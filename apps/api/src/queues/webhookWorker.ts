import { Worker, Queue, Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { processPendingWebhooks, createWebhookDeliveriesForEvent, deliverWebhook } from '@/services/webhookDelivery';
import { getControlCentreClient } from '@/lib/controlCentreClient';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const connection = {
  host: new URL(redisUrl).hostname,
  port: parseInt(new URL(redisUrl).port || '6379', 10),
  password: new URL(redisUrl).password || undefined,
};

// Queue for webhook delivery jobs
export const webhookDeliveryQueue = new Queue('webhook-delivery', { connection });

// Worker that processes webhook deliveries
export const webhookWorker = new Worker(
  'webhook-delivery',
  async (job: Job<{ eventId: string; endpointId: string }>) => {
    const { eventId, endpointId } = job.data;
    await deliverWebhook({ eventId, endpointId });
  },
  { connection, concurrency: 5 }
);

webhookWorker.on('completed', (job) => {
  console.log('[WebhookWorker] Job completed', { jobId: job.id });
});

webhookWorker.on('failed', (job, err) => {
  console.error('[WebhookWorker] Job failed', { jobId: job?.id, error: err.message });
});

// Worker that polls Control Centre for new webhook events
export const controlCentrePollWorker = new Worker(
  'control-centre-poll',
  async () => {
    try {
      const client = getControlCentreClient();
      const appId = process.env.APP_ID;

      if (!appId) {
        console.warn('[ControlCentrePoll] APP_ID not configured, skipping poll');
        return;
      }

      // Fetch unprocessed webhook events from Control Centre
      // This assumes Control Centre exposes an endpoint for apps to poll
      const response = await client.get(`/apps/${appId}/webhook-events/pending`, {
        params: { limit: 100 },
      });

      const events = response.data.events ?? [];

      for (const event of events) {
        // Store locally (idempotent)
        await prisma.controlCentreEvent.upsert({
          where: { idempotencyKey: event.idempotency_key },
          create: {
            eventType: event.event_type,
            aggregateType: event.aggregate_type,
            aggregateId: event.aggregate_id,
            payload: event.payload,
            idempotencyKey: event.idempotency_key,
            receivedAt: new Date(event.occurred_at),
            status: 'pending',
          },
          update: {},
        });

        // Create local webhook event for delivery
        const webhookEvent = await prisma.webhookEvent.create({
          data: {
            eventType: event.event_type,
            aggregateType: event.aggregate_type,
            aggregateId: event.aggregate_id,
            payload: event.payload,
            idempotencyKey: event.idempotency_key,
            occurredAt: new Date(event.occurred_at),
          },
        });

        // Create deliveries
        await createWebhookDeliveriesForEvent(webhookEvent.id);

        // Mark as processed
        await prisma.controlCentreEvent.update({
          where: { idempotencyKey: event.idempotency_key },
          data: { status: 'processed', processedAt: new Date() },
        });
      }

      console.log('[ControlCentrePoll] Processed', events.length, 'events');
    } catch (error) {
      console.error('[ControlCentrePoll] Error', error);
      throw error;
    }
  },
  { connection, concurrency: 1 }
);

// Worker that processes pending webhook deliveries (retry logic)
export const webhookRetryWorker = new Worker(
  'webhook-retry',
  async () => {
    const processed = await processPendingWebhooks(50);
    if (processed > 0) {
      console.log('[WebhookRetry] Processed', processed, 'deliveries');
    }
  },
  { connection, concurrency: 1 }
);

// Schedule periodic jobs using setInterval instead of BullMQ job scheduler
let pollInterval: NodeJS.Timeout | null = null;
let retryInterval: NodeJS.Timeout | null = null;

export async function schedulePeriodicJobs(): Promise<void> {
  // Poll Control Centre every 30 seconds
  pollInterval = setInterval(async () => {
    try {
      await controlCentrePollWorker.run();
    } catch (error) {
      console.error('[ControlCentrePoll] Scheduled run failed', error);
    }
  }, 30 * 1000);

  // Process webhook retries every 60 seconds
  retryInterval = setInterval(async () => {
    try {
      await webhookRetryWorker.run();
    } catch (error) {
      console.error('[WebhookRetry] Scheduled run failed', error);
    }
  }, 60 * 1000);

  console.log('[Queues] Periodic jobs scheduled');
}

export async function shutdownWorkers(): Promise<void> {
  if (pollInterval) clearInterval(pollInterval);
  if (retryInterval) clearInterval(retryInterval);
  
  await Promise.all([
    webhookWorker.close(),
    controlCentrePollWorker.close(),
    webhookRetryWorker.close(),
    webhookDeliveryQueue.close(),
  ]);
  console.log('[Queues] Workers shut down');
}

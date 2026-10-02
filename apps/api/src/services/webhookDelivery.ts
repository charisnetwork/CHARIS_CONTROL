import { prisma } from '@/lib/prisma';
import axios, { AxiosError } from 'axios';
import * as crypto from 'node:crypto';

export interface WebhookDeliveryJob {
  eventId: string;
  endpointId: string;
}

export async function deliverWebhook(job: WebhookDeliveryJob): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: {
      eventId_endpointId: {
        eventId: job.eventId,
        endpointId: job.endpointId,
      },
    },
    include: {
      event: true,
      endpoint: true,
    },
  });

  if (!delivery) {
    throw new Error('Delivery not found');
  }

  if (delivery.status === 'DELIVERED') {
    return; // Already delivered
  }

  // Acquire lease to prevent duplicate processing
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min lease

  const updated = await prisma.webhookDelivery.updateMany({
    where: {
      id: delivery.id,
      status: { in: ['PENDING', 'RETRYING'] },
      OR: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lt: new Date() } },
      ],
    },
    data: {
      leaseToken,
      leaseExpiresAt,
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return; // Another worker got the lease
  }

  try {
    const signature = generateSignature(delivery.event.payload, delivery.endpoint.signingSecretReference);

    const response = await axios.post(delivery.endpoint.url, delivery.event.payload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event-Type': delivery.event.eventType,
        'X-Webhook-Event-Id': delivery.event.id,
        'X-Webhook-Idempotency-Key': delivery.event.idempotencyKey,
        'User-Agent': 'Charis-Webhook/1.0',
      },
      validateStatus: () => true, // Don't throw on non-2xx
    });

    const success = response.status >= 200 && response.status < 300;

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: success ? 'DELIVERED' : 'FAILED',
        responseStatus: response.status,
        deliveredAt: success ? new Date() : null,
        lastErrorCode: success ? null : `HTTP_${response.status}`,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: success ? null : calculateNextAttempt(delivery.attemptCount),
      },
    });

    if (!success) {
      throw new Error(`Webhook delivery failed with status ${response.status}`);
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    const attemptCount = delivery.attemptCount + 1;
    const maxAttempts = 10;

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: attemptCount >= maxAttempts ? 'FAILED' : 'RETRYING',
        lastErrorCode: axiosError.code ?? 'UNKNOWN_ERROR',
        lastAttemptAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: attemptCount >= maxAttempts ? null : calculateNextAttempt(attemptCount),
      },
    });

    throw error;
  }
}

function generateSignature(payload: unknown, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

function calculateNextAttempt(attemptCount: number): Date {
  // Exponential backoff: 1min, 2min, 4min, 8min, 16min, 32min, 1hr, 2hr, 4hr, 8hr
  const delays = [1, 2, 4, 8, 16, 32, 60, 120, 240, 480]; // minutes
  const delayIndex = Math.min(attemptCount - 1, delays.length - 1);
  return new Date(Date.now() + delays[delayIndex] * 60 * 1000);
}

export async function createWebhookDeliveriesForEvent(eventId: string): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: eventId },
  });

  if (!event) return;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      enabled: true,
      subscribedEvents: {
        array_contains: event.eventType, // PostgreSQL JSONB contains
      },
    },
  });

  if (endpoints.length === 0) return;

  await prisma.webhookDelivery.createMany({
    data: endpoints.map((endpoint) => ({
      eventId,
      endpointId: endpoint.id,
      status: 'PENDING',
      attemptCount: 0,
    })),
    skipDuplicates: true,
  });
}

export async function processPendingWebhooks(limit = 100): Promise<number> {
  const pendingDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: { in: ['PENDING', 'RETRYING'] },
      OR: [
        { nextAttemptAt: null },
        { nextAttemptAt: { lte: new Date() } },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  let processed = 0;
  for (const delivery of pendingDeliveries) {
    try {
      await deliverWebhook({ eventId: delivery.eventId, endpointId: delivery.endpointId });
      processed++;
    } catch (error) {
      console.error('[WebhookDelivery] Failed to deliver', {
        deliveryId: delivery.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return processed;
}
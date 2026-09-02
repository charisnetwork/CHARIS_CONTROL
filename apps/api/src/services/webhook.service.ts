import { Application } from '@prisma/client';
import * as crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { assertSafePublicUrl } from './urlSafety.service';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}

/** Database-backed outbox. A failed delivery is retried with bounded exponential backoff. */
export class WebhookService {
  private static timer: NodeJS.Timeout | undefined;
  private static readonly maxAttempts = 8;

  static async dispatch(application: Application, eventType: string, data: unknown): Promise<void> {
    if (!application.webhookUrl || !application.webhookSecret) return;
    const payload = { eventId: uuidv4(), eventType, data: JSON.parse(JSON.stringify(data)), timestamp: Date.now() };
    const delivery = await prisma.webhookDelivery.create({
      data: { eventId: payload.eventId, applicationId: application.id, eventType, payload: payload as object },
    });
    await this.deliver(delivery, application);
  }

  static startDeliveryWorker(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.processDueDeliveries(); }, 30_000);
    this.timer.unref();
  }

  static async processDueDeliveries(): Promise<void> {
    const due = await prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      include: { application: true }, take: 50, orderBy: { nextAttemptAt: 'asc' },
    });
    await Promise.all(due.map((delivery: any) => this.deliver(delivery, delivery.application)));
  }

  private static async deliver(delivery: { id: string; attemptCount: number; payload: unknown }, application: Application): Promise<void> {
    if (!application.webhookUrl || !application.webhookSecret) return;
    const attempt = delivery.attemptCount + 1;
    const now = new Date();
    try {
      const target = await assertSafePublicUrl(application.webhookUrl, 'Webhook URL');
      const body = canonicalJson(delivery.payload);
      const signature = crypto.createHmac('sha256', application.webhookSecret).update(body).digest('hex');
      const response = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-signature': signature }, body, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'DELIVERED', attemptCount: attempt, lastAttemptAt: now, responseStatus: response.status, deliveredAt: now, failureReason: null } });
    } catch (error) {
      const retryable = attempt < this.maxAttempts;
      const delayMs = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(attempt, 12));
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: {
        status: retryable ? 'PENDING' : 'FAILED', attemptCount: attempt, lastAttemptAt: now,
        nextAttemptAt: new Date(Date.now() + delayMs), failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Delivery failed',
      } });
    }
  }
}

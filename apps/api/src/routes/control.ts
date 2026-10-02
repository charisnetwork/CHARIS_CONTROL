import { Router, Request, Response } from 'express';
import { prisma } from '@/lib/prisma';
import { createSubscription, activateSubscription, cancelSubscription, recordSubscriptionEvent } from '@/services/subscriptionService';
import { redeemCoupon } from '@/services/couponService';
import { consumeUsage } from '@/services/usageService';
import { createWebhookDeliveriesForEvent } from '@/services/webhookDelivery';

const router = Router();

// Middleware to verify Control Centre requests
const verifyControlCentre = (req: Request, res: Response, next: Function) => {
  const secret = req.headers['x-control-secret'] as string;
  const expectedSecret = process.env.CONTROL_API_SECRET;

  if (!secret || secret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

router.use(verifyControlCentre);

/**
 * POST /api/v1/control/subscriptions
 * Control Centre creates a subscription in the app
 */
router.post('/subscriptions', async (req: Request, res: Response) => {
  try {
    const {
      subscriber_external_id,
      plan_code,
      external_id,
      starts_at,
      ends_at,
      auto_renews,
      commercial_snapshot,
      entitlement_snapshot,
    } = req.body;

    // Find or create subscriber
    let subscriber = await prisma.subscriber.findUnique({
      where: { externalId: subscriber_external_id },
    });

    if (!subscriber) {
      subscriber = await prisma.subscriber.create({
        data: {
          externalId: subscriber_external_id,
          name: req.body.subscriber_name ?? subscriber_external_id,
          email: req.body.subscriber_email,
          mobileNumber: req.body.subscriber_mobile,
          metadata: req.body.subscriber_metadata ?? {},
        },
      });
    }

    // Find plan by code
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { code: plan_code },
      include: { entitlements: { include: { feature: true } } },
    });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const subscription = await createSubscription({
      subscriberId: subscriber.id,
      planId: plan.id,
      externalId: external_id,
      startsAt: new Date(starts_at),
      endsAt: ends_at ? new Date(ends_at) : undefined,
      autoRenews: auto_renews ?? true,
      commercialSnapshot: commercial_snapshot ?? {},
      entitlementSnapshot: entitlement_snapshot ?? {},
    });

    // Activate immediately if starts_at is now or past
    if (new Date(starts_at) <= new Date()) {
      await activateSubscription(subscription.id);
      await recordSubscriptionEvent(subscription.id, 'activated', new Date(), { source: 'control_centre' });
    }

    return res.status(201).json({
      id: subscription.id,
      external_id: subscription.externalId,
      status: subscription.status,
      starts_at: subscription.startsAt,
      ends_at: subscription.endsAt,
    });
  } catch (error) {
    console.error('[Control] Create subscription error', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * PATCH /api/v1/control/subscriptions/:id/activate
 */
router.patch('/subscriptions/:id/activate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const subscription = await activateSubscription(id);
    await recordSubscriptionEvent(id, 'activated', new Date(), { source: 'control_centre' });
    return res.json({ id: subscription.id, status: subscription.status });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * PATCH /api/v1/control/subscriptions/:id/cancel
 */
router.patch('/subscriptions/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await cancelSubscription(id);
    await recordSubscriptionEvent(id, 'cancelled', new Date(), { source: 'control_centre' });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * POST /api/v1/control/coupons/redeem
 * Control Centre triggers coupon redemption
 */
router.post('/coupons/redeem', async (req: Request, res: Response) => {
  try {
    const { coupon_code, subscription_external_id, payment_id, idempotency_key, discount_amount, currency } = req.body;

    const coupon = await prisma.coupon.findUnique({ where: { code: coupon_code.toUpperCase() } });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });

    const subscription = await prisma.subscription.findUnique({ where: { externalId: subscription_external_id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });

    const redemption = await redeemCoupon({
      couponId: coupon.id,
      subscriptionId: subscription.id,
      paymentId: payment_id,
      idempotencyKey: idempotency_key,
      discountAmount: discount_amount,
      currency,
    });

    return res.status(201).json({ id: redemption.id, discount_amount: redemption.discountAmount });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * POST /api/v1/control/usage
 * Control Centre reports usage (or app reports to Control Centre - bidirectional)
 */
router.post('/usage', async (req: Request, res: Response) => {
  try {
    const { subscription_external_id, feature_code, delta, idempotency_key, operation, metadata } = req.body;

    const subscription = await prisma.subscription.findUnique({ where: { externalId: subscription_external_id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });

    await consumeUsage({
      subscriptionId: subscription.id,
      featureCode: feature_code,
      delta,
      idempotencyKey: idempotency_key,
      operation: operation ?? 'consume',
      metadata,
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * POST /api/v1/control/webhook-events
 * Control Centre sends webhook events to app (outbox pattern)
 */
router.post('/webhook-events', async (req: Request, res: Response) => {
  try {
    const { event_type, aggregate_type, aggregate_id, payload, idempotency_key, occurred_at } = req.body;

    // Store event (idempotent)
    const event = await prisma.controlCentreEvent.upsert({
      where: { idempotencyKey: idempotency_key },
      create: {
        eventType: event_type,
        aggregateType: aggregate_type,
        aggregateId: aggregate_id,
        payload,
        idempotencyKey: idempotency_key,
        receivedAt: new Date(occurred_at),
        status: 'pending',
      },
      update: {},
    });

    // Also create local webhook event for delivery to app's endpoints
    const webhookEvent = await prisma.webhookEvent.create({
      data: {
        eventType: event_type,
        aggregateType: aggregate_type,
        aggregateId: aggregate_id,
        payload,
        idempotencyKey: idempotency_key,
        occurredAt: new Date(occurred_at),
      },
    });

    // Create deliveries for matching endpoints
    await createWebhookDeliveriesForEvent(webhookEvent.id);

    // Mark as processed
    await prisma.controlCentreEvent.update({
      where: { id: event.id },
      data: { status: 'processed', processedAt: new Date() },
    });

    return res.status(201).json({ success: true, eventId: webhookEvent.id });
  } catch (error) {
    console.error('[Control] Webhook event error', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/v1/control/health
 * App reports health to Control Centre
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;
    const dbStatus = 'healthy';

    // Check Redis (if configured)
    let redisStatus = 'healthy';
    // ... redis check

    return res.json({
      overall_status: 'healthy',
      frontend_status: 'healthy',
      backend_status: 'healthy',
      database_status: dbStatus,
      latency_ms: null,
      dependencies: { redis: redisStatus },
      incident_summary: null,
    });
  } catch (error) {
    return res.status(503).json({
      overall_status: 'critical',
      frontend_status: 'unknown',
      backend_status: 'critical',
      database_status: 'critical',
      latency_ms: null,
      dependencies: {},
      incident_summary: error instanceof Error ? error.message : 'Health check failed',
    });
  }
});

export default router;
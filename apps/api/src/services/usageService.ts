import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { reportUsageToControlCentre } from '@/lib/controlCentreClient';
import { Prisma } from '@prisma/client';

export interface ConsumeUsageInput {
  subscriptionId: string;
  featureCode: string;
  delta: number;
  idempotencyKey: string;
  operation: string;
  metadata?: Prisma.InputJsonValue;
}

export async function consumeUsage(input: ConsumeUsageInput) {
  return prisma.$transaction(async (tx) => {
    // Check idempotency
    const existingEvent = await tx.usageEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingEvent) {
      return { success: true, duplicate: true };
    }

    // Get subscription with plan entitlements
    const subscription = await tx.subscription.findUnique({
      where: { id: input.subscriptionId },
      include: {
        plan: {
          include: {
            entitlements: {
              include: { feature: true },
            },
          },
        },
      },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.status !== 'ACTIVE') {
      throw new Error(`Subscription is ${subscription.status.toLowerCase()}`);
    }

    // Find matching entitlement
    const entitlement = subscription.plan.entitlements.find(
      (e) => e.feature.code === input.featureCode && e.enabled
    );

    if (!entitlement) {
      throw new Error(`Feature ${input.featureCode} not entitled`);
    }

    // Determine period boundaries
    const periodStart = getPeriodStart(subscription.startsAt, entitlement.resetPeriod);
    const periodEnd = getPeriodEnd(periodStart, entitlement.resetPeriod);

    // Get or create usage counter
    let counter = await tx.usageCounter.findUnique({
      where: {
        subscriptionId_featureId_periodStart: {
          subscriptionId: input.subscriptionId,
          featureId: entitlement.featureId,
          periodStart,
        },
      },
    });

    if (!counter) {
      counter = await tx.usageCounter.create({
        data: {
          subscriptionId: input.subscriptionId,
          featureId: entitlement.featureId,
          periodStart,
          periodEnd,
          usedValue: 0,
        },
      });
    }

    // Check limit
    if (entitlement.limitType === 'LIMITED' && entitlement.limitValue !== null) {
      const newUsedValue = Number(counter.usedValue) + input.delta;
      if (newUsedValue > Number(entitlement.limitValue)) {
        throw new Error(`Usage limit exceeded for ${input.featureCode}`);
      }
    }

    // Create usage event
    await tx.usageEvent.create({
      data: {
        counterId: counter.id,
        idempotencyKey: input.idempotencyKey,
        delta: input.delta,
        operation: input.operation,
        metadata: input.metadata ?? {},
      },
    });

    // Increment counter
    await tx.usageCounter.update({
      where: { id: counter.id },
      data: { usedValue: { increment: input.delta } },
    });

    // Report to Control Centre (async, don't block)
    reportUsageToControlCentre(process.env.APP_ID ?? '', {
      subscription_id: input.subscriptionId,
      feature_code: input.featureCode,
      delta: input.delta,
      idempotency_key: input.idempotencyKey,
      occurred_at: new Date().toISOString(),
    }).catch((err) => {
      console.error('[UsageService] Failed to report usage to Control Centre', err);
    });

    return { success: true, duplicate: false, usedValue: Number(counter.usedValue) + input.delta };
  });
}

export async function getUsageForSubscription(subscriptionId: string, featureCode?: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: {
        include: {
          entitlements: {
            include: { feature: true },
          },
        },
      },
      usageCounters: {
        include: { feature: true },
        orderBy: { periodStart: 'desc' },
      },
    },
  });

  if (!subscription) return null;

  let counters = subscription.usageCounters;
  if (featureCode) {
    counters = counters.filter((c) => c.feature.code === featureCode);
  }

  // Build a map of featureId -> planEntitlement for quick lookup
  const entitlementMap = new Map(
    subscription.plan.entitlements.map((e) => [e.featureId, e])
  );

  return counters.map((counter) => {
    const planEntitlement = entitlementMap.get(counter.featureId);
    return {
      featureCode: counter.feature.code,
      featureName: counter.feature.name,
      usedValue: Number(counter.usedValue),
      limitValue: planEntitlement?.limitValue ? Number(planEntitlement.limitValue) : null,
      limitType: planEntitlement?.limitType ?? 'LIMITED',
      unit: planEntitlement?.unit ?? counter.feature.defaultUnit,
      resetPeriod: planEntitlement?.resetPeriod,
      periodStart: counter.periodStart,
      periodEnd: counter.periodEnd,
    };
  });
}

function getPeriodStart(startsAt: Date, resetPeriod: string | null): Date {
  const date = new Date(startsAt);
  if (!resetPeriod || resetPeriod === 'TOTAL' || resetPeriod === 'BILLING_CYCLE') {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  switch (resetPeriod) {
    case 'DAILY':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    case 'MONTHLY':
      return new Date(date.getFullYear(), date.getMonth(), 1);
    case 'YEARLY':
      return new Date(date.getFullYear(), 0, 1);
    default:
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}

function getPeriodEnd(periodStart: Date, resetPeriod: string | null): Date | null {
  if (!resetPeriod || resetPeriod === 'TOTAL' || resetPeriod === 'BILLING_CYCLE') {
    return null;
  }
  const date = new Date(periodStart);
  switch (resetPeriod) {
    case 'DAILY':
      date.setDate(date.getDate() + 1);
      return date;
    case 'MONTHLY':
      date.setMonth(date.getMonth() + 1);
      return date;
    case 'YEARLY':
      date.setFullYear(date.getFullYear() + 1);
      return date;
    default:
      return null;
  }
}

import { prisma } from '@/lib/prisma';
import { signEntitlement, type EntitlementPayload } from '@/lib/jwt';
import { getControlCentreClient } from '@/lib/controlCentreClient';

export interface EntitlementSnapshot {
  featureCode: string;
  enabled: boolean;
  limitType: 'limited' | 'unlimited';
  limitValue: number | null;
  unit: string | null;
  resetPeriod: string | null;
}

export async function buildEntitlementForTenant(tenantId: string): Promise<string | null> {
  // Find subscriber by external_id (tenantId)
  const subscriber = await prisma.subscriber.findUnique({
    where: { externalId: tenantId },
    include: {
      subscriptions: {
        where: { status: 'ACTIVE' },
        include: {
          plan: {
            include: {
              entitlements: {
                include: { feature: true },
              },
            },
          },
        },
        orderBy: { startsAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!subscriber || subscriber.subscriptions.length === 0) {
    return null;
  }

  const subscription = subscriber.subscriptions[0];
  const plan = subscription.plan;

  // Build features array and limits map
  const features: string[] = [];
  const limits: Record<string, number> = {};

  for (const entitlement of plan.entitlements) {
    if (!entitlement.enabled) continue;

    const featureCode = entitlement.feature.code;
    features.push(featureCode);

    if (entitlement.limitType === 'UNLIMITED') {
      limits[featureCode] = -1; // -1 = unlimited
    } else if (entitlement.limitValue !== null) {
      limits[featureCode] = Number(entitlement.limitValue);
    }
  }

  // Determine billing cycle from plan
  const billingCycle = `${plan.durationValue} ${plan.durationUnit.toLowerCase()}`;

  // Get usage period from subscription
  const usagePeriod = {
    unit: plan.durationUnit.toLowerCase(),
    startsAt: Math.floor(subscription.startsAt.getTime() / 1000),
    endsAt: subscription.endsAt ? Math.floor(subscription.endsAt.getTime() / 1000) : null,
  };

  const payload: Omit<EntitlementPayload, keyof import('jose').JWTPayload> = {
    entitlementVersion: 1,
    applicationId: process.env.APP_ID ?? 'unknown',
    tenantId,
    status: subscription.status,
    planId: plan.id,
    subscriptionId: subscription.id,
    features,
    limits,
    billingCycle,
    usagePeriod,
  };

  return signEntitlement(payload);
}

export async function getCachedEntitlement(tenantId: string): Promise<string | null> {
  // Check Redis cache first (implement if needed)
  // For now, build fresh each time
  return buildEntitlementForTenant(tenantId);
}

export async function invalidateEntitlementCache(tenantId: string): Promise<void> {
  // Invalidate Redis cache if implemented
  // For now, no-op since we build fresh
}

import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

export interface CreateSubscriptionInput {
  subscriberId: string;
  planId: string;
  externalId?: string;
  startsAt: Date;
  endsAt?: Date;
  autoRenews?: boolean;
  commercialSnapshot: Prisma.InputJsonValue;
  entitlementSnapshot: Prisma.InputJsonValue;
}

export async function createSubscription(input: CreateSubscriptionInput) {
  return prisma.subscription.create({
    data: {
      subscriberId: input.subscriberId,
      planId: input.planId,
      externalId: input.externalId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      autoRenews: input.autoRenews ?? true,
      commercialSnapshot: input.commercialSnapshot,
      entitlementSnapshot: input.entitlementSnapshot,
      status: 'PENDING',
    },
    include: {
      plan: { include: { entitlements: { include: { feature: true } } } },
      subscriber: true,
    },
  });
}

export async function activateSubscription(subscriptionId: string) {
  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'ACTIVE' },
    include: { plan: { include: { entitlements: { include: { feature: true } } } } },
  });
}

export async function cancelSubscription(subscriptionId: string, cancelledAt: Date = new Date()) {
  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'CANCELLED', cancelledAt, autoRenews: false },
  });
}

export async function suspendSubscription(subscriptionId: string) {
  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'SUSPENDED' },
  });
}

export async function getActiveSubscriptionForSubscriber(subscriberId: string) {
  return prisma.subscription.findFirst({
    where: { subscriberId, status: 'ACTIVE' },
    include: {
      plan: { include: { entitlements: { include: { feature: true } } } },
    },
    orderBy: { startsAt: 'desc' },
  });
}

export async function getSubscriptionById(subscriptionId: string) {
  return prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: { include: { entitlements: { include: { feature: true } } } },
      subscriber: true,
    },
  });
}

export async function recordSubscriptionEvent(
  subscriptionId: string,
  eventType: string,
  effectiveAt: Date,
  details: Prisma.InputJsonValue,
  actorUserId?: string
) {
  return prisma.subscriptionEvent.create({
    data: {
      subscriptionId,
      eventType,
      effectiveAt,
      details,
      actorUserId,
    },
  });
}
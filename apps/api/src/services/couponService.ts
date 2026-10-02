import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export interface RedeemCouponInput {
  couponId: string;
  subscriptionId: string;
  paymentId?: string;
  idempotencyKey: string;
  discountAmount: Decimal;
  currency: string;
}

export async function validateCouponForSubscription(
  couponId: string,
  subscriptionId: string,
  subscriberId: string
): Promise<{ valid: boolean; reason?: string; coupon?: any }> {
  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    include: { plans: true },
  });

  if (!coupon) {
    return { valid: false, reason: 'Coupon not found' };
  }

  if (coupon.status !== 'ACTIVE') {
    return { valid: false, reason: `Coupon is ${coupon.status.toLowerCase()}` };
  }

  const now = new Date();
  if (now < coupon.startsAt || now > coupon.endsAt) {
    return { valid: false, reason: 'Coupon not valid for current date' };
  }

  if (coupon.redemptionCount >= coupon.maximumRedemptions) {
    return { valid: false, reason: 'Coupon redemption limit reached' };
  }

  // Check if coupon applies to subscription's plan
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });

  if (!subscription) {
    return { valid: false, reason: 'Subscription not found' };
  }

  const planIds = coupon.plans.map((cp) => cp.planId);
  if (!planIds.includes(subscription.planId)) {
    return { valid: false, reason: 'Coupon not valid for this plan' };
  }

  // Check per-subscriber limit
  if (coupon.perSubscriberLimit) {
    const subscriberRedemptions = await prisma.couponRedemption.count({
      where: { couponId, subscription: { subscriberId } },
    });
    if (subscriberRedemptions >= coupon.perSubscriberLimit) {
      return { valid: false, reason: 'Per-subscriber redemption limit reached' };
    }
  }

  // Check first subscription only
  if (coupon.firstSubscriptionOnly) {
    const subscriberSubscriptionCount = await prisma.subscription.count({
      where: { subscriberId, status: { in: ['ACTIVE', 'PENDING'] } },
    });
    if (subscriberSubscriptionCount > 1) {
      return { valid: false, reason: 'Coupon only valid for first subscription' };
    }
  }

  // Check minimum duration
  if (coupon.minimumDurationValue && coupon.minimumDurationUnit) {
    const plan = subscription.plan;
    const planDurationInDays = getDurationInDays(plan.durationValue, plan.durationUnit);
    const minDurationInDays = getDurationInDays(coupon.minimumDurationValue, coupon.minimumDurationUnit);
    if (planDurationInDays < minDurationInDays) {
      return { valid: false, reason: `Coupon requires minimum ${coupon.minimumDurationValue} ${coupon.minimumDurationUnit.toLowerCase()}(s) subscription` };
    }
  }

  return { valid: true, coupon };
}

export async function redeemCoupon(input: RedeemCouponInput) {
  // Use transaction for atomicity
  return prisma.$transaction(async (tx) => {
    // Check idempotency
    const existing = await tx.couponRedemption.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    // Validate coupon
    const subscription = await tx.subscription.findUnique({
      where: { id: input.subscriptionId },
      include: { plan: true },
    });
    if (!subscription) throw new Error('Subscription not found');

    const validation = await validateCouponForSubscription(input.couponId, input.subscriptionId, subscription.subscriberId);
    if (!validation.valid) throw new Error(validation.reason);

    const coupon = validation.coupon!;

    // Create redemption
    const redemption = await tx.couponRedemption.create({
      data: {
        couponId: input.couponId,
        subscriptionId: input.subscriptionId,
        paymentId: input.paymentId,
        idempotencyKey: input.idempotencyKey,
        discountAmount: input.discountAmount,
        currency: input.currency,
      },
    });

    // Increment coupon redemption count
    await tx.coupon.update({
      where: { id: input.couponId },
      data: { redemptionCount: { increment: 1 } },
    });

    // If affiliate coupon, create commission entry
    if (coupon.kind === 'AFFILIATE' && coupon.affiliateId && coupon.commissionType && coupon.commissionValue) {
      const commissionAmount = calculateCommission(
        coupon.commissionType,
        coupon.commissionValue,
        input.discountAmount
      );

      await tx.affiliateCommission.create({
        data: {
          affiliateId: coupon.affiliateId,
          redemptionId: redemption.id,
          entryType: 'EARNED',
          amount: commissionAmount,
          currency: coupon.commissionCurrency ?? input.currency,
          reference: `redemption_${redemption.id}`,
        },
      });
    }

    return redemption;
  });
}

function calculateCommission(
  commissionType: 'percentage' | 'fixed',
  commissionValue: Decimal,
  discountAmount: Decimal
): Decimal {
  if (commissionType === 'percentage') {
    return discountAmount.mul(commissionValue).div(100);
  }
  return commissionValue;
}

function getDurationInDays(value: number, unit: string): number {
  switch (unit.toUpperCase()) {
    case 'DAY': return value;
    case 'MONTH': return value * 30;
    case 'YEAR': return value * 365;
    default: return value;
  }
}

export async function getCouponByCode(code: string) {
  return prisma.coupon.findUnique({
    where: { code: code.toUpperCase() },
    include: { plans: true, affiliate: true },
  });
}

export async function getCouponsForPlan(planId: string) {
  return prisma.coupon.findMany({
    where: {
      plans: { some: { planId } },
      status: 'ACTIVE',
      startsAt: { lte: new Date() },
      endsAt: { gte: new Date() },
    },
    include: { plans: true, affiliate: true },
  });
}
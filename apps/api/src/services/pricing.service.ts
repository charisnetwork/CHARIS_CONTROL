import { AppError } from '../middlewares/error.middleware';
import { prisma } from '../lib/prisma';

const supportedDurations = new Set([1, 3, 6, 12, 24, 36]);

export interface SubscriptionQuote {
  durationMonths: number; basePrice: number; promotionDiscount: number; couponDiscount: number;
  totalDiscount: number; finalPrice: number; promotionName: string | null; couponCode: string | null; couponId: string | null;
}

/** Deterministic quote; the returned values are persisted on the subscription as history. */
export async function quoteSubscription(applicationId: string, planId: string, durationMonths: number, couponCode?: string, promotionId?: string): Promise<SubscriptionQuote> {
  if (!supportedDurations.has(durationMonths)) throw new AppError('Unsupported subscription duration', 400);
  const plan: any = await (prisma as any).plan.findUnique({ where: { id: planId }, include: { priceOptions: { include: { tiers: true } } } });
  if (!plan?.isActive) throw new AppError('Plan is not available', 404);
  const option = plan.priceOptions.find((candidate: any) => candidate.durationMonths === durationMonths && candidate.isActive);
  if (!option) throw new AppError(`No pricing option exists for ${durationMonths} months`, 400);
  // A price tier is a monthly price for its numbered 12-month period. For
  // shorter terms the first tier applies; for longer terms missing periods
  // intentionally reuse the final configured tier. This supports, for example,
  // year 1 ₹100/month, year 2 ₹200/month, year 3 ₹150/month without relying on
  // `monthlyPrice × duration` for every commercial offer.
  const tiers = [...option.tiers].sort((a: any, b: any) => a.periodNumber - b.periodNumber);
  const basePrice = tiers.length
    ? Array.from({ length: durationMonths }, (_, month) => {
        const period = Math.floor(month / 12) + 1;
        const tier = tiers.find((candidate: any) => candidate.periodNumber === period) || tiers[tiers.length - 1];
        return Number(tier.monthlyAmount);
      }).reduce((total, amount) => total + amount, 0)
    : Number(option.baseAmount);
  let promotionDiscount = 0; let promotionName: string | null = null;
  if (promotionId) {
    const promotion = await (prisma as any).planPromotion.findFirst({ where: { id: promotionId, planId, isActive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } } });
    if (!promotion || promotion.durationMonths && promotion.durationMonths !== durationMonths) throw new AppError('Promotion is not applicable', 400);
    promotionName = promotion.name;
    promotionDiscount = promotion.discountType === 'PERCENTAGE' ? basePrice * Number(promotion.discountValue) / 100 : Number(promotion.discountValue);
  }
  let couponDiscount = 0; let appliedCoupon: string | null = null; let appliedCouponId: string | null = null;
  if (couponCode) {
    const normalizedCode = couponCode.trim().toUpperCase();
    const coupon = await prisma.coupon.findFirst({ where: { code: normalizedCode, isActive: true, OR: [{ applicationId }, { applicationId: null }] } });
    if (!coupon || coupon.expiresAt && coupon.expiresAt < new Date() || coupon.totalUsageLimit !== null && coupon.usesCount >= coupon.totalUsageLimit) throw new AppError('Coupon is invalid or exhausted', 400);
    const applicablePlans = Array.isArray(coupon.applicablePlans) ? coupon.applicablePlans.map(String) : [];
    if (applicablePlans.length && !applicablePlans.includes(planId) && !applicablePlans.includes(plan.code || '')) throw new AppError('Coupon is not applicable to this plan', 400);
    appliedCoupon = coupon.code;
    appliedCouponId = coupon.id;
    const afterPromotion = Math.max(0, basePrice - promotionDiscount);
    couponDiscount = coupon.discountType === 'percentage' ? afterPromotion * Math.min(100, Math.max(0, coupon.discountValue)) / 100 : Math.max(0, coupon.discountValue);
  }
  const totalDiscount = Math.min(basePrice, promotionDiscount + couponDiscount);
  return { durationMonths, basePrice, promotionDiscount, couponDiscount, totalDiscount, finalPrice: basePrice - totalDiscount, promotionName, couponCode: appliedCoupon, couponId: appliedCouponId };
}

export { supportedDurations };

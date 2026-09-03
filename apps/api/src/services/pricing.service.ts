import { PrismaClient } from '@prisma/client';
import { AppError } from '../middlewares/error.middleware';

const prisma = new PrismaClient();
const supportedDurations = new Set([1, 3, 6, 12, 24, 36]);

export interface SubscriptionQuote {
  durationMonths: number; basePrice: number; promotionDiscount: number; couponDiscount: number;
  totalDiscount: number; finalPrice: number; promotionName: string | null; couponCode: string | null;
}

/** Deterministic quote; the returned values are persisted on the subscription as history. */
export async function quoteSubscription(applicationId: string, planId: string, durationMonths: number, couponCode?: string, promotionId?: string): Promise<SubscriptionQuote> {
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120) throw new AppError('durationMonths must be between 1 and 120', 400);
  const plan: any = await (prisma as any).plan.findUnique({ where: { id: planId }, include: { priceOptions: { include: { tiers: true } } } });
  if (!plan?.isActive) throw new AppError('Plan is not available', 404);
  const option = plan.priceOptions.find((candidate: any) => candidate.durationMonths === durationMonths && candidate.isActive);
  if (!option) throw new AppError(`No pricing option exists for ${durationMonths} months`, 400);
  const basePrice = option.tiers.length
    ? option.tiers.reduce((total: number, tier: any) => total + Number(tier.monthlyAmount), 0) * 12
    : Number(option.baseAmount);
  let promotionDiscount = 0; let promotionName: string | null = null;
  if (promotionId) {
    const promotion = await (prisma as any).planPromotion.findFirst({ where: { id: promotionId, planId, isActive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } } });
    if (!promotion || promotion.durationMonths && promotion.durationMonths !== durationMonths) throw new AppError('Promotion is not applicable', 400);
    promotionName = promotion.name;
    promotionDiscount = promotion.discountType === 'PERCENTAGE' ? basePrice * Number(promotion.discountValue) / 100 : Number(promotion.discountValue);
  }
  let couponDiscount = 0; let appliedCoupon: string | null = null;
  if (couponCode) {
    const coupon = await prisma.coupon.findFirst({ where: { code: couponCode, isActive: true, OR: [{ applicationId }, { applicationId: null }] } });
    if (!coupon || coupon.expiresAt && coupon.expiresAt < new Date() || coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) throw new AppError('Coupon is invalid or exhausted', 400);
    appliedCoupon = coupon.code;
    const afterPromotion = Math.max(0, basePrice - promotionDiscount);
    couponDiscount = coupon.discountType === 'percentage' ? afterPromotion * coupon.discountValue / 100 : coupon.discountValue;
  }
  const totalDiscount = Math.min(basePrice, promotionDiscount + couponDiscount);
  return { durationMonths, basePrice, promotionDiscount, couponDiscount, totalDiscount, finalPrice: basePrice - totalDiscount, promotionName, couponCode: appliedCoupon };
}

export { supportedDurations };

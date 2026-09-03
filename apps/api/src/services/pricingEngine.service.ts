import { PrismaClient, Plan } from '@prisma/client';

const prisma = new PrismaClient();

export interface PricingEngineParams {
  planId: string;
  durationMonths: number;
  couponCode?: string;
  offerId?: string;
}

export class PricingEngineService {
  static async calculateSubscriptionPricing({ planId, durationMonths, couponCode, offerId }: PricingEngineParams) {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Plan not found');

    const pricingMatrix = plan.pricingMatrix as Record<string, number>;
    const durationCode = durationMonths === 1 ? '1m' :
                         durationMonths === 3 ? '3m' :
                         durationMonths === 6 ? '6m' :
                         durationMonths === 12 ? '1y' :
                         durationMonths === 24 ? '2y' :
                         durationMonths === 36 ? '3y' : null;

    if (!durationCode || !pricingMatrix[durationCode]) {
      throw new Error(`Pricing not configured for duration: ${durationMonths} months`);
    }

    // Base price per month from 1m or just use the duration's price as base
    // Usually base price is 1m price * durationMonths
    const basePrice1m = pricingMatrix['1m'] || (pricingMatrix[durationCode] / durationMonths);
    const basePrice = basePrice1m * durationMonths;
    let currentPrice = pricingMatrix[durationCode];
    let durationDiscount = basePrice - currentPrice;
    
    let promoDiscount = 0;
    let couponDiscount = 0;
    
    // Check Offer
    if (offerId) {
      const offer = await prisma.offer.findUnique({ where: { id: offerId } });
      if (offer && offer.isActive && new Date() >= offer.startDate && new Date() <= offer.endDate) {
        if (offer.discountType === 'percentage') {
          promoDiscount = currentPrice * (offer.discountValue / 100);
        } else if (offer.discountType === 'fixed') {
          promoDiscount = offer.discountValue;
        }
        currentPrice -= promoDiscount;
      }
    }

    // Check Coupon
    let couponRecord = null;
    if (couponCode) {
      couponRecord = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
      if (couponRecord && couponRecord.isActive) {
        if (!couponRecord.expiresAt || new Date() < couponRecord.expiresAt) {
          if (couponRecord.discountType === 'percentage') {
            couponDiscount = currentPrice * (couponRecord.discountValue / 100);
          } else if (couponRecord.discountType === 'fixed') {
            couponDiscount = couponRecord.discountValue;
          }
          currentPrice -= couponDiscount;
        }
      }
    }

    // Ensure price doesn't go below 0
    if (currentPrice < 0) currentPrice = 0;

    const netPrice = currentPrice;
    const totalDiscount = durationDiscount + promoDiscount + couponDiscount;
    const savingsPercent = basePrice > 0 ? (totalDiscount / basePrice) * 100 : 0;

    const priceSnapshot = {
      basePrice,
      durationDiscount,
      promoDiscount,
      couponDiscount,
      netPrice,
      savingsPercent: Number(savingsPercent.toFixed(2)),
      durationMonths,
      couponCode: couponRecord ? couponRecord.code : null,
      offerId: offerId || null,
      calculatedAt: new Date().toISOString()
    };

    return {
      basePrice,
      durationDiscount,
      promoDiscount,
      couponDiscount,
      netPrice,
      savingsPercent: Number(savingsPercent.toFixed(2)),
      priceSnapshot
    };
  }
}

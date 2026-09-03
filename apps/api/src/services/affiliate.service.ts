import { PrismaClient, SubscriptionReference } from '@prisma/client';

const prisma = new PrismaClient();

export class AffiliateService {
  static async processSaleAttribution({ subscriptionReference, couponCode }: { subscriptionReference: SubscriptionReference, couponCode: string }) {
    if (!couponCode) return null;

    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode.toUpperCase() },
      include: { affiliate: true }
    });

    if (!coupon || !coupon.affiliateId || !coupon.affiliate) {
      return null;
    }

    const affiliate = coupon.affiliate;
    
    // Calculate commission
    let commissionAmount = 0;
    const basisAmount = affiliate.commissionBasis === 'gross' ? Number(subscriptionReference.grossAmount) : Number(subscriptionReference.netAmount);
    
    if (affiliate.commissionType === 'percentage') {
      commissionAmount = basisAmount * (affiliate.commissionValue / 100);
    } else {
      commissionAmount = affiliate.commissionValue;
    }

    const sale = await prisma.affiliateSale.create({
      data: {
        subscriptionReferenceId: subscriptionReference.id,
        affiliateId: affiliate.id,
        couponId: coupon.id,
        couponCodeSnapshot: coupon.code,
        grossAmount: subscriptionReference.grossAmount || 0,
        discountAmount: subscriptionReference.discountAmount || 0,
        netAmount: subscriptionReference.netAmount || 0,
        commissionAmount,
        commissionRateSnapshot: {
          type: affiliate.commissionType,
          value: affiliate.commissionValue,
          basis: affiliate.commissionBasis
        },
        paymentStatus: 'PAID',
        payoutStatus: 'PENDING'
      }
    });

    return sale;
  }

  static async getAffiliateMonthlyReport({ month, year, affiliateId }: { month: number, year: number, affiliateId: string }) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const sales = await prisma.affiliateSale.findMany({
      where: {
        affiliateId,
        saleDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        subscriptionReference: true
      }
    });

    let grossSales = 0;
    let netRevenue = 0;
    let totalCommission = 0;
    let pendingPayouts = 0;
    let paidPayouts = 0;
    
    const customerIds = new Set();

    sales.forEach(sale => {
      grossSales += Number(sale.grossAmount);
      netRevenue += Number(sale.netAmount);
      totalCommission += Number(sale.commissionAmount);

      if (sale.payoutStatus === 'PENDING') {
        pendingPayouts += Number(sale.commissionAmount);
      } else if (sale.payoutStatus === 'PAID') {
        paidPayouts += Number(sale.commissionAmount);
      }

      if (sale.subscriptionReference && sale.subscriptionReference.customerId) {
        customerIds.add(sale.subscriptionReference.customerId);
      }
    });

    return {
      month,
      year,
      totalSalesCount: sales.length,
      uniqueCustomers: customerIds.size,
      grossSales,
      netRevenue,
      totalCommission,
      pendingPayouts,
      paidPayouts
    };
  }
}

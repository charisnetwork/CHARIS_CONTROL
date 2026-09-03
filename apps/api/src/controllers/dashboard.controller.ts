import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/** Real control-plane metrics only. Product activity and login data belongs to
 * each product's authenticated `/control/*` adapter and is never fabricated. */
export const getStats = async (req: Request, res: Response) => {
  const applicationId = typeof req.query.applicationId === 'string' ? req.query.applicationId : undefined;
  const subscriptions = await prisma.subscriptionReference.findMany({
    where: applicationId ? { applicationId } : {},
    select: { customerId: true, status: true, paymentStatus: true, finalPrice: true, price: true, durationMonths: true, createdAt: true, endDate: true, plan: { select: { id: true, name: true } } },
  });
  const active = subscriptions.filter((subscription) => ['ACTIVE', 'TRIAL'].includes(subscription.status));
  const paidActive = active.filter((subscription) => subscription.paymentStatus === 'PAID');
  const mrr = paidActive.reduce((sum, subscription) => sum + Number(subscription.finalPrice ?? subscription.price ?? 0) / Math.max(1, subscription.durationMonths || 1), 0);
  const now = new Date();
  const inThirtyDays = new Date(now); inThirtyDays.setDate(now.getDate() + 30);
  const planDistribution = Object.values(active.reduce<Record<string, { name: string; count: number }>>((all, subscription) => {
    const key = subscription.plan?.id || 'unassigned';
    const current = all[key] || { name: subscription.plan?.name || 'Unassigned', count: 0 };
    current.count += 1; all[key] = current; return all;
  }, {}));
  const revenueData = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const revenue = subscriptions.filter((subscription) => subscription.paymentStatus === 'PAID' && subscription.createdAt >= month && subscription.createdAt < nextMonth)
      .reduce((sum, subscription) => sum + Number(subscription.finalPrice ?? subscription.price ?? 0), 0);
    return { month: month.toLocaleString('en', { month: 'short' }), revenue };
  });
  res.json({ stats: {
    totalTenants: new Set(subscriptions.map((subscription) => subscription.customerId)).size,
    totalSubscriptions: subscriptions.length,
    activeSubscriptions: active.length,
    trialSubscriptions: subscriptions.filter((subscription) => subscription.status === 'TRIAL').length,
    cancelledSubscriptions: subscriptions.filter((subscription) => subscription.status === 'CANCELLED').length,
    failedPayments: subscriptions.filter((subscription) => subscription.paymentStatus === 'FAILED').length,
    expiringSubscriptions: active.filter((subscription) => subscription.endDate && subscription.endDate >= now && subscription.endDate <= inThirtyDays).length,
    mrr, arr: mrr * 12, planDistribution, revenueData,
    dataSources: { controlCentre: true, productOperationalData: false },
  } });
};

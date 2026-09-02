import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getReports = async (req: Request, res: Response) => {
  // Return MRR, ARR, active subscriptions, revenue stats
  const activeSubscriptions = await prisma.subscriptionReference.count({
    where: { status: 'ACTIVE' }
  });
  
  const allSubs = await prisma.subscriptionReference.findMany({
    where: { status: 'ACTIVE' },
    select: { price: true, billingCycle: true }
  });

  let mrr = 0;
  let arr = 0;
  
  allSubs.forEach(sub => {
    const price = sub.price || 0;
    if (sub.billingCycle === 'MONTHLY') {
      mrr += price;
      arr += price * 12;
    } else if (sub.billingCycle === 'YEARLY') {
      mrr += price / 12;
      arr += price;
    }
  });

  const revenueStats = {
    totalRevenue: arr, // simplified
    monthlyRecurringRevenue: mrr,
    annualRecurringRevenue: arr
  };

  res.json({
    activeSubscriptions,
    mrr,
    arr,
    revenueStats
  });
};

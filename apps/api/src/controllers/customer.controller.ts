import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getCustomers = async (req: Request, res: Response) => {
  const subscriptions = await prisma.subscriptionReference.findMany({
    select: {
      customerId: true,
      customerEmail: true,
      customerName: true,
      applicationId: true,
      application: {
        select: { displayName: true }
      },
      status: true,
      createdAt: true,
    }
  });

  const customersMap = new Map();
  
  subscriptions.forEach(sub => {
    const key = sub.customerEmail || sub.customerId;
    if (!customersMap.has(key)) {
      customersMap.set(key, {
        id: sub.customerId,
        email: sub.customerEmail,
        name: sub.customerName,
        applications: [],
        firstSeen: sub.createdAt,
        status: sub.status
      });
    }
    const c = customersMap.get(key);
    c.applications.push(sub.application?.displayName || sub.applicationId);
    if (sub.createdAt < c.firstSeen) c.firstSeen = sub.createdAt;
  });

  res.json(Array.from(customersMap.values()));
};

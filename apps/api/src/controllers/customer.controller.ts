import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error.middleware';
import { externalAppRequest } from '../services/integrationService';

export const getCustomers = async (req: Request, res: Response) => {
  const applicationId = typeof req.query.applicationId === 'string' ? req.query.applicationId : undefined;
  if (applicationId) {
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application?.apiKey) throw new AppError('Application integration is not configured', 409);
    const operational = await externalAppRequest(application.apiBaseUrl, application.apiKey, '/control/customers');
    const rows = Array.isArray(operational?.data) ? operational.data : [];
    const subscriptions = await prisma.subscriptionReference.findMany({ where: { applicationId }, include: { plan: { select: { name: true, code: true } } }, orderBy: { updatedAt: 'desc' } });
    const byTenant = new Map(subscriptions.map((subscription) => [subscription.customerId, subscription]));
    res.json({ data: rows.map((customer: any) => {
      const subscription = byTenant.get(customer.tenantId);
      return {
        ...customer,
        controlCentreSubscription: subscription ? {
          id: subscription.id, status: subscription.status, startDate: subscription.startDate, endDate: subscription.endDate,
          plan: subscription.plan, entitlementStatus: ['ACTIVE', 'TRIAL'].includes(subscription.status) ? 'ACTIVE' : 'INACTIVE',
        } : null,
      };
    }), page: operational?.page || null });
    return;
  }
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

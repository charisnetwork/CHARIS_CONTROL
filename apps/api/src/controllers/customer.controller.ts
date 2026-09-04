import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error.middleware';
import { externalAppRequest } from '../services/integrationService';

export const getCustomers = async (req: Request, res: Response) => {
  const applicationId = typeof req.query.applicationId === 'string' ? req.query.applicationId : undefined;
  if (applicationId) {
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    let rows: any[] = [];
    let page: any = null;

    if (application?.apiBaseUrl && application?.apiKey) {
      try {
        const operational = await externalAppRequest(application.apiBaseUrl, application.apiKey, '/control/customers');
        rows = Array.isArray(operational?.data) ? operational.data : [];
        page = operational?.page || null;
      } catch (e) {
        console.warn(`[CustomerController] Operational customer adapter call failed for application ${applicationId}:`, e);
      }
    }

    const subscriptions = await prisma.subscriptionReference.findMany({ 
      where: { applicationId }, 
      include: { plan: { select: { name: true, code: true } } }, 
      orderBy: { updatedAt: 'desc' } 
    });

    if (rows.length > 0) {
      const byTenant = new Map(subscriptions.map((subscription) => [subscription.customerId, subscription]));
      return res.json({ 
        data: rows.map((customer: any) => {
          const subscription = byTenant.get(customer.tenantId);
          return {
            ...customer,
            controlCentreSubscription: subscription ? {
              id: subscription.id, 
              status: subscription.status, 
              startDate: subscription.startDate, 
              endDate: subscription.endDate,
              plan: subscription.plan, 
              entitlementStatus: ['ACTIVE', 'TRIAL'].includes(subscription.status) ? 'ACTIVE' : 'INACTIVE',
            } : null,
          };
        }), 
        page 
      });
    }

    // Fallback: Return subscriptions from Control Centre database if external app adapter is unconfigured/offline
    return res.json({
      data: subscriptions.map(sub => ({
        tenantId: sub.customerId,
        companyName: sub.customerName || sub.customerId,
        email: sub.customerEmail || '—',
        owner: { name: sub.customerName || 'Tenant Customer' },
        subscription: { plan: sub.plan, status: sub.status },
        controlCentreSubscription: {
          id: sub.id,
          status: sub.status,
          startDate: sub.startDate,
          endDate: sub.endDate,
          plan: sub.plan,
          entitlementStatus: ['ACTIVE', 'TRIAL'].includes(sub.status) ? 'ACTIVE' : 'INACTIVE'
        }
      })),
      page: null
    });
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

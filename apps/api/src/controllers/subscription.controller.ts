import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { externalAppRequest } from '../services/integrationService';
import { AppError } from '../middlewares/error.middleware';

export const getSubscriptions = async (req: Request, res: Response) => {
  const { productId } = req.query;
  if (!productId || productId === 'all') {
    res.status(400).json({ message: 'A specific productId is required' });
    return;
  }
  
  const app = await prisma.application.findUnique({ where: { id: String(productId) } });
  
  if (!app || !app.apiBaseUrl || !app.apiKey) {
    throw new AppError('Application not found or missing integration configuration', 404);
  }

  // Fetch live from the external app
  const data = await externalAppRequest(app.apiBaseUrl, app.apiKey, '/api/admin/subscriptions');
  res.json(data);
};

export const getCustomers = async (req: Request, res: Response) => {
  const { productId } = req.query;
  if (!productId || productId === 'all') {
    res.status(400).json({ message: 'A specific productId is required' });
    return;
  }
  
  const app = await prisma.application.findUnique({ where: { id: String(productId) } });
  if (!app || !app.apiBaseUrl || !app.apiKey) {
    throw new AppError('Application not found or missing integration configuration', 404);
  }

  const data = await externalAppRequest(app.apiBaseUrl, app.apiKey, '/api/admin/customers');
  res.json(data);
};

export const getSubscriptionAnalytics = async (req: Request, res: Response) => {
  const { productId } = req.query;
  if (!productId) {
    res.status(400).json({ message: 'productId is required' });
    return;
  }
  
  if (productId === 'all') {
    // If fetching all, we could iterate over all active apps and sum their stats, but for now:
    res.json({
      totalCustomers: 0,
      activeSubscriptions: 0,
      trialSubscriptions: 0,
      cancelledSubscriptions: 0,
      mrr: 0,
      arr: 0,
    });
    return;
  }
  
  const app = await prisma.application.findUnique({ where: { id: String(productId) } });
  if (!app || !app.apiBaseUrl || !app.apiKey) {
    throw new AppError('Application not found or missing integration configuration', 404);
  }

  const data = await externalAppRequest(app.apiBaseUrl, app.apiKey, '/api/admin/stats');
  res.json(data);
};

export const createSubscription = async (req: Request, res: Response) => {
  const { applicationId, customerId, planId, status, price, billingCycle, startDate } = req.body;
  if (!applicationId || !customerId || !planId) {
    throw new AppError('applicationId, customerId, and planId are required', 400);
  }

  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) throw new AppError('Application not found', 404);

  const sub = await prisma.subscriptionReference.create({
    data: {
      applicationId, customerId, planId, status, price, billingCycle, startDate: new Date(startDate)
    },
    include: { plan: true }
  });

  await prisma.subscriptionEvent.create({
    data: {
      subscriptionReferenceId: sub.id,
      eventType: 'SUBSCRIPTION_CREATED',
      newPlanId: planId
    }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    WebhookService.dispatch(application, 'SUBSCRIPTION_CREATED', sub);
  });

  res.status(201).json(sub);
};

export const updateSubscription = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { planId, status, reason, price } = req.body;

  const sub = await prisma.subscriptionReference.findUnique({ where: { id }, include: { application: true, plan: true } });
  if (!sub) throw new AppError('Subscription not found', 404);

  let eventType: string | null = null;
  const isStatusChange = status && status !== sub.status;
  const isPlanChange = planId && planId !== sub.planId;

  if (!isStatusChange && !isPlanChange && price === undefined) {
    res.json(sub);
    return;
  }

  if (isStatusChange) {
    if (status === 'ACTIVE') eventType = 'SUBSCRIPTION_ACTIVATED';
    else if (status === 'EXPIRED') eventType = 'SUBSCRIPTION_EXPIRED';
    else if (status === 'SUSPENDED') eventType = 'SUBSCRIPTION_SUSPENDED';
    else eventType = 'SUBSCRIPTION_UPDATED';
  } else if (isPlanChange) {
    const newPlan = await prisma.plan.findUnique({ where: { id: planId } });
    if (newPlan && sub.plan) {
      const oldPrice = sub.price || 0;
      const newPrice = price !== undefined ? price : oldPrice;
      if (newPrice > oldPrice || newPlan.order > sub.plan.order) {
        eventType = 'SUBSCRIPTION_UPGRADED';
      } else if (newPrice < oldPrice || newPlan.order < sub.plan.order) {
        eventType = 'SUBSCRIPTION_DOWNGRADED';
      } else {
        eventType = 'PLAN_CHANGED';
      }
    } else {
      eventType = 'PLAN_CHANGED';
    }
  }

  if (!eventType) eventType = 'SUBSCRIPTION_UPDATED';

  const updatedSub = await prisma.subscriptionReference.update({
    where: { id },
    data: { planId: planId || sub.planId, status: status || sub.status, price: price !== undefined ? price : sub.price },
    include: { plan: true, application: true }
  });

  await prisma.subscriptionEvent.create({
    data: {
      subscriptionReferenceId: sub.id,
      eventType,
      previousPlanId: sub.planId,
      newPlanId: planId || sub.planId,
      reason
    }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    WebhookService.dispatch(sub.application, eventType as string, updatedSub);
  });

  res.json(updatedSub);
};

export const cancelSubscription = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { reason } = req.body;

  const sub = await prisma.subscriptionReference.findUnique({ where: { id }, include: { application: true } });
  if (!sub) throw new AppError('Subscription not found', 404);

  const updatedSub = await prisma.subscriptionReference.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: { application: true }
  });

  await prisma.subscriptionEvent.create({
    data: {
      subscriptionReferenceId: sub.id,
      eventType: 'SUBSCRIPTION_CANCELLED',
      reason
    }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    WebhookService.dispatch(sub.application, 'SUBSCRIPTION_CANCELLED', updatedSub);
  });

  res.json(updatedSub);
};


export const renewSubscription = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { nextRenewalDate, reason } = req.body;

  const sub = await prisma.subscriptionReference.findUnique({ where: { id }, include: { application: true } });
  if (!sub) throw new AppError('Subscription not found', 404);

  const updatedSub = await prisma.subscriptionReference.update({
    where: { id },
    data: { nextRenewalDate: nextRenewalDate ? new Date(nextRenewalDate) : sub.nextRenewalDate },
    include: { application: true }
  });

  await prisma.subscriptionEvent.create({
    data: {
      subscriptionReferenceId: sub.id,
      eventType: 'SUBSCRIPTION_RENEWED',
      reason
    }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    WebhookService.dispatch(sub.application, 'SUBSCRIPTION_RENEWED', updatedSub);
  });

  res.json(updatedSub);
};

export const failPayment = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { reason } = req.body;

  const sub = await prisma.subscriptionReference.findUnique({ where: { id }, include: { application: true } });
  if (!sub) throw new AppError('Subscription not found', 404);

  const updatedSub = await prisma.subscriptionReference.update({
    where: { id },
    data: { paymentStatus: 'FAILED' },
    include: { application: true }
  });

  await prisma.subscriptionEvent.create({
    data: {
      subscriptionReferenceId: sub.id,
      eventType: 'PAYMENT_FAILED',
      reason
    }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    WebhookService.dispatch(sub.application, 'PAYMENT_FAILED', updatedSub);
  });

  res.json(updatedSub);
};

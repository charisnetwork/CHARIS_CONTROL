import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error.middleware';

export const getPlans = async (req: Request, res: Response) => {
  const { productId } = req.query;
  if (!productId || productId === 'all') {
    res.status(400).json({ message: 'A specific productId is required' });
    return;
  }
  
  const plans = await (prisma as any).plan.findMany({
    where: { subscriptionModel: { mappings: { some: { applicationId: String(productId), isActive: true } } } },
    include: { priceOptions: { include: { tiers: true }, orderBy: { durationMonths: 'asc' } }, promotions: { where: { isActive: true } }, featureEntitlements: { include: { feature: { include: { fields: true } } } } },
    orderBy: { order: 'asc' },
  });
  res.json(plans);
};

export const createPlan = async (req: Request, res: Response) => {
  const { name, code, description, subscriptionModelId: suppliedModelId, applicationId, order, pricingMatrix, isActive, priceOptions = [] } = req.body;
  if (!name || !code || (!suppliedModelId && !applicationId)) {
    throw new AppError('name, code, and applicationId (or subscriptionModelId) are required', 400);
  }
  const mapping = suppliedModelId ? null : await prisma.applicationMapping.findFirst({ where: { applicationId, isActive: true } });
  const subscriptionModelId = suppliedModelId || mapping?.subscriptionModelId;
  if (!subscriptionModelId) throw new AppError('Application has no active subscription model mapping', 409);
  if (!Array.isArray(priceOptions) || priceOptions.some((option: any) => !Number.isInteger(option.durationMonths) || option.durationMonths < 1 || !Number.isFinite(Number(option.baseAmount)) || Number(option.baseAmount) < 0)) {
    throw new AppError('priceOptions must contain valid durationMonths and non-negative baseAmount values', 400);
  }
  const newPlan = await prisma.plan.create({
    data: {
      name, code: String(code).trim().toLowerCase(), description, subscriptionModelId, order, pricingMatrix, isActive,
      priceOptions: priceOptions.length ? { create: priceOptions.map((option: any) => ({
        durationMonths: Number(option.durationMonths), currency: option.currency || 'INR', baseAmount: Number(option.baseAmount),
        tiers: Array.isArray(option.tiers) && option.tiers.length ? { create: option.tiers.map((tier: any) => ({ periodNumber: Number(tier.periodNumber), monthlyAmount: Number(tier.monthlyAmount) })) } : undefined,
      })) } : undefined,
    } as any,
    include: { priceOptions: { include: { tiers: true } }, featureEntitlements: { include: { feature: true } } },
  });
  res.status(201).json(newPlan);
};

export const updatePlan = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, description, order, pricingMatrix, isActive, priceOptions } = req.body;

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) throw new AppError('Plan not found', 404);

  if (priceOptions !== undefined && (!Array.isArray(priceOptions) || priceOptions.some((option: any) => !Number.isInteger(option.durationMonths) || option.durationMonths < 1 || !Number.isFinite(Number(option.baseAmount)) || Number(option.baseAmount) < 0))) {
    throw new AppError('priceOptions must contain valid durationMonths and non-negative baseAmount values', 400);
  }
  const updatedPlan = await prisma.plan.update({
    where: { id },
    data: {
      name, description, order, pricingMatrix, isActive,
      ...(priceOptions === undefined ? {} : { priceOptions: {
        deleteMany: {},
        create: priceOptions.map((option: any) => ({
          durationMonths: Number(option.durationMonths), currency: option.currency || 'INR', baseAmount: Number(option.baseAmount),
          tiers: Array.isArray(option.tiers) && option.tiers.length ? { create: option.tiers.map((tier: any) => ({ periodNumber: Number(tier.periodNumber), monthlyAmount: Number(tier.monthlyAmount) })) } : undefined,
        })),
      } }),
    } as any,
    include: { priceOptions: { include: { tiers: true } }, featureEntitlements: { include: { feature: true } } },
  });

  const subs = await prisma.subscriptionReference.findMany({
    where: { planId: id },
    include: { application: true }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    subs.forEach(sub => {
      WebhookService.dispatch(sub.application, 'PLAN_CHANGED', { subscriptionId: sub.id, plan: updatedPlan });
    });
  });

  res.json(updatedPlan);
};

export const updateFeature = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, code, description, category } = req.body;

  const feature = await prisma.feature.findUnique({ where: { id } });
  if (!feature) throw new AppError('Feature not found', 404);

  const updatedFeature = await prisma.feature.update({
    where: { id },
    data: { name, code, description, category }
  });

  const plans = await prisma.plan.findMany({
    where: { subscriptionModelId: feature.subscriptionModelId },
    include: { subscriptionReferences: { include: { application: true } } }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    plans.forEach(plan => {
      plan.subscriptionReferences.forEach(sub => {
        WebhookService.dispatch(sub.application, 'FEATURE_CHANGED', { subscriptionId: sub.id, feature: updatedFeature });
      });
    });
  });

  res.json(updatedFeature);
};

export const updateFeatureLimit = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { type, value, errorMessage } = req.body;

  const rule = await prisma.validationRule.findUnique({ where: { id }, include: { featureField: { include: { feature: true } } } });
  if (!rule) throw new AppError('Validation rule not found', 404);

  const updatedRule = await prisma.validationRule.update({
    where: { id },
    data: { type, value, errorMessage }
  });

  const plans = await prisma.plan.findMany({
    where: { subscriptionModelId: rule.featureField.feature.subscriptionModelId },
    include: { subscriptionReferences: { include: { application: true } } }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    plans.forEach(plan => {
      plan.subscriptionReferences.forEach(sub => {
        WebhookService.dispatch(sub.application, 'LIMIT_CHANGED', { subscriptionId: sub.id, rule: updatedRule });
      });
    });
  });

  res.json(updatedRule);
};

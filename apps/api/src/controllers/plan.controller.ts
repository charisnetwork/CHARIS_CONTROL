import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error.middleware';

export const getPlans = async (req: Request, res: Response) => {
  const { productId } = req.query;
  const whereCondition = (productId && productId !== 'all')
    ? { subscriptionModel: { mappings: { some: { applicationId: String(productId), isActive: true } } } }
    : {};

  const plans = await (prisma as any).plan.findMany({
    where: whereCondition,
    include: {
      priceOptions: { include: { tiers: true }, orderBy: { durationMonths: 'asc' } },
      promotions: { where: { isActive: true } },
      featureEntitlements: { include: { feature: { include: { fields: true } } } }
    },
    orderBy: { order: 'asc' },
  });
  res.json(plans);
};

export const getFeatureGroups = async (req: Request, res: Response) => {
  const groups = await prisma.featureGroup.findMany({
    include: {
      features: {
        orderBy: { sortOrder: 'asc' }
      }
    },
    orderBy: { sortOrder: 'asc' }
  });
  res.json(groups);
};

export const getPlanFeatures = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const entitlements = await (prisma as any).planFeatureEntitlement.findMany({
    where: { planId: id },
    include: { feature: true }
  });
  res.json(entitlements);
};

export const updatePlanFeatures = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const featuresList: Array<{ featureId: string; isEnabled: boolean }> = req.body.features || req.body;

  if (!Array.isArray(featuresList)) {
    throw new AppError('Body must contain array of features { featureId, isEnabled }', 400);
  }

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) throw new AppError('Plan not found', 404);

  const updatedEntitlements = [];
  for (const item of featuresList) {
    if (!item.featureId) continue;
    const ent = await (prisma as any).planFeatureEntitlement.upsert({
      where: { planId_featureId: { planId: id, featureId: item.featureId } },
      update: { isEnabled: item.isEnabled },
      create: { planId: id, featureId: item.featureId, isEnabled: item.isEnabled }
    });
    updatedEntitlements.push(ent);
  }

  // Notify connected app subscriptions via Webhook
  const subs = await (prisma as any).subscriptionReference.findMany({
    where: { planId: id },
    include: { application: true }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    subs.forEach((sub: any) => {
      if (sub.application) {
        WebhookService.dispatch(sub.application, 'FEATURE_CHANGED', {
          subscriptionId: sub.id,
          planId: id,
          updatedEntitlementsCount: updatedEntitlements.length
        });
      }
    });
  });

  res.json({ message: 'Plan feature matrix updated successfully', count: updatedEntitlements.length });
};

export const createPlan = async (req: Request, res: Response) => {
  const { name, code, description, priceMonthly, priceYearly, currency = 'INR', badge, isRecommended = false, subscriptionModelId: suppliedModelId, applicationId, order = 0, pricingMatrix, isActive = true, priceOptions = [] } = req.body;
  if (!name || !code) {
    throw new AppError('name and code are required', 400);
  }

  let subscriptionModelId = suppliedModelId;
  if (!subscriptionModelId) {
    const defaultModel = await prisma.subscriptionModel.findFirst();
    subscriptionModelId = defaultModel?.id;
  }
  if (!subscriptionModelId) throw new AppError('No subscription model found in system', 409);

  const newPlan = await prisma.plan.create({
    data: {
      name,
      code: String(code).trim().toLowerCase(),
      description,
      badge,
      isRecommended,
      priceMonthly: priceMonthly !== undefined ? Number(priceMonthly) : undefined,
      priceYearly: priceYearly !== undefined ? Number(priceYearly) : undefined,
      currency,
      subscriptionModelId,
      order: Number(order) || 0,
      pricingMatrix,
      isActive,
      priceOptions: Array.isArray(priceOptions) && priceOptions.length ? {
        create: priceOptions.map((option: any) => ({
          durationMonths: Number(option.durationMonths), currency: option.currency || 'INR', baseAmount: Number(option.baseAmount),
          tiers: Array.isArray(option.tiers) && option.tiers.length ? { create: option.tiers.map((tier: any) => ({ periodNumber: Number(tier.periodNumber), monthlyAmount: Number(tier.monthlyAmount) })) } : undefined,
        }))
      } : undefined,
    } as any,
    include: { priceOptions: { include: { tiers: true } }, featureEntitlements: { include: { feature: true } } },
  });
  res.status(201).json(newPlan);
};

export const updatePlan = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { name, code, description, priceMonthly, priceYearly, currency, badge, isRecommended, order, pricingMatrix, isActive, priceOptions } = req.body;

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) throw new AppError('Plan not found', 404);

  const updatedPlan = await prisma.plan.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(code !== undefined && { code: String(code).trim().toLowerCase() }),
      ...(description !== undefined && { description }),
      ...(badge !== undefined && { badge }),
      ...(isRecommended !== undefined && { isRecommended: Boolean(isRecommended) }),
      ...(priceMonthly !== undefined && { priceMonthly: Number(priceMonthly) }),
      ...(priceYearly !== undefined && { priceYearly: Number(priceYearly) }),
      ...(currency !== undefined && { currency }),
      ...(order !== undefined && { order: Number(order) }),
      ...(pricingMatrix !== undefined && { pricingMatrix }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(priceOptions === undefined ? {} : {
        priceOptions: {
          deleteMany: {},
          create: priceOptions.map((option: any) => ({
            durationMonths: Number(option.durationMonths), currency: option.currency || 'INR', baseAmount: Number(option.baseAmount),
            tiers: Array.isArray(option.tiers) && option.tiers.length ? { create: option.tiers.map((tier: any) => ({ periodNumber: Number(tier.periodNumber), monthlyAmount: Number(tier.monthlyAmount) })) } : undefined,
          })),
        }
      }),
    } as any,
    include: { priceOptions: { include: { tiers: true } }, featureEntitlements: { include: { feature: true } } },
  });

  const subs = await (prisma as any).subscriptionReference.findMany({
    where: { planId: id },
    include: { application: true }
  });

  import('../services/webhook.service').then(({ WebhookService }) => {
    subs.forEach((sub: any) => {
      if (sub.application) {
        WebhookService.dispatch(sub.application, 'PLAN_CHANGED', { subscriptionId: sub.id, plan: updatedPlan });
      }
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

  res.json(updatedRule);
};


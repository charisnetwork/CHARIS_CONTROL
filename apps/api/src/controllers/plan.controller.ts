import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { externalAppRequest } from '../services/integrationService';
import { AppError } from '../middlewares/error.middleware';

export const getPlans = async (req: Request, res: Response) => {
  const { productId } = req.query;
  if (!productId || productId === 'all') {
    res.status(400).json({ message: 'A specific productId is required' });
    return;
  }
  
  const app = await prisma.application.findUnique({ where: { id: String(productId) } });
  if (!app || !app.apiBaseUrl || !app.apiKey) {
    throw new AppError('Application not found or missing integration configuration', 404);
  }

  const data = await externalAppRequest(app.apiBaseUrl, app.apiKey, '/api/admin/plans');
  res.json(data);
};

export const createPlan = async (req: Request, res: Response) => {
  const { name, code, description, subscriptionModelId, order, pricingMatrix, isActive } = req.body;
  if (!name || !code || !subscriptionModelId) {
    throw new AppError('name, code, and subscriptionModelId are required', 400);
  }
  const newPlan = await prisma.plan.create({
    data: { name, code, description, subscriptionModelId, order, pricingMatrix, isActive }
  });
  res.status(201).json(newPlan);
};

export const updatePlan = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, description, order, pricingMatrix, isActive } = req.body;

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) throw new AppError('Plan not found', 404);

  const updatedPlan = await prisma.plan.update({
    where: { id },
    data: { name, description, order, pricingMatrix, isActive }
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


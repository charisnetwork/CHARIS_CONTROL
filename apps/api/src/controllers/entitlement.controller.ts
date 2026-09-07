import { Request, Response } from 'express';
import { AppError } from '../middlewares/error.middleware';
import { EntitlementService } from '../services/entitlement.service';
import { prisma } from '../lib/prisma';

/** Machine-to-machine: the registered application API key fixes the application scope. */
export const getEntitlement = async (req: Request, res: Response) => {
  const apiKey = req.header('x-charis-api-key') || req.header('x-api-key');
  const tenantId = String(req.params.tenantId || req.query.tenantId || req.query.customerId || '');
  if (!apiKey || !tenantId) throw new AppError('Application credentials and tenantId are required', 401);
  const application = await prisma.application.findFirst({ where: { apiKey, status: 'ACTIVE' } });
  if (!application) throw new AppError('Invalid application credentials', 401);
  if (!application.privateKey) throw new AppError('Application signing key is not configured', 503);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ token: await EntitlementService.generateEntitlementToken(application.id, tenantId) });
};

/** High-level entitlement object for UI features check */
export const getTenantEntitlements = async (req: Request, res: Response) => {
  const apiKey = req.header('x-charis-api-key') || req.header('x-api-key');
  const tenantId = String(req.params.tenantId || req.query.tenantId || req.query.customerId || '');

  if (!apiKey || !tenantId) throw new AppError('Application credentials and tenantId are required', 401);

  const application = await prisma.application.findFirst({ where: { apiKey, status: 'ACTIVE' } });
  if (!application) throw new AppError('Invalid application credentials', 401);

  const sub = await prisma.subscriptionReference.findFirst({
    where: {
      applicationId: application.id,
      customerId: tenantId
    },
    include: {
      plan: {
        include: {
          featureEntitlements: {
            include: { feature: true }
          }
        }
      },
      featureOverrides: {
        include: { feature: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const featureMap: Record<string, boolean> = {};

  if (sub && sub.plan) {
    sub.plan.featureEntitlements.forEach(fe => {
      if (fe.feature?.code) {
        featureMap[fe.feature.code] = fe.isEnabled;
      }
    });
    sub.featureOverrides.forEach(ov => {
      if (ov.feature?.code) {
        featureMap[ov.feature.code] = ov.isEnabledOverride;
      }
    });
  }

  res.json({
    tenantId,
    status: sub?.status || 'EXPIRED',
    plan: sub?.plan ? {
      id: sub.plan.id,
      name: sub.plan.name,
      code: sub.plan.code,
      badge: sub.plan.badge,
      description: sub.plan.description,
      priceMonthly: sub.plan.priceMonthly,
      priceYearly: sub.plan.priceYearly,
      currency: sub.plan.currency
    } : null,
    features: featureMap,
    endDate: sub?.endDate || null
  });
};


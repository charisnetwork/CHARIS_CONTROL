import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getPublicCatalog = async (req: Request, res: Response) => {
  try {
    const applicationSlug = req.params.applicationSlug as string;

    const app = await prisma.application.findFirst({
      where: { OR: [{ applicationName: applicationSlug }, { displayName: applicationSlug }] },
      include: {
        featureGroups: {
          orderBy: { sortOrder: 'asc' },
          include: {
            features: { orderBy: { sortOrder: 'asc' } }
          }
        },
        mappings: {
          include: {
            subscriptionModel: {
              include: {
                plans: {
                  where: { isActive: true },
                  orderBy: { order: 'asc' },
                  include: {
                    priceOptions: { where: { isActive: true } },
                    featureEntitlements: { include: { feature: true } }
                  }
                }
              }
            }
          }
        },
        offers: {
          where: { isActive: true, status: 'active', startDate: { lte: new Date() }, endDate: { gte: new Date() } },
          select: {
            id: true,
            name: true,
            productId: true,
            planId: true,
            durationMonths: true,
            discountType: true,
            discountValue: true,
            perks: true,
            banner: true,
            description: true,
            startDate: true,
            endDate: true,
            displayBadge: true
          }
        }
      }
    });

    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const featureGroups = app.featureGroups.map(g => ({
      id: g.id,
      name: g.name,
      code: g.code,
      sortOrder: g.sortOrder,
      features: g.features.map(f => ({
        id: f.id,
        name: f.name,
        code: f.code,
        description: f.description,
        sortOrder: f.sortOrder
      }))
    }));

    const plans = app.mappings.flatMap(m => m.subscriptionModel.plans).map(plan => {
      const entitlementsMap: Record<string, boolean> = {};
      plan.featureEntitlements.forEach(fe => {
        if (fe.feature?.code) {
          entitlementsMap[fe.feature.code] = fe.isEnabled;
        }
      });

      return {
        id: plan.id,
        name: plan.name,
        code: plan.code,
        badge: plan.badge,
        isRecommended: plan.isRecommended,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        currency: plan.currency,
        description: plan.description,
        order: plan.order,
        perks: plan.perks,
        pricingMatrix: plan.pricingMatrix,
        entitlements: entitlementsMap,
        features: plan.featureEntitlements.map(fe => ({
          code: fe.feature.code,
          name: fe.feature.name,
          isEnabled: fe.isEnabled
        }))
      };
    });

    return res.json({
      applicationName: app.displayName || app.applicationName,
      logo: app.logo,
      description: app.description,
      featureGroups,
      plans,
      offers: app.offers
    });
  } catch (error) {
    console.error('Error fetching public catalog:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


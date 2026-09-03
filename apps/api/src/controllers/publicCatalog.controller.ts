import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getPublicCatalog = async (req: Request, res: Response) => {
  try {
    const applicationSlug = req.params.applicationSlug as string;
    
    // In a real app, applicationSlug might map to applicationName
    const app = await prisma.application.findUnique({
      where: { applicationName: applicationSlug },
      include: {
        mappings: {
          include: {
            subscriptionModel: {
              include: {
                plans: {
                  where: { isActive: true },
                  orderBy: { order: 'asc' },
                  include: {
                    priceOptions: {
                      where: { isActive: true }
                    },
                    featureEntitlements: {
                      include: { feature: true }
                    }
                  }
                },
                features: true
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

    // Prepare safe catalog data (Zero secrets)
    const catalog = {
      applicationName: app.displayName || app.applicationName,
      logo: app.logo,
      description: app.description,
      subscriptionModels: app.mappings.map((mapping: any) => {
        const sm = mapping.subscriptionModel;
        return {
          id: sm.id,
          name: sm.name,
          description: sm.description,
          plans: sm.plans.map((plan: any) => ({
            id: plan.id,
            name: plan.name,
            code: plan.code,
            badge: plan.badge,
            isRecommended: plan.isRecommended,
            description: plan.description,
            perks: plan.perks,
            pricingMatrix: plan.pricingMatrix,
            durations: ['1m', '3m', '6m', '1y', '2y', '3y'], // Available duration options
            features: plan.featureEntitlements.map((fe: any) => ({
              code: fe.feature.code,
              name: fe.feature.name,
              isEnabled: fe.isEnabled,
              limitValue: fe.limitValue,
              category: fe.feature.category
            }))
          }))
        };
      }),
      publicOffers: app.offers
    };

    return res.json(catalog);
  } catch (error) {
    console.error('Error fetching public catalog:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

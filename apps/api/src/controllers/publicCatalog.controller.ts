import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error.middleware';

/**
 * Deliberately small public projection of the commercial catalog.  This is the
 * only catalog endpoint intended for a product's browser UI: credentials,
 * internal mappings and subscription history never leave the control plane.
 */
export const getPublicCatalog = async (req: Request, res: Response) => {
  const slug = String(req.params.applicationSlug || '').trim().toLowerCase();
  if (!slug) throw new AppError('applicationSlug is required', 400);

  const application = await prisma.application.findFirst({
    where: { applicationName: { equals: slug, mode: 'insensitive' }, status: 'ACTIVE' },
    select: { id: true, applicationName: true, displayName: true, description: true },
  });
  if (!application) throw new AppError('Public catalog not found', 404);

  const plans: any[] = await (prisma as any).plan.findMany({
    where: {
      isActive: true,
      subscriptionModel: { mappings: { some: { applicationId: application.id, isActive: true } } },
    },
    orderBy: { order: 'asc' },
    include: {
      priceOptions: { where: { isActive: true }, orderBy: { durationMonths: 'asc' }, include: { tiers: { orderBy: { periodNumber: 'asc' } } } },
      promotions: { where: { isActive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } } },
      featureEntitlements: { include: { feature: true } },
    },
  });

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    product: { slug: application.applicationName, name: application.displayName, description: application.description },
    plans: plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      displayOrder: plan.order,
      recommended: /pro|popular/i.test(`${plan.code || ''} ${plan.name}`),
      prices: plan.priceOptions.map((option: any) => ({
        durationMonths: option.durationMonths,
        currency: option.currency,
        amount: Number(option.baseAmount),
        tiers: option.tiers.map((tier: any) => ({ periodNumber: tier.periodNumber, monthlyAmount: Number(tier.monthlyAmount) })),
      })),
      offers: plan.promotions.map((offer: any) => ({ name: offer.name, discountType: offer.discountType, discountValue: Number(offer.discountValue), durationMonths: offer.durationMonths })),
      features: plan.featureEntitlements.map((entry: any) => ({ code: entry.feature.code, name: entry.feature.name, enabled: entry.isEnabled, limit: entry.limitValue })),
    })),
  });
};

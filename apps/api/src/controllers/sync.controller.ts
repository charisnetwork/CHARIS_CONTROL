import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middlewares/error.middleware';

const prisma = new PrismaClient();

/**
 * External apps (like Bill Easy) call this endpoint to pull down the master
 * catalog of plans and feature entitlements they need to enforce locally.
 */
export const syncEntitlements = async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    throw new AppError('Missing x-api-key header', 401);
  }

  // 1. Identify the application calling us
  const application = await prisma.application.findUnique({
    where: { apiKey }
  });

  if (!application || application.status !== 'ACTIVE') {
    throw new AppError('Unauthorized: Invalid or inactive API key', 401);
  }

  // 2. Fetch all mappings for this application to find its Subscription Models
  const mappings = await prisma.applicationMapping.findMany({
    where: { applicationId: application.id, isActive: true },
    include: {
      subscriptionModel: {
        include: {
          plans: {
            where: { isActive: true }
          },
          features: {
            include: {
              fields: {
                include: {
                  validationRules: true
                }
              }
            }
          },
          billingModels: true
        }
      }
    }
  });

  // If no detailed models are mapped yet (since we are still scaffolding),
  // we'll provide a standard fallback format so the external app developers
  // have a reliable JSON structure to code against.
  if (mappings.length === 0) {
    // Return standard fallback JSON structure as requested
    res.json({
      application: application.applicationName,
      timestamp: new Date().toISOString(),
      models: [
        {
          name: 'Default_Subscription_Model',
          plans: [
            {
              id: 'plan_pro',
              name: 'PRO',
              pricing: { monthly: 999, yearly: 9990 },
              features: ['Unlimited Projects', 'API Access']
            }
          ],
          features: [
            {
              code: 'max_users',
              name: 'Maximum Users',
              type: 'NUMBER',
              defaultValue: '1'
            },
            {
              code: 'storage_gb',
              name: 'Storage Limit (GB)',
              type: 'NUMBER',
              defaultValue: '5'
            }
          ]
        }
      ]
    });
    return;
  }

  // 3. Construct the dynamic response based on the actual DB data
  const responseData = {
    application: application.applicationName,
    timestamp: new Date().toISOString(),
    models: mappings.map(mapping => ({
      name: mapping.subscriptionModel.name,
      description: mapping.subscriptionModel.description,
      plans: mapping.subscriptionModel.plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        pricingMatrix: plan.pricingMatrix
      })),
      features: mapping.subscriptionModel.features.map(feature => ({
        id: feature.id,
        code: feature.code,
        name: feature.name,
        category: feature.category,
        fields: feature.fields.map(field => ({
          code: field.code,
          name: field.name,
          type: field.type,
          defaultValue: field.defaultValue,
          validation: field.validationRules
        }))
      })),
      billingModels: mapping.subscriptionModel.billingModels
    }))
  };

  res.json(responseData);
};

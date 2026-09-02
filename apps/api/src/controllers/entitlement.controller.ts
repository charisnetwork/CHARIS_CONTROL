import { Request, Response } from 'express';
import { AppError } from '../middlewares/error.middleware';
import { EntitlementService } from '../services/entitlement.service';
import { prisma } from '../lib/prisma';

/** Machine-to-machine: the registered application API key fixes the application scope. */
export const getEntitlement = async (req: Request, res: Response) => {
  const apiKey = req.header('x-charis-api-key') || req.header('x-api-key');
  const tenantId = String(req.params.tenantId || '');
  if (!apiKey || !tenantId) throw new AppError('Application credentials and tenantId are required', 401);
  const application = await prisma.application.findFirst({ where: { apiKey, status: 'ACTIVE' } });
  if (!application) throw new AppError('Invalid application credentials', 401);
  if (!application.privateKey) throw new AppError('Application signing key is not configured', 503);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ token: await EntitlementService.generateEntitlementToken(application.id, tenantId) });
};

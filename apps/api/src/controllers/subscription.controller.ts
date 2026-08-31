import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { externalAppRequest } from '../services/integrationService';
import { AppError } from '../middlewares/error.middleware';

const prisma = new PrismaClient();

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

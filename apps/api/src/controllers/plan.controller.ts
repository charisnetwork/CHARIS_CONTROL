import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { externalAppRequest } from '../services/integrationService';
import { AppError } from '../middlewares/error.middleware';

const prisma = new PrismaClient();

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
  // Plan creation should now ideally be routed to the external application or handled
  // as part of the centralized metadata model, but to satisfy the external contract:
  res.status(501).json({ message: 'Plan creation via Control Center is disabled. Manage plans natively or synchronize them.' });
};

export const updatePlan = async (req: Request, res: Response) => {
  res.status(501).json({ message: 'Plan updates via Control Center are disabled.' });
};

import { Request, Response } from 'express';
import { PrismaClient, ApplicationEnvironment, ApplicationStatus } from '@prisma/client';
import { AppError } from '../middlewares/error.middleware';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const getApplications = async (req: Request, res: Response) => {
  const applications = await prisma.application.findMany({
    orderBy: { displayName: 'asc' }
  });
  res.json(applications);
};

export const createApplication = async (req: Request, res: Response) => {
  const { 
    applicationName, 
    displayName, 
    apiBaseUrl, 
    description,
    environment = ApplicationEnvironment.PRODUCTION 
  } = req.body;

  if (!applicationName || !displayName || !apiBaseUrl) {
    throw new AppError('applicationName, displayName, and apiBaseUrl are required', 400);
  }

  // Auto-generate a secure 64-character API key for this application
  const generatedApiKey = `cc_live_${crypto.randomBytes(24).toString('hex')}`;

  const existing = await prisma.application.findUnique({
    where: { applicationName }
  });

  if (existing) {
    throw new AppError('Application with this name already exists', 409);
  }

  const application = await prisma.application.create({
    data: {
      applicationName,
      displayName,
      apiBaseUrl,
      apiKey: generatedApiKey,
      description,
      environment,
      status: ApplicationStatus.ACTIVE
    }
  });

  res.status(201).json(application);
};

export const deleteApplication = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.application.delete({
    where: { id: String(id) }
  });
  res.status(204).send();
};

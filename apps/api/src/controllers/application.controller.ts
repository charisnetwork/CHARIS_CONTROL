import { Request, Response } from 'express';
import { ApplicationEnvironment, ApplicationStatus } from '@prisma/client';
import { AppError } from '../middlewares/error.middleware';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { applicationMetadata } from '../services/applicationResponse.service';
import { assertSafePublicUrl } from '../services/urlSafety.service';


export const getApplications = async (req: Request, res: Response) => {
  const applications = await prisma.application.findMany({
    orderBy: { displayName: 'asc' }
  });
  res.json(applications.map(applicationMetadata));
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

  await assertSafePublicUrl(apiBaseUrl, 'apiBaseUrl');

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

  res.status(201).json(applicationMetadata(application));
};

export const deleteApplication = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.application.delete({
    where: { id: String(id) }
  });
  res.status(204).send();
};

export const regenerateKeys = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  const updated = await prisma.application.update({
    where: { id: String(id) },
    data: { publicKey, privateKey }
  });

  res.json({ message: 'Signing keys regenerated', publicKey: updated.publicKey });
};

export const regenerateWebhookSecret = async (req: Request, res: Response) => {
  const { id } = req.params;
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  
  const updated = await prisma.application.update({
    where: { id: String(id) },
    data: { webhookSecret }
  });

  res.json({ message: 'Webhook secret regenerated' });
};

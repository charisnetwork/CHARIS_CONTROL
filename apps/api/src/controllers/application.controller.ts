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

export const getApplicationCredentials = async (req: Request, res: Response) => {
  const { id } = req.params;
  const application = await prisma.application.findUnique({
    where: { id: String(id) }
  });

  if (!application) {
    throw new AppError('Application not found', 404);
  }

  let { apiKey, publicKey, privateKey, webhookSecret } = application;
  let needsUpdate = false;

  if (!apiKey) {
    apiKey = `cc_live_${crypto.randomBytes(24).toString('hex')}`;
    needsUpdate = true;
  }
  if (!webhookSecret) {
    webhookSecret = crypto.randomBytes(32).toString('hex');
    needsUpdate = true;
  }
  if (!publicKey || !privateKey) {
    const keys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    needsUpdate = true;
  }

  let updatedApp = application;
  if (needsUpdate) {
    updatedApp = await prisma.application.update({
      where: { id: String(id) },
      data: { apiKey, publicKey, privateKey, webhookSecret }
    });
  }

  res.json({
    id: updatedApp.id,
    applicationName: updatedApp.applicationName,
    displayName: updatedApp.displayName,
    apiKey: updatedApp.apiKey,
    publicKey: updatedApp.publicKey,
    webhookUrl: updatedApp.webhookUrl,
    webhookSecret: updatedApp.webhookSecret,
    hasPrivateKey: Boolean(updatedApp.privateKey)
  });
};

export const createApplication = async (req: Request, res: Response) => {
  const { 
    applicationName, 
    displayName, 
    apiBaseUrl, 
    description,
    webhookUrl,
    environment = ApplicationEnvironment.PRODUCTION 
  } = req.body;

  if (!applicationName || !displayName || !apiBaseUrl) {
    throw new AppError('applicationName, displayName, and apiBaseUrl are required', 400);
  }

  const existing = await prisma.application.findUnique({
    where: { applicationName }
  });

  if (existing) {
    throw new AppError('Application with this name already exists', 409);
  }

  await assertSafePublicUrl(apiBaseUrl, 'apiBaseUrl');
  if (webhookUrl) {
    await assertSafePublicUrl(webhookUrl, 'webhookUrl');
  }

  // Auto-generate secure API key, Webhook Secret, and 2048-bit RSA keypair
  const generatedApiKey = `cc_live_${crypto.randomBytes(24).toString('hex')}`;
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  
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

  const application = await prisma.application.create({
    data: {
      applicationName,
      displayName,
      apiBaseUrl,
      webhookUrl: webhookUrl || null,
      apiKey: generatedApiKey,
      webhookSecret,
      publicKey,
      privateKey,
      description,
      environment,
      status: ApplicationStatus.ACTIVE
    }
  });

  res.status(201).json(applicationMetadata(application));
};

export const updateApplicationCredentials = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { webhookUrl } = req.body;

  const app = await prisma.application.findUnique({ where: { id: String(id) } });
  if (!app) {
    throw new AppError('Application not found', 404);
  }

  if (webhookUrl) {
    await assertSafePublicUrl(webhookUrl, 'webhookUrl');
  }

  // If any credentials missing, auto-generate them
  let { apiKey, publicKey, privateKey, webhookSecret } = app;
  if (!apiKey) {
    apiKey = `cc_live_${crypto.randomBytes(24).toString('hex')}`;
  }
  if (!webhookSecret) {
    webhookSecret = crypto.randomBytes(32).toString('hex');
  }
  if (!publicKey || !privateKey) {
    const keys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  }

  const updated = await prisma.application.update({
    where: { id: String(id) },
    data: {
      webhookUrl: webhookUrl !== undefined ? (webhookUrl || null) : app.webhookUrl,
      apiKey,
      publicKey,
      privateKey,
      webhookSecret
    }
  });

  res.json({
    id: updated.id,
    applicationName: updated.applicationName,
    displayName: updated.displayName,
    apiKey: updated.apiKey,
    publicKey: updated.publicKey,
    webhookUrl: updated.webhookUrl,
    webhookSecret: updated.webhookSecret,
    message: 'Credentials updated successfully'
  });
};

export const generateAllCredentials = async (req: Request, res: Response) => {
  const { id } = req.params;
  const app = await prisma.application.findUnique({ where: { id: String(id) } });
  if (!app) {
    throw new AppError('Application not found', 404);
  }

  const apiKey = `cc_live_${crypto.randomBytes(24).toString('hex')}`;
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const updated = await prisma.application.update({
    where: { id: String(id) },
    data: { apiKey, webhookSecret, publicKey, privateKey }
  });

  res.json({
    id: updated.id,
    applicationName: updated.applicationName,
    displayName: updated.displayName,
    apiKey: updated.apiKey,
    publicKey: updated.publicKey,
    webhookUrl: updated.webhookUrl,
    webhookSecret: updated.webhookSecret,
    message: 'All API keys & webhook credentials regenerated successfully'
  });
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

  res.json({ message: 'Webhook secret regenerated', webhookSecret: updated.webhookSecret });
};

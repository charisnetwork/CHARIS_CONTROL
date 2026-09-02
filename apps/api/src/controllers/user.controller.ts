import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error.middleware';

export const revokeUserAccess = async (req: Request, res: Response) => {
  const { customerId, applicationId, reason } = req.body;

  if (!customerId || !applicationId) {
    throw new AppError('customerId and applicationId are required', 400);
  }

  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) throw new AppError('Application not found', 404);

  const subs = await prisma.subscriptionReference.findMany({
    where: { customerId, applicationId }
  });

  for (const sub of subs) {
    await prisma.subscriptionReference.update({
      where: { id: sub.id },
      data: { status: 'CANCELLED' }
    });

    await prisma.subscriptionEvent.create({
      data: {
        subscriptionReferenceId: sub.id,
        eventType: 'USER_ACCESS_REVOKED',
        reason
      }
    });
  }

  import('../services/webhook.service').then(({ WebhookService }) => {
    WebhookService.dispatch(app, 'USER_ACCESS_REVOKED', { customerId, reason, subscriptions: subs.map(s => s.id) });
  });

  res.json({ message: 'User access revoked successfully' });
};

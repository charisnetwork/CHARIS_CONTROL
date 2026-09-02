import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getNotifications = async (req: Request, res: Response) => {
  const notifications = await prisma.globalNotification.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(notifications);
};

export const createNotification = async (req: Request, res: Response) => {
  const { title, message, targetAudience, priority, type, applicationId } = req.body;
  const newNotification = await prisma.globalNotification.create({
    data: { title, message, targetAudience, priority, type, applicationId }
  });
  res.status(201).json(newNotification);
};

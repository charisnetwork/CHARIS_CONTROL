import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error.middleware';

export const getOffers = async (req: Request, res: Response) => {
  const { applicationId } = req.query;
  const where = applicationId ? { applicationId: String(applicationId) } : {};
  const offers = await prisma.offer.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(offers);
};

export const createOffer = async (req: Request, res: Response) => {
  const { title, banner, description, applicationId, startDate, endDate, status } = req.body;
  const newOffer = await prisma.offer.create({
    data: {
      title, banner, description, applicationId, startDate: new Date(startDate), endDate: new Date(endDate), status
    }
  });
  res.status(201).json(newOffer);
};

export const deleteOffer = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await prisma.offer.delete({ where: { id } });
  res.status(204).send();
};

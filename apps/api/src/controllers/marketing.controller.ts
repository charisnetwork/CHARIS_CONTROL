import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getMarketingCampaigns = async (req: Request, res: Response) => {
  const campaigns = await prisma.marketingCampaign.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(campaigns);
};

export const createMarketingCampaign = async (req: Request, res: Response) => {
  const { name, platform, budget, status } = req.body;
  const newCampaign = await prisma.marketingCampaign.create({
    data: {
      name, platform, budget: Number(budget), status
    }
  });
  res.status(201).json(newCampaign);
};

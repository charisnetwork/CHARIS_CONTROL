import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AffiliateService } from '../services/affiliate.service';

const prisma = new PrismaClient();

export const getAffiliates = async (req: Request, res: Response) => {
  try {
    const affiliates = await prisma.affiliate.findMany();
    return res.json(affiliates);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch affiliates' });
  }
};

export const createAffiliate = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const affiliate = await prisma.affiliate.create({
      data: {
        companyName: data.companyName,
        contactPerson: data.contactPerson,
        email: data.email,
        mobileNo: data.mobileNo,
        address: data.address,
        pan: data.pan,
        gstin: data.gstin,
        affiliateCode: data.affiliateCode,
        couponCode: data.couponCode,
        commissionType: data.commissionType || 'percentage',
        commissionBasis: data.commissionBasis || 'net',
        commissionValue: data.commissionValue || 0,
        commissionPct: data.commissionPct || 0,
        status: data.status || 'ACTIVE',
        payoutMethod: data.payoutMethod,
        payoutDetails: data.payoutDetails
      }
    });
    return res.status(201).json(affiliate);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create affiliate' });
  }
};

export const getAffiliateReports = async (req: Request, res: Response) => {
  try {
    const { affiliateId, month, year } = req.query;
    if (!affiliateId || !month || !year) {
      return res.status(400).json({ error: 'Missing required query params' });
    }
    
    const report = await AffiliateService.getAffiliateMonthlyReport({
      affiliateId: String(affiliateId),
      month: Number(month),
      year: Number(year)
    });
    
    return res.json(report);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate report' });
  }
};

export const processAffiliatePayout = async (req: Request, res: Response) => {
  try {
    const { affiliateId, saleIds } = req.body;
    if (!affiliateId || !saleIds || !Array.isArray(saleIds)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const updated = await prisma.affiliateSale.updateMany({
      where: {
        id: { in: saleIds },
        affiliateId,
        payoutStatus: 'PENDING'
      },
      data: {
        payoutStatus: 'PAID'
      }
    });

    return res.json({ message: 'Payout processed', updatedCount: updated.count });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to process payout' });
  }
};

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error.middleware';

export const getCoupons = async (req: Request, res: Response) => {
  const { applicationId } = req.query;
  const where = applicationId ? { applicationId: String(applicationId) } : {};
  const coupons = await prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(coupons);
};

export const createCoupon = async (req: Request, res: Response) => {
  const { code, applicationId, discountType, discountValue, maxUses, expiresAt, applicablePlans, isActive } = req.body;
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) throw new AppError('Coupon code is required', 400);
  if (!['percentage', 'flat'].includes(discountType)) throw new AppError('discountType must be percentage or flat', 400);
  if (!Number.isFinite(Number(discountValue)) || Number(discountValue) < 0 || (discountType === 'percentage' && Number(discountValue) > 100)) throw new AppError('Invalid discount value', 400);
  const newCoupon = await prisma.coupon.create({
    data: {
      code: normalizedCode,
      applicationId,
      discountType,
      discountValue: Number(discountValue),
      maxUses: maxUses ? Number(maxUses) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      applicablePlans: Array.isArray(applicablePlans) ? applicablePlans.map(String) : [],
      isActive: isActive !== undefined ? isActive : true
    }
  });
  res.status(201).json(newCoupon);
};

export const deleteCoupon = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await prisma.coupon.delete({ where: { id } });
  res.status(204).send();
};

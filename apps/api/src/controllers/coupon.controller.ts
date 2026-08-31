import { Request, Response } from 'express';
import { getMockData, updateMockData } from '../services/mockDataGenerator';
import { v4 as uuidv4 } from 'uuid';

export const getCoupons = async (req: Request, res: Response) => {
  const { productId } = req.query;
  if (!productId) {
    res.status(400).json({ message: 'productId is required' });
    return;
  }
  
  const db = getMockData(productId as string);
  res.json(db.coupons || []);
};

export const createCoupon = async (req: Request, res: Response) => {
  const { productId, code, discountType, discountValue, usageLimit, expiryDate } = req.body;
  if (!productId) {
    res.status(400).json({ message: 'productId is required' });
    return;
  }

  const newCoupon = {
    id: uuidv4(),
    code,
    discountType,
    discountValue,
    usageLimit,
    usesCount: 0,
    isActive: true,
    expiryDate
  };

  updateMockData(productId, 'coupons', newCoupon);
  res.status(201).json(newCoupon);
};

import { Router } from 'express';
import { createCoupon, getCoupons } from '../controllers/coupon.controller';

const router = Router();

router.post('/', createCoupon);
router.get('/', getCoupons);

export default router;

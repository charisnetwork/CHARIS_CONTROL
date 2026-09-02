import { Router } from 'express';
import { createCoupon, getCoupons } from '../controllers/coupon.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/', requireRoles(MANAGEMENT_ROLES), createCoupon);
router.get('/', getCoupons);

export default router;

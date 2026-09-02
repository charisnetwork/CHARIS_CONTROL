import { Router } from 'express';
import { createCoupon, getCoupons, deleteCoupon } from '../controllers/coupon.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', getCoupons);
router.post('/', requireRoles(MANAGEMENT_ROLES), createCoupon);
router.delete('/:id', requireRoles(MANAGEMENT_ROLES), deleteCoupon);

export default router;

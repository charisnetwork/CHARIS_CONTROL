import { Router } from 'express';
import { createPlan, getPlans, updatePlan, updateFeature, updateFeatureLimit } from '../controllers/plan.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/', createPlan);
router.get('/', getPlans);
router.put('/:id', requireRoles(MANAGEMENT_ROLES), updatePlan);
router.put('/features/:id', requireRoles(MANAGEMENT_ROLES), updateFeature);
router.put('/features/limits/:id', requireRoles(MANAGEMENT_ROLES), updateFeatureLimit);

export default router;

import { Router } from 'express';
import { createPlan, getPlans, updatePlan, getFeatureGroups, getPlanFeatures, updatePlanFeatures, updateFeature, updateFeatureLimit } from '../controllers/plan.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/feature-groups', getFeatureGroups);
router.get('/:id/features', getPlanFeatures);
router.put('/:id/features', requireRoles(MANAGEMENT_ROLES), updatePlanFeatures);
router.post('/', requireRoles(MANAGEMENT_ROLES), createPlan);
router.get('/', getPlans);
router.put('/:id', requireRoles(MANAGEMENT_ROLES), updatePlan);
router.put('/features/:id', requireRoles(MANAGEMENT_ROLES), updateFeature);
router.put('/features/limits/:id', requireRoles(MANAGEMENT_ROLES), updateFeatureLimit);

export default router;


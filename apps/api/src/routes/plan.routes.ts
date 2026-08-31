import { Router } from 'express';
import { createPlan, getPlans, updatePlan } from '../controllers/plan.controller';

const router = Router();

router.post('/', createPlan);
router.get('/', getPlans);
router.put('/:id', updatePlan);

export default router;

import { Router } from 'express';
import { getEntitlement } from '../controllers/entitlement.controller';
const router = Router();
router.get('/:tenantId', getEntitlement);
export default router;

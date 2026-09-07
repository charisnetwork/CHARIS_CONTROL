import { Router } from 'express';
import { getEntitlement, getTenantEntitlements } from '../controllers/entitlement.controller';
const router = Router();
router.get('/details', getTenantEntitlements);
router.get('/details/:tenantId', getTenantEntitlements);
router.get('/:tenantId', getEntitlement);
export default router;


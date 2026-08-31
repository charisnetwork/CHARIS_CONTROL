import { Router } from 'express';
import { syncEntitlements } from '../controllers/sync.controller';

const router = Router();

// This route is specifically designed to be called by external apps like Bill Easy.
// It relies on the x-api-key header checked inside the controller.
router.get('/entitlements', syncEntitlements);

export default router;

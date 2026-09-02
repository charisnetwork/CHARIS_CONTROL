import { Router } from 'express';
import { revokeUserAccess } from '../controllers/user.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.post('/revoke-access', authenticate, requireRoles(['SUPER_ADMIN', 'ADMIN']), revokeUserAccess);

export default router;

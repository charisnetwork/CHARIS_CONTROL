import { Router } from 'express';
import { getNotifications, createNotification } from '../controllers/notification.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', getNotifications);
router.post('/', requireRoles(MANAGEMENT_ROLES), createNotification);

export default router;

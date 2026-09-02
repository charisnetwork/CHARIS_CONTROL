import { Router } from 'express';
import { 
  getApplications, 
  createApplication, 
  deleteApplication, 
  regenerateKeys, 
  regenerateWebhookSecret 
} from '../controllers/application.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', getApplications);
router.post('/', requireRoles(MANAGEMENT_ROLES), createApplication);
router.delete('/:id', requireRoles(MANAGEMENT_ROLES), deleteApplication);
router.post('/:id/keys', requireRoles(['SUPER_ADMIN']), regenerateKeys);
router.post('/:id/webhook-secret', requireRoles(['SUPER_ADMIN']), regenerateWebhookSecret);

export default router;

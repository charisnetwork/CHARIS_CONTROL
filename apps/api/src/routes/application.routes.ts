import { Router } from 'express';
import { 
  getApplications, 
  getApplicationCredentials,
  updateApplicationCredentials,
  generateAllCredentials,
  createApplication, 
  deleteApplication, 
  regenerateKeys, 
  regenerateWebhookSecret 
} from '../controllers/application.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', getApplications);
router.get('/:id/credentials', requireRoles(MANAGEMENT_ROLES), getApplicationCredentials);
router.put('/:id/credentials', requireRoles(MANAGEMENT_ROLES), updateApplicationCredentials);
router.post('/:id/generate-all', requireRoles(MANAGEMENT_ROLES), generateAllCredentials);
router.post('/', requireRoles(MANAGEMENT_ROLES), createApplication);
router.delete('/:id', requireRoles(MANAGEMENT_ROLES), deleteApplication);
router.post('/:id/keys', requireRoles(MANAGEMENT_ROLES), regenerateKeys);
router.post('/:id/webhook-secret', requireRoles(MANAGEMENT_ROLES), regenerateWebhookSecret);

export default router;

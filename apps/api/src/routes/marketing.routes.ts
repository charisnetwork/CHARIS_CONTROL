import { Router } from 'express';
import { getMarketingCampaigns, createMarketingCampaign } from '../controllers/marketing.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', getMarketingCampaigns);
router.post('/', requireRoles(MANAGEMENT_ROLES), createMarketingCampaign);

export default router;

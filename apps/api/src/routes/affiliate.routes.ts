import { Router } from 'express';
import { getAffiliates, createAffiliate, getAffiliateReports, processAffiliatePayout } from '../controllers/affiliate.controller';

const router = Router();

router.get('/', getAffiliates);
router.post('/', createAffiliate);
router.get('/reports', getAffiliateReports);
router.post('/payout', processAffiliatePayout);

export default router;

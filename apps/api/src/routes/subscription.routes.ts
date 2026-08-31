import { Router } from 'express';
import { getSubscriptions, getCustomers, getSubscriptionAnalytics } from '../controllers/subscription.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Temporarily disabling authenticate for mock data ease of testing, or keep it if headers are passed correctly
// router.use(authenticate);

router.get('/', getSubscriptions);
router.get('/customers', getCustomers);
router.get('/analytics', getSubscriptionAnalytics);

export default router;

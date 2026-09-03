import { Router } from 'express';
import { getSubscriptions, getCustomers, getSubscriptionAnalytics, createSubscription, updateSubscription, cancelSubscription, renewSubscription, failPayment, previewSubscriptionQuote } from '../controllers/subscription.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getSubscriptions);
router.get('/customers', getCustomers);
router.get('/analytics', getSubscriptionAnalytics);
router.post('/quote', requireRoles(MANAGEMENT_ROLES), previewSubscriptionQuote);
router.post('/', requireRoles(MANAGEMENT_ROLES), createSubscription);
router.put('/:id', requireRoles(MANAGEMENT_ROLES), updateSubscription);
router.post('/:id/cancel', requireRoles(MANAGEMENT_ROLES), cancelSubscription);
router.post('/:id/renew', requireRoles(MANAGEMENT_ROLES), renewSubscription);
router.post('/:id/fail-payment', requireRoles(MANAGEMENT_ROLES), failPayment);

export default router;

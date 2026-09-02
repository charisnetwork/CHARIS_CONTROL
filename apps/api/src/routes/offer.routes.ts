import { Router } from 'express';
import { getOffers, createOffer, deleteOffer } from '../controllers/offer.controller';
import { authenticate, MANAGEMENT_ROLES, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', getOffers);
router.post('/', requireRoles(MANAGEMENT_ROLES), createOffer);
router.delete('/:id', requireRoles(MANAGEMENT_ROLES), deleteOffer);

export default router;

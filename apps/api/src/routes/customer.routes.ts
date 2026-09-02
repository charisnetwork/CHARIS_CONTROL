import { Router } from 'express';
import { getCustomers } from '../controllers/customer.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', getCustomers);

export default router;

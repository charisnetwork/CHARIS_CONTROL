import { Router } from 'express';
import { getApplications, createApplication, deleteApplication } from '../controllers/application.controller';

const router = Router();

router.get('/', getApplications);
router.post('/', createApplication);
router.delete('/:id', deleteApplication);

export default router;

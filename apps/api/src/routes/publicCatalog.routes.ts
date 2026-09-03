import { Router } from 'express';
import { getPublicCatalog } from '../controllers/publicCatalog.controller';

const router = Router();
router.get('/catalog/:applicationSlug', getPublicCatalog);
export default router;

import { Router } from 'express';
import { getPublicCatalog } from '../controllers/publicCatalog.controller';

const router = Router();

// Keep the explicit catalog namespace used by application integrations.
router.get('/catalog/:applicationSlug', getPublicCatalog);

// Backwards-compatible shorthand for existing consumers.
router.get('/:applicationSlug', getPublicCatalog);

export default router;

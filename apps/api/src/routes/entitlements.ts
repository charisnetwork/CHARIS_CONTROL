import { Router, Request, Response } from 'express';
import { verifyEntitlement } from '@/lib/jwt';
import { buildEntitlementForTenant } from '@/services/entitlementService';

const router = Router();

/**
 * GET /api/entitlements/:tenantId
 * Called by SDK to get signed entitlement token for a tenant
 */
router.get('/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const entitlement = await buildEntitlementForTenant(tenantId);

    if (!entitlement) {
      return res.status(404).json({
        error: 'ENTITLEMENT_NOT_FOUND',
        message: 'No active subscription found for this tenant',
      });
    }

    // Verify the token we just created (sanity check)
    const verified = await verifyEntitlement(entitlement);
    console.log('[Entitlements] Issued token for tenant', { tenantId, features: verified.features.length });

    return res.json({ token: entitlement });
  } catch (error) {
    console.error('[Entitlements] Error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/entitlements/verify
 * Verify an entitlement token (for debugging/admin)
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const payload = await verifyEntitlement(token);
    return res.json({ valid: true, payload });
  } catch (error) {
    return res.status(401).json({ valid: false, error: error instanceof Error ? error.message : 'Invalid token' });
  }
});

export default router;
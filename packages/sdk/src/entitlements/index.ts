import * as crypto from 'node:crypto';

export interface EntitlementPayload {
  entitlementVersion: 1; applicationId: string; tenantId: string; status: string;
  planId: string | null; features: string[]; limits: Record<string, number>;
  billingCycle: string | null; iat: number; exp: number; // Unix seconds
}
export interface CacheLayer {
  get(key: string): Promise<EntitlementPayload | null> | EntitlementPayload | null;
  set(key: string, value: EntitlementPayload): Promise<void> | void;
  delete?(key: string): Promise<void> | void;
}
export class InMemoryCache implements CacheLayer {
  private cache = new Map<string, EntitlementPayload>();
  get(key: string) { return this.cache.get(key) || null; }
  set(key: string, value: EntitlementPayload) { this.cache.set(key, value); }
  delete(key: string) { this.cache.delete(key); }
}

/** Verifies and caches app-scoped, signed entitlements. `exp` is Unix seconds. */
export class EntitlementManager {
  private readonly processedEvents = new Map<string, number>();
  private readonly replayWindowMs = 5 * 60 * 1000;
  constructor(
    private readonly applicationId: string,
    private readonly publicKey: string,
    private readonly webhookSecret: string,
    public readonly http?: any,
    private readonly cache: CacheLayer = new InMemoryCache(),
    public readonly gracePeriodMs = 7 * 24 * 60 * 60 * 1000,
  ) {}
  private key(tenantId: string) { return `${this.applicationId}:${tenantId}`; }

  verifyToken(token: string): EntitlementPayload {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) throw new Error('Invalid entitlement token format');
    if (!crypto.verify('RSA-SHA256', Buffer.from(encoded), this.publicKey, Buffer.from(signature, 'base64url'))) throw new Error('Invalid entitlement signature');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as EntitlementPayload;
    if (payload.entitlementVersion !== 1 || payload.applicationId !== this.applicationId || !payload.tenantId || !Number.isInteger(payload.exp)) throw new Error('Invalid entitlement payload');
    return payload;
  }
  async cacheEntitlement(tenantId: string, payload: EntitlementPayload) {
    if (payload.applicationId !== this.applicationId || payload.tenantId !== tenantId) throw new Error('Entitlement scope mismatch');
    await this.cache.set(this.key(tenantId), payload);
  }
  async getEntitlement(tenantId: string) {
    const payload = await this.cache.get(this.key(tenantId));
    if (!payload) return null;
    if (Date.now() < payload.exp * 1000) return payload;
    if (Date.now() < payload.exp * 1000 + this.gracePeriodMs) { this.fetchEntitlement(tenantId).catch(() => undefined); return payload; }
    await this.cache.delete?.(this.key(tenantId));
    return null;
  }
  async fetchEntitlement(tenantId: string): Promise<EntitlementPayload> {
    if (!this.http) throw new Error('HTTP client not configured');
    const response = await this.http.get(`/api/entitlements/${encodeURIComponent(tenantId)}`);
    const payload = this.verifyToken(response.data.token);
    await this.cacheEntitlement(tenantId, payload);
    return payload;
  }
  requireFeature(feature: string) { return this.authorize((e) => e.features.includes(feature), 'Feature not permitted'); }
  requirePlan(plan: string) { return this.authorize((e) => e.planId === plan, 'Plan not permitted'); }
  checkLimit(limit: string, amount: number) { return this.authorize((e) => e.limits[limit] === undefined || (Number.isFinite(e.limits[limit]) && amount <= e.limits[limit]), `Limit exceeded for ${limit}`); }
  private authorize(check: (entitlement: EntitlementPayload) => boolean, message: string) {
    return async (req: any, res: any, next: any) => {
      try {
        // Never trust x-tenant-id: this is established by the app's own JWT middleware.
        const tenantId = req.companyId || req.user?.company_id;
        if (!tenantId) return res.status(401).json({ error: 'Authenticated tenant identity is required' });
        let entitlement = await this.getEntitlement(tenantId);
        if (!entitlement) {
          const entitlementHeader = req.headers?.['x-entitlement-token'];
          entitlement = entitlementHeader ? this.verifyToken(entitlementHeader) : await this.fetchEntitlement(tenantId);
          await this.cacheEntitlement(tenantId, entitlement);
        }
        if (entitlement.tenantId !== tenantId || !['ACTIVE', 'TRIAL'].includes(entitlement.status) || !check(entitlement)) return res.status(403).json({ error: message });
        req.entitlement = entitlement; next();
      } catch (error: any) { return res.status(401).json({ error: error.message || 'Invalid entitlement' }); }
    };
  }
  webhookReceiver() {
    return async (req: any, res: any) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      try {
        const expected = crypto.createHmac('sha256', this.webhookSecret).update(raw).digest();
        const supplied = Buffer.from(String(req.headers['x-webhook-signature'] || ''), 'hex');
        if (supplied.length !== expected.length || !crypto.timingSafeEqual(expected, supplied)) return res.status(401).json({ error: 'Invalid webhook signature' });
        const event = JSON.parse(raw.toString('utf8')) as { eventId: string; timestamp: number; data?: { customerId?: string; tenantId?: string } };
        if (!event.eventId || !Number.isFinite(event.timestamp) || Math.abs(Date.now() - event.timestamp) > this.replayWindowMs) return res.status(400).json({ error: 'Expired or malformed webhook event' });
        for (const [id, time] of this.processedEvents) if (Date.now() - time > this.replayWindowMs) this.processedEvents.delete(id);
        if (this.processedEvents.has(event.eventId)) return res.status(200).json({ success: true, duplicate: true });
        this.processedEvents.set(event.eventId, Date.now());
        const tenantId = event.data?.tenantId || event.data?.customerId;
        if (tenantId) { await this.cache.delete?.(this.key(tenantId)); this.fetchEntitlement(tenantId).catch(() => undefined); }
        return res.status(200).json({ success: true });
      } catch { return res.status(400).json({ error: 'Invalid webhook payload' }); }
    };
  }
}

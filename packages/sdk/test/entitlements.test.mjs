import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { EntitlementManager, InMemoryCache } from '../dist/index.mjs';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const appId = 'app-a';
const sign = (overrides = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = { entitlementVersion: 1, applicationId: appId, tenantId: 'tenant-a', status: 'ACTIVE', planId: 'pro', features: ['invoices'], limits: { invoices: 50 }, billingCycle: 'MONTHLY', iat: now, exp: now + 60, ...overrides };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${crypto.sign('RSA-SHA256', Buffer.from(encoded), privateKey).toString('base64url')}`;
};

test('verifies valid signed tokens and rejects tampering/application mismatch', () => {
  const manager = new EntitlementManager(appId, publicKey, 'secret');
  assert.equal(manager.verifyToken(sign()).tenantId, 'tenant-a');
  assert.throws(() => manager.verifyToken(`${sign()}x`), /signature/);
  assert.throws(() => manager.verifyToken(sign({ applicationId: 'app-b' })), /payload/);
});

test('cache is tenant and application scoped and expiration observes grace', async () => {
  const cache = new InMemoryCache();
  const manager = new EntitlementManager(appId, publicKey, 'secret', undefined, cache, 2000);
  await manager.cacheEntitlement('tenant-a', manager.verifyToken(sign()));
  assert.equal((await manager.getEntitlement('tenant-a'))?.tenantId, 'tenant-a');
  assert.equal(await manager.getEntitlement('tenant-b'), null);
  const expired = manager.verifyToken(sign({ exp: Math.floor(Date.now() / 1000) }));
  await manager.cacheEntitlement('tenant-a', expired);
  assert.equal((await manager.getEntitlement('tenant-a'))?.tenantId, 'tenant-a');
});

test('webhook requires an HMAC and makes duplicate event ids idempotent', async () => {
  const manager = new EntitlementManager(appId, publicKey, 'secret');
  const raw = Buffer.from(JSON.stringify({ eventId: 'evt-1', timestamp: Date.now(), data: { tenantId: 'tenant-a' } }));
  const signature = crypto.createHmac('sha256', 'secret').update(raw).digest('hex');
  const receiver = manager.webhookReceiver();
  const response = () => ({ statusCode: 0, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const first = response(); await receiver({ body: raw, headers: { 'x-webhook-signature': signature } }, first);
  assert.equal(first.statusCode, 200);
  const duplicate = response(); await receiver({ body: raw, headers: { 'x-webhook-signature': signature } }, duplicate);
  assert.deepEqual(duplicate.body, { success: true, duplicate: true });
  const invalid = response(); await receiver({ body: raw, headers: { 'x-webhook-signature': '00' } }, invalid);
  assert.equal(invalid.statusCode, 401);
});

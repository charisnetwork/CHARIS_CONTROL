import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SignJWT, jwtVerify, importSPKI, importPKCS8, type JWTPayload, type KeyLike } from 'jose';

let privateKeyCache: KeyLike | null = null;
let publicKeyCache: KeyLike | null = null;

export async function getPrivateKey(): Promise<KeyLike> {
  if (privateKeyCache) return privateKeyCache;

  const keyPath = process.env.ENTITLEMENT_PRIVATE_KEY_PATH ?? './keys/private.pem';
  const absolutePath = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);

  const pem = await fs.readFile(absolutePath, 'utf-8');
  privateKeyCache = await importPKCS8(pem, 'RS256');
  return privateKeyCache;
}

export async function getPublicKey(): Promise<KeyLike> {
  if (publicKeyCache) return publicKeyCache;

  const keyPath = process.env.ENTITLEMENT_PUBLIC_KEY_PATH ?? './keys/public.pem';
  const absolutePath = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);

  const pem = await fs.readFile(absolutePath, 'utf-8');
  publicKeyCache = await importSPKI(pem, 'RS256');
  return publicKeyCache;
}

export interface EntitlementPayload extends JWTPayload {
  entitlementVersion: 1;
  applicationId: string;
  tenantId: string;
  status: string;
  planId: string | null;
  subscriptionId: string | null;
  features: string[];
  limits: Record<string, number>;
  billingCycle: string | null;
  usagePeriod: {
    unit: string | null;
    startsAt: number | null;
    endsAt: number | null;
  };
}

export async function signEntitlement(payload: Omit<EntitlementPayload, keyof JWTPayload>): Promise<string> {
  const privateKey = await getPrivateKey();
  const keyId = process.env.ENTITLEMENT_KEY_ID ?? 'charis-entitlement-v1';
  const ttlHours = parseInt(process.env.ENTITLEMENT_TTL_HOURS ?? '24', 10);

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(privateKey);
}

export async function verifyEntitlement(token: string): Promise<EntitlementPayload> {
  const publicKey = await getPublicKey();
  const { payload } = await jwtVerify(token, publicKey, {
    algorithms: ['RS256'],
  });
  return payload as unknown as EntitlementPayload;
}

export function clearKeyCache(): void {
  privateKeyCache = null;
  publicKeyCache = null;
}
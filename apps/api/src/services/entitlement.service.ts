import * as crypto from 'node:crypto';
import { prisma } from '../lib/prisma';

export interface EntitlementPayloadV1 {
  entitlementVersion: 1;
  applicationId: string;
  tenantId: string;
  status: string;
  planId: string | null;
  features: string[];
  limits: Record<string, number>;
  billingCycle: string | null;
  iat: number;
  exp: number;
}

/** Compact token: base64url(payload).base64url(RSA-SHA256 signature over payload). */
export class EntitlementService {
  static async generateEntitlementToken(applicationId: string, tenantId: string): Promise<string> {
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application?.privateKey) throw new Error('Application signing key is not configured.');
    const subscription = await prisma.subscriptionReference.findFirst({
      where: { applicationId, customerId: tenantId },
      include: { plan: { include: { subscriptionModel: { include: { features: { include: { fields: true } } } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    const isEntitled = subscription?.status === 'ACTIVE' || subscription?.status === 'TRIAL';
    const features = isEntitled ? subscription?.plan?.subscriptionModel?.features ?? [] : [];
    const limits: Record<string, number> = {};
    for (const feature of features) {
      const field = feature.fields.find((candidate) => candidate.type === 'NUMBER');
      limits[feature.code] = field?.defaultValue ? Number(field.defaultValue) || 0 : 1;
    }
    const now = Math.floor(Date.now() / 1000);
    const payload: EntitlementPayloadV1 = {
      entitlementVersion: 1, applicationId, tenantId, status: subscription?.status || 'INACTIVE',
      planId: isEntitled ? subscription?.planId || null : null, features: features.map((feature) => feature.code), limits,
      billingCycle: subscription?.billingCycle || null, iat: now, exp: now + (application.verificationInterval || 604800),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.sign('RSA-SHA256', Buffer.from(encodedPayload), application.privateKey);
    return `${encodedPayload}.${signature.toString('base64url')}`;
  }
}

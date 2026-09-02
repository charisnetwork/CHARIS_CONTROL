import { Application } from '@prisma/client';

/** Never send server-side credentials to a browser or ordinary management response. */
export function applicationMetadata(application: Application) {
  const { apiKey, apiSecret, privateKey, webhookSecret, ...metadata } = application;
  return {
    ...metadata,
    apiKeyHint: apiKey ? `${apiKey.slice(0, 10)}…${apiKey.slice(-4)}` : null,
    hasWebhookSecret: Boolean(webhookSecret),
    hasSigningKey: Boolean(privateKey),
  };
}

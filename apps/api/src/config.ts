/** Runtime configuration helpers. Secrets are intentionally never defaulted. */
export const isProduction = process.env.NODE_ENV === 'production';

export function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured`);
  }
  return value;
}

export function jwtSecret(): string {
  return requiredSecret('JWT_SECRET');
}

export function allowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

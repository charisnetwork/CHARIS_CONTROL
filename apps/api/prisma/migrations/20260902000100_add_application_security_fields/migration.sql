-- Apply through `prisma migrate deploy` against the Control Centre database only.
-- This is additive and intentionally does not touch Bill Easy.
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "webhookSecret" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "publicKey" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "privateKey" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "verificationInterval" INTEGER;

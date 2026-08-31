-- Super Admin Password Reset SQL
-- Generated: 2026-04-13T15:51:09.319Z
-- Email: admin@example.com
-- Password: TestPass123

-- Ensure table exists
CREATE TABLE IF NOT EXISTS "AdminUsers" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) DEFAULT 'Admin',
  role VARCHAR(50) DEFAULT 'super_admin',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Reset password
UPDATE "AdminUsers" SET 
  password_hash = '$2a$10$bSAuktiG/CIIltpZYr9QceMq/YKnGIUR3ZCNvDdhe9vbeKKJywgam',
  is_active = true,
  updated_at = NOW()
WHERE email = 'admin@example.com';

-- Or insert if not exists
INSERT INTO "AdminUsers" (email, password_hash, name, role, is_active, created_at, updated_at)
VALUES ('admin@example.com', '$2a$10$bSAuktiG/CIIltpZYr9QceMq/YKnGIUR3ZCNvDdhe9vbeKKJywgam', 'Super Admin', 'super_admin', true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  updated_at = NOW();

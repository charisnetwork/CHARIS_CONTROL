#!/usr/bin/env node
/**
 * Generate SQL to reset Super Admin password (for direct DB execution)
 * Usage: node generateResetSQL.js [new_password] [email]
 * 
 * This is useful when:
 *   - Database sync errors prevent the app from starting
 *   - You need to reset the password via Render's SQL Shell
 *   - The Node.js script cannot connect to the database
 */

const bcrypt = require('bcryptjs');

const DEFAULT_NEW_PASSWORD = 'Admin@2026';
const DEFAULT_EMAIL = 'pachu.mgd@gmail.com';

async function generateSQL() {
  try {
    const newPassword = process.argv[2] || DEFAULT_NEW_PASSWORD;
    const email = process.argv[3] || DEFAULT_EMAIL;

    // Hash password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    console.log('');
    console.log('-- =====================================================');
    console.log('-- SUPER ADMIN PASSWORD RESET SQL');
    console.log('-- Generated:', new Date().toISOString());
    console.log('-- =====================================================');
    console.log('');
    console.log('-- Run this in your ADMIN database (mybillbook_admin)');
    console.log('-- Methods to execute:');
    console.log('--   1. Render Dashboard: Database → SQL Shell');
    console.log('--   2. psql: psql $DATABASE_URL_ADMIN -f reset.sql');
    console.log('--   3. pgAdmin: Query Tool');
    console.log('');
    console.log('-- =====================================================');
    console.log('-- STEP 1: Ensure AdminUsers table exists');
    console.log('-- =====================================================');
    console.log('');
    console.log(`CREATE TABLE IF NOT EXISTS "AdminUsers" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) DEFAULT 'Admin',
  role VARCHAR(50) DEFAULT 'super_admin',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);`);
    console.log('');
    console.log('-- =====================================================');
    console.log('-- STEP 2: Reset password for super admin');
    console.log('-- =====================================================');
    console.log('');
    console.log(`-- Option A: Update existing admin`);
    console.log(`UPDATE "AdminUsers" SET `);
    console.log(`  password_hash = '${hashedPassword}',`);
    console.log(`  is_active = true,`);
    console.log(`  updated_at = NOW()`);
    console.log(`WHERE email = '${email}';`);
    console.log('');
    console.log(`-- Option B: Insert new admin (if no admin exists)`);
    console.log(`INSERT INTO "AdminUsers" (email, password_hash, name, role, is_active, created_at, updated_at)`);
    console.log(`VALUES ('${email}', '${hashedPassword}', 'Super Admin', 'super_admin', true, NOW(), NOW())`);
    console.log(`ON CONFLICT (email) DO UPDATE SET`);
    console.log(`  password_hash = EXCLUDED.password_hash,`);
    console.log(`  is_active = true,`);
    console.log(`  updated_at = NOW();`);
    console.log('');
    console.log('-- =====================================================');
    console.log('-- STEP 3: Verify the admin user');
    console.log('-- =====================================================');
    console.log('');
    console.log(`-- List all admin users:`);
    console.log(`SELECT id, email, name, role, is_active, last_login FROM "AdminUsers";`);
    console.log('');
    console.log('-- =====================================================');
    console.log('-- LOGIN CREDENTIALS AFTER RESET');
    console.log('-- =====================================================');
    console.log(`-- URL:      https://admin.charisbilleasy.store`);
    console.log(`-- Email:    ${email}`);
    console.log(`-- Password: ${newPassword}`);
    console.log('-- =====================================================');
    console.log('');
    console.log('-- ⚠️  IMPORTANT: Change this password immediately after logging in!');
    console.log('');

    // Also save to file for convenience
    const fs = require('fs');
    const path = require('path');
    
    const sqlFile = path.join(__dirname, 'reset-password-generated.sql');
    const sqlContent = `-- Super Admin Password Reset SQL
-- Generated: ${new Date().toISOString()}
-- Email: ${email}
-- Password: ${newPassword}

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
  password_hash = '${hashedPassword}',
  is_active = true,
  updated_at = NOW()
WHERE email = '${email}';

-- Or insert if not exists
INSERT INTO "AdminUsers" (email, password_hash, name, role, is_active, created_at, updated_at)
VALUES ('${email}', '${hashedPassword}', 'Super Admin', 'super_admin', true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  updated_at = NOW();
`;

    fs.writeFileSync(sqlFile, sqlContent);
    console.log(`💾 SQL also saved to: ${sqlFile}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

function maskPassword(password) {
  if (password.length <= 4) return '****';
  return password.substring(0, 2) + '****' + password.substring(password.length - 2);
}

generateSQL();

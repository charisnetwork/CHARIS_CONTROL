#!/usr/bin/env node
/**
 * Reset Super Admin via Environment Variables
 * Usage: ADMIN_EMAIL=user@example.com ADMIN_PASSWORD=NewPass123 node resetViaEnvironment.js
 * 
 * This script is specifically designed for Render deployment where:
 *   - You want to set credentials via environment variables
 *   - The sync error prevents normal database operations
 *   - You need a non-interactive reset method
 * 
 * Environment Variables:
 *   - ADMIN_EMAIL: The admin email to reset/create (default: pachu.mgd@gmail.com)
 *   - ADMIN_PASSWORD: The new password (required)
 *   - DATABASE_URL_ADMIN: Admin database connection string
 */

const bcrypt = require('bcryptjs');
const { adminDB } = require('../config/db');
const { AdminUser } = require('../models/adminModels');

async function resetViaEnvironment() {
  console.log('');
  console.log('🔐 Super Admin Reset via Environment Variables');
  console.log('================================================');
  console.log('');

  // Get values from environment variables
  const email = process.env.ADMIN_EMAIL || 'pachu.mgd@gmail.com';
  const newPassword = process.env.ADMIN_PASSWORD;

  // Validate required variables
  if (!newPassword) {
    console.error('❌ ERROR: ADMIN_PASSWORD environment variable is required');
    console.log('');
    console.log('Usage examples:');
    console.log('  ADMIN_PASSWORD=MyNewPass123 node resetViaEnvironment.js');
    console.log('  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=MyNewPass123 node resetViaEnvironment.js');
    console.log('');
    console.log('For Render deployment:');
    console.log('  1. Go to Render Dashboard → Your Admin Backend Service');
    console.log('  2. Add environment variable: ADMIN_PASSWORD = your-new-password');
    console.log('  3. Run: node admin/backend/scripts/resetViaEnvironment.js');
    console.log('  4. Remove the ADMIN_PASSWORD variable after use (for security)');
    process.exit(1);
  }

  // Password strength validation
  if (newPassword.length < 8) {
    console.error('❌ ERROR: Password must be at least 8 characters long');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL_ADMIN environment variable is not set');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${'*'.repeat(newPassword.length)}`);
  console.log(`  Database: ${maskDatabaseUrl(dbUrl)}`);
  console.log('');

  try {
    // Connect to database
    console.log('🔍 Connecting to database...');
    await adminDB.authenticate();
    console.log('✅ Connected');
    console.log('');

    // Try to sync with minimal changes
    console.log('🔄 Syncing database...');
    try {
      await adminDB.sync({ alter: false });
      console.log('✅ Database synced');
    } catch (syncErr) {
      console.warn('⚠️  Sync warning:', syncErr.message);
    }
    console.log('');

    // Find or create admin
    console.log(`🔍 Looking for admin: ${email}`);
    let admin = await AdminUser.findOne({ where: { email } });

    // Hash password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (!admin) {
      console.log('   Admin not found. Creating new admin...');
      admin = await AdminUser.create({
        email: email,
        password_hash: hashedPassword,
        name: 'Super Admin',
        role: 'super_admin',
        is_active: true
      });
      console.log('✅ New admin created');
    } else {
      console.log('   Admin found. Updating password...');
      await admin.update({
        password_hash: hashedPassword,
        is_active: true
      });
      console.log('✅ Password updated');
    }

    console.log('');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║         ADMIN CREDENTIALS                              ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  URL:      https://admin.charisbilleasy.store          ║`);
    console.log(`║  Email:    ${email.padEnd(48)}║`);
    console.log(`║  Password: ${'[SET VIA ENV VARIABLE]'.padEnd(48)}║`);
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');

    // Security reminder
    console.log('🔒 Security Recommendations:');
    console.log('   1. Remove ADMIN_PASSWORD from environment variables');
    console.log('   2. Change the password immediately after first login');
    console.log('   3. Enable 2FA if available');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('');

    if (error.name === 'SequelizeConnectionError') {
      console.error('💡 Connection failed. Check DATABASE_URL_ADMIN');
    } else if (error.name === 'SequelizeDatabaseError') {
      console.error('💡 Database error. Try running the SQL script instead:');
      console.error('   node scripts/generateResetSQL.js');
    }

    process.exit(1);
  }
}

function maskDatabaseUrl(url) {
  try {
    if (!url) return 'Not configured';
    return url.replace(/(:[^:]+)@/, ':****@');
  } catch {
    return 'Invalid URL';
  }
}

resetViaEnvironment();

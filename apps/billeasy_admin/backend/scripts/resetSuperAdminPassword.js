#!/usr/bin/env node
/**
 * Super Admin Password Reset Script for Admin Control Center
 * Usage: node resetSuperAdminPassword.js [email] [new_password]
 * 
 * This script connects to the admin database (mybillbook_admin) and resets
 * the password for the super admin user.
 * 
 * Environment Variables:
 *   - DATABASE_URL_ADMIN: Admin database connection string (required)
 *   - RENDER: Set to 'true' when running on Render (optional)
 *   - NODE_ENV: Set to 'production' for production mode
 */

const bcrypt = require('bcryptjs');
const { adminDB } = require('../config/db');
const { AdminUser } = require('../models/adminModels');

const DEFAULT_ADMIN_EMAIL = 'pachu.mgd@gmail.com';
const DEFAULT_NEW_PASSWORD = 'Admin@2026';

async function resetSuperAdminPassword() {
  console.log('');
  console.log('🔐 Super Admin Password Reset Tool');
  console.log('===================================');
  console.log('');

  try {
    // Check environment variables
    const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ ERROR: DATABASE_URL_ADMIN environment variable is not set');
      console.log('');
      console.log('💡 For Render deployment:');
      console.log('   1. Go to Render Dashboard → Your Admin Backend Service');
      console.log('   2. Click "Environment" tab');
      console.log('   3. Add: DATABASE_URL_ADMIN = <your-admin-db-connection-string>');
      console.log('');
      console.log('💡 For local development:');
      console.log('   Create a .env file with: DATABASE_URL_ADMIN=postgres://user:pass@localhost:5432/mybillbook_admin');
      process.exit(1);
    }

    // Get email and password from command line args or use defaults
    const email = process.argv[2] || DEFAULT_ADMIN_EMAIL;
    const newPassword = process.argv[3] || DEFAULT_NEW_PASSWORD;

    console.log('🔍 Connecting to Admin Database...');
    console.log('   Database:', maskDatabaseUrl(dbUrl));
    console.log('');

    // Test database connection with timeout
    let connected = false;
    const maxRetries = 3;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        await adminDB.authenticate();
        connected = true;
        break;
      } catch (connError) {
        console.log(`   Connection attempt ${i + 1}/${maxRetries} failed...`);
        if (i === maxRetries - 1) throw connError;
        await sleep(1000);
      }
    }

    console.log('✅ Connected to Admin Database');
    console.log('');

    // Sync database schema (handles "sync errors")
    console.log('🔄 Syncing database schema...');
    try {
      await adminDB.sync({ alter: false }); // Don't alter, just ensure tables exist
      console.log('✅ Database schema synced');
    } catch (syncError) {
      console.warn('⚠️  Schema sync warning (non-critical):', syncError.message);
      console.log('   Continuing with password reset...');
    }
    console.log('');

    // Find the admin user
    console.log(`🔍 Looking for admin: ${email}`);
    let admin = await AdminUser.findOne({ where: { email } });

    // If not found, try case-insensitive search
    if (!admin) {
      const { Op } = require('sequelize');
      admin = await AdminUser.findOne({ 
        where: { 
          email: { [Op.iLike]: email } 
        } 
      });
    }

    if (!admin) {
      console.error('❌ Admin user not found:', email);
      console.log('');
      
      // List all admin users
      console.log('📋 Available admin users:');
      const admins = await AdminUser.findAll({
        attributes: ['id', 'email', 'name', 'role', 'is_active']
      });
      
      if (admins.length === 0) {
        console.log('   No admin users found. Creating default admin...');
        console.log('');
        
        // Create default admin
        const hashedPassword = await bcrypt.hash(DEFAULT_NEW_PASSWORD, 10);
        admin = await AdminUser.create({
          email: DEFAULT_ADMIN_EMAIL,
          password_hash: hashedPassword,
          name: 'Super Admin',
          role: 'super_admin',
          is_active: true
        });
        
        console.log('✅ Default admin created!');
        console.log('');
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║           DEFAULT ADMIN CREDENTIALS                    ║');
        console.log('╠════════════════════════════════════════════════════════╣');
        console.log(`║  URL:      https://admin.charisbilleasy.store          ║`);
        console.log(`║  Email:    ${DEFAULT_ADMIN_EMAIL.padEnd(48)}║`);
        console.log(`║  Password: ${DEFAULT_NEW_PASSWORD.padEnd(48)}║`);
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('⚠️  IMPORTANT: Change this password immediately after logging in!');
        console.log('');
        
        process.exit(0);
      }
      
      admins.forEach(a => {
        const status = a.is_active ? '' : '(INACTIVE)';
        console.log(`   - ${a.email} (${a.name}) [${a.role}] ${status}`);
      });
      
      console.log('');
      console.log('💡 Use one of the emails above or create a new admin.');
      process.exit(1);
    }

    console.log('✅ Admin user found:', admin.email);
    console.log('   Name:', admin.name);
    console.log('   Role:', admin.role);
    console.log('   Status:', admin.is_active ? 'Active' : 'Inactive');
    console.log('');

    // Activate if inactive
    if (!admin.is_active) {
      console.log('⚠️  Admin is inactive. Activating...');
    }

    // Hash new password
    console.log('🔒 Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    console.log('💾 Updating password in database...');
    await admin.update({
      password_hash: hashedPassword,
      is_active: true,
      last_login: null // Force re-login
    });

    console.log('');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║         PASSWORD RESET SUCCESSFUL!                     ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  URL:      https://admin.charisbilleasy.store          ║`);
    console.log(`║  Email:    ${email.padEnd(48)}║`);
    console.log(`║  Password: ${newPassword.padEnd(48)}║`);
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password immediately after logging in!');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('');
    
    if (error.message.includes('connect') || error.message.includes('ECONNREFUSED')) {
      console.error('💡 Database connection failed. Troubleshooting:');
      console.error('');
      console.error('   For Render Deployment:');
      console.error('   1. Check DATABASE_URL_ADMIN is set in Environment Variables');
      console.error('   2. Verify the database is in the same region as your service');
      console.error('   3. Check if the database allows connections from Render IPs');
      console.error('   4. Try restarting the service from Render Dashboard');
      console.error('');
      console.error('   For Local Development:');
      console.error('   1. Ensure PostgreSQL is running: sudo service postgresql status');
      console.error('   2. Verify database exists: createdb mybillbook_admin');
      console.error('   3. Check credentials in .env file');
    } else if (error.message.includes('relation') || error.message.includes('does not exist')) {
      console.error('💡 Database table missing. Run these SQL commands:');
      console.error(`   CREATE TABLE IF NOT EXISTS "AdminUsers" (...)`);
      console.error('   Or run: node server.js (which will auto-sync tables)');
    } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      console.error('💡 Connection timeout. This may be a Render sync issue.');
      console.error('   Try running the script again in 30 seconds.');
    }
    
    process.exit(1);
  }
}

// Helper function to mask database URL for logging
function maskDatabaseUrl(url) {
  try {
    if (!url) return 'Not configured';
    // Replace password with asterisks
    return url.replace(/(:[^:]+)@/, ':****@');
  } catch {
    return 'Invalid URL';
  }
}

// Helper function for delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the reset function
resetSuperAdminPassword();

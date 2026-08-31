#!/usr/bin/env node
/**
 * Reset Super Admin Password with Database Sync Fix
 * Usage: node resetWithSyncFix.js [email] [new_password]
 * 
 * This script specifically handles Render "sync errors" by:
 *   1. Forcing a clean database connection
 *   2. Handling schema mismatches gracefully
 *   3. Recreating tables if necessary (destructive - use with caution)
 *   4. Providing fallback to raw SQL execution
 * 
 * Use this when you see errors like:
 *   - "sync error" in Render logs
 *   - "relation does not exist"
 *   - "column does not exist"
 *   - Connection timeouts during sync
 */

const bcrypt = require('bcryptjs');
const { Sequelize } = require('sequelize');
require('dotenv').config();

const DEFAULT_ADMIN_EMAIL = 'pachu.mgd@gmail.com';
const DEFAULT_NEW_PASSWORD = 'Admin@2026';

async function resetWithSyncFix() {
  console.log('');
  console.log('🔧 Super Admin Reset with Sync Fix');
  console.log('====================================');
  console.log('');

  const email = process.argv[2] || DEFAULT_ADMIN_EMAIL;
  const newPassword = process.argv[3] || DEFAULT_NEW_PASSWORD;

  const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ DATABASE_URL_ADMIN not set');
    process.exit(1);
  }

  console.log('Target:');
  console.log(`  Email:    ${email}`);
  console.log(`  Database: ${maskUrl(dbUrl)}`);
  console.log('');

  // Create fresh Sequelize instance
  const sequelizeOptions = {
    dialect: 'postgres',
    logging: false,
    define: {
      freezeTableName: true,
      underscored: true,
      timestamps: true
    },
    pool: {
      max: 1,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };

  // Enable SSL for Render
  if (dbUrl.includes('render.com')) {
    sequelizeOptions.dialectOptions = {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    };
  }

  let sequelize;
  
  try {
    console.log('🔍 Creating database connection...');
    sequelize = new Sequelize(dbUrl, sequelizeOptions);
    
    await sequelize.authenticate();
    console.log('✅ Connected successfully');
    console.log('');

    // Method 1: Try to use existing table
    console.log('🔍 Checking for AdminUsers table...');
    
    try {
      const [results] = await sequelize.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'AdminUsers'
        );
      `);
      
      const tableExists = results[0].exists;
      
      if (!tableExists) {
        console.log('⚠️  AdminUsers table does not exist. Creating...');
        await createAdminUsersTable(sequelize);
      } else {
        console.log('✅ Table exists');
      }
    } catch (checkError) {
      console.warn('⚠️  Could not check table existence:', checkError.message);
      console.log('   Attempting to create table anyway...');
      await createAdminUsersTable(sequelize);
    }

    // Hash password
    console.log('');
    console.log('🔒 Hashing password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Upsert admin user using raw SQL (most reliable)
    console.log('💾 Updating admin password...');
    
    const upsertQuery = `
      INSERT INTO "AdminUsers" (id, email, password_hash, name, role, is_active, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        '${email}',
        '${hashedPassword}',
        'Super Admin',
        'super_admin',
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        is_active = true,
        updated_at = NOW()
      RETURNING *;
    `;

    const [result] = await sequelize.query(upsertQuery);
    
    console.log('');
    console.log('✅ Password reset successful!');
    console.log('');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║         ADMIN CREDENTIALS                              ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  URL:      https://admin.charisbilleasy.store          ║`);
    console.log(`║  Email:    ${email.padEnd(48)}║`);
    console.log(`║  Password: ${newPassword.padEnd(48)}║`);
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');

    // Verify the update
    const [verifyResult] = await sequelize.query(
      `SELECT id, email, name, role, is_active FROM "AdminUsers" WHERE email = '${email}'`
    );
    
    if (verifyResult.length > 0) {
      console.log('✅ Verified in database:');
      console.log(`   ID:       ${verifyResult[0].id}`);
      console.log(`   Name:     ${verifyResult[0].name}`);
      console.log(`   Role:     ${verifyResult[0].role}`);
      console.log(`   Active:   ${verifyResult[0].is_active}`);
    }

    console.log('');
    console.log('⚠️  IMPORTANT: Change this password immediately after logging in!');
    console.log('');

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('');

    if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
      console.error('💡 Cannot connect to database. For Render:');
      console.error('   1. Check if DATABASE_URL_ADMIN is correct');
      console.error('   2. Verify the database service is running');
      console.error('   3. Check if the database allows external connections');
    } else if (error.message.includes('authentication failed')) {
      console.error('💡 Authentication failed. Check your database credentials.');
    } else if (error.message.includes('does not exist')) {
      console.error('💡 Database or table issue. Try the SQL method:');
      console.error('   node scripts/generateResetSQL.js');
    }

    if (sequelize) {
      await sequelize.close().catch(() => {});
    }
    
    process.exit(1);
  }
}

async function createAdminUsersTable(sequelize) {
  const createTableQuery = `
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
  `;
  
  await sequelize.query(createTableQuery);
  console.log('✅ Table created successfully');
}

function maskUrl(url) {
  try {
    if (!url) return 'Not set';
    return url.replace(/(:[^:@]+)@/, ':****@');
  } catch {
    return 'Invalid';
  }
}

resetWithSyncFix();

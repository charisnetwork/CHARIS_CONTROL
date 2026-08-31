const { Sequelize } = require('sequelize');
const path = require('path');

// Basic Sequelize options
const sequelizeOptions = {
  dialect: 'postgres',
  logging: false,
  define: {
    freezeTableName: true,
    underscored: true,
    timestamps: true
  }
};

// Log environment keys for debugging (without values for security)
const envKeys = Object.keys(process.env);
console.log('[DB Config] Environment Keys found:', envKeys.filter(k => k.includes('DATABASE') || k === 'PORT' || k === 'NODE_ENV'));

// Primary DB URL (Main SaaS DB)
// Railway provides multiple URL formats, prefer the standard one
let saasUrl = (
  process.env.DATABASE_URL || 
  process.env.DATABASE_URL_SaaS || 
  process.env.DATABASE_PUBLIC_URL || 
  ''
).trim();

// Admin DB URL (Specific Admin DB or fallback to SaaS DB)
let adminUrl = (
  process.env.DATABASE_URL || 
  process.env.DATABASE_URL_ADMIN || 
  process.env.DATABASE_PUBLIC_URL || 
  ''
).trim();

if (!saasUrl) {
  console.error('[DB Config] CRITICAL: DATABASE_URL or DATABASE_URL_SaaS is missing!');
  saasUrl = 'postgres://dummy:dummy@localhost:5432/dummy'; // Fallback so it doesn't crash on load
}

if (!adminUrl) {
  console.error('[DB Config] CRITICAL: DATABASE_URL or DATABASE_URL_ADMIN is missing!');
  adminUrl = 'postgres://dummy:dummy@localhost:5432/dummy'; // Fallback so it doesn't crash on load
}

// Validate and clean URLs
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Log for debugging
console.log('[DB Config] SaaS URL Valid:', isValidUrl(saasUrl) ? '✅' : '❌ (may have protocol issue)');
console.log('[DB Config] Admin URL Valid:', isValidUrl(adminUrl) ? '✅' : '❌ (may have protocol issue)');

// Ensure URLs have proper protocol - only add if missing
if (saasUrl && !saasUrl.startsWith('postgres://') && !saasUrl.startsWith('postgresql://')) {
  if (!saasUrl.includes('://')) {
    console.warn('[DB Config] SaaS URL missing protocol, prepending postgresql://');
    saasUrl = `postgresql://${saasUrl}`;
  }
}

if (adminUrl && !adminUrl.startsWith('postgres://') && !adminUrl.startsWith('postgresql://')) {
  if (!adminUrl.includes('://')) {
    console.warn('[DB Config] Admin URL missing protocol, prepending postgresql://');
    adminUrl = `postgresql://${adminUrl}`;
  }
}

// Add SSL for cloud hosting (Railway, Render, etc.)
if (saasUrl.includes('railway.app') || saasUrl.includes('render.com') || process.env.NODE_ENV === 'production') {
  sequelizeOptions.dialectOptions = {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  };
  console.log('[DB Config] SSL Enabled for Database Connections');
}

console.log('[DB Config] Initializing Sequelize for SaaS DB (URL length:', saasUrl.length, ')');
let saasDB;
try {
  saasDB = new Sequelize(saasUrl, sequelizeOptions);
  console.log('[DB Config] ✅ SaaS DB Sequelize initialized');
} catch (error) {
  console.error('[DB Config] ❌ Failed to initialize SaaS DB:', error.message);
  console.error('[DB Config] URL starts with:', saasUrl.substring(0, 30) + '...');
  throw error;
}

console.log('[DB Config] Initializing Sequelize for Admin DB (URL length:', adminUrl.length, ')');
let adminDB;
try {
  adminDB = new Sequelize(adminUrl, sequelizeOptions);
  console.log('[DB Config] ✅ Admin DB Sequelize initialized');
} catch (error) {
  console.error('[DB Config] ❌ Failed to initialize Admin DB:', error.message);
  console.error('[DB Config] URL starts with:', adminUrl.substring(0, 30) + '...');
  throw error;
}

module.exports = { saasDB, adminDB };

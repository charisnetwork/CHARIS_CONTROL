const fs = require('fs');
const path = require('path');

// If DATABASE_URL is not set but PGHOST is (which Railway provides)
if (!process.env.DATABASE_URL && process.env.PGHOST) {
  const user = process.env.PGUSER || process.env.POSTGRES_USER;
  const pass = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const host = process.env.PGHOST;
  const port = process.env.PGPORT || '5432';
  const db = process.env.PGDATABASE || process.env.POSTGRES_DB;
  
  const dbUrl = `postgresql://${user}:${pass}@${host}:${port}/${db}?schema=public`;
  
  const envPath = path.join(__dirname, '../.env');
  fs.writeFileSync(envPath, `DATABASE_URL="${dbUrl}"\n`);
  console.log('[Setup] Created .env with constructed DATABASE_URL from Railway variables.');
} else {
  console.log('[Setup] DATABASE_URL already exists or PGHOST is missing. Skipping.');
}

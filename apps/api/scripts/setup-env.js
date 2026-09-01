const fs = require('fs');
const path = require('path');

// If PGHOST is present, we construct the URL.
// We do this even if DATABASE_URL exists, to override broken manual configurations
// where the user accidentally set it to the app's own private domain.
if (process.env.PGHOST) {
  const user = process.env.PGUSER || process.env.POSTGRES_USER || 'postgres';
  const pass = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '';
  const host = process.env.PGHOST;
  const port = process.env.PGPORT || '5432';
  const db = process.env.PGDATABASE || process.env.POSTGRES_DB || 'railway';
  
  const dbUrl = `postgresql://${user}:${pass}@${host}:${port}/${db}?schema=public`;
  
  const envPath = path.join(__dirname, '../.env');
  fs.writeFileSync(envPath, `DATABASE_URL="${dbUrl}"\n`);
  console.log(`[Setup] Created .env with constructed DATABASE_URL from Railway variables using host: ${host}`);
} else {
  console.log('[Setup] PGHOST is missing. Ensure you have a Postgres service linked.');
}

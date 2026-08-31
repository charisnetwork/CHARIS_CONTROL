# Super Admin Password Reset Scripts

This folder contains scripts to reset the **Super Admin** password for the Admin Control Center (`admin.charisbilleasy.store`).

> ⚠️ **Important**: This is for the **SaaS Admin Panel** only, not for regular user accounts.

## 🔐 Default Login Credentials

After a fresh deployment, the default credentials are:
- **URL**: https://admin.charisbilleasy.store
- **Email**: `pachu.mgd@gmail.com`
- **Password**: `nishu@143` (or `Admin@2026` if reset)

If you've changed the password and forgotten it, use the methods below.

---

## 🚀 Quick Start for Render Deployment

### Method 1: SQL Shell (Recommended for Sync Errors)

If you're experiencing "sync errors" on Render:

1. **Generate the SQL** locally:
   ```bash
   cd admin/backend
   node scripts/generateResetSQL.js
   ```

2. **Copy the generated SQL** from the output

3. **Run on Render**:
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click your **PostgreSQL database**
   - Go to **"SQL Shell"** tab
   - Paste and execute the SQL

### Method 2: Render Shell (Direct Node.js)

1. **Go to Render Dashboard** → Your `billeasy-admin-backend` service
2. **Click "Shell"** tab
3. **Run the reset script**:
   ```bash
   cd admin/backend
   node scripts/resetSuperAdminPassword.js
   ```

### Method 3: Environment Variable Reset

For non-interactive reset (useful in CI/CD):

1. **Add environment variable** in Render Dashboard:
   - Key: `ADMIN_PASSWORD`
   - Value: `YourNewSecurePassword123`

2. **Run the script**:
   ```bash
   cd admin/backend
   node scripts/resetViaEnvironment.js
   ```

3. **Remove the environment variable** after use (for security)

---

## 📋 Detailed Script Reference

### `resetSuperAdminPassword.js` (Standard Method)

**Best for**: Normal password reset with full error handling

```bash
cd admin/backend

# Reset default admin with default password
node scripts/resetSuperAdminPassword.js

# Reset specific user with custom password
node scripts/resetSuperAdminPassword.js user@example.com MyNewPass123
```

**Features**:
- Auto-detects admin user or creates default
- Handles database connection retries
- Syncs schema automatically
- Lists available admins if email not found

---

### `generateResetSQL.js` (SQL Method)

**Best for**: Sync errors, manual database access, Render SQL Shell

```bash
cd admin/backend

# Generate SQL with default password
node scripts/generateResetSQL.js

# Generate SQL with custom password
node scripts/generateResetSQL.js MyNewPass123 admin@example.com
```

**Output**:
- Prints SQL to console
- Saves SQL to `reset-password-generated.sql` file
- Includes table creation if needed

---

### `resetWithSyncFix.js` (Sync Error Fix)

**Best for**: Database sync errors, schema issues, connection timeouts

```bash
cd admin/backend

# Reset with sync fix
node scripts/resetWithSyncFix.js

# With custom credentials
node scripts/resetWithSyncFix.js admin@example.com NewPass123
```

**Features**:
- Bypasses Sequelize sync issues
- Uses raw SQL for reliability
- Creates missing tables automatically
- Handles SSL for Render

---

### `resetViaEnvironment.js` (Non-Interactive)

**Best for**: CI/CD pipelines, automated deployments

```bash
# Set environment variables
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=SecurePass123
export DATABASE_URL_ADMIN=postgres://...

# Run
cd admin/backend
node scripts/resetViaEnvironment.js
```

**Required Environment Variables**:
- `ADMIN_PASSWORD` (required) - The new password
- `ADMIN_EMAIL` (optional) - Defaults to `pachu.mgd@gmail.com`
- `DATABASE_URL_ADMIN` (required) - Database connection string

---

## 🔧 Troubleshooting Render Sync Errors

### "Sync Error" in Render Logs

**Symptoms**: Service fails to start with sync-related errors

**Solution 1 - SQL Shell Method**:
1. Generate SQL: `node scripts/generateResetSQL.js`
2. Copy the SQL
3. Go to Render Dashboard → Database → SQL Shell
4. Execute the SQL

**Solution 2 - Restart with Sync Fix**:
1. Go to Render Dashboard → Service → Shell
2. Run: `node scripts/resetWithSyncFix.js`
3. Restart the service from the Dashboard

**Solution 3 - Disable Sync Temporarily**:
1. In `server.js`, change `adminDB.sync({ alter: true })` to `adminDB.sync()`
2. Deploy the change
3. Reset password using SQL Shell
4. Re-enable sync if needed

### "Database connection failed"

**Check**:
1. `DATABASE_URL_ADMIN` is set in environment variables
2. Database is in the same region as your service
3. Database allows connections from Render

**Test connection**:
```bash
# In Render Shell
node -e "const { Sequelize } = require('sequelize'); const s = new Sequelize(process.env.DATABASE_URL_ADMIN, {dialect:'postgres'}); s.authenticate().then(()=>console.log('OK')).catch(e=>console.error(e.message))"
```

### "User not found"

The script will list all available admin users. Use one of those emails or the script will create a default admin.

---

## 🗄️ Database Information

The admin panel uses a **separate database** from the main SaaS app:

| Database | Purpose | Default Name | Environment Variable |
|----------|---------|--------------|---------------------|
| SaaS DB | User accounts, invoices, companies | `mybillbook` | `DATABASE_URL_SaaS` |
| Admin DB | Super admin users, affiliates, platform expenses | `mybillbook_admin` | `DATABASE_URL_ADMIN` |

### Render Environment Variables

```bash
# Main SaaS database (read-only from admin)
DATABASE_URL_SaaS=postgres://user:pass@host:5432/mybillbook

# Admin database (full access)
DATABASE_URL_ADMIN=postgres://user:pass@host:5432/mybillbook_admin

# Admin panel secret
ADMIN_SECRET=your_secret_key

# Optional: For environment-based reset
ADMIN_EMAIL=pachu.mgd@gmail.com
ADMIN_PASSWORD=your_temp_password
```

---

## 🛡️ Security Notes

1. **No Self-Service Forgot Password**: The admin panel intentionally doesn't have a "Forgot Password" feature for security. Use these scripts instead.

2. **Change Default Password**: After resetting, immediately change the password to something secure.

3. **Remove Temp Environment Variables**: If you used `ADMIN_PASSWORD` or similar, remove them after use.

4. **Keep Admin DB Separate**: Never share the admin database credentials with the main app.

5. **Audit Trail**: Consider adding audit logging for admin password changes in production.

---

## 📞 Support

If you continue to have issues:

1. Check the server logs in Render Dashboard
2. Verify environment variables are set correctly
3. Try the SQL Shell method as a fallback
4. Ensure database is accessible from the Render service

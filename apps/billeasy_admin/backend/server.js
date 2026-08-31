const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { adminDB, saasDB } = require('./config/db');
const adminRoutes = require('./routes/adminRoutes');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Admin credentials - only pachu.mgd@gmail.com is allowed
const ADMIN_EMAIL = 'pachu.mgd@gmail.com';
const ADMIN_SECRET_PIN = process.env.ADMIN_SECRET_PIN || process.env.ADMIN_SECRET; // Simple PIN-based auth
const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET; // Use JWT_SECRET or fallback to ADMIN_SECRET
const JWT_EXPIRES_IN = '24h';

app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins - health checks, mobile apps, curl, server-to-server
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'x-admin-token'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());
app.use(morgan('dev'));

// JWT Authentication Middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  // Also support x-admin-token header for flexibility
  const tokenFromHeader = req.headers['x-admin-token'];
  const finalToken = token || tokenFromHeader;
  
  if (!finalToken) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  // Handle legacy tokens (prefix with 'legacy-')
  if (finalToken.startsWith('legacy-')) {
    const secret = finalToken.substring(7);
    if (secret === process.env.ADMIN_SECRET) {
      req.user = { email: ADMIN_EMAIL, role: 'superadmin' };
      return next();
    }
    return res.status(403).json({ error: 'Invalid legacy token.' });
  }
  
  try {
    const decoded = jwt.verify(finalToken, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// Legacy secret authentication (for backward compatibility)
const authenticateLegacy = (req, res, next) => {
  const adminSecret = process.env.ADMIN_SECRET;
  let providedSecret = req.headers['x-admin-secret'];
  
  if (!providedSecret && req.headers['authorization']) {
    const authHeader = req.headers['authorization'];
    if (authHeader.startsWith('Bearer ')) {
      providedSecret = authHeader.substring(7);
    } else {
      providedSecret = authHeader;
    }
  }
  
  if (adminSecret && providedSecret === adminSecret) {
    return next();
  }
  
  return res.status(403).json({ 
    error: "Unauthorized access", 
    message: adminSecret ? "Invalid secret" : "ADMIN_SECRET not configured on server"
  });
};

// Combined auth middleware - tries JWT first, then falls back to legacy
const authMiddleware = (req, res, next) => {
  // Debug log
  console.log('[Auth] Path:', req.path);
  console.log('[Auth] Authorization header:', req.headers['authorization'] ? 'present' : 'missing');
  console.log('[Auth] x-admin-token header:', req.headers['x-admin-token'] ? 'present' : 'missing');
  
  // Try JWT auth first
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const tokenFromHeader = req.headers['x-admin-token'];
  
  if (token || tokenFromHeader) {
    console.log('[Auth] Attempting JWT authentication');
    return authenticateJWT(req, res, next);
  }
  
  // Fall back to legacy secret auth
  console.log('[Auth] Attempting legacy authentication');
  return authenticateLegacy(req, res, next);
};

// Health Check (public) - MUST return 200 for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    auth: 'jwt-enabled',
    service: 'admin-backend'
  });
});

// Public routes
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  console.log('[Login] Attempt:', email);
  console.log('[Login] ADMIN_EMAIL configured:', ADMIN_EMAIL);
  console.log('[Login] ADMIN_SECRET_PIN configured:', ADMIN_SECRET_PIN ? 'Yes' : 'NO');
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  
  // Only allow the specific admin email
  if (email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase()) {
    console.log('[Login] Email mismatch:', email.toLowerCase().trim(), '!==', ADMIN_EMAIL.toLowerCase());
    return res.status(401).json({ error: 'Invalid credentials. Only authorized admin can login.' });
  }
  
  // Check if ADMIN_SECRET_PIN is configured
  if (!ADMIN_SECRET_PIN) {
    console.error('[Login] ADMIN_SECRET_PIN not set in environment');
    return res.status(500).json({ error: 'Server configuration error. ADMIN_SECRET_PIN not set.' });
  }
  
  // Simple comparison: password must match ADMIN_SECRET_PIN
  const isPasswordValid = (password === ADMIN_SECRET_PIN);
  
  console.log('[Login] Password valid:', isPasswordValid);
  
  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  
  // Generate JWT token
  const token = jwt.sign(
    { 
      email: ADMIN_EMAIL,
      role: 'superadmin',
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  
  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      email: ADMIN_EMAIL,
      name: 'Platform Administrator',
      role: 'superadmin'
    }
  });
});

// Get current user (protected)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    email: ADMIN_EMAIL,
    name: 'Platform Administrator',
    role: 'superadmin'
  });
});

// Logout (client-side token removal, but we can log it)
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Protected routes
app.use('/api', authMiddleware, adminRoutes);

// Error Handler
app.use((err, req, res, next) => {
  console.error('ADMIN ERROR:', err);
  const status = err.status || 500;
  const message = (process.env.NODE_ENV === 'production' && status === 500) 
    ? 'Internal admin server error' 
    : err.message;

  res.status(status).json({
    error: message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

// Database Sync & Server Start
const startServer = async () => {
  let retries = 0;
  const maxRetries = 5;
  
  while (retries < maxRetries) {
    try {
      // Check for critical environment variables
      if (!JWT_SECRET) {
        console.warn('⚠️ WARNING: JWT_SECRET is not set. Using fallback - this is insecure!');
      }
      
      if (!ADMIN_SECRET_PIN) {
        console.warn('⚠️ WARNING: ADMIN_SECRET_PIN is not set. Login will not work!');
        console.log('💡 Set ADMIN_SECRET_PIN env variable to enable admin login');
      }

      // Authenticate SaaS DB (Read-Only access recommended)
      await saasDB.authenticate();
      console.log('✅ Connected to SaaS Database');

      // Sync Admin DB (Write Access for Affiliates, Expenses, etc.)
      await adminDB.authenticate();
      await adminDB.sync({ alter: true });
      console.log('✅ Connected and Synced Admin Database');

      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Developer Admin Control Center running on port ${PORT}`);
        console.log(`🔐 Admin Email: ${ADMIN_EMAIL}`);
        console.log(`🔑 JWT Auth: ${JWT_SECRET ? 'Enabled' : 'DISABLED - Using legacy secret only'}`);
      });
      
      return; // Success - exit retry loop
    } catch (error) {
      retries++;
      console.error(`❌ Database connection failed (attempt ${retries}/${maxRetries}):`, error.message);
      
      if (retries >= maxRetries) {
        console.error('❌ Max retries reached. Starting without DB...');
        // Start server even without DB so health check passes
        app.listen(PORT, '0.0.0.0', () => {
          console.log(`🚀 Developer Admin Control Center running on port ${PORT} (DB unavailable)`);
          console.log(`🔐 Admin Email: ${ADMIN_EMAIL}`);
        });
        return;
      }
      
      console.log(`⏳ Retrying in 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
};

startServer();

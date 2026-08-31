const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_BACKEND_PORT = process.env.ADMIN_BACKEND_PORT || '3001';

const adminBackendEnv = {
  ...process.env,
  PORT: ADMIN_BACKEND_PORT,
  NODE_ENV: process.env.NODE_ENV || 'production'
};

console.log('🚀 Starting Admin Service Gateway...');
console.log(`📦 Spawning Admin Backend on port ${ADMIN_BACKEND_PORT}...`);
const adminBackend = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, 'backend'),
  env: adminBackendEnv,
  stdio: 'inherit'
});

adminBackend.on('exit', (code, signal) => {
  console.warn(`⚠️ Admin backend process exited with code=${code}, signal=${signal}`);
});

adminBackend.on('error', (err) => {
  console.error('❌ Failed to start admin backend process:', err);
});

app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'x-admin-token']
}));

app.use(express.json());

app.use('/api', createProxyMiddleware({
  target: `http://localhost:${ADMIN_BACKEND_PORT}`,
  changeOrigin: true,
  logLevel: 'debug',
  proxyTimeout: 60000,
  timeout: 60000,
  on: {
    error: (err, req, res) => {
      console.error(`[Admin Proxy Error] ${req.method} ${req.url} ->`, err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Admin backend unavailable', details: err.message });
      }
    }
  }
}));

const adminFrontendPath = path.join(__dirname, 'frontend/dist');

if (fs.existsSync(adminFrontendPath) && fs.existsSync(path.join(adminFrontendPath, 'index.html'))) {
  console.log('✅ Admin frontend found, serving static files.');
  app.use(express.static(adminFrontendPath, {
    maxAge: '1d',
    etag: true,
    lastModified: true
  }));

  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/uploads') || req.url.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(adminFrontendPath, 'index.html'), (err) => {
      if (err) {
        console.error('[Admin Gateway] Error sending index.html:', err);
        next(err);
      }
    });
  });
} else {
  console.log('⚠️ Admin frontend NOT found in admin/frontend/dist.');
}

app.use('/uploads', express.static(path.join(__dirname, 'backend/uploads')));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'admin-gateway',
    backend: `http://localhost:${ADMIN_BACKEND_PORT}`,
    saas_links: {
      railway: process.env.RAILWAY_SAAS_LINK || 'not_set',
      vercel: process.env.VERCEL_SAAS_LINK || 'not_set'
    },
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Admin Gateway running on port ${PORT}`);
  console.log(`🔗 Admin API: /api`);
  console.log(`🔗 Admin Portal: /`);
  console.log(`🔗 Admin Health: /health`);
});

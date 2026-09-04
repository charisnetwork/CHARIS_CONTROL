import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import 'express-async-errors';
import { errorHandler } from './middlewares/error.middleware';
import authRoutes from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';
import subscriptionRoutes from './routes/subscription.routes';
import planRoutes from './routes/plan.routes';
import couponRoutes from './routes/coupon.routes';
import applicationRoutes from './routes/application.routes';
import syncRoutes from './routes/sync.routes';
import userRoutes from './routes/user.routes';
import entitlementRoutes from './routes/entitlement.routes';
import offerRoutes from './routes/offer.routes';
import marketingRoutes from './routes/marketing.routes';
import notificationRoutes from './routes/notification.routes';
import reportRoutes from './routes/report.routes';
import customerRoutes from './routes/customer.routes';
import publicCatalogRoutes from './routes/publicCatalog.routes';
import affiliateRoutes from './routes/affiliate.routes';
import { WebhookService } from './services/webhook.service';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { allowedOrigins, isProduction, jwtSecret } from './config';
import './queues/health.queue';

dotenv.config();

// Refuse a production process that would issue or accept unverifiable tokens.
if (isProduction) jwtSecret();
const configuredOrigins = allowedOrigins();
const defaultAllowedOrigins = [
  'https://charis-control.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4000'
];

const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // Server-to-server, mobile, curl
  if (configuredOrigins.length > 0) {
    if (configuredOrigins.includes('*') || configuredOrigins.includes(origin)) return true;
  }
  if (defaultAllowedOrigins.includes(origin) || origin.endsWith('.pages.dev') || origin.endsWith('.up.railway.app')) {
    return true;
  }
  return false;
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-entitlement-token', 'x-webhook-signature'],
};

const app = express();
const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true,
  }
});

io.on('connection', (socket) => {
  console.log('Client connected to Socket.IO', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan('dev'));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Browser-safe commercial catalog. It intentionally has no authentication
// because its controller returns a strictly public projection only.
app.use('/api/public', publicCatalogRoutes);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/users', userRoutes);
app.use('/api/entitlements', entitlementRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/affiliates', affiliateRoutes);

// Use error handler middleware
app.use(errorHandler);

import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';

const seedDefaultAdminUser = async () => {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || 'nishu@143';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const adminEmails = [
      process.env.ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || 'pachu@gmail.com',
      'pachu.mgd@gmail.com'
    ];

    for (const email of adminEmails) {
      await prisma.adminUser.upsert({
        where: { email },
        update: { password: hashedPassword, role: 'SUPER_ADMIN', isActive: true },
        create: {
          email,
          password: hashedPassword,
          firstName: 'Pachu',
          lastName: 'Admin',
          role: 'SUPER_ADMIN',
          isActive: true
        }
      });
    }

    // Auto-seed Bill Easy application if missing
    let app = await prisma.application.findFirst({
      where: { OR: [{ applicationName: 'billeasy' }, { displayName: 'Bill Easy' }] }
    });

    if (!app) {
      app = await prisma.application.create({
        data: {
          applicationName: 'billeasy',
          displayName: 'Bill Easy',
          description: 'Billing, Invoicing & Inventory Management System',
          apiKey: 'billeasy_live_api_key_2026',
          apiBaseUrl: 'https://bill-easy-production.up.railway.app',
          webhookUrl: 'https://bill-easy-production.up.railway.app/api/webhooks/charis',
          webhookSecret: 'billeasy_webhook_secret_2026',
          status: 'ACTIVE'
        }
      });
    } else {
      await prisma.application.update({
        where: { id: app.id },
        data: {
          apiBaseUrl: 'https://bill-easy-production.up.railway.app',
          webhookUrl: 'https://bill-easy-production.up.railway.app/api/webhooks/charis'
        }
      });
    }

    // Seed default subscription model & plans if missing
    let model = await prisma.subscriptionModel.findFirst({
      where: { name: 'Standard SaaS Model' }
    });
    if (!model) {
      model = await prisma.subscriptionModel.create({
        data: { name: 'Standard SaaS Model', description: 'Standard Tiered SaaS Subscription Model' }
      });
      await prisma.applicationMapping.create({
        data: { applicationId: app.id, subscriptionModelId: model.id }
      });
    }

    const existingPlans = await prisma.plan.findMany({ where: { subscriptionModelId: model.id } });
    let proPlan = existingPlans.find(p => p.code === 'BILL_EASY_PRO');
    if (existingPlans.length === 0) {
      await prisma.plan.create({
        data: {
          subscriptionModelId: model.id,
          name: 'Free Account',
          code: 'FREE',
          badge: 'Starter',
          description: 'For small freelancers & single users',
          isRecommended: false,
          pricingMatrix: { '1m': 0, '3m': 0, '6m': 0, '1y': 0 },
          perks: ['GST Invoicing', '1 User Access', '50 Invoices/mo']
        }
      });
      proPlan = await prisma.plan.create({
        data: {
          subscriptionModelId: model.id,
          name: 'Pro Plan',
          code: 'BILL_EASY_PRO',
          badge: 'Most Popular',
          description: 'For growing retail & wholesale businesses',
          isRecommended: true,
          pricingMatrix: { '1m': 499, '3m': 1200, '6m': 2200, '1y': 3600 },
          perks: ['500 Invoices/mo', '10 E-Way Bills/mo', 'CA Reports', 'Priority Support']
        }
      });
      await prisma.plan.create({
        data: {
          subscriptionModelId: model.id,
          name: 'Enterprise Plan',
          code: 'BILL_EASY_ENTERPRISE',
          badge: 'Unlimited',
          description: 'For high volume enterprises & multi-store chains',
          isRecommended: false,
          pricingMatrix: { '1m': 999, '3m': 2500, '6m': 4500, '1y': 7200 },
          perks: ['Unlimited Invoices', 'Unlimited E-Way Bills', 'AI Assistant', 'Multi-Warehouse']
        }
      });
    }

    const existingSub = await prisma.subscriptionReference.findFirst({ where: { applicationId: app.id } });
    if (!existingSub && proPlan) {
      await prisma.subscriptionReference.create({
        data: {
          applicationId: app.id,
          planId: proPlan.id,
          customerId: 'tenant_abc_traders',
          customerName: 'ABC Traders Pvt Ltd',
          customerEmail: 'pachu.mgd@gmail.com',
          status: 'ACTIVE',
          billingCycle: 'YEARLY',
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          durationMonths: 12,
          basePrice: 3600,
          discountAmount: 600,
          couponCode: 'AGENCYA20',
          couponDiscount: 600,
          finalPrice: 3000,
          price: 3000,
          paymentStatus: 'PAID'
        }
      });
    }

    console.log('✅ Default Admin User, Application, Plans & Subscriptions auto-seeded successfully!');
  } catch (err) {
    console.warn('⚠️ Admin auto-seed warning (continuing boot):', (err as Error).message);
  }
};

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  WebhookService.startDeliveryWorker();
  seedDefaultAdminUser();
  console.log(`Server is running on port ${PORT}`);
});

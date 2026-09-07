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

const DEFAULT_GROUPS = [
  { name: 'Sales Management', code: 'sales', sortOrder: 1 },
  { name: 'Purchases & Vendors', code: 'purchases', sortOrder: 2 },
  { name: 'Expenses Tracker', code: 'expenses', sortOrder: 3 },
  { name: 'Inventory & Warehouses', code: 'inventory', sortOrder: 4 },
  { name: 'Parties & Directory', code: 'directory', sortOrder: 5 },
  { name: 'E-Way Bills & Tax Compliance', code: 'eway_bills', sortOrder: 6 },
  { name: 'Financial & Tax Reports', code: 'reports', sortOrder: 7 },
  { name: 'AI & Intelligent Tools', code: 'ai_tools', sortOrder: 8 },
  { name: 'Management & System Security', code: 'management', sortOrder: 9 }
];

const DEFAULT_FEATURES = [
  // Sales Management (Group 1)
  { groupCode: 'sales', name: 'Create GST Invoice', code: 'create_invoice', description: 'Create and issue GST compliant invoices', sortOrder: 1 },
  { groupCode: 'sales', name: 'Estimates & Quotations', code: 'quotations', description: 'Create quotations and convert to invoices', sortOrder: 2 },
  { groupCode: 'sales', name: 'Payment In', code: 'payment_in', description: 'Record customer payment collections', sortOrder: 3 },
  { groupCode: 'sales', name: 'Sales Return & Credit Notes', code: 'sales_return', description: 'Record sales returns and issue credit notes', sortOrder: 4 },
  { groupCode: 'sales', name: 'POS Billing Counter', code: 'pos_billing', description: 'Fast barcode counter POS billing UI', sortOrder: 5 },
  { groupCode: 'sales', name: 'Custom PDF Branding & Sharing', code: 'pdf_print', description: 'Custom invoice logos and WhatsApp PDF sharing', sortOrder: 6 },

  // Purchases (Group 2)
  { groupCode: 'purchases', name: 'Purchase Bill Entry', code: 'purchase_entry', description: 'Record vendor purchase bills and tax credits', sortOrder: 7 },
  { groupCode: 'purchases', name: 'Purchase Orders (PO)', code: 'purchase_orders', description: 'Issue POs to suppliers and track fulfillment', sortOrder: 8 },

  // Expenses (Group 3)
  { groupCode: 'expenses', name: 'Expense Tracking', code: 'expense_tracker', description: 'Categorized business expense records', sortOrder: 9 },

  // Inventory (Group 4)
  { groupCode: 'inventory', name: 'Product Catalog Master', code: 'products_master', description: 'Item master, HSN codes, SKU & pricing', sortOrder: 10 },
  { groupCode: 'inventory', name: 'Stock Transfer (Multi-Godowns)', code: 'stock_transfer', description: 'Transfer stock between godowns/warehouses', sortOrder: 11 },
  { groupCode: 'inventory', name: 'Low Stock Alerts', code: 'low_stock_alerts', description: 'Safety stock alerts and reorder warnings', sortOrder: 12 },

  // Directory (Group 5)
  { groupCode: 'directory', name: 'Customer Master & Ledgers', code: 'customers_master', description: 'Customer directory and balance tracking', sortOrder: 13 },
  { groupCode: 'directory', name: 'Supplier Master & Payables', code: 'suppliers_master', description: 'Vendor directory and payable balances', sortOrder: 14 },

  // E-Way Bills (Group 6)
  { groupCode: 'eway_bills', name: 'Generate E-Way Bills', code: 'eway_bills_create', description: 'Direct e-way bill generation & transport details', sortOrder: 15 },
  { groupCode: 'eway_bills', name: 'E-Way Bill History & Print', code: 'eway_bills_list', description: 'View, filter, and print generated e-way bills', sortOrder: 16 },
  { groupCode: 'eway_bills', name: 'GSTR-1 & GSTR-3B Tax Summaries', code: 'gstr_reports', description: 'Export GST return summaries', sortOrder: 17 },

  // Reports (Group 7)
  { groupCode: 'reports', name: 'Sales Analytics & Item Reports', code: 'sales_reports', description: 'Item-wise sales and party profitability', sortOrder: 18 },
  { groupCode: 'reports', name: 'Purchase & Vendor Summaries', code: 'purchase_reports', description: 'Purchase register and vendor ledgers', sortOrder: 19 },
  { groupCode: 'reports', name: 'Profit & Loss Statement', code: 'profit_loss_reports', description: 'Monthly & annual P&L financial summaries', sortOrder: 20 },
  { groupCode: 'reports', name: 'Stock Valuation Reports', code: 'stock_reports', description: 'Stock summary and inventory valuation', sortOrder: 21 },

  // AI Tools (Group 8)
  { groupCode: 'ai_tools', name: 'Charis AI Assistant Copilot', code: 'ai_assistant', description: 'Interactive AI billing & invoice assistant', sortOrder: 22 },
  { groupCode: 'ai_tools', name: 'Automated Business Insights', code: 'ai_insights', description: 'Smart sales forecasting & reorder recommendations', sortOrder: 23 },

  // Management (Group 9)
  { groupCode: 'management', name: 'Multi-Business Workspaces', code: 'multi_business', description: 'Manage multiple businesses under one account', sortOrder: 24 },
  { groupCode: 'management', name: 'Team Roles & Access Control', code: 'max_users_access', description: 'Multi-user access and role permissions', sortOrder: 25 },
  { groupCode: 'management', name: 'Staff Attendance & Payroll', code: 'staff_payroll', description: 'Staff attendance logging and salary tracking', sortOrder: 26 },
  { groupCode: 'management', name: 'User Action Audit Tracker', code: 'activity_tracker', description: 'Audit trail of user actions & edits', sortOrder: 27 },
  { groupCode: 'management', name: 'Tally Accounting Export', code: 'tally_export', description: '1-click export of data to Tally Prime', sortOrder: 28 }
];

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

    // Auto-seed Standard Subscription Model & Mapping
    let model = await prisma.subscriptionModel.findFirst({ where: { name: 'Standard SaaS Model' } });
    if (!model) {
      model = await prisma.subscriptionModel.create({
        data: { name: 'Standard SaaS Model', description: 'Universal Multi-Tier Subscription Model' }
      });
    }

    await prisma.applicationMapping.upsert({
      where: { applicationId_subscriptionModelId: { applicationId: app.id, subscriptionModelId: model.id } },
      update: { isActive: true },
      create: { applicationId: app.id, subscriptionModelId: model.id, isActive: true }
    });

    // Auto-seed 9 Main Feature Groups and 28 Sub-Features
    const groupMap = new Map<string, string>();
    for (const g of DEFAULT_GROUPS) {
      const group = await prisma.featureGroup.upsert({
        where: { code: g.code },
        update: { name: g.name, sortOrder: g.sortOrder, applicationId: app.id },
        create: { applicationId: app.id, name: g.name, code: g.code, sortOrder: g.sortOrder }
      });
      groupMap.set(g.code, group.id);
    }

    const featureIdMap = new Map<string, string>();
    for (const f of DEFAULT_FEATURES) {
      const groupId = groupMap.get(f.groupCode) || null;
      const feat = await prisma.feature.upsert({
        where: { code: f.code },
        update: { name: f.name, groupId, description: f.description, sortOrder: f.sortOrder, applicationId: app.id },
        create: { applicationId: app.id, groupId, subscriptionModelId: model.id, name: f.name, code: f.code, description: f.description, sortOrder: f.sortOrder }
      });
      featureIdMap.set(f.code, feat.id);
    }

    // Seed 4 Universal Plans with custom admin description text in own words
    const PLANS_DEF = [
      {
        name: 'Free Account',
        code: 'free',
        badge: 'Starter',
        priceMonthly: 0,
        priceYearly: 0,
        currency: 'INR',
        description: 'Basic GST invoicing and inventory management for freelancers and single-user small businesses.',
        isRecommended: false,
        order: 1,
        // Enabled feature codes for Free plan:
        enabledCodes: ['create_invoice', 'payment_in', 'products_master', 'customers_master', 'suppliers_master', 'pdf_print']
      },
      {
        name: 'Starter Plan',
        code: 'starter',
        badge: 'Popular',
        priceMonthly: 299,
        priceYearly: 2400,
        currency: 'INR',
        description: 'Ideal for growing retail stores needing payment tracking, estimates, sales returns, and purchase bills.',
        isRecommended: false,
        order: 2,
        enabledCodes: [
          'create_invoice', 'quotations', 'payment_in', 'sales_return', 'pdf_print',
          'purchase_entry', 'expense_tracker', 'products_master', 'low_stock_alerts',
          'customers_master', 'suppliers_master', 'sales_reports', 'purchase_reports'
        ]
      },
      {
        name: 'Pro Plan',
        code: 'pro',
        badge: 'Most Popular',
        priceMonthly: 499,
        priceYearly: 3600,
        currency: 'INR',
        description: 'Complete billing & inventory solution with E-Way bills, POS counter, multi-business, and Tally export.',
        isRecommended: true,
        order: 3,
        enabledCodes: [
          'create_invoice', 'quotations', 'payment_in', 'sales_return', 'pos_billing', 'pdf_print',
          'purchase_entry', 'purchase_orders', 'expense_tracker', 'products_master', 'low_stock_alerts',
          'customers_master', 'suppliers_master', 'eway_bills_create', 'eway_bills_list', 'gstr_reports',
          'sales_reports', 'purchase_reports', 'profit_loss_reports', 'stock_reports',
          'multi_business', 'max_users_access', 'tally_export'
        ]
      },
      {
        name: 'Enterprise Plan',
        code: 'enterprise',
        badge: 'Unlimited',
        priceMonthly: 999,
        priceYearly: 7200,
        currency: 'INR',
        description: 'Unlimited power with AI Assistant copilot, multi-warehouse stock transfer, staff payroll, and priority 24/7 support.',
        isRecommended: false,
        order: 4,
        // All 28 features enabled for Enterprise plan
        enabledCodes: DEFAULT_FEATURES.map(f => f.code)
      }
    ];

    let proPlan: any = null;
    for (const pDef of PLANS_DEF) {
      const plan = await prisma.plan.upsert({
        where: { code: pDef.code },
        update: {
          subscriptionModelId: model.id,
          name: pDef.name,
          badge: pDef.badge,
          priceMonthly: pDef.priceMonthly,
          priceYearly: pDef.priceYearly,
          currency: pDef.currency,
          description: pDef.description,
          isRecommended: pDef.isRecommended,
          order: pDef.order,
          isActive: true
        },
        create: {
          subscriptionModelId: model.id,
          name: pDef.name,
          code: pDef.code,
          badge: pDef.badge,
          priceMonthly: pDef.priceMonthly,
          priceYearly: pDef.priceYearly,
          currency: pDef.currency,
          description: pDef.description,
          isRecommended: pDef.isRecommended,
          order: pDef.order,
          isActive: true
        }
      });

      if (pDef.code === 'pro') proPlan = plan;

      // Seed exact 28 PlanFeatureEntitlement toggle rows per plan
      for (const fDef of DEFAULT_FEATURES) {
        const featureId = featureIdMap.get(fDef.code);
        if (!featureId) continue;
        const isEnabled = pDef.enabledCodes.includes(fDef.code);

        await prisma.planFeatureEntitlement.upsert({
          where: { planId_featureId: { planId: plan.id, featureId } },
          update: { isEnabled },
          create: { planId: plan.id, featureId, isEnabled }
        });
      }
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

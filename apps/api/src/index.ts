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

// Use error handler middleware
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  WebhookService.startDeliveryWorker();
  console.log(`Server is running on port ${PORT}`);
});

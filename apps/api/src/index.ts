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
const origins = allowedOrigins();
const developmentOrigins = ['http://localhost:5173', 'http://localhost:3000'];
const corsOrigins = origins.length ? origins : developmentOrigins;
// In production, an omitted allow-list must not turn into a wildcard. Starting
// with browser CORS disabled keeps health checks/server-to-server traffic alive.
const corsOriginOption = origins.length ? origins : isProduction ? false : corsOrigins;

const app = express();
const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: corsOriginOption,
    credentials: true,
  }
});

io.on('connection', (socket) => {
  console.log('Client connected to Socket.IO', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: corsOriginOption, credentials: true }));
app.use(helmet());
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

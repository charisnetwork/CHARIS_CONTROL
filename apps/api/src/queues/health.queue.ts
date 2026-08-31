import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';

const prisma = new PrismaClient();
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const healthQueue = new Queue('healthPing', { connection });

// Schedule a repeatable job to run every 1 minute
healthQueue.add('pingAllApps', {}, {
  repeat: {
    pattern: '* * * * *',
  }
});

const worker = new Worker('healthPing', async (job: Job) => {
  if (job.name === 'pingAllApps') {
    const products = await prisma.product.findMany({ where: { isActive: true } });
    
    for (const product of products) {
      const startTime = Date.now();
      let status = 0;
      try {
        const res = await axios.get(`${product.apiUrl}/health`, { timeout: 5000 });
        status = res.status;
      } catch (error: any) {
        status = error.response?.status || 500;
        
        // Emit critical alert if the API is completely down
        io.emit('system_alert', {
          type: 'error',
          title: 'Product Offline',
          message: `${product.name} is not responding (Status: ${status})`
        });
      }
      
      const responseTime = Date.now() - startTime;
      
      // Store log in DB
      await prisma.apiLog.create({
        data: {
          productName: product.name,
          endpoint: '/health',
          method: 'GET',
          statusCode: status,
          responseTime
        }
      });
      
      // Emit live update to dashboard
      io.emit('health_update', {
        product: product.name,
        status,
        responseTime
      });
    }
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error ${err.message}`);
});

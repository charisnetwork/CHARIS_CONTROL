import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';

const prisma = new PrismaClient();

let connectionConfig: ConnectionOptions = {
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null
};

if (process.env.REDIS_URL) {
  const url = new URL(process.env.REDIS_URL);
  connectionConfig = {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
    username: url.username || undefined,
    maxRetriesPerRequest: null
  };
}

export const healthQueue = new Queue('healthPing', { connection: connectionConfig });

// Schedule a repeatable job to run every 1 minute
healthQueue.add('pingAllApps', {}, {
  repeat: {
    pattern: '* * * * *',
  }
});

const worker = new Worker('healthPing', async (job: Job) => {
  if (job.name === 'pingAllApps') {
    const applications = await prisma.application.findMany({ where: { status: 'ACTIVE' } });
    
    for (const app of applications) {
      const startTime = Date.now();
      let status = 0;
      
      const targetUrl = app.healthApi || `${app.apiBaseUrl}/health`;

      try {
        const res = await axios.get(targetUrl, { timeout: 5000 });
        status = res.status;
      } catch (error: any) {
        status = error.response?.status || 500;
        
        // Emit critical alert if the API is completely down
        io.emit('system_alert', {
          type: 'error',
          title: 'Application Offline',
          message: `${app.displayName} is not responding (Status: ${status})`
        });
      }
      
      const responseTime = Date.now() - startTime;
      
      // Store log in DB
      await prisma.apiLog.create({
        data: {
          applicationName: app.applicationName,
          endpoint: targetUrl,
          method: 'GET',
          statusCode: status,
          responseTime
        }
      });
      
      // Emit live update to dashboard
      io.emit('health_update', {
        product: app.applicationName,
        status,
        responseTime
      });
    }
  }
}, { connection: connectionConfig });

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error ${err.message}`);
});

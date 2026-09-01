import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';

const prisma = new PrismaClient();

export let healthQueue: Queue | null = null;

if (process.env.REDIS_URL) {
  const url = new URL(process.env.REDIS_URL);
  const connectionConfig: ConnectionOptions = {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
    username: url.username || undefined,
    maxRetriesPerRequest: null
  };

  healthQueue = new Queue('healthPing', { connection: connectionConfig });

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
          io.emit('system_alert', {
            type: 'error',
            title: 'Application Offline',
            message: `${app.displayName} is not responding (Status: ${status})`
          });
        }
        
        const responseTime = Date.now() - startTime;
        
        await prisma.apiLog.create({
          data: {
            applicationName: app.applicationName,
            endpoint: targetUrl,
            method: 'GET',
            statusCode: status,
            responseTime
          }
        });
        
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
} else {
  console.warn("REDIS_URL not provided. Health ping worker is disabled.");
}

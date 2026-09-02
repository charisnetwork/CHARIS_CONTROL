import { PrismaClient } from '@prisma/client';

// One client per process prevents connection-pool exhaustion under hot reload/workers.
export const prisma = new PrismaClient();

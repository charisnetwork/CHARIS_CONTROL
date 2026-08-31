import { Request, Response } from 'express';

export const getStats = async (req: Request, res: Response) => {
  // Mock data for the dashboard until real integrations are built
  const stats = {
    mrr: 125000,
    arr: 1500000,
    totalUsers: 1420,
    activeServers: 4,
    health: {
      cpu: 45,
      ram: 60,
      database: 'Healthy',
      redis: 'Healthy',
    },
    revenueData: [
      { month: 'Jan', revenue: 95000 },
      { month: 'Feb', revenue: 105000 },
      { month: 'Mar', revenue: 110000 },
      { month: 'Apr', revenue: 115000 },
      { month: 'May', revenue: 120000 },
      { month: 'Jun', revenue: 125000 },
    ]
  };

  res.json({ stats });
};

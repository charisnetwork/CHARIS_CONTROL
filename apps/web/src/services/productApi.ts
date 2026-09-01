
import type { Product } from '../store/productStore';

/**
 * Enterprise Plug & Play: Dynamic Product API Client
 * 
 * In a real production environment, this service would use `axios` to 
 * communicate directly with the external product APIs (e.g. `billeasy.com/api/admin`).
 * 
 * For now, this returns mocked data structured precisely how the API would return it.
 */

export const fetchProductDashboardSummary = async (product: Product | null, isAll: boolean) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));

  if (isAll) {
    return {
      totalCustomers: 12450,
      activeUsersToday: 8302,
      totalRevenue: 2540000,
      monthlyRevenue: 320500,
      activeSubscriptions: 8900,
      expiredSubscriptions: 3550,
      newRegistrations: 145,
      couponUsage: 1204,
      apiHealth: 'HEALTHY'
    };
  }

  if (!product) throw new Error('No product selected');

  // Simulated data based on product name for realism
  const isBillEasy = product.productName.toLowerCase().includes('bill');
  
  return {
    totalCustomers: isBillEasy ? 8500 : 3950,
    activeUsersToday: isBillEasy ? 6200 : 2102,
    totalRevenue: isBillEasy ? 1850000 : 690000,
    monthlyRevenue: isBillEasy ? 210000 : 110500,
    activeSubscriptions: isBillEasy ? 6100 : 2800,
    expiredSubscriptions: isBillEasy ? 2400 : 1150,
    newRegistrations: isBillEasy ? 95 : 50,
    couponUsage: isBillEasy ? 804 : 400,
    apiHealth: 'HEALTHY'
  };
};

export const fetchProductCustomers = async (product: Product | null, isAll: boolean) => {
  await new Promise(resolve => setTimeout(resolve, 800));

  if (isAll) {
    // In reality, this would query a global aggregator or make concurrent calls
    return generateMockCustomers('Platform Wide', 50);
  }

  if (!product) throw new Error('No product selected');

  return generateMockCustomers(product.displayName, 25);
};

// Helper to generate realistic mock customers
const generateMockCustomers = (sourceName: string, count: number) => {
  const customers = [];
  const plans = ['Free', 'Basic', 'Premium', 'Enterprise'];
  const statuses = ['Active', 'Suspended', 'Expired'];

  for (let i = 0; i < count; i++) {
    customers.push({
      id: `CUST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      company: `Enterprise ${Math.floor(Math.random() * 1000)} LLC`,
      owner: `User ${i + 1}`,
      email: `user${i+1}@example.com`,
      phone: `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
      plan: plans[Math.floor(Math.random() * plans.length)],
      subscriptionStatus: statuses[Math.floor(Math.random() * statuses.length)],
      registeredDate: new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toISOString(),
      lastLogin: new Date(Date.now() - Math.floor(Math.random() * 100000000)).toISOString(),
      sourceProduct: sourceName
    });
  }

  return customers;
};

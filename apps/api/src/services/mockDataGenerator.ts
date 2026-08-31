import { v4 as uuidv4 } from 'uuid';

// Types mimicking Prisma models
export interface MockCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  registeredDate: string;
  lastLogin: string;
  status: 'ACTIVE' | 'INACTIVE';
  company: string;
}

export interface MockSubscription {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  planId: string;
  planName: string;
  price: number;
  billingCycle: 'MONTHLY' | 'YEARLY';
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED';
  startDate: string;
  nextRenewalDate: string;
  paymentStatus: 'PAID' | 'FAILED' | 'PENDING';
}

export interface MockPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  maxUsers: number;
  maxStorageGb: number;
  isActive: boolean;
}

export interface MockCoupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  usageLimit: number;
  usesCount: number;
  isActive: boolean;
  expiryDate: string;
}

export interface MockOffer {
  id: string;
  title: string;
  description: string;
  discountDesc: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

// In-memory mock databases grouped by productId
const databases: Record<string, any> = {};

const generateInitialData = (productId: string) => {
  if (databases[productId]) return databases[productId];

  const plans: MockPlan[] = productId.includes('civil') ? [
    { id: uuidv4(), name: 'FREE', description: 'Basic civil operations', monthlyPrice: 0, yearlyPrice: 0, features: ['1 Project', 'Basic Reporting'], maxUsers: 1, maxStorageGb: 1, isActive: true },
    { id: uuidv4(), name: 'PRO', description: 'Advanced civil operations', monthlyPrice: 999, yearlyPrice: 9990, features: ['Unlimited Projects', 'Advanced Reporting', 'API Access'], maxUsers: 10, maxStorageGb: 100, isActive: true },
    { id: uuidv4(), name: 'ENTERPRISE', description: 'Full civil operations', monthlyPrice: 2999, yearlyPrice: 29990, features: ['Unlimited Everything', 'Dedicated Support'], maxUsers: 100, maxStorageGb: 1000, isActive: true },
  ] : [
    { id: uuidv4(), name: 'FREE', description: 'Basic billing', monthlyPrice: 0, yearlyPrice: 0, features: ['1 User', 'Basic Invoicing'], maxUsers: 1, maxStorageGb: 1, isActive: true },
    { id: uuidv4(), name: 'STARTER', description: 'Small business billing', monthlyPrice: 199, yearlyPrice: 1990, features: ['3 Users', 'Advanced Invoicing'], maxUsers: 3, maxStorageGb: 5, isActive: true },
    { id: uuidv4(), name: 'PRO', description: 'Professional billing', monthlyPrice: 599, yearlyPrice: 5990, features: ['10 Users', 'API Access', 'Custom Domain'], maxUsers: 10, maxStorageGb: 50, isActive: true },
    { id: uuidv4(), name: 'BUSINESS', description: 'Corporate billing', monthlyPrice: 999, yearlyPrice: 9990, features: ['50 Users', 'Dedicated Account Manager'], maxUsers: 50, maxStorageGb: 500, isActive: true },
  ];

  const customers: MockCustomer[] = Array.from({ length: 50 }).map((_, i) => ({
    id: `cust_${uuidv4()}`,
    name: `User ${i + 1}`,
    email: `user${i + 1}@example.com`,
    phone: `+1555000${i.toString().padStart(4, '0')}`,
    registeredDate: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
    lastLogin: new Date(Date.now() - Math.random() * 100000000).toISOString(),
    status: Math.random() > 0.1 ? 'ACTIVE' : 'INACTIVE',
    company: `Company ${i + 1} Ltd`,
  }));

  const subscriptions: MockSubscription[] = customers.map(cust => {
    const plan = plans[Math.floor(Math.random() * plans.length)];
    const statuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELLED'];
    const status = statuses[Math.floor(Math.random() * statuses.length)] as any;
    const isYearly = Math.random() > 0.5;
    return {
      id: `sub_${uuidv4()}`,
      customerId: cust.id,
      customerName: cust.name,
      customerEmail: cust.email,
      planId: plan.id,
      planName: plan.name,
      price: isYearly ? plan.yearlyPrice : plan.monthlyPrice,
      billingCycle: isYearly ? 'YEARLY' : 'MONTHLY',
      status: status,
      startDate: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
      nextRenewalDate: new Date(Date.now() + Math.random() * 10000000000).toISOString(),
      paymentStatus: status === 'PAST_DUE' ? 'FAILED' : 'PAID',
    };
  });

  const coupons: MockCoupon[] = [
    { id: uuidv4(), code: 'WELCOME50', discountType: 'percentage', discountValue: 50, usageLimit: 100, usesCount: 23, isActive: true, expiryDate: new Date(Date.now() + 8640000000).toISOString() },
    { id: uuidv4(), code: 'FLAT200', discountType: 'flat', discountValue: 200, usageLimit: 50, usesCount: 50, isActive: false, expiryDate: new Date(Date.now() - 8640000000).toISOString() },
  ];

  const offers: MockOffer[] = [
    { id: uuidv4(), title: 'Festival Offer', description: 'Special festive pricing', discountDesc: '30% OFF on Annual', startDate: new Date(Date.now() - 864000000).toISOString(), endDate: new Date(Date.now() + 8640000000).toISOString(), isActive: true },
  ];

  databases[productId] = { plans, customers, subscriptions, coupons, offers };
  return databases[productId];
};

export const getMockData = (productId: string | 'all') => {
  if (productId === 'all') {
    // Return aggregated stats or a specific all dataset
    return {
      stats: {
        totalCustomers: 500,
        activeSubscriptions: 420,
        mrr: 15400,
        arr: 184800,
        churnRate: 2.4,
      }
    };
  }
  return generateInitialData(productId);
};

export const updateMockData = (productId: string, entity: string, data: any) => {
  if (productId === 'all') return;
  const db = generateInitialData(productId);
  if (db[entity]) {
    const idx = db[entity].findIndex((e: any) => e.id === data.id);
    if (idx !== -1) {
      db[entity][idx] = { ...db[entity][idx], ...data };
    } else {
      db[entity].push(data);
    }
  }
  return data;
};

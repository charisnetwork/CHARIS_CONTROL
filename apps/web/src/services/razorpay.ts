import { controlApi } from './controlApi';

export interface RazorpayOrder {
  id: string;
  subscription_id: string;
  order_id: string | null;
  payment_id: string | null;
  amount_minor: number;
  currency: string;
  status: 'creating' | 'ready' | 'paid' | 'review' | 'refunded';
  key_id: string;
  mode: 'test' | 'live';
  created_at: string;
}

export interface RazorpayResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface CheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (result: RazorpayResult) => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => { open: () => void };
  }
}

let loading: Promise<void> | undefined;
export function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loading = undefined; script.remove(); reject(new Error('Checkout could not load')); };
    document.head.appendChild(script);
  });
  return loading;
}

export async function listRazorpay(applicationId: string): Promise<{ enabled: boolean; mode: 'test' | 'live'; checkouts: RazorpayOrder[] }> {
  const { data } = await controlApi.get(`/apps/${applicationId}/payments/razorpay`);
  return data;
}

export async function createRazorpayOrder(applicationId: string, payload: {
  subscriber_id: string; plan_id: string; idempotency_key: string; reason: string;
  previous_subscription_id?: string; previous_version?: number;
}): Promise<RazorpayOrder> {
  const { data } = await controlApi.post(`/apps/${applicationId}/payments/razorpay/orders`, payload);
  return data;
}

export async function verifyRazorpay(applicationId: string, payload: RazorpayResult): Promise<RazorpayOrder> {
  const { data } = await controlApi.post(`/apps/${applicationId}/payments/razorpay/verify`, payload);
  return data;
}

export async function reconcileRazorpay(applicationId: string, checkoutId: string, paymentId: string): Promise<RazorpayOrder> {
  const { data } = await controlApi.post(`/apps/${applicationId}/payments/razorpay/checkouts/${checkoutId}/reconcile`, { payment_id: paymentId });
  return data;
}

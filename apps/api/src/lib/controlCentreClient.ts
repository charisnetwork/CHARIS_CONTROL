import axios, { AxiosInstance } from 'axios';
import { prisma } from './prisma';

let clientCache: AxiosInstance | null = null;

export function getControlCentreClient(): AxiosInstance {
  if (clientCache) return clientCache;

  const baseUrl = process.env.CONTROL_CENTRE_URL?.replace(/\/+$/, '');
  const apiKey = process.env.CONTROL_CENTRE_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error('CONTROL_CENTRE_URL and CONTROL_CENTRE_API_KEY must be configured');
  }

  clientCache = axios.create({
    baseURL: `${baseUrl}/api/v1`,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Correlation-ID': crypto.randomUUID(),
    },
  });

  clientCache.interceptors.response.use(
    (response) => response,
    (error) => {
      const correlationId = error.config?.headers?.['X-Correlation-ID'];
      console.error('[ControlCentreClient] Request failed', {
        correlationId,
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
      });
      return Promise.reject(error);
    }
  );

  return clientCache;
}

export interface ControlCentreApplication {
  id: string;
  name: string;
  slug: string;
  control_api_base_url: string;
  health_path: string;
  environment: string;
  status: string;
  version: number;
}

export interface ControlCentrePlan {
  id: string;
  name: string;
  code: string;
  price: number;
  currency: string;
  duration_value: number;
  duration_unit: string;
  coupons_allowed: boolean;
  user_limit: number | null;
  user_limit_unlimited: boolean;
  status: string;
  entitlements: ControlCentreEntitlement[];
}

export interface ControlCentreEntitlement {
  id: string;
  feature_id: string;
  feature_code: string;
  enabled: boolean;
  limit_type: 'limited' | 'unlimited';
  limit_value: number | null;
  unit: string | null;
  reset_period: string | null;
}

export interface ControlCentreCoupon {
  id: string;
  name: string;
  code: string;
  kind: 'promotion' | 'affiliate';
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  commission_type: 'percentage' | 'fixed' | null;
  commission_value: number | null;
  commission_currency: string | null;
  currency: string | null;
  starts_at: string;
  ends_at: string;
  maximum_redemptions: number;
  per_subscriber_limit: number | null;
  first_subscription_only: boolean;
  minimum_duration_value: number | null;
  minimum_duration_unit: string | null;
  status: string;
  plan_ids: string[];
}

export interface ControlCentreSubscriber {
  id: string;
  external_id: string;
  name: string;
  email: string | null;
  mobile_number: string | null;
  status: string;
  metadata: Record<string, unknown>;
}

export interface ControlCentreSubscription {
  id: string;
  subscriber_id: string;
  plan_id: string;
  external_id: string | null;
  status: string;
  starts_at: string;
  ends_at: string | null;
  auto_renews: boolean;
  commercial_snapshot: Record<string, unknown>;
  entitlement_snapshot: Record<string, unknown>;
}

export async function fetchApplicationFromControlCentre(appId: string): Promise<ControlCentreApplication | null> {
  try {
    const client = getControlCentreClient();
    const response = await client.get(`/apps/${appId}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchPlansFromControlCentre(appId: string): Promise<ControlCentrePlan[]> {
  const client = getControlCentreClient();
  const response = await client.get(`/apps/${appId}/plans`);
  return response.data;
}

export async function fetchCouponsFromControlCentre(appId: string): Promise<ControlCentreCoupon[]> {
  const client = getControlCentreClient();
  const response = await client.get(`/apps/${appId}/coupons`);
  return response.data;
}

export async function fetchSubscriberFromControlCentre(appId: string, subscriberId: string): Promise<ControlCentreSubscriber | null> {
  try {
    const client = getControlCentreClient();
    const response = await client.get(`/apps/${appId}/subscribers/${subscriberId}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchSubscriptionFromControlCentre(appId: string, subscriptionId: string): Promise<ControlCentreSubscription | null> {
  try {
    const client = getControlCentreClient();
    const response = await client.get(`/apps/${appId}/subscriptions/${subscriptionId}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function reportHealthToControlCentre(
  appId: string,
  health: {
    overall_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    frontend_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    backend_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    database_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    latency_ms: number | null;
    dependencies: Record<string, unknown>;
    incident_summary: string | null;
  }
): Promise<void> {
  const client = getControlCentreClient();
  await client.post(`/apps/${appId}/health`, health);
}

export async function reportUsageToControlCentre(
  appId: string,
  usage: {
    subscription_id: string;
    feature_code: string;
    delta: number;
    idempotency_key: string;
    occurred_at: string;
  }
): Promise<void> {
  const client = getControlCentreClient();
  await client.post(`/apps/${appId}/usage`, usage);
}

export async function reportSubscriptionEventToControlCentre(
  appId: string,
  event: {
    subscription_id: string;
    event_type: string;
    effective_at: string;
    details: Record<string, unknown>;
  }
): Promise<void> {
  const client = getControlCentreClient();
  await client.post(`/apps/${appId}/subscription-events`, event);
}
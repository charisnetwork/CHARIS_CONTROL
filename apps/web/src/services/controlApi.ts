import axios from 'axios';
import { useAuthStore, type ControlUser } from '../store/authStore';
import type { Product } from '../store/productStore';

export type ApplicationEnvironment = 'development' | 'staging' | 'production';

const configuredBaseUrl = import.meta.env.VITE_CONTROL_API_URL?.trim().replace(/\/+$/, '');

if (!configuredBaseUrl) {
  console.warn('VITE_CONTROL_API_URL is not configured; using same-origin /api/v1');
}

export const controlApi = axios.create({
  baseURL: `${configuredBaseUrl ?? ''}/api/v1`,
  withCredentials: true,
  timeout: 15_000,
});

controlApi.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface SessionResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  expires_at: string;
  csrf_token: string;
  user: ControlUser;
}

interface ApplicationResponse {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  frontend_url: string | null;
  control_api_base_url: string;
  health_path: string;
  environment: ApplicationEnvironment;
  status: 'active' | 'disabled' | 'archived';
  version: number;
}

export interface CreateApplicationPayload {
  name: string;
  slug: string;
  frontend_url?: string;
  control_api_base_url: string;
  health_path: string;
  environment: ApplicationEnvironment;
}

export interface IssuedCredential {
  credential_type: string;
  key_prefix: string;
  credential_version: number;
  secret: string;
  valid_from: string;
  notice: string;
}

export interface ApplicationOverviewData {
  counts: {
    subscribers: number;
    subscriptions: number;
    active_subscriptions: number;
    plans: number;
    active_coupons: number;
  };
  latest_health: {
    status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    frontend_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    backend_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    database_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    latency_ms: number | null;
    checked_at: string;
  } | null;
  data_sources: Record<string, boolean>;
}

const mapApplication = (application: ApplicationResponse): Product => ({
  id: application.id,
  productName: application.slug,
  displayName: application.name,
  logo: application.logo_url ?? undefined,
  frontendUrl: application.frontend_url ?? undefined,
  apiBaseUrl: application.control_api_base_url,
  healthPath: application.health_path,
  environment: application.environment,
  status: application.status,
  version: application.version,
});

export async function restoreSession(): Promise<boolean> {
  const csrfToken = useAuthStore.getState().csrfToken;
  if (!csrfToken) {
    useAuthStore.getState().markInitialized();
    return false;
  }
  try {
    const { data } = await controlApi.post<SessionResponse>('/auth/refresh', undefined, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    useAuthStore.getState().setAuth(data.access_token, data.csrf_token, data.user);
    return true;
  } catch {
    useAuthStore.getState().logout();
    return false;
  }
}

export async function listApplications(): Promise<Product[]> {
  const { data } = await controlApi.get<ApplicationResponse[]>('/apps');
  return data.map(mapApplication);
}

export async function createApplication(payload: CreateApplicationPayload) {
  const { data } = await controlApi.post<{
    application: ApplicationResponse;
    credential: IssuedCredential;
  }>('/apps', payload);
  return { application: mapApplication(data.application), credential: data.credential };
}

export async function getApplicationOverview(applicationId: string) {
  const { data } = await controlApi.get<ApplicationOverviewData>(
    `/apps/${applicationId}/overview`,
  );
  return data;
}

export type ResetPeriod = 'total' | 'daily' | 'monthly' | 'yearly' | 'billing_cycle';

export interface AppFeature {
  id: string;
  application_id: string;
  code: string;
  name: string;
  description: string | null;
  default_unit: string | null;
  allowed_reset_periods: ResetPeriod[];
  supports_numeric_limit: boolean;
  active: boolean;
  version: number;
}

export interface PlanEntitlement {
  id: string;
  feature_id: string;
  enabled: boolean;
  limit_type: 'limited' | 'unlimited' | null;
  limit_value: number | null;
  unit: string | null;
  reset_period: ResetPeriod | null;
}

export interface SubscriptionPlan {
  id: string;
  application_id: string;
  name: string;
  code: string;
  description: string | null;
  price: string;
  currency: string;
  duration_value: number;
  duration_unit: 'day' | 'month' | 'year';
  coupons_allowed: boolean;
  user_limit: number | null;
  user_limit_unlimited: boolean;
  status: 'draft' | 'active' | 'archived';
  effective_at: string | null;
  version: number;
  entitlements: PlanEntitlement[];
}

export interface EntitlementPayload {
  feature_id: string;
  enabled: boolean;
  limit_type?: 'limited' | 'unlimited';
  limit_value?: number;
  unit?: string;
  reset_period?: ResetPeriod;
}

export interface CreatePlanPayload {
  name: string;
  code: string;
  description?: string;
  price: string;
  currency: string;
  duration_value: number;
  duration_unit: 'day' | 'month' | 'year';
  coupons_allowed: boolean;
  user_limit?: number;
  user_limit_unlimited: boolean;
  status: 'draft' | 'active';
  effective_at?: string;
  entitlements: EntitlementPayload[];
}

export async function listFeatures(applicationId: string): Promise<AppFeature[]> {
  const { data } = await controlApi.get<AppFeature[]>(`/apps/${applicationId}/features`);
  return data;
}

export async function createFeature(
  applicationId: string,
  payload: {
    code: string;
    name: string;
    description?: string;
    default_unit?: string;
    allowed_reset_periods: ResetPeriod[];
    supports_numeric_limit: boolean;
  },
): Promise<AppFeature> {
  const { data } = await controlApi.post<AppFeature>(`/apps/${applicationId}/features`, payload);
  return data;
}

export async function listPlans(applicationId: string): Promise<SubscriptionPlan[]> {
  const { data } = await controlApi.get<SubscriptionPlan[]>(`/apps/${applicationId}/plans`);
  return data;
}

export async function createPlan(
  applicationId: string,
  payload: CreatePlanPayload,
): Promise<SubscriptionPlan> {
  const { data } = await controlApi.post<SubscriptionPlan>(
    `/apps/${applicationId}/plans`,
    payload,
  );
  return data;
}

export interface Subscriber {
  id: string;
  application_id: string;
  external_id: string;
  name: string;
  email: string | null;
  mobile_number: string | null;
  status: 'active' | 'suspended' | 'archived';
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
}

export interface Subscription {
  id: string;
  application_id: string;
  subscriber_id: string;
  plan_id: string;
  external_id: string | null;
  status: 'pending' | 'active' | 'suspended' | 'cancelled' | 'expired';
  starts_at: string;
  ends_at: string | null;
  auto_renews: boolean;
  commercial_snapshot: {
    plan_name?: string;
    plan_code?: string;
    price?: string;
    currency?: string;
    gross_price?: string;
    coupon_code?: string;
    discount_amount?: string;
    final_price?: string;
  };
  entitlement_snapshot: Array<{
    feature_code: string;
    enabled: boolean;
    limit_type: 'limited' | 'unlimited' | null;
    limit_value: number | null;
    unit: string | null;
    reset_period: ResetPeriod | null;
  }>;
  version: number;
}

export async function listSubscribers(applicationId: string): Promise<Subscriber[]> {
  const { data } = await controlApi.get<Subscriber[]>(`/apps/${applicationId}/subscribers`);
  return data;
}

export async function createSubscriber(
  applicationId: string,
  payload: {
    external_id: string;
    name: string;
    email?: string;
    mobile_number?: string;
  },
): Promise<Subscriber> {
  const { data } = await controlApi.post<Subscriber>(
    `/apps/${applicationId}/subscribers`,
    { ...payload, metadata: {} },
  );
  return data;
}

export async function listSubscriptions(applicationId: string): Promise<Subscription[]> {
  const { data } = await controlApi.get<Subscription[]>(`/apps/${applicationId}/subscriptions`);
  return data;
}

export async function createSubscription(
  applicationId: string,
  payload: {
    subscriber_id: string;
    plan_id: string;
    external_id?: string;
    starts_at: string;
    auto_renews: boolean;
    coupon_code?: string;
    coupon_idempotency_key?: string;
  },
): Promise<Subscription> {
  const { data } = await controlApi.post<Subscription>(
    `/apps/${applicationId}/subscriptions`,
    payload,
  );
  return data;
}

export interface Coupon {
  id: string;
  application_id: string;
  name: string;
  code: string;
  kind: 'promotion' | 'affiliate';
  affiliate_id: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: string;
  commission_type: 'percentage' | 'fixed' | null;
  commission_value: string | null;
  commission_currency: string | null;
  currency: string | null;
  starts_at: string;
  ends_at: string;
  maximum_redemptions: number;
  per_subscriber_limit: number | null;
  first_subscription_only: boolean;
  minimum_duration_value: number | null;
  minimum_duration_unit: 'day' | 'month' | 'year' | null;
  redemption_count: number;
  status: 'active' | 'scheduled' | 'expired' | 'disabled';
  plan_ids: string[];
}

export interface CreateCouponPayload {
  name: string;
  code: string;
  kind: 'promotion' | 'affiliate';
  affiliate_id?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: string;
  currency?: string;
  commission_type?: 'percentage' | 'fixed';
  commission_value?: string;
  commission_currency?: string;
  starts_at: string;
  ends_at: string;
  maximum_redemptions: number;
  per_subscriber_limit?: number;
  first_subscription_only: boolean;
  minimum_duration_value?: number;
  minimum_duration_unit?: 'day' | 'month' | 'year';
  status: 'active' | 'scheduled';
  plan_ids: string[];
}

export async function listCoupons(applicationId: string): Promise<Coupon[]> {
  const { data } = await controlApi.get<Coupon[]>(`/apps/${applicationId}/coupons`);
  return data;
}

export async function createCoupon(
  applicationId: string,
  payload: CreateCouponPayload,
): Promise<Coupon> {
  const { data } = await controlApi.post<Coupon>(`/apps/${applicationId}/coupons`, payload);
  return data;
}

export interface Affiliate {
  id: string;
  application_id: string;
  company_name: string | null;
  contact_name: string;
  mobile_number: string | null;
  email: string;
  tax_registration_number: string | null;
  address: Record<string, unknown>;
  notes: string | null;
  status: 'active' | 'disabled' | 'archived';
  archived_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CommissionEntry {
  id: string;
  affiliate_id: string;
  entry_type: 'earned' | 'paid' | 'adjustment';
  amount: string;
  currency: string;
  reference: string;
  notes: string | null;
  occurred_at: string;
}

export interface CommissionSummary {
  currency: string;
  earned: string;
  paid: string;
  adjustments: string;
  balance: string;
}

export async function listAffiliates(applicationId: string): Promise<Affiliate[]> {
  const { data } = await controlApi.get<Affiliate[]>(`/apps/${applicationId}/affiliates`);
  return data;
}

export async function createAffiliate(
  applicationId: string,
  payload: { contact_name: string; email: string; company_name?: string; mobile_number?: string },
): Promise<Affiliate> {
  const { data } = await controlApi.post<Affiliate>(`/apps/${applicationId}/affiliates`, {
    ...payload,
    address: {},
  });
  return data;
}

export async function updateAffiliateStatus(
  applicationId: string,
  affiliateId: string,
  status: Affiliate['status'],
): Promise<Affiliate> {
  const { data } = await controlApi.patch<Affiliate>(
    `/apps/${applicationId}/affiliates/${affiliateId}/status`,
    { status },
  );
  return data;
}

export async function listCommissionSummary(
  applicationId: string,
  affiliateId: string,
): Promise<CommissionSummary[]> {
  const { data } = await controlApi.get<CommissionSummary[]>(
    `/apps/${applicationId}/affiliates/${affiliateId}/commission-summary`,
  );
  return data;
}

export async function listCommissionEntries(
  applicationId: string,
  affiliateId: string,
): Promise<CommissionEntry[]> {
  const { data } = await controlApi.get<CommissionEntry[]>(
    `/apps/${applicationId}/affiliates/${affiliateId}/commissions`,
  );
  return data;
}

export async function recordCommissionPayout(
  applicationId: string,
  affiliateId: string,
  payload: { amount: string; currency: string; reference: string; notes?: string },
): Promise<CommissionEntry> {
  const { data } = await controlApi.post<CommissionEntry>(
    `/apps/${applicationId}/affiliates/${affiliateId}/commissions`,
    { ...payload, entry_type: 'paid', occurred_at: new Date().toISOString() },
  );
  return data;
}

export interface Notification {
  id: string;
  application_id: string;
  title: string;
  message: string;
  deep_link: string | null;
  action_metadata: Record<string, unknown>;
  audience_type: 'all_subscribers' | 'plans';
  status: 'draft' | 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled';
  scheduled_at: string | null;
  sent_at: string | null;
  plan_ids: string[];
  version: number;
  created_at: string;
}

export interface CreateNotificationPayload {
  title: string;
  message: string;
  deep_link?: string;
  action_metadata: Record<string, unknown>;
  audience_type: 'all_subscribers' | 'plans';
  plan_ids: string[];
  status: 'draft' | 'scheduled';
  scheduled_at?: string;
}

export async function listNotifications(applicationId: string): Promise<Notification[]> {
  const { data } = await controlApi.get<Notification[]>(
    `/apps/${applicationId}/notifications`,
  );
  return data;
}

export async function createNotification(
  applicationId: string,
  payload: CreateNotificationPayload,
): Promise<Notification> {
  const { data } = await controlApi.post<Notification>(
    `/apps/${applicationId}/notifications`,
    payload,
  );
  return data;
}

export async function dispatchNotification(applicationId: string, notificationId: string) {
  const { data } = await controlApi.post<{
    notification_id: string;
    status: Notification['status'];
    recipient_count: number;
    idempotent_replay: boolean;
  }>(`/apps/${applicationId}/notifications/${notificationId}/dispatch`);
  return data;
}

export async function cancelNotification(
  applicationId: string,
  notificationId: string,
): Promise<Notification> {
  const { data } = await controlApi.post<Notification>(
    `/apps/${applicationId}/notifications/${notificationId}/cancel`,
  );
  return data;
}

export interface ReportSummary {
  starts_at: string;
  ends_at: string;
  new_subscribers: number;
  new_subscriptions: number;
  active_subscriptions: number;
  coupon_redemptions: number;
  usage_events: number;
  discount_total_by_currency: Array<{ currency: string; amount: string; count: number }>;
  collected_revenue_by_currency: Array<{ currency: string; amount: string; count: number }>;
  earned_commission_by_currency: Array<{ currency: string; amount: string; count: number }>;
  plan_distribution: Array<{ plan_id: string; plan_name: string; active_subscriptions: number }>;
  subscription_trend: Array<{ date: string; subscriptions: number }>;
}

export type ExportReportType =
  | 'subscriptions'
  | 'payments'
  | 'coupon_redemptions'
  | 'affiliate_commissions'
  | 'usage_events';

export async function getReportSummary(
  applicationId: string,
  startsAt: string,
  endsAt: string,
): Promise<ReportSummary> {
  const { data } = await controlApi.get<ReportSummary>(`/apps/${applicationId}/reports/summary`, {
    params: { starts_at: startsAt, ends_at: endsAt },
  });
  return data;
}

export async function exportReport(
  applicationId: string,
  reportType: ExportReportType,
  startsAt: string,
  endsAt: string,
): Promise<{ blob: Blob; filename: string; truncated: boolean }> {
  const response = await controlApi.post(
    `/apps/${applicationId}/reports/exports`,
    { report_type: reportType, starts_at: startsAt, ends_at: endsAt },
    { responseType: 'blob' },
  );
  const disposition = String(response.headers['content-disposition'] ?? '');
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${reportType}.csv`;
  return {
    blob: response.data as Blob,
    filename,
    truncated: response.headers['x-report-truncated'] === 'true',
  };
}

export interface CredentialMetadata {
  id: string;
  credential_type: string;
  key_prefix: string;
  credential_version: number;
  status: 'active' | 'grace' | 'revoked';
  valid_from: string;
  grace_ends_at: string | null;
  revoked_at: string | null;
}

export interface HealthReport {
  id: string;
  overall_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  frontend_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  backend_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  database_status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  latency_ms: number | null;
  incident_summary: string | null;
  checked_at: string;
}

export interface PlanUiSettings {
  application_id: string;
  recommended_plan_id: string | null;
  show_feature_comparison: boolean;
  show_billing_period_selector: boolean;
  display_labels: Record<string, string>;
  items: Array<{ plan_id: string; visible: boolean; display_order: number; display_label: string | null }>;
  version: number;
}

export async function updateApplicationSettings(applicationId: string, payload: {
  name: string; frontend_url?: string; control_api_base_url: string;
  health_path: string; environment: ApplicationEnvironment;
}): Promise<Product> {
  const { data } = await controlApi.patch<ApplicationResponse>(
    `/apps/${applicationId}/settings/application`,
    { ...payload, logo_url: null, integration_config: {} },
  );
  return mapApplication(data);
}

export async function listCredentials(applicationId: string): Promise<CredentialMetadata[]> {
  const { data } = await controlApi.get<CredentialMetadata[]>(
    `/apps/${applicationId}/settings/credentials`,
  );
  return data;
}

export async function rotateCredential(applicationId: string, graceHours: number) {
  const { data } = await controlApi.post<IssuedCredential>(
    `/apps/${applicationId}/settings/credentials/rotate`,
    { grace_hours: graceHours },
  );
  return data;
}

export async function listHealthReports(applicationId: string): Promise<HealthReport[]> {
  const { data } = await controlApi.get<HealthReport[]>(
    `/apps/${applicationId}/settings/health`,
  );
  return data;
}

export async function getPlanUiSettings(applicationId: string): Promise<PlanUiSettings> {
  const { data } = await controlApi.get<PlanUiSettings>(
    `/apps/${applicationId}/settings/subscription-storefront`,
  );
  return data;
}

export async function updatePlanUiSettings(
  applicationId: string,
  payload: Omit<PlanUiSettings, 'application_id' | 'version'>,
): Promise<PlanUiSettings> {
  const { data } = await controlApi.put<PlanUiSettings>(
    `/apps/${applicationId}/settings/subscription-storefront`,
    payload,
  );
  return data;
}

import type { AppFeature, Coupon, EntitlementPayload, PlanAccent, PlanArtwork, ResetPeriod, SubscriptionPlan } from '../../../services/controlApi';

/** Gradient stops per accent. Apps ship the same presets, so OS never sends colours or images. */
export const ACCENTS: Record<Exclude<PlanAccent, 'auto'>, { from: string; to: string; glow: string; label: string }> = {
  blue: { from: '#60a5fa', to: '#2563eb', glow: 'rgba(59,130,246,0.35)', label: 'Blue' },
  violet: { from: '#c4b5fd', to: '#7c3aed', glow: 'rgba(139,92,246,0.4)', label: 'Violet' },
  emerald: { from: '#6ee7b7', to: '#059669', glow: 'rgba(16,185,129,0.35)', label: 'Green' },
  amber: { from: '#fcd34d', to: '#d97706', glow: 'rgba(245,158,11,0.38)', label: 'Gold' },
  rose: { from: '#fda4af', to: '#e11d48', glow: 'rgba(244,63,94,0.35)', label: 'Rose' },
  slate: { from: '#cbd5e1', to: '#475569', glow: 'rgba(148,163,184,0.3)', label: 'Silver' },
};

export const ARTWORK_OPTIONS: Array<{ value: PlanArtwork; label: string }> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'leaf', label: 'Leaf' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'gem', label: 'Gem' },
  { value: 'crown', label: 'Crown' },
  { value: 'shield', label: 'Shield' },
  { value: 'building', label: 'Building' },
  { value: 'sparkles', label: 'Sparkles' },
  { value: 'gift', label: 'Gift' },
  { value: 'none', label: 'No picture' },
];

export type CardOffer = { code: string; label: string; discount_type: 'percentage' | 'fixed'; discount_value: string };
export type CardFeature = { name: string; detail: string | null };
export type CardPlan = {
  name: string;
  tagline: string | null;
  badge: string | null;
  price: string;
  compare_at_price: string | null;
  currency: string;
  duration_value: number;
  duration_unit: 'day' | 'month' | 'year';
  highlights: string[];
  features: CardFeature[];
  coupons_allowed: boolean;
  offer: CardOffer | null;
};

export const periodLabel = (value: number, unit: 'day' | 'month' | 'year') =>
  value === 1 ? `/${unit}` : `/${value} ${unit}s`;

/** Display-only estimate; the app's checkout asks OS for the real quote. */
export function offerPrice(price: number, offer: CardOffer | null) {
  if (!offer) return null;
  const value = Number(offer.discount_value);
  const discounted = offer.discount_type === 'percentage' ? price * (1 - value / 100) : price - value;
  return Math.max(0, Math.round(discounted * 100) / 100);
}

type VisualPlan = { id?: string; price: string | number; duration_value: number; duration_unit: 'day' | 'month' | 'year'; artwork: PlanArtwork; accent: PlanAccent };

const perMonth = (plan: VisualPlan) => Number(plan.price) / ({ day: 1 / 30, month: 1, year: 12 }[plan.duration_unit] * plan.duration_value);

/**
 * Same rule as the OS catalog sent to apps (integration.resolved_visuals): free → leaf/green,
 * recommended → gem/violet, priciest paid plan → crown/gold, other paid plans → rocket/blue.
 */
export function resolveVisuals(plan: VisualPlan, others: VisualPlan[], recommended: boolean) {
  const paid = others.filter((item) => Number(item.price) > 0);
  const top = paid.length > 1 ? Math.max(...paid.map(perMonth)) : null;
  const auto: [Exclude<PlanArtwork, 'auto'>, Exclude<PlanAccent, 'auto'>] = Number(plan.price) === 0
    ? ['leaf', 'emerald']
    : recommended ? ['gem', 'violet']
      : top !== null && Math.abs(perMonth(plan) - top) < 0.005 ? ['crown', 'amber'] : ['rocket', 'blue'];
  return {
    artwork: plan.artwork === 'auto' ? auto[0] : plan.artwork,
    accent: ACCENTS[plan.accent === 'auto' ? auto[1] : plan.accent],
  };
}

export type Unit = 'day' | 'month' | 'year';
export const RESET_LABEL: Record<ResetPeriod, string> = { total: 'in total', daily: 'per day', monthly: 'per month', yearly: 'per year', billing_cycle: 'per billing cycle' };

export type Draft = {
  name: string; price: string; duration_value: number; duration_unit: Unit; compare_at_price: string;
  badge: string; tagline: string; description: string; highlights: string[]; coupons_allowed: boolean;
  offer_coupon_id: string | null; artwork: PlanArtwork; accent: PlanAccent; pricing_group: string; code: string;
  entitlements: Record<string, EntitlementPayload>;
};

export function draftFrom(plan: SubscriptionPlan | null, copy = false): Draft {
  if (!plan) return { name: '', price: '', duration_value: 1, duration_unit: 'month', compare_at_price: '', badge: '', tagline: '', description: '', highlights: [''], coupons_allowed: true, offer_coupon_id: null, artwork: 'auto', accent: 'auto', pricing_group: '', code: '', entitlements: {} };
  return {
    name: copy ? `${plan.name} copy` : plan.name, price: String(Number(plan.price)), duration_value: plan.duration_value, duration_unit: plan.duration_unit,
    compare_at_price: plan.compare_at_price ? String(Number(plan.compare_at_price)) : '', badge: plan.badge ?? '', tagline: plan.tagline ?? '',
    description: plan.description ?? '', highlights: plan.highlights.length ? [...plan.highlights] : [''], coupons_allowed: plan.coupons_allowed,
    offer_coupon_id: copy ? null : plan.offer_coupon_id, artwork: plan.artwork, accent: plan.accent, pricing_group: plan.pricing_group ?? '', code: copy ? '' : plan.code,
    entitlements: Object.fromEntries(plan.entitlements.filter((item) => item.enabled).map((item) => [item.feature_id, {
      feature_id: item.feature_id, enabled: true, limit_type: item.limit_type ?? 'unlimited',
      ...(item.limit_type === 'limited' ? { limit_value: item.limit_value ?? 1, unit: item.unit ?? undefined, reset_period: item.reset_period ?? undefined } : {}),
    }])),
  };
}

const BYTE_UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'];

/** "50 invoices per month", "1 business in total", "5 GB in total". */
export function limitAmount(value: number, unit: string | null | undefined) {
  if (unit === 'bytes') {
    let size = value; let step = 0;
    while (size >= 1024 && step < BYTE_UNITS.length - 1) { size /= 1024; step += 1; }
    return `${Number(size.toFixed(size % 1 ? 1 : 0)).toLocaleString('en-IN')} ${BYTE_UNITS[step]}`;
  }
  const label = value === 1 && unit?.endsWith('es') && /(s|x|z|ch|sh)es$/.test(unit) ? unit.slice(0, -2) : value === 1 && unit?.endsWith('s') ? unit.slice(0, -1) : unit ?? '';
  return `${value.toLocaleString('en-IN')} ${label}`.trim();
}

export function featureDetail(item: { limit_type?: string | null; limit_value?: number | null; unit?: string | null; reset_period?: ResetPeriod | null }, feature: AppFeature | undefined): string | null {
  if (!feature?.supports_numeric_limit) return '';
  if (item.limit_type !== 'limited') return null;
  return `${limitAmount(Number(item.limit_value), item.unit)} ${item.reset_period ? RESET_LABEL[item.reset_period] : ''}`.trim();
}

export function cardOffer(coupon: Coupon | undefined): CardOffer | null {
  return coupon ? { code: coupon.code, label: coupon.name, discount_type: coupon.discount_type, discount_value: coupon.discount_value } : null;
}

/** Features grouped as the app publishes them; hand-typed codes last. */
export function groupFeatures(features: AppFeature[]) {
  const groups = new Map<string, AppFeature[]>();
  for (const feature of [...features].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))) {
    const key = feature.group_name || (feature.source === 'app' ? 'General' : 'Typed in OS');
    groups.set(key, [...(groups.get(key) ?? []), feature]);
  }
  return [...groups.entries()].sort(([a], [b]) => Number(a === 'Typed in OS') - Number(b === 'Typed in OS'));
}


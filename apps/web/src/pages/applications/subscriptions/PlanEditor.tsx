import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, GripVertical, Plus, Search, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  apiErrorMessage,
  createPlan,
  updatePlan,
  type AppFeature,
  type Coupon,
  type EntitlementPayload,
  type PlanAccent,
  type ResetPeriod,
  type SubscriptionPlan,
} from '../../../services/controlApi';
import { Toggle } from '../../../components/Toggle';
import { PlanCard } from './PlanCard';
import { PlanArtworkImage } from './planVisuals';
import { ACCENTS, ARTWORK_OPTIONS, RESET_LABEL, cardOffer, draftFrom, featureDetail, groupFeatures, resolveVisuals, type CardFeature, type Draft, type Unit } from './planModel';


const PERIODS: Array<{ key: string; label: string; value: number; unit: Unit }> = [
  { key: '1-month', label: 'Monthly', value: 1, unit: 'month' },
  { key: '3-month', label: '3 months', value: 3, unit: 'month' },
  { key: '6-month', label: '6 months', value: 6, unit: 'month' },
  { key: '1-year', label: 'Yearly', value: 1, unit: 'year' },
];
const field = 'mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

function Section({ title, hint, children, aside }: { title: string; hint?: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{title}</h3>{hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}</div>{aside}</div>
    <div className="mt-4">{children}</div>
  </section>;
}

export function PlanEditor({ applicationId, editing, copyOf, plans, features, coupons, recommendedPlanId, canManageStorefront, onClose, onSaved }: {
  applicationId: string;
  editing: SubscriptionPlan | null;
  copyOf: SubscriptionPlan | null;
  plans: SubscriptionPlan[];
  features: AppFeature[];
  coupons: Coupon[];
  recommendedPlanId: string | null;
  canManageStorefront: boolean;
  onClose: () => void;
  onSaved: (plan: SubscriptionPlan, published: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(editing ?? copyOf, Boolean(copyOf && !editing)));
  const [now] = useState(() => Date.now());
  const [search, setSearch] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const featureById = useMemo(() => new Map(features.map((feature) => [feature.id, feature])), [features]);
  const appPublishes = features.some((feature) => feature.source === 'app');
  const grouped = useMemo(() => groupFeatures(features), [features]);
  const term = search.trim().toLowerCase();
  const enabledCount = Object.values(draft.entitlements).filter((item) => item.enabled && featureById.has(item.feature_id)).length;
  const periodKey = PERIODS.find((period) => period.value === draft.duration_value && period.unit === draft.duration_unit)?.key ?? 'custom';
  const [customPeriod, setCustomPeriod] = useState(periodKey === 'custom');
  const groups = [...new Set(plans.map((plan) => plan.pricing_group).filter(Boolean))] as string[];
  // Only promotion coupons that checkout would accept for this plan can be advertised.
  const offers = coupons.filter((coupon) => coupon.kind === 'promotion' && (coupon.status === 'active' || coupon.status === 'scheduled')
    && new Date(coupon.ends_at).getTime() > now && coupon.redemption_count < coupon.maximum_redemptions
    && (coupon.plan_ids.length === 0 || (editing !== null && coupon.plan_ids.includes(editing.id)))
    && (coupon.discount_type === 'percentage' || coupon.currency === 'INR'));
  const offerCoupon = draft.coupons_allowed ? coupons.find((coupon) => coupon.id === draft.offer_coupon_id) : undefined;

  const toggleFeature = (feature: AppFeature, on: boolean) => setDraft((current) => ({
    ...current,
    entitlements: {
      ...current.entitlements,
      [feature.id]: !on ? { feature_id: feature.id, enabled: false }
        : feature.supports_numeric_limit
          ? { feature_id: feature.id, enabled: true, limit_type: 'limited', limit_value: 10, unit: feature.default_unit ?? 'units', reset_period: feature.allowed_reset_periods[0] ?? 'total' }
          : { feature_id: feature.id, enabled: true, limit_type: 'unlimited' },
    },
  }));
  const patchFeature = (featureId: string, patch: Partial<EntitlementPayload>) => setDraft((current) => ({ ...current, entitlements: { ...current.entitlements, [featureId]: { ...current.entitlements[featureId], ...patch } } }));
  const setLine = (index: number, value: string) => {
    const lines = value.split('\n');
    if (lines.length > 1) { // Pasted several lines: one highlight per line.
      const next = [...draft.highlights]; next.splice(index, 1, ...lines.map((line) => line.trim()).filter(Boolean));
      set({ highlights: next.slice(0, 12) }); return;
    }
    set({ highlights: draft.highlights.map((line, i) => (i === index ? value : line)) });
  };

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const entitlements = Object.values(draft.entitlements).filter((item) => item.enabled && featureById.has(item.feature_id));
      const shared = {
        name: draft.name.trim(), price: draft.price || '0', duration_value: draft.duration_value, duration_unit: draft.duration_unit,
        tagline: draft.tagline.trim() || null, badge: draft.badge.trim() || null, compare_at_price: draft.compare_at_price || null,
        pricing_group: draft.pricing_group.trim() || null, highlights: draft.highlights.map((line) => line.trim()).filter(Boolean),
        artwork: draft.artwork, accent: draft.accent, coupons_allowed: draft.coupons_allowed,
        offer_coupon_id: draft.coupons_allowed ? draft.offer_coupon_id : null,
      };
      const startNow = new Date().toISOString();
      if (editing) {
        const live = editing.status === 'active';
        return updatePlan(applicationId, editing.id, {
          expected_version: editing.version, ...shared, description: draft.description.trim() || null, entitlements,
          status: publish || live ? 'active' : 'draft',
          ...((publish || live) && !editing.effective_at ? { effective_at: startNow } : {}),
        });
      }
      return createPlan(applicationId, {
        ...shared, code: draft.code.trim() || undefined, description: draft.description.trim() || undefined,
        user_limit_unlimited: true, status: publish ? 'active' : 'draft', ...(publish ? { effective_at: startNow } : {}), entitlements,
      });
    },
    onMutate: () => setError(''),
    onSuccess: (plan, publish) => onSaved(plan, publish || plan.status === 'active'),
    onError: (failure) => setError(apiErrorMessage(failure, 'The plan could not be saved. Check the fields and try again.')),
  });

  const submit = (publish: boolean) => (event?: FormEvent) => {
    event?.preventDefault();
    if (draft.name.trim().length < 2) return setError('Give the plan a name (at least 2 characters).');
    if (!(Number(draft.price) >= 0) || draft.price === '') return setError('Enter a price. Use 0 for a free plan.');
    if (draft.compare_at_price && Number(draft.compare_at_price) <= Number(draft.price)) return setError('The crossed-out price must be higher than the price.');
    if (Object.values(draft.entitlements).some((item) => item.enabled && item.limit_type === 'limited' && !(Number(item.limit_value) >= 1))) return setError('Every limit must be at least 1, or switch it to Unlimited.');
    if (publish && !enabledCount && !window.confirm('This plan has no features switched on, so customers on it can only view their data. Publish anyway?')) return;
    save.mutate(publish);
  };

  const previewFeatures: CardFeature[] = grouped.flatMap(([, items]) => items).filter((feature) => draft.entitlements[feature.id]?.enabled)
    .map((feature) => ({ name: feature.name, detail: featureDetail(draft.entitlements[feature.id], feature) }));
  const previewPlan = { id: editing?.id, price: draft.price || '0', duration_value: draft.duration_value, duration_unit: draft.duration_unit, artwork: draft.artwork, accent: draft.accent };
  const visuals = resolveVisuals(previewPlan, [...plans.filter((plan) => plan.id !== editing?.id && plan.status === 'active'), previewPlan], editing?.id === recommendedPlanId && Boolean(editing));
  const live = editing?.status === 'active';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.form
        onSubmit={submit(true)} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        className="flex h-full w-full max-w-[1320px] flex-col border-l border-slate-800 bg-[#0b0b0e] shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">{editing ? (live ? 'Live plan' : 'Draft plan') : 'New plan'}</p><h2 className="text-xl font-bold">{editing ? `Edit ${editing.name}` : copyOf ? `Copy of ${copyOf.name}` : 'Create a subscription plan'}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5 overflow-y-auto p-6">
            <Section title="Plan name and price">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Plan name<input autoFocus required maxLength={160} value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder="e.g. Pro" className={field} /></label>
                <label className="text-sm font-medium">Price (₹)<input required inputMode="decimal" value={draft.price} onChange={(event) => set({ price: event.target.value.replace(/[^0-9.]/g, '') })} placeholder="499 — use 0 for free" className={field} /></label>
              </div>
              <p className="mt-4 text-sm font-medium">Billing period</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PERIODS.map((period) => <button key={period.key} type="button" onClick={() => { setCustomPeriod(false); set({ duration_value: period.value, duration_unit: period.unit }); }} className={`rounded-full border px-4 py-1.5 text-sm transition ${!customPeriod && periodKey === period.key ? 'border-blue-500 bg-blue-500/15 text-white' : 'border-slate-800 text-slate-400 hover:border-slate-600'}`}>{period.label}</button>)}
                <button type="button" onClick={() => setCustomPeriod(true)} className={`rounded-full border px-4 py-1.5 text-sm ${customPeriod ? 'border-blue-500 bg-blue-500/15 text-white' : 'border-slate-800 text-slate-400 hover:border-slate-600'}`}>Custom</button>
              </div>
              {customPeriod && <div className="mt-3 flex max-w-xs gap-2"><input type="number" min={1} max={1200} value={draft.duration_value} onChange={(event) => set({ duration_value: Math.max(1, Number(event.target.value)) })} className={`${field} mt-0 w-24`} /><select value={draft.duration_unit} onChange={(event) => set({ duration_unit: event.target.value as Unit })} className={`${field} mt-0`}><option value="day">days</option><option value="month">months</option><option value="year">years</option></select></div>}
              {live && <p className="mt-3 text-xs text-slate-500">Price changes apply to new purchases and renewals. Current customers keep what they paid for until their term ends.</p>}
            </Section>

            <Section title="Plan details" hint="One selling point per line. Pasting several lines splits them automatically.">
              <div className="space-y-2">
                {draft.highlights.map((line, index) => <div key={index} className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-slate-700" />
                  <input value={line} maxLength={120} onChange={(event) => setLine(index, event.target.value)} onPaste={(event) => { const text = event.clipboardData.getData('text'); if (text.includes('\n')) { event.preventDefault(); setLine(index, text); } }}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (draft.highlights.length < 12) set({ highlights: [...draft.highlights.slice(0, index + 1), '', ...draft.highlights.slice(index + 1)] }); } }}
                    placeholder={index === 0 ? 'e.g. Unlimited projects and sites' : 'Another detail'} className={`${field} mt-0`} />
                  <button type="button" aria-label="Remove line" onClick={() => set({ highlights: draft.highlights.length > 1 ? draft.highlights.filter((_, i) => i !== index) : [''] })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>)}
              </div>
              {draft.highlights.length < 12 && <button type="button" onClick={() => set({ highlights: [...draft.highlights, ''] })} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300"><Plus className="h-4 w-4" />Add line</button>}
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label className="text-sm font-medium">Badge<input maxLength={40} value={draft.badge} onChange={(event) => set({ badge: event.target.value })} placeholder="Most popular" className={field} /></label>
                <label className="text-sm font-medium sm:col-span-2">Short tagline<input maxLength={200} value={draft.tagline} onChange={(event) => set({ tagline: event.target.value })} placeholder="For growing teams" className={field} /></label>
                <label className="text-sm font-medium">Crossed-out price (₹)<input inputMode="decimal" value={draft.compare_at_price} onChange={(event) => set({ compare_at_price: event.target.value.replace(/[^0-9.]/g, '') })} placeholder="Optional, e.g. 999" className={field} /></label>
              </div>
            </Section>

            <Section title="Coupons and offer" aside={<Toggle label="Allow coupons" checked={draft.coupons_allowed} onChange={(on) => set({ coupons_allowed: on, offer_coupon_id: on ? draft.offer_coupon_id : null })} />} hint={draft.coupons_allowed ? 'Customers see a “Have a coupon?” box on this plan.' : 'Coupons are switched off for this plan.'}>
              {draft.coupons_allowed ? <>
                <label className="text-sm font-medium">Featured offer (optional)
                  <select value={draft.offer_coupon_id ?? ''} onChange={(event) => set({ offer_coupon_id: event.target.value || null })} className={field}>
                    <option value="">No featured offer</option>
                    {offers.map((coupon) => <option key={coupon.id} value={coupon.id}>{coupon.code} · {coupon.discount_type === 'percentage' ? `${Number(coupon.discount_value)}% off` : `₹${Number(coupon.discount_value)} off`} · until {new Date(coupon.ends_at).toLocaleDateString('en-IN')}</option>)}
                  </select>
                </label>
                <p className="mt-2 text-xs text-slate-500">The offer shows as a swinging price tag and the code is filled in for the customer. Only active promotion coupons appear here; partner codes stay private. <Link to={`/apps/${applicationId}/coupons`} className="text-blue-400 hover:underline">Create a coupon</Link></p>
              </> : <p className="text-sm text-slate-500">Turn on to let customers use coupons or to feature an offer.</p>}
            </Section>

            <Section title={`App features · ${enabledCount} on`} hint="Switch on what this plan includes. Anything switched off is blocked by the app for customers on this plan."
              aside={<div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a feature" className="w-48 rounded-full border border-slate-800 bg-slate-900 py-1.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div>}>
              {!features.length && <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"><AlertTriangle className="h-5 w-5 shrink-0" />This app hasn't published its features yet. Start the app with its Charis OS settings and they appear here automatically.</div>}
              <div className="space-y-5">
                {grouped.map(([group, items]) => {
                  const visible = items.filter((feature) => !term || `${feature.name} ${feature.code} ${feature.description ?? ''}`.toLowerCase().includes(term));
                  if (!visible.length) return null;
                  const allOn = items.every((feature) => draft.entitlements[feature.id]?.enabled);
                  return <div key={group}>
                    <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group}</p><button type="button" onClick={() => items.forEach((feature) => { if (Boolean(draft.entitlements[feature.id]?.enabled) === allOn) toggleFeature(feature, !allOn); })} className="text-xs text-slate-500 hover:text-white">{allOn ? 'Switch all off' : 'Switch all on'}</button></div>
                    <div className="divide-y divide-slate-800/70 overflow-hidden rounded-xl border border-slate-800/80">
                      {visible.map((feature) => {
                        const item = draft.entitlements[feature.id];
                        const on = Boolean(item?.enabled);
                        return <div key={feature.id} className={`p-3.5 transition-colors ${on ? 'bg-blue-500/[0.06]' : 'bg-slate-950/40'}`}>
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0"><p className="text-sm font-medium">{feature.name}{appPublishes && feature.source === 'manual' && <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300" title={`The app does not check “${feature.code}”`}>not used by the app</span>}</p>{feature.description && <p className="mt-0.5 truncate text-xs text-slate-500">{feature.description}</p>}</div>
                            <Toggle label={feature.name} checked={on} onChange={(value) => toggleFeature(feature, value)} />
                          </div>
                          {on && feature.supports_numeric_limit && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                            <div className="inline-flex rounded-lg border border-slate-800 p-0.5">{(['limited', 'unlimited'] as const).map((kind) => <button key={kind} type="button" onClick={() => patchFeature(feature.id, kind === 'limited' ? { limit_type: 'limited', limit_value: item.limit_value ?? 10, unit: feature.default_unit ?? 'units', reset_period: item.reset_period ?? feature.allowed_reset_periods[0] ?? 'total' } : { limit_type: 'unlimited', limit_value: undefined, unit: undefined, reset_period: undefined })} className={`rounded-md px-3 py-1 text-xs ${item.limit_type === kind ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>{kind === 'limited' ? 'Up to' : 'Unlimited'}</button>)}</div>
                            {item.limit_type === 'limited' && <><input type="number" min={1} value={item.limit_value ?? ''} onChange={(event) => patchFeature(feature.id, { limit_value: Number(event.target.value) })} className="w-28 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5" aria-label={`${feature.name} limit`} /><span className="text-slate-400">{feature.default_unit}</span>
                              {feature.allowed_reset_periods.length > 1 ? <select value={item.reset_period} onChange={(event) => patchFeature(feature.id, { reset_period: event.target.value as ResetPeriod })} className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5">{feature.allowed_reset_periods.map((period) => <option key={period} value={period}>{RESET_LABEL[period]}</option>)}</select> : <span className="text-slate-500">{item.reset_period ? RESET_LABEL[item.reset_period] : ''}</span>}</>}
                          </div>}
                        </div>;
                      })}
                    </div>
                  </div>;
                })}
              </div>
            </Section>

            <Section title="Card look" hint="Pick a picture and colour, or leave both on Automatic.">
              <div className="flex flex-wrap gap-2">{ARTWORK_OPTIONS.map((option) => {
                const shownArt = option.value === 'auto' ? visuals.artwork : option.value;
                return <button key={option.value} type="button" onClick={() => set({ artwork: option.value })} className={`flex w-[84px] flex-col items-center gap-1 rounded-xl border p-2 text-[11px] transition ${draft.artwork === option.value ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-slate-800 text-slate-400 hover:border-slate-600'}`}>
                  <span className="grid h-12 place-items-center">{shownArt === 'none' ? <span className="text-lg text-slate-600">—</span> : <PlanArtworkImage artwork={shownArt} accent={visuals.accent} size={44} />}</span>{option.label}
                </button>;
              })}</div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => set({ accent: 'auto' })} className={`rounded-full border px-3 py-1.5 text-xs ${draft.accent === 'auto' ? 'border-blue-500 text-white' : 'border-slate-800 text-slate-400'}`}>Automatic</button>
                {(Object.entries(ACCENTS) as Array<[Exclude<PlanAccent, 'auto'>, (typeof ACCENTS)[keyof typeof ACCENTS]]>).map(([key, value]) => <button key={key} type="button" aria-label={value.label} title={value.label} onClick={() => set({ accent: key })} className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-[#0b0b0e] transition ${draft.accent === key ? 'ring-2 ring-white' : ''}`} style={{ background: `linear-gradient(135deg, ${value.from}, ${value.to})` }} />)}
              </div>
            </Section>

            <section className="rounded-2xl border border-slate-800/80 bg-slate-900/30">
              <button type="button" onClick={() => setMore(!more)} className="flex w-full items-center justify-between p-5 text-left"><span><span className="font-semibold">More options</span><span className="mt-0.5 block text-xs text-slate-500">Plan code, monthly/yearly pairing, internal note</span></span><ChevronDown className={`h-4 w-4 text-slate-500 transition ${more ? 'rotate-180' : ''}`} /></button>
              {more && <div className="grid gap-4 border-t border-slate-800 p-5 sm:grid-cols-2">
                <label className="text-sm font-medium">Plan code<input readOnly={Boolean(editing)} value={draft.code} onChange={(event) => set({ code: event.target.value })} placeholder="Created from the name" className={`${field} font-mono read-only:opacity-60`} /><span className="mt-1 block text-xs text-slate-500">Used in reports. Cannot change after creation.</span></label>
                <label className="text-sm font-medium">Show together with<input list="pricing-groups" maxLength={100} value={draft.pricing_group} onChange={(event) => set({ pricing_group: event.target.value })} placeholder="e.g. pro" className={field} /><datalist id="pricing-groups">{groups.map((group) => <option key={group} value={group} />)}</datalist><span className="mt-1 block text-xs text-slate-500">Give the monthly and yearly versions the same word to show one card with a Monthly / Yearly switch.</span></label>
                <label className="text-sm font-medium sm:col-span-2">Internal note<textarea rows={2} maxLength={4000} value={draft.description} onChange={(event) => set({ description: event.target.value })} className={field} /></label>
              </div>}
            </section>
          </div>

          <aside className="hidden overflow-y-auto border-l border-slate-800 bg-gradient-to-b from-slate-950 to-[#0b0b0e] p-6 lg:block">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Live preview · what customers see</p>
            <PlanCard preview recommended={editing?.id === recommendedPlanId && Boolean(editing)} artwork={visuals.artwork} accent={visuals.accent}
              plan={{ name: draft.name, tagline: draft.tagline || null, badge: draft.badge || null, price: draft.price || '0', compare_at_price: draft.compare_at_price || null, currency: 'INR', duration_value: draft.duration_value, duration_unit: draft.duration_unit, highlights: draft.highlights.map((line) => line.trim()).filter(Boolean), features: previewFeatures, coupons_allowed: draft.coupons_allowed, offer: cardOffer(offerCoupon) }} />
            <p className="mt-4 text-xs leading-relaxed text-slate-500">Prices here are a preview. The app always asks Charis OS for the final price, including any coupon, before taking payment.</p>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-[#0b0b0e] px-6 py-4">
          <div className="min-h-5 text-sm">{error ? <span role="alert" className="text-red-300">{error}</span> : <span className="text-slate-500">{live ? 'Saving updates the live plan.' : canManageStorefront ? 'Publishing puts the plan on the app’s plan page.' : 'Publishing makes the plan available; ask an owner to show it on the plan page.'}</span>}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-slate-400 hover:text-white">Cancel</button>
            {!live && <button type="button" disabled={save.isPending} onClick={() => submit(false)()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold hover:border-slate-500 disabled:opacity-50">Save draft</button>}
            <button type="submit" disabled={save.isPending} className="rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 disabled:opacity-50">{save.isPending ? 'Saving…' : live ? 'Save changes' : 'Publish plan'}</button>
          </div>
        </footer>
      </motion.form>
    </div>
  );
}

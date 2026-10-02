import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Infinity as InfinityIcon, Package, Plus, SlidersHorizontal, X } from 'lucide-react';
import {
  createFeature,
  createPlan,
  listFeatures,
  listPlans,
  type CreatePlanPayload,
  type EntitlementPayload,
  type ResetPeriod,
} from '../../services/controlApi';
import { useAuthStore } from '../../store/authStore';
import { useProductStore } from '../../store/productStore';

const resetPeriods: ResetPeriod[] = ['total', 'daily', 'monthly', 'yearly', 'billing_cycle'];

export function PlansCatalog() {
  const application = useProductStore((state) => state.selectedProduct);
  const isOwner = useAuthStore((state) => state.user?.role === 'owner');
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'feature' | 'plan' | null>(null);
  const [featureForm, setFeatureForm] = useState({ name: '', code: '', default_unit: '', supports_numeric_limit: true, allowed_reset_periods: ['monthly'] as ResetPeriod[] });
  const [planForm, setPlanForm] = useState({ name: '', code: '', price: '', currency: 'INR', duration_value: 1, duration_unit: 'month' as const, status: 'draft' as 'draft' | 'active' });
  const [entitlements, setEntitlements] = useState<Record<string, EntitlementPayload>>({});
  const features = useQuery({ queryKey: ['features', application?.id], queryFn: () => listFeatures(application!.id), enabled: Boolean(application) });
  const plans = useQuery({ queryKey: ['plans', application?.id], queryFn: () => listPlans(application!.id), enabled: Boolean(application) });
  const featureNames = useMemo(() => new Map(features.data?.map((feature) => [feature.id, feature.name]) ?? []), [features.data]);

  const featureMutation = useMutation({
    mutationFn: () => createFeature(application!.id, { ...featureForm, default_unit: featureForm.default_unit || undefined }),
    onSuccess: async () => { setDialog(null); setFeatureForm({ name: '', code: '', default_unit: '', supports_numeric_limit: true, allowed_reset_periods: ['monthly'] }); await queryClient.invalidateQueries({ queryKey: ['features', application?.id] }); },
  });
  const planMutation = useMutation({
    mutationFn: () => {
      const payload: CreatePlanPayload = {
        ...planForm,
        price: planForm.price,
        coupons_allowed: true,
        user_limit_unlimited: true,
        entitlements: Object.values(entitlements).filter((item) => item.enabled),
        ...(planForm.status === 'active' ? { effective_at: new Date().toISOString() } : {}),
      };
      return createPlan(application!.id, payload);
    },
    onSuccess: async () => { setDialog(null); setEntitlements({}); setPlanForm({ name: '', code: '', price: '', currency: 'INR', duration_value: 1, duration_unit: 'month', status: 'draft' }); await Promise.all([queryClient.invalidateQueries({ queryKey: ['plans', application?.id] }), queryClient.invalidateQueries({ queryKey: ['application-overview', application?.id] })]); },
  });

  if (!application) return null;
  const submitFeature = (event: FormEvent) => { event.preventDefault(); featureMutation.mutate(); };
  const submitPlan = (event: FormEvent) => { event.preventDefault(); planMutation.mutate(); };
  const toggleFeature = (featureId: string, enabled: boolean) => setEntitlements((current) => ({ ...current, [featureId]: enabled ? { feature_id: featureId, enabled: true, limit_type: 'unlimited' } : { feature_id: featureId, enabled: false } }));
  const updateEntitlement = (featureId: string, patch: Partial<EntitlementPayload>) => setEntitlements((current) => ({ ...current, [featureId]: { ...(current[featureId] ?? { feature_id: featureId, enabled: true, limit_type: 'unlimited' }), ...patch } }));

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">{application.displayName}</p><h1 className="mt-2 text-3xl font-bold">Plans and entitlements</h1><p className="mt-2 text-slate-400">Features are registered by this application and enforced by backend entitlement logic.</p></div>{isOwner && <div className="flex gap-2"><button onClick={() => setDialog('feature')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-blue-500/50"><Plus className="mr-2 inline h-4 w-4" />Feature</button><button onClick={() => setDialog('plan')} disabled={!features.data?.length} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"><Plus className="mr-2 inline h-4 w-4" />Plan</button></div>}</header>

      {(features.isError || plans.isError) && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">The app-scoped catalog could not be loaded.</div>}
      <section><div className="mb-3 flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-blue-400" /><h2 className="font-semibold">Application feature catalog</h2></div><div className="flex flex-wrap gap-2">{features.data?.map((feature) => <span key={feature.id} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300">{feature.name}<span className="ml-2 font-mono text-[10px] text-slate-500">{feature.code}</span></span>)}{features.data?.length === 0 && <p className="text-sm text-slate-500">Register the first feature before creating plans.</p>}</div></section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{plans.isPending && <p className="text-slate-500">Loading plans…</p>}{plans.data?.map((plan) => <article key={plan.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 text-blue-400"><Package className="h-5 w-5" /></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${plan.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'}`}>{plan.status}</span></div><h2 className="mt-5 text-xl font-semibold">{plan.name}</h2><p className="mt-1 font-mono text-xs text-slate-500">{plan.code}</p><p className="mt-5 text-2xl font-bold">{plan.currency} {Number(plan.price).toLocaleString()}<span className="text-sm font-normal text-slate-500"> / {plan.duration_value} {plan.duration_unit}</span></p><div className="mt-5 space-y-2 border-t border-slate-800 pt-4">{plan.entitlements.filter((item) => item.enabled).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 text-slate-300"><Check className="h-3.5 w-3.5 text-emerald-400" />{featureNames.get(item.feature_id) ?? item.feature_id}</span><span className="text-xs text-slate-500">{item.limit_type === 'unlimited' ? <InfinityIcon className="h-4 w-4" /> : `${item.limit_value} ${item.unit} / ${item.reset_period}`}</span></div>)}</div></article>)}{plans.data?.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">No plans exist for this application.</div>}</section>

      {dialog === 'feature' && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><form onSubmit={submitFeature} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6"><div className="flex justify-between"><h2 className="text-xl font-semibold">Register feature</h2><button type="button" onClick={() => setDialog(null)}><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4"><label className="text-sm">Name<input required value={featureForm.name} onChange={(event) => setFeatureForm({ ...featureForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5" /></label><label className="text-sm">Code<input required value={featureForm.code} onChange={(event) => setFeatureForm({ ...featureForm, code: event.target.value })} placeholder="monthly_invoices" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono" /></label><label className="text-sm">Default unit<input value={featureForm.default_unit} onChange={(event) => setFeatureForm({ ...featureForm, default_unit: event.target.value })} placeholder="invoices" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={featureForm.supports_numeric_limit} onChange={(event) => setFeatureForm({ ...featureForm, supports_numeric_limit: event.target.checked, allowed_reset_periods: event.target.checked ? ['monthly'] : [], default_unit: event.target.checked ? featureForm.default_unit : '' })} />Supports numerical limits</label></div>{featureMutation.isError && <p className="mt-4 text-sm text-red-300">Feature validation failed or this code already exists.</p>}<button className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold">Register feature</button></form></div>}

      {dialog === 'plan' && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><form onSubmit={submitPlan} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6"><div className="flex justify-between"><h2 className="text-xl font-semibold">Create subscription plan</h2><button type="button" onClick={() => setDialog(null)}><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">Name<input required value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5" /></label><label className="text-sm">Code<input required value={planForm.code} onChange={(event) => setPlanForm({ ...planForm, code: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono" /></label><label className="text-sm">Price<input required min="0" step="0.01" type="number" value={planForm.price} onChange={(event) => setPlanForm({ ...planForm, price: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5" /></label><label className="text-sm">Currency<input required maxLength={3} value={planForm.currency} onChange={(event) => setPlanForm({ ...planForm, currency: event.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5" /></label><label className="text-sm">Duration<input required min="1" type="number" value={planForm.duration_value} onChange={(event) => setPlanForm({ ...planForm, duration_value: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5" /></label><label className="text-sm">Status<select value={planForm.status} onChange={(event) => setPlanForm({ ...planForm, status: event.target.value as 'draft' | 'active' })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5"><option value="draft">Draft</option><option value="active">Active</option></select></label></div><div className="mt-6 border-t border-slate-800 pt-5"><h3 className="font-semibold">Entitlements</h3><div className="mt-3 space-y-3">{features.data?.map((feature) => { const item = entitlements[feature.id]; return <div key={feature.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><label className="flex items-center gap-3"><input type="checkbox" checked={Boolean(item?.enabled)} onChange={(event) => toggleFeature(feature.id, event.target.checked)} /><span className="font-medium">{feature.name}</span><span className="font-mono text-xs text-slate-600">{feature.code}</span></label>{item?.enabled && <div className="mt-3 grid gap-3 sm:grid-cols-4"><select value={item.limit_type} onChange={(event) => updateEntitlement(feature.id, event.target.value === 'limited' ? { limit_type: 'limited', limit_value: 1, unit: feature.default_unit ?? 'units', reset_period: feature.allowed_reset_periods[0] ?? 'total' } : { limit_type: 'unlimited', limit_value: undefined, unit: undefined, reset_period: undefined })} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm"><option value="unlimited">Unlimited</option>{feature.supports_numeric_limit && <option value="limited">Limited</option>}</select>{item.limit_type === 'limited' && <><input required min="1" type="number" value={item.limit_value ?? 1} onChange={(event) => updateEntitlement(feature.id, { limit_value: Number(event.target.value) })} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm" /><input required value={item.unit ?? ''} readOnly={Boolean(feature.default_unit)} onChange={(event) => updateEntitlement(feature.id, { unit: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm" /><select value={item.reset_period} onChange={(event) => updateEntitlement(feature.id, { reset_period: event.target.value as ResetPeriod })} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm">{(feature.allowed_reset_periods.length ? feature.allowed_reset_periods : resetPeriods).map((period) => <option key={period} value={period}>{period}</option>)}</select></>}</div>}</div>; })}</div></div>{planMutation.isError && <p className="mt-4 text-sm text-red-300">Plan validation failed. Check feature limits, code, and effective status.</p>}<button className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold">Create plan</button></form></div>}
    </div>
  );
}

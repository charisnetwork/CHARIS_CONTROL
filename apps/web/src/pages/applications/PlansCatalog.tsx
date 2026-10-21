import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, Check, Infinity as InfinityIcon, Package, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  apiErrorMessage,
  createFeature,
  createPlan,
  deletePlan,
  listFeatures,
  listPlans,
  replacePlanEntitlements,
  updatePlan,
  type AppFeature,
  type CreatePlanPayload,
  type EntitlementPayload,
  type ResetPeriod,
  type SubscriptionPlan,
} from '../../services/controlApi';
import { useAuthStore } from '../../store/authStore';
import { useProductStore } from '../../store/productStore';

type Duration = 'day' | 'month' | 'year';
const emptyPlan = () => ({
  name: '', code: '', description: '', price: '', currency: 'INR', duration_value: 1, duration_unit: 'month' as Duration,
  status: 'draft' as 'draft' | 'active', tagline: '', badge: '', compare_at_price: '', pricing_group: '',
});
const input = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 read-only:opacity-60';
const resetLabel: Record<ResetPeriod, string> = { total: 'in total', daily: 'per day', monthly: 'per month', yearly: 'per year', billing_cycle: 'per billing cycle' };

/** Features grouped as the app publishes them (group, then the app's own order). */
function groupFeatures(features: AppFeature[]) {
  const groups = new Map<string, AppFeature[]>();
  for (const feature of [...features].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))) {
    const key = feature.group_name || (feature.source === 'app' ? 'General' : 'Custom (typed in OS)');
    groups.set(key, [...(groups.get(key) ?? []), feature]);
  }
  // The app's own groups first; hand-typed codes last.
  return [...groups.entries()].sort(([a], [b]) => Number(a.startsWith('Custom')) - Number(b.startsWith('Custom')));
}

const limitText = (item: { limit_type: string | null; limit_value: number | null; unit: string | null; reset_period: ResetPeriod | null }) =>
  item.limit_type === 'limited' ? `${item.limit_value?.toLocaleString('en-IN')} ${item.unit} ${item.reset_period ? resetLabel[item.reset_period] : ''}` : 'Unlimited';

export function PlansCatalog() {
  const application = useProductStore((state) => state.selectedProduct);
  const isOwner = useAuthStore((state) => state.user?.role === 'owner');
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'feature' | 'plan' | null>(null);
  const [featureForm, setFeatureForm] = useState({ name: '', code: '', default_unit: '', supports_numeric_limit: false, allowed_reset_periods: [] as ResetPeriod[] });
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [entitlements, setEntitlements] = useState<Record<string, EntitlementPayload>>({});
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [actionError, setActionError] = useState('');
  const features = useQuery({ queryKey: ['features', application?.id], queryFn: () => listFeatures(application!.id), enabled: Boolean(application) });
  const plans = useQuery({ queryKey: ['plans', application?.id], queryFn: () => listPlans(application!.id), enabled: Boolean(application) });
  const featureById = useMemo(() => new Map(features.data?.map((feature) => [feature.id, feature]) ?? []), [features.data]);
  const published = features.data?.filter((feature) => feature.source === 'app') ?? [];
  const appPublishes = published.length > 0;
  const lastSync = published.reduce<string | null>((latest, feature) => (feature.synced_at && (!latest || feature.synced_at > latest) ? feature.synced_at : latest), null);
  const grouped = useMemo(() => groupFeatures(features.data ?? []), [features.data]);

  const refreshPlans = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['plans', application?.id] }), queryClient.invalidateQueries({ queryKey: ['application-overview', application?.id] })]);
  const closePlanDialog = () => { setDialog(null); setEditing(null); setEntitlements({}); setPlanForm(emptyPlan()); };
  const presentation = () => ({
    tagline: planForm.tagline.trim() || null,
    badge: planForm.badge.trim() || null,
    compare_at_price: planForm.compare_at_price ? planForm.compare_at_price : null,
    pricing_group: planForm.pricing_group.trim() || null,
  });

  const featureMutation = useMutation({
    mutationFn: () => createFeature(application!.id, { ...featureForm, default_unit: featureForm.default_unit || undefined }),
    onSuccess: async () => { setDialog(null); setFeatureForm({ name: '', code: '', default_unit: '', supports_numeric_limit: false, allowed_reset_periods: [] }); await queryClient.invalidateQueries({ queryKey: ['features', application?.id] }); },
  });
  const planMutation = useMutation({
    mutationFn: async () => {
      const chosen = Object.values(entitlements).filter((item) => item.enabled);
      if (editing) {
        // Existing customers keep the price and limits frozen on their current term.
        const updated = await updatePlan(application!.id, editing.id, {
          expected_version: editing.version,
          name: planForm.name,
          description: planForm.description || null,
          price: planForm.price,
          duration_value: planForm.duration_value,
          duration_unit: planForm.duration_unit,
          status: planForm.status,
          ...presentation(),
          ...(planForm.status === 'active' && !editing.effective_at ? { effective_at: new Date().toISOString() } : {}),
        });
        return replacePlanEntitlements(application!.id, updated.id, chosen);
      }
      const payload: CreatePlanPayload = {
        name: planForm.name, code: planForm.code, description: planForm.description || undefined, price: planForm.price,
        currency: planForm.currency, duration_value: planForm.duration_value, duration_unit: planForm.duration_unit,
        status: planForm.status, coupons_allowed: true, user_limit_unlimited: true, entitlements: chosen, ...presentation(),
        ...(planForm.status === 'active' ? { effective_at: new Date().toISOString() } : {}),
      };
      return createPlan(application!.id, payload);
    },
    onSuccess: async () => { closePlanDialog(); await refreshPlans(); },
  });
  const planAction = useMutation({
    mutationFn: async ({ plan, action }: { plan: SubscriptionPlan; action: 'archive' | 'delete' }) => {
      if (action === 'delete') await deletePlan(application!.id, plan.id);
      else await updatePlan(application!.id, plan.id, { expected_version: plan.version, status: 'archived' });
    },
    onMutate: () => setActionError(''),
    onSuccess: refreshPlans,
    onError: (error) => setActionError(apiErrorMessage(error, 'The plan could not be changed.')),
  });

  const startEdit = (plan: SubscriptionPlan) => {
    setEditing(plan);
    setPlanForm({
      name: plan.name, code: plan.code, description: plan.description ?? '', price: String(Number(plan.price)), currency: plan.currency,
      duration_value: plan.duration_value, duration_unit: plan.duration_unit, status: plan.status === 'active' ? 'active' : 'draft',
      tagline: plan.tagline ?? '', badge: plan.badge ?? '', compare_at_price: plan.compare_at_price ? String(Number(plan.compare_at_price)) : '', pricing_group: plan.pricing_group ?? '',
    });
    setEntitlements(Object.fromEntries(plan.entitlements.filter((item) => item.enabled).map((item) => [item.feature_id, {
      feature_id: item.feature_id, enabled: true, limit_type: item.limit_type ?? 'unlimited',
      ...(item.limit_type === 'limited' ? { limit_value: item.limit_value ?? 1, unit: item.unit ?? undefined, reset_period: item.reset_period ?? undefined } : {}),
    }])));
    setDialog('plan');
  };

  if (!application) return null;
  const toggleFeature = (feature: AppFeature, enabled: boolean) => setEntitlements((current) => ({
    ...current,
    [feature.id]: !enabled ? { feature_id: feature.id, enabled: false }
      : feature.supports_numeric_limit
        ? { feature_id: feature.id, enabled: true, limit_type: 'limited', limit_value: 1, unit: feature.default_unit ?? 'units', reset_period: feature.allowed_reset_periods[0] ?? 'total' }
        : { feature_id: feature.id, enabled: true, limit_type: 'unlimited' },
  }));
  const updateEntitlement = (featureId: string, patch: Partial<EntitlementPayload>) => setEntitlements((current) => ({ ...current, [featureId]: { ...current[featureId], ...patch } }));
  // "Tick all" includes every feature the app uses, unlimited; adjust limits afterwards.
  const setAll = (enabled: boolean) => setEntitlements(Object.fromEntries((features.data ?? [])
    .filter((feature) => !enabled || feature.source === 'app' || !appPublishes)
    .map((feature) => [feature.id, enabled ? { feature_id: feature.id, enabled: true, limit_type: 'unlimited' as const } : { feature_id: feature.id, enabled: false }])));

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">{application.displayName}</p>
          <h1 className="mt-2 text-3xl font-bold">Plans and features</h1>
          <p className="mt-2 text-slate-400">Tick the features each plan includes. The app enforces exactly what you tick.</p>
        </div>
        {isOwner && <button onClick={() => { setEditing(null); setPlanForm(emptyPlan()); setEntitlements({}); setDialog('plan'); }} disabled={!features.data?.length} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"><Plus className="mr-2 inline h-4 w-4" />New plan</button>}
      </header>

      {actionError && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">{actionError}</div>}
      {(features.isError || plans.isError) && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">The app-scoped catalog could not be loaded.</div>}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-blue-400" /><h2 className="font-semibold">Features {appPublishes ? `published by ${application.displayName}` : ''}</h2></div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {lastSync && <span>Last updated by the app {new Date(lastSync).toLocaleString()}</span>}
            {isOwner && <button onClick={() => setDialog('feature')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-blue-500/50">+ Custom feature</button>}
          </div>
        </div>
        {!appPublishes && features.isSuccess && <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"><AlertTriangle className="h-5 w-5 shrink-0" /><p>This app hasn't published its feature list yet. Set its <code>CHARIS_OS_URL</code>, <code>CHARIS_OS_APP_ID</code> and <code>CHARIS_OS_APP_KEY</code> variables and restart it — its features appear here automatically. Custom features only work if the app's code checks that exact code.</p></div>}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {grouped.map(([group, items]) => <div key={group}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group}</p>
            <ul className="mt-2 space-y-1.5">{items.map((feature) => <li key={feature.id} className="text-sm text-slate-300">
              {feature.name}{feature.supports_numeric_limit && <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">limit · {feature.default_unit}</span>}
              {appPublishes && feature.source === 'manual' && <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300" title={`The app does not check the code "${feature.code}"`}>not used by the app</span>}
            </li>)}</ul>
          </div>)}
          {features.data?.length === 0 && <p className="text-sm text-slate-500">No features yet.</p>}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.isPending && <p className="text-slate-500">Loading plans…</p>}
        {plans.data?.map((plan) => <article key={plan.id} className={`relative rounded-2xl border bg-slate-900/60 p-6 ${plan.badge ? 'border-blue-500/50' : 'border-slate-800'}`}>
          {plan.badge && <span className="absolute -top-3 right-5 rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white">{plan.badge}</span>}
          <div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 text-blue-400"><Package className="h-5 w-5" /></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${plan.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'}`}>{plan.status}</span></div>
          <h2 className="mt-5 text-xl font-semibold">{plan.name}</h2>
          {plan.tagline && <p className="mt-1 text-sm text-blue-300">{plan.tagline}</p>}
          <p className="mt-1 font-mono text-xs text-slate-500">{plan.code}{plan.pricing_group ? ` · group "${plan.pricing_group}"` : ''}</p>
          <p className="mt-5 text-2xl font-bold">{plan.compare_at_price && <span className="mr-2 text-base font-normal text-slate-500 line-through">{plan.currency} {Number(plan.compare_at_price).toLocaleString('en-IN')}</span>}{plan.currency} {Number(plan.price).toLocaleString('en-IN')}<span className="text-sm font-normal text-slate-500"> / {plan.duration_value} {plan.duration_unit}</span></p>
          {isOwner && <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <button onClick={() => startEdit(plan)} className="rounded-lg border border-slate-700 px-3 py-1.5 hover:border-blue-500/50"><Pencil className="mr-1 inline h-3.5 w-3.5" />Edit</button>
            <button disabled={planAction.isPending} onClick={() => { if (window.confirm(`Archive ${plan.name}? It disappears from the plan page; existing customers keep it until their term ends.`)) planAction.mutate({ plan, action: 'archive' }); }} className="rounded-lg border border-slate-700 px-3 py-1.5 hover:border-amber-500/50"><Archive className="mr-1 inline h-3.5 w-3.5" />Archive</button>
            <button disabled={planAction.isPending} onClick={() => { if (window.confirm(`Delete ${plan.name} permanently? Only plans never used by a customer, coupon or notification can be deleted.`)) planAction.mutate({ plan, action: 'delete' }); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-red-300 hover:border-red-500/50"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Delete</button>
          </div>}
          <div className="mt-5 space-y-2 border-t border-slate-800 pt-4">{plan.entitlements.filter((item) => item.enabled).map((item) => {
            const feature = featureById.get(item.feature_id);
            return <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 text-slate-300"><Check className="h-3.5 w-3.5 text-emerald-400" />{feature?.name ?? 'Retired feature'}</span><span className="text-xs text-slate-500">{item.limit_type === 'unlimited' ? (feature?.supports_numeric_limit ? 'Unlimited' : <InfinityIcon className="h-4 w-4" />) : limitText(item)}</span></div>;
          })}</div>
        </article>)}
        {plans.data?.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">No plans exist for this application.</div>}
      </section>

      {dialog === 'feature' && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><form onSubmit={(event: FormEvent) => { event.preventDefault(); featureMutation.mutate(); }} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex justify-between"><h2 className="text-xl font-semibold">Custom feature</h2><button type="button" onClick={() => setDialog(null)}><X className="h-5 w-5" /></button></div>
        <p className="mt-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">Only for codes the app's developers have added to its code. A code the app doesn't check has no effect.</p>
        <div className="mt-5 grid gap-4">
          <label className="text-sm">Name<input required value={featureForm.name} onChange={(event) => setFeatureForm({ ...featureForm, name: event.target.value })} className={input} /></label>
          <label className="text-sm">Code<input required value={featureForm.code} onChange={(event) => setFeatureForm({ ...featureForm, code: event.target.value })} placeholder="e.g. monthly_invoices" className={`${input} font-mono`} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={featureForm.supports_numeric_limit} onChange={(event) => setFeatureForm({ ...featureForm, supports_numeric_limit: event.target.checked, allowed_reset_periods: event.target.checked ? ['monthly'] : [], default_unit: event.target.checked ? featureForm.default_unit : '' })} />Has a numerical limit</label>
          {featureForm.supports_numeric_limit && <label className="text-sm">Unit<input required value={featureForm.default_unit} onChange={(event) => setFeatureForm({ ...featureForm, default_unit: event.target.value })} placeholder="invoices" className={input} /></label>}
        </div>
        {featureMutation.isError && <p className="mt-4 text-sm text-red-300">{apiErrorMessage(featureMutation.error, 'Feature validation failed or this code already exists.')}</p>}
        <button className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold">Add custom feature</button>
      </form></div>}

      {dialog === 'plan' && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><form onSubmit={(event: FormEvent) => { event.preventDefault(); planMutation.mutate(); }} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex justify-between"><h2 className="text-xl font-semibold">{editing ? `Edit ${editing.name}` : 'New plan'}</h2><button type="button" onClick={closePlanDialog}><X className="h-5 w-5" /></button></div>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-slate-400">Plan</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">Name<input required value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} placeholder="Pro" className={input} /></label>
          <label className="text-sm">Code<input required readOnly={Boolean(editing)} value={planForm.code} onChange={(event) => setPlanForm({ ...planForm, code: event.target.value })} placeholder="pro_yearly" className={`${input} font-mono`} /></label>
          <label className="text-sm">Status<select value={planForm.status} onChange={(event) => setPlanForm({ ...planForm, status: event.target.value as 'draft' | 'active' })} className={input}><option value="draft">Draft (hidden)</option><option value="active">Active</option></select></label>
          <label className="text-sm">Price<input required min="0" step="0.01" type="number" value={planForm.price} onChange={(event) => setPlanForm({ ...planForm, price: event.target.value })} className={input} /></label>
          <label className="text-sm">Currency<input required readOnly={Boolean(editing)} maxLength={3} value={planForm.currency} onChange={(event) => setPlanForm({ ...planForm, currency: event.target.value.toUpperCase() })} className={input} /></label>
          <label className="text-sm">Billing period<div className="mt-1 flex gap-2"><input required min="1" type="number" value={planForm.duration_value} onChange={(event) => setPlanForm({ ...planForm, duration_value: Number(event.target.value) })} className="w-20 rounded-lg border border-slate-700 bg-slate-950 p-2.5" /><select value={planForm.duration_unit} onChange={(event) => setPlanForm({ ...planForm, duration_unit: event.target.value as Duration })} className="flex-1 rounded-lg border border-slate-700 bg-slate-950 p-2.5"><option value="day">Days</option><option value="month">Months</option><option value="year">Years</option></select></div></label>
        </div>

        <h3 className="mt-7 text-sm font-semibold uppercase tracking-wider text-slate-400">Customer plan page</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Tagline<input value={planForm.tagline} maxLength={200} onChange={(event) => setPlanForm({ ...planForm, tagline: event.target.value })} placeholder="Essential plan for small business owners" className={input} /></label>
          <label className="text-sm">Badge<input value={planForm.badge} maxLength={40} onChange={(event) => setPlanForm({ ...planForm, badge: event.target.value })} placeholder="Most Popular" className={input} /></label>
          <label className="text-sm">Original price (shown struck through)<input min="0" step="0.01" type="number" value={planForm.compare_at_price} onChange={(event) => setPlanForm({ ...planForm, compare_at_price: event.target.value })} placeholder="Optional, higher than the price" className={input} /></label>
          <label className="text-sm">Pricing group<input value={planForm.pricing_group} maxLength={100} onChange={(event) => setPlanForm({ ...planForm, pricing_group: event.target.value })} placeholder="e.g. pro" className={input} /><span className="mt-1 block text-xs text-slate-500">Give the monthly and yearly versions the same group to show them as one card with a Monthly / Yearly switch.</span></label>
          <label className="text-sm sm:col-span-2">Description<input value={planForm.description} maxLength={4000} onChange={(event) => setPlanForm({ ...planForm, description: event.target.value })} className={input} /></label>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Features in this plan</h3><div className="flex gap-2 text-xs"><button type="button" onClick={() => setAll(true)} className="rounded border border-slate-700 px-2 py-1">Tick all</button><button type="button" onClick={() => setAll(false)} className="rounded border border-slate-700 px-2 py-1">Clear</button></div></div>
        <p className="mt-1 text-xs text-slate-500">Anything not ticked is not included — the app blocks it for customers on this plan.</p>
        <div className="mt-3 space-y-5">{grouped.map(([group, items]) => <div key={group}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group}</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">{items.map((feature) => {
            const item = entitlements[feature.id];
            const unused = appPublishes && feature.source === 'manual';
            return <div key={feature.id} className={`rounded-xl border p-3 ${item?.enabled ? 'border-blue-500/40 bg-blue-500/5' : 'border-slate-800 bg-slate-950/50'}`}>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1" checked={Boolean(item?.enabled)} onChange={(event) => toggleFeature(feature, event.target.checked)} />
                <span><span className="font-medium">{feature.name}</span>{unused && <span className="ml-2 text-[10px] text-amber-300">not used by the app</span>}{feature.description && <span className="block text-xs text-slate-500">{feature.description}</span>}</span></label>
              {item?.enabled && feature.supports_numeric_limit && <div className="mt-3 flex flex-wrap items-center gap-2 pl-7 text-sm">
                <select value={item.limit_type} onChange={(event) => updateEntitlement(feature.id, event.target.value === 'limited' ? { limit_type: 'limited', limit_value: 1, unit: feature.default_unit ?? 'units', reset_period: feature.allowed_reset_periods[0] ?? 'total' } : { limit_type: 'unlimited', limit_value: undefined, unit: undefined, reset_period: undefined })} className="rounded-lg border border-slate-700 bg-slate-900 p-1.5"><option value="limited">Up to</option><option value="unlimited">Unlimited</option></select>
                {item.limit_type === 'limited' && <><input required min="1" type="number" value={item.limit_value ?? 1} onChange={(event) => updateEntitlement(feature.id, { limit_value: Number(event.target.value) })} className="w-28 rounded-lg border border-slate-700 bg-slate-900 p-1.5" /><span className="text-slate-400">{feature.default_unit}</span>
                  <select value={item.reset_period} onChange={(event) => updateEntitlement(feature.id, { reset_period: event.target.value as ResetPeriod })} className="rounded-lg border border-slate-700 bg-slate-900 p-1.5">{feature.allowed_reset_periods.map((period) => <option key={period} value={period}>{resetLabel[period]}</option>)}</select></>}
              </div>}
            </div>;
          })}</div>
        </div>)}</div>
        {editing && <p className="mt-5 text-xs text-slate-400">Changes apply to new purchases and renewals. Customers on this plan keep their current price and limits until their term ends.</p>}
        {planMutation.isError && <p className="mt-4 text-sm text-red-300">{apiErrorMessage(planMutation.error, 'Plan validation failed. Check limits, code and prices.')}</p>}
        <button disabled={planMutation.isPending} className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold">{editing ? 'Save changes' : 'Create plan'}</button>
      </form></div>}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Archive, Copy, Eye, EyeOff, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  apiErrorMessage,
  deletePlan,
  getPlanUiSettings,
  listCoupons,
  listFeatures,
  listPlans,
  updatePlan,
  updatePlanUiSettings,
  type PlanUiSettings,
  type SubscriptionPlan,
} from '../../../services/controlApi';
import { useAuthStore } from '../../../store/authStore';
import { useProductStore } from '../../../store/productStore';
import { Toggle } from '../../../components/Toggle';
import { Subscriptions } from '../Subscriptions';
import { PlanCard } from './PlanCard';
import { PlanEditor } from './PlanEditor';
import { PlanArtworkImage } from './planVisuals';
import { cardOffer, featureDetail, resolveVisuals } from './planModel';

const TABS = [
  { key: 'plans', label: 'Plans' },
  { key: 'customers', label: 'Customers' },
  { key: 'plan-page', label: 'Plan page' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** Storefront items for every non-archived plan, keeping current order and visibility. */
function storefrontItems(settings: PlanUiSettings, plans: SubscriptionPlan[], change?: { planId: string; visible: boolean }) {
  return plans.filter((plan) => plan.status !== 'archived')
    .map((plan, index) => {
      const item = settings.items.find((entry) => entry.plan_id === plan.id);
      return { plan_id: plan.id, visible: change?.planId === plan.id ? change.visible : item?.visible ?? false, display_order: item?.display_order ?? 1000 + index, display_label: item?.display_label ?? null };
    })
    .sort((a, b) => a.display_order - b.display_order)
    .map((item, index) => ({ ...item, display_order: index }));
}

function Confetti({ onDone }: { onDone: () => void }) {
  const still = useReducedMotion();
  const [pieces] = useState(() => Array.from({ length: 36 }, (_, index) => ({ index, x: (Math.random() - 0.5) * 900, y: -200 - Math.random() * 380, rotate: Math.random() * 720, color: ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#fb7185'][index % 5] })));
  useEffect(() => { if (still) onDone(); }, [still, onDone]);
  if (still) return null;
  return <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
    {pieces.map((piece) => <motion.span key={piece.index} className="absolute h-3 w-2 rounded-sm" style={{ background: piece.color }} initial={{ x: 0, y: 120, opacity: 1, rotate: 0 }} animate={{ x: piece.x, y: [120, piece.y, piece.y + 700], opacity: [1, 1, 0], rotate: piece.rotate }} transition={{ duration: 1.8, ease: 'easeOut' }} onAnimationComplete={piece.index === 0 ? onDone : undefined} />)}
  </div>;
}

export function SubscriptionsHub() {
  const application = useProductStore((state) => state.selectedProduct);
  const isOwner = useAuthStore((state) => state.user?.role === 'owner');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((item) => item.key === params.get('tab')) ? params.get('tab') : 'plans') as Tab;
  const [editor, setEditor] = useState<{ plan: SubscriptionPlan | null; copy: SubscriptionPlan | null } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const appId = application?.id;
  const features = useQuery({ queryKey: ['features', appId], queryFn: () => listFeatures(appId!), enabled: Boolean(appId) });
  const plans = useQuery({ queryKey: ['plans', appId], queryFn: () => listPlans(appId!), enabled: Boolean(appId) });
  const coupons = useQuery({ queryKey: ['coupons', appId], queryFn: () => listCoupons(appId!), enabled: Boolean(appId) });
  const planUi = useQuery({ queryKey: ['plan-ui', appId], queryFn: () => getPlanUiSettings(appId!), enabled: Boolean(appId) });
  const [order, setOrder] = useState<string[] | null>(null);
  const featureById = useMemo(() => new Map(features.data?.map((feature) => [feature.id, feature]) ?? []), [features.data]);

  const refresh = () => Promise.all(['plans', 'plan-ui', 'coupons', 'application-overview'].map((key) => queryClient.invalidateQueries({ queryKey: [key, appId] })));
  const setVisible = async (planId: string, visible: boolean) => {
    const [settings, latest] = await Promise.all([getPlanUiSettings(appId!), listPlans(appId!)]);
    await updatePlanUiSettings(appId!, {
      recommended_plan_id: !visible && settings.recommended_plan_id === planId ? null : settings.recommended_plan_id,
      show_feature_comparison: settings.show_feature_comparison, show_billing_period_selector: settings.show_billing_period_selector,
      display_labels: settings.display_labels, items: storefrontItems(settings, latest, { planId, visible }),
    });
  };
  const action = useMutation({
    mutationFn: async ({ plan, kind }: { plan: SubscriptionPlan; kind: 'archive' | 'delete' | 'show' | 'hide' }) => {
      if (kind === 'delete') return deletePlan(appId!, plan.id);
      if (kind === 'archive') return void (await updatePlan(appId!, plan.id, { expected_version: plan.version, status: 'archived' }));
      return setVisible(plan.id, kind === 'show');
    },
    onMutate: () => { setNotice(null); setMenu(null); },
    onSuccess: async (_, { plan, kind }) => { await refresh(); setNotice({ kind: 'ok', text: { archive: `${plan.name} archived. Current customers keep it until their term ends.`, delete: `${plan.name} deleted.`, show: `${plan.name} is now on the plan page.`, hide: `${plan.name} is hidden from the plan page.` }[kind] }); },
    onError: (error) => setNotice({ kind: 'error', text: apiErrorMessage(error, 'That change was not saved.') }),
  });
  const storefront = useMutation({
    mutationFn: async (patch: { recommended_plan_id?: string | null; order?: string[] }) => {
      const [settings, latest] = await Promise.all([getPlanUiSettings(appId!), listPlans(appId!)]);
      const items = storefrontItems(settings, latest);
      const ranked = patch.order ? [...items].sort((a, b) => patch.order!.indexOf(a.plan_id) - patch.order!.indexOf(b.plan_id)).map((item, index) => ({ ...item, display_order: index })) : items;
      return updatePlanUiSettings(appId!, { recommended_plan_id: patch.recommended_plan_id !== undefined ? patch.recommended_plan_id : settings.recommended_plan_id, show_feature_comparison: settings.show_feature_comparison, show_billing_period_selector: settings.show_billing_period_selector, display_labels: settings.display_labels, items: ranked });
    },
    onSuccess: async () => { setOrder(null); await refresh(); setNotice({ kind: 'ok', text: 'Plan page updated. Apps show the change within a minute.' }); },
    onError: (error) => setNotice({ kind: 'error', text: apiErrorMessage(error, 'The plan page was not saved.') }),
  });

  if (!application) return null;
  const all = plans.data ?? [];
  const live = all.filter((plan) => plan.status === 'active');
  const drafts = all.filter((plan) => plan.status === 'draft');
  const recommendedId = planUi.data?.recommended_plan_id ?? null;
  const visibleIds = new Set(planUi.data?.items.filter((item) => item.visible).map((item) => item.plan_id));
  const couponById = new Map(coupons.data?.map((coupon) => [coupon.id, coupon]) ?? []);
  const storefrontOrder = order ?? [...all.filter((plan) => plan.status !== 'archived')].sort((a, b) => (planUi.data?.items.find((item) => item.plan_id === a.id)?.display_order ?? 999) - (planUi.data?.items.find((item) => item.plan_id === b.id)?.display_order ?? 999)).map((plan) => plan.id);

  const card = (plan: SubscriptionPlan) => {
    const visuals = resolveVisuals(plan, live, plan.id === recommendedId);
    const offer = plan.coupons_allowed && plan.offer_coupon_id ? couponById.get(plan.offer_coupon_id) : undefined;
    const liveOffer = offer && (offer.status === 'active' || offer.status === 'scheduled') && new Date(offer.ends_at).getTime() > openedAt ? offer : undefined;
    const shown = visibleIds.has(plan.id);
    return <motion.div key={plan.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
      <PlanCard recommended={plan.id === recommendedId} artwork={visuals.artwork} accent={visuals.accent} dimmed={plan.status === 'draft'}
        plan={{ ...plan, highlights: plan.highlights, offer: cardOffer(liveOffer), features: plan.entitlements.filter((item) => item.enabled).map((item) => ({ name: featureById.get(item.feature_id)?.name ?? 'Retired feature', detail: featureDetail(item, featureById.get(item.feature_id)) })) }}>
        <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-4">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${plan.status === 'active' ? (shown ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300') : 'bg-slate-800 text-slate-400'}`}>{plan.status === 'draft' ? 'Draft' : shown ? 'Live on plan page' : 'Live · hidden'}</span>
          {isOwner && <div className="relative flex items-center gap-1">
            <button onClick={() => setEditor({ plan, copy: null })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-blue-500/60"><Pencil className="h-3.5 w-3.5" />Edit</button>
            <button aria-label={`More actions for ${plan.name}`} onClick={() => setMenu(menu === plan.id ? null : plan.id)} className="rounded-lg border border-slate-700 p-1.5 hover:border-slate-500"><MoreHorizontal className="h-4 w-4" /></button>
            <AnimatePresence>{menu === plan.id && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute bottom-10 right-0 z-20 w-56 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 py-1 text-sm shadow-2xl">
              <button onClick={() => { setMenu(null); setEditor({ plan: null, copy: plan }); }} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-800"><Copy className="h-4 w-4" />Duplicate (e.g. yearly version)</button>
              {plan.status === 'active' && <button onClick={() => action.mutate({ plan, kind: shown ? 'hide' : 'show' })} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-800">{shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{shown ? 'Hide from plan page' : 'Show on plan page'}</button>}
              <button onClick={() => { if (window.confirm(`Archive ${plan.name}? It leaves the plan page. Customers already on it keep it until their term ends.`)) action.mutate({ plan, kind: 'archive' }); }} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-800"><Archive className="h-4 w-4" />Archive</button>
              <button onClick={() => { if (window.confirm(`Delete ${plan.name} permanently? Only plans no customer, coupon or notification has used can be deleted.`)) action.mutate({ plan, kind: 'delete' }); }} className="flex w-full items-center gap-2 px-3 py-2 text-red-300 hover:bg-slate-800"><Trash2 className="h-4 w-4" />Delete</button>
            </motion.div>}</AnimatePresence>
          </div>}
        </div>
      </PlanCard>
    </motion.div>;
  };

  return <div className="mx-auto max-w-7xl space-y-6 pb-16">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">{application.displayName}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Subscriptions</h1><p className="mt-1.5 text-slate-400">Create plans, choose what each one unlocks, and see who is subscribed.</p></div>
      {isOwner && tab === 'plans' && <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setEditor({ plan: null, copy: null })} disabled={!features.isSuccess} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 disabled:opacity-40"><Plus className="h-4 w-4" />Create plan</motion.button>}
    </header>

    <nav className="flex gap-1 border-b border-slate-800" aria-label="Subscription sections">
      {TABS.map((item) => <button key={item.key} onClick={() => setParams(item.key === 'plans' ? {} : { tab: item.key })} className={`relative px-4 py-2.5 text-sm font-medium transition ${tab === item.key ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
        {item.label}{item.key === 'plans' && all.length > 0 && <span className="ml-2 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{all.length}</span>}
        {tab === item.key && <motion.span layoutId="subscription-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-500" />}
      </button>)}
    </nav>

    <AnimatePresence>{notice && <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3.5 text-sm ${notice.kind === 'error' ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>{notice.text}</motion.p>}</AnimatePresence>

    {tab === 'plans' && <>
      {(plans.isError || features.isError) && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">Plans could not be loaded. Refresh the page to try again.</p>}
      {plans.isPending && <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="h-[440px] animate-pulse rounded-3xl bg-slate-900/60" />)}</div>}
      {plans.isSuccess && all.length === 0 && <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-800 px-6 py-16 text-center">
        <PlanArtworkImage artwork="rocket" accent={{ from: '#93c5fd', to: '#7c3aed', glow: 'rgba(124,58,237,0.4)', label: '' }} size={120} />
        <h2 className="mt-6 text-xl font-semibold">No plans yet</h2><p className="mt-2 max-w-md text-slate-400">Create your first plan: give it a name and price, switch on the features it includes, and publish it to {application.displayName}.</p>
        {isOwner && <button onClick={() => setEditor({ plan: null, copy: null })} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold"><Plus className="h-4 w-4" />Create plan</button>}
      </div>}
      {live.length > 0 && <section><h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Live · {live.length}</h2><div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"><AnimatePresence>{live.map(card)}</AnimatePresence></div></section>}
      {drafts.length > 0 && <section><h2 className="mb-4 mt-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Drafts · {drafts.length} <span className="normal-case tracking-normal text-slate-600">(customers can't see these)</span></h2><div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"><AnimatePresence>{drafts.map(card)}</AnimatePresence></div></section>}
    </>}

    {tab === 'customers' && <Subscriptions embedded />}

    {tab === 'plan-page' && <section className="max-w-3xl space-y-4">
      <p className="text-sm text-slate-400">Choose which live plans {application.displayName} shows, their order, and the one to highlight as recommended.</p>
      <div className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800">
        {storefrontOrder.map((planId, index) => {
          const plan = all.find((item) => item.id === planId);
          if (!plan) return null;
          const visuals = resolveVisuals(plan, live, plan.id === recommendedId);
          const move = (step: number) => { const next = [...storefrontOrder]; next.splice(index, 1); next.splice(index + step, 0, planId); setOrder(next); };
          return <div key={plan.id} className="flex items-center gap-4 bg-slate-950/40 p-4">
            <div className="flex flex-col"><button aria-label="Move up" disabled={!isOwner || index === 0} onClick={() => move(-1)} className="text-slate-500 hover:text-white disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button><button aria-label="Move down" disabled={!isOwner || index === storefrontOrder.length - 1} onClick={() => move(1)} className="text-slate-500 hover:text-white disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button></div>
            <PlanArtworkImage artwork={visuals.artwork === 'none' ? 'sparkles' : visuals.artwork} accent={visuals.accent} size={40} />
            <div className="min-w-0 flex-1"><p className="font-medium">{plan.name}</p><p className="text-xs text-slate-500">{Number(plan.price) === 0 ? 'Free' : `₹${Number(plan.price).toLocaleString('en-IN')} / ${plan.duration_value > 1 ? `${plan.duration_value} ` : ''}${plan.duration_unit}${plan.duration_value > 1 ? 's' : ''}`} · {plan.status === 'draft' ? 'draft — publish it first' : 'live'}</p></div>
            <button disabled={!isOwner || plan.status !== 'active' || storefront.isPending} onClick={() => storefront.mutate({ recommended_plan_id: plan.id === recommendedId ? null : plan.id })} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs disabled:opacity-30 ${plan.id === recommendedId ? 'border-violet-500 bg-violet-500/15 text-violet-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}><Star className="h-3.5 w-3.5" />{plan.id === recommendedId ? 'Recommended' : 'Recommend'}</button>
            <Toggle label={`Show ${plan.name} on plan page`} disabled={!isOwner || plan.status !== 'active' || action.isPending} checked={visibleIds.has(plan.id)} onChange={(on) => action.mutate({ plan, kind: on ? 'show' : 'hide' })} />
          </div>;
        })}
        {storefrontOrder.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No plans yet.</p>}
      </div>
      {order && <div className="flex gap-2"><button disabled={storefront.isPending} onClick={() => storefront.mutate({ order })} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">Save order</button><button onClick={() => setOrder(null)} className="rounded-xl px-4 py-2 text-sm text-slate-400">Undo</button></div>}
    </section>}

    {editor && appId && <PlanEditor applicationId={appId} editing={editor.plan} copyOf={editor.copy} plans={all} features={features.data ?? []} coupons={coupons.data ?? []} recommendedPlanId={recommendedId} canManageStorefront={isOwner}
      onClose={() => setEditor(null)}
      onSaved={async (plan, published) => {
        const wasLive = editor.plan?.status === 'active';
        if (published && !wasLive && isOwner) {
          try { await setVisible(plan.id, true); } catch { setNotice({ kind: 'error', text: `${plan.name} is published but could not be added to the plan page. Use the Plan page tab.` }); }
        }
        setEditor(null);
        await refresh();
        if (published && !wasLive) setCelebrate(true);
        setNotice((current) => current?.kind === 'error' ? current : { kind: 'ok', text: published ? (wasLive ? `${plan.name} updated. Apps pick up the change within a minute.` : `${plan.name} is live! It appears in ${application.displayName} within a minute.`) : `${plan.name} saved as a draft.` });
      }} />}
    {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
  </div>;
}

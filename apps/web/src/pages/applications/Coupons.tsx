import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, TicketPercent, Trash2, X } from 'lucide-react';
import {
  apiErrorMessage,
  createCoupon,
  deleteCoupon,
  listAffiliates,
  listCoupons,
  listPlans,
  updateCoupon,
  type Coupon,
} from '../../services/controlApi';
import { useAuthStore } from '../../store/authStore';
import { useProductStore } from '../../store/productStore';

const toInput = (value: Date | string) => new Date(new Date(value).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const emptyForm = () => ({
  name: '', code: '', kind: 'promotion' as 'promotion' | 'affiliate', affiliate_id: '',
  discount_type: 'percentage' as 'percentage' | 'fixed', discount_value: '10', currency: 'INR',
  commission_type: 'percentage' as 'percentage' | 'fixed', commission_value: '10',
  starts_at: toInput(new Date()), ends_at: toInput(new Date(Date.now() + 365 * 86_400_000)),
  maximum_redemptions: 100, per_subscriber_limit: 1, first_subscription_only: false, plan_ids: [] as string[],
});

export function Coupons() {
  const application = useProductStore((state) => state.selectedProduct);
  const isOwner = useAuthStore((state) => state.user?.role === 'owner');
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [actionError, setActionError] = useState('');
  const coupons = useQuery({ queryKey: ['coupons', application?.id], queryFn: () => listCoupons(application!.id), enabled: Boolean(application) });
  const plans = useQuery({ queryKey: ['plans', application?.id], queryFn: () => listPlans(application!.id), enabled: Boolean(application) });
  const affiliates = useQuery({ queryKey: ['affiliates', application?.id], queryFn: () => listAffiliates(application!.id), enabled: Boolean(application) });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['coupons', application?.id] }), queryClient.invalidateQueries({ queryKey: ['application-overview', application?.id] })]);
  const close = () => { setShowForm(false); setEditing(null); setForm(emptyForm()); };

  const save = useMutation({
    mutationFn: () => {
      const dates = { starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString() };
      if (editing) {
        const unused = editing.redemption_count === 0;
        return updateCoupon(application!.id, editing.id, {
          expected_version: editing.version, name: form.name, ...dates,
          maximum_redemptions: form.maximum_redemptions, per_subscriber_limit: form.per_subscriber_limit,
          first_subscription_only: form.first_subscription_only, plan_ids: form.plan_ids,
          ...(unused ? { discount_value: form.discount_value, ...(editing.kind === 'affiliate' ? { commission_value: form.commission_value } : {}) } : {}),
        });
      }
      const partner = form.kind === 'affiliate';
      return createCoupon(application!.id, {
        name: form.name, code: form.code.toUpperCase(), kind: form.kind, ...dates,
        discount_type: form.discount_type, discount_value: form.discount_value,
        currency: form.discount_type === 'fixed' ? form.currency.toUpperCase() : undefined,
        maximum_redemptions: form.maximum_redemptions, per_subscriber_limit: form.per_subscriber_limit,
        first_subscription_only: form.first_subscription_only, plan_ids: form.plan_ids,
        status: new Date(form.starts_at) > new Date() ? 'scheduled' : 'active',
        ...(partner ? {
          affiliate_id: form.affiliate_id, commission_type: form.commission_type, commission_value: form.commission_value,
          commission_currency: form.commission_type === 'fixed' ? form.currency.toUpperCase() : undefined,
        } : {}),
      });
    },
    onSuccess: async () => { close(); await refresh(); },
  });
  const action = useMutation({
    mutationFn: async ({ coupon, kind }: { coupon: Coupon; kind: 'toggle' | 'delete' }) => {
      if (kind === 'delete') await deleteCoupon(application!.id, coupon.id);
      else await updateCoupon(application!.id, coupon.id, { expected_version: coupon.version, status: coupon.status === 'disabled' ? 'active' : 'disabled' });
    },
    onMutate: () => setActionError(''),
    onSuccess: refresh,
    onError: (error) => setActionError(apiErrorMessage(error, 'The coupon could not be changed.')),
  });

  if (!application) return null;
  const planNames = new Map(plans.data?.map((plan) => [plan.id, plan.name]) ?? []);
  const partnerNames = new Map(affiliates.data?.map((partner) => [partner.id, partner.company_name || partner.contact_name]) ?? []);
  const activePartners = affiliates.data?.filter((partner) => partner.status === 'active') ?? [];
  const submit = (event: FormEvent) => { event.preventDefault(); save.mutate(); };
  const togglePlan = (id: string) => setForm((value) => ({ ...value, plan_ids: value.plan_ids.includes(id) ? value.plan_ids.filter((item) => item !== id) : [...value.plan_ids, id] }));
  const startEdit = (coupon: Coupon) => {
    setEditing(coupon);
    setForm({
      ...emptyForm(), name: coupon.name, code: coupon.code, kind: coupon.kind, affiliate_id: coupon.affiliate_id ?? '',
      discount_type: coupon.discount_type, discount_value: String(Number(coupon.discount_value)), currency: coupon.currency ?? coupon.commission_currency ?? 'INR',
      commission_type: coupon.commission_type ?? 'percentage', commission_value: coupon.commission_value ? String(Number(coupon.commission_value)) : '10',
      starts_at: toInput(coupon.starts_at), ends_at: toInput(coupon.ends_at), maximum_redemptions: coupon.maximum_redemptions,
      per_subscriber_limit: coupon.per_subscriber_limit ?? 1, first_subscription_only: coupon.first_subscription_only, plan_ids: coupon.plan_ids,
    });
    setShowForm(true);
  };
  const locked = Boolean(editing && editing.redemption_count > 0);
  const input = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 disabled:opacity-50';

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">{application.displayName}</p><h1 className="mt-2 text-3xl font-bold">Coupons</h1><p className="mt-2 text-slate-400">Promotions and partner codes for this application only. Customers enter them at checkout.</p></div>{isOwner && <button onClick={() => { setEditing(null); setForm(emptyForm()); setShowForm(true); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold"><Plus className="mr-2 inline h-4 w-4" />New coupon</button>}</header>
    {actionError && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">{actionError}</div>}
    {coupons.isError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">Unable to load coupons for this application.</div>}
    <div className="grid gap-4 md:grid-cols-2">{coupons.data?.map((coupon) => <article key={coupon.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/10 text-violet-400"><TicketPercent className="h-5 w-5" /></span><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${coupon.status === 'disabled' ? 'bg-slate-500/10 text-slate-400' : 'bg-blue-500/10 text-blue-300'}`}>{coupon.status}</span></div>
      <h2 className="mt-4 text-lg font-semibold">{coupon.name}</h2><p className="mt-1 font-mono text-sm text-violet-300">{coupon.code}</p>
      <p className="mt-4 text-2xl font-bold">{coupon.discount_type === 'percentage' ? `${Number(coupon.discount_value)}%` : `${coupon.currency} ${Number(coupon.discount_value)}`} off</p>
      {coupon.kind === 'affiliate' && <p className="mt-1 text-xs text-emerald-300">Partner: {partnerNames.get(coupon.affiliate_id ?? '') ?? 'Unknown'} · earns {coupon.commission_type === 'percentage' ? `${Number(coupon.commission_value)}%` : `${coupon.commission_currency} ${Number(coupon.commission_value)}`}</p>}
      <div className="mt-4 flex justify-between text-xs text-slate-500"><span>{coupon.plan_ids.length ? coupon.plan_ids.map((id) => planNames.get(id) ?? id).join(', ') : 'All eligible plans'}</span><span>{coupon.redemption_count}/{coupon.maximum_redemptions} used · until {new Date(coupon.ends_at).toLocaleDateString()}</span></div>
      {isOwner && <div className="mt-4 flex flex-wrap gap-2 text-xs"><button onClick={() => startEdit(coupon)} className="rounded-lg border border-slate-700 px-3 py-1.5"><Pencil className="mr-1 inline h-3.5 w-3.5" />Edit</button><button disabled={action.isPending} onClick={() => action.mutate({ coupon, kind: 'toggle' })} className="rounded-lg border border-slate-700 px-3 py-1.5">{coupon.status === 'disabled' ? 'Enable' : 'Disable'}</button><button disabled={action.isPending} onClick={() => { if (window.confirm(`Delete coupon ${coupon.code}? Coupons that have been used can only be disabled.`)) action.mutate({ coupon, kind: 'delete' }); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-red-300"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Delete</button></div>}
    </article>)}{coupons.data?.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">No coupons configured for this application.</div>}</div>

    {showForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4"><form onSubmit={submit} className="my-8 w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div className="flex justify-between"><h2 className="text-xl font-semibold">{editing ? `Edit ${editing.code}` : 'Create coupon'}</h2><button type="button" onClick={close}><X className="h-5 w-5" /></button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={input} /></label>
        <label className="text-sm">Code<input required disabled={Boolean(editing)} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} className={`${input} font-mono uppercase`} /></label>
        <label className="text-sm">Type<select disabled={Boolean(editing)} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as 'promotion' | 'affiliate' })} className={input}><option value="promotion">Promotion</option><option value="affiliate">Partner (affiliate) code</option></select></label>
        {form.kind === 'affiliate' && <label className="text-sm">Partner<select required disabled={Boolean(editing)} value={form.affiliate_id} onChange={(event) => setForm({ ...form, affiliate_id: event.target.value })} className={input}><option value="">Choose a partner</option>{(editing ? affiliates.data ?? [] : activePartners).map((partner) => <option key={partner.id} value={partner.id}>{partner.company_name || partner.contact_name}</option>)}</select></label>}
        <label className="text-sm">Discount type<select disabled={Boolean(editing)} value={form.discount_type} onChange={(event) => setForm({ ...form, discount_type: event.target.value as 'percentage' | 'fixed' })} className={input}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
        <label className="text-sm">Discount value<input required disabled={locked} min="0.01" step="0.01" type="number" value={form.discount_value} onChange={(event) => setForm({ ...form, discount_value: event.target.value })} className={input} /></label>
        {form.kind === 'affiliate' && <><label className="text-sm">Commission type<select disabled={Boolean(editing)} value={form.commission_type} onChange={(event) => setForm({ ...form, commission_type: event.target.value as 'percentage' | 'fixed' })} className={input}><option value="percentage">% of amount paid</option><option value="fixed">Fixed amount</option></select></label>
        <label className="text-sm">Commission value<input required disabled={locked} min="0.01" step="0.01" type="number" value={form.commission_value} onChange={(event) => setForm({ ...form, commission_value: event.target.value })} className={input} /></label></>}
        {(form.discount_type === 'fixed' || (form.kind === 'affiliate' && form.commission_type === 'fixed')) && <label className="text-sm">Currency<input required disabled={Boolean(editing)} maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} className={`${input} uppercase`} /></label>}
        <label className="text-sm">Maximum uses<input required min={editing?.redemption_count || 1} type="number" value={form.maximum_redemptions} onChange={(event) => setForm({ ...form, maximum_redemptions: Number(event.target.value) })} className={input} /></label>
        <label className="text-sm">Uses per customer<input required min="1" type="number" value={form.per_subscriber_limit} onChange={(event) => setForm({ ...form, per_subscriber_limit: Number(event.target.value) })} className={input} /></label>
        <label className="text-sm">Starts<input required type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} className={input} /></label>
        <label className="text-sm">Ends<input required type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} className={input} /></label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.first_subscription_only} onChange={(event) => setForm({ ...form, first_subscription_only: event.target.checked })} />First subscription only</label>
        <fieldset className="sm:col-span-2"><legend className="text-sm">Plan scope <span className="text-slate-500">(none means all eligible plans)</span></legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{plans.data?.map((plan) => <label key={plan.id} className="flex items-center gap-2 rounded-lg border border-slate-800 p-2 text-sm"><input type="checkbox" checked={form.plan_ids.includes(plan.id)} onChange={() => togglePlan(plan.id)} />{plan.name}</label>)}</div></fieldset>
      </div>
      {locked && <p className="mt-4 text-xs text-slate-400">This coupon has been used, so its discount and commission are fixed. Disable it and create a new one to change them.</p>}
      {form.kind === 'affiliate' && !editing && activePartners.length === 0 && <p className="mt-4 text-xs text-amber-300">Add an active partner on the Affiliates page first.</p>}
      {save.isError && <p className="mt-4 text-sm text-red-300">{apiErrorMessage(save.error, 'Coupon could not be saved. Check code uniqueness, dates, value, and plan scope.')}</p>}
      <button disabled={save.isPending} className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold">{editing ? 'Save changes' : 'Create coupon'}</button>
    </form></div>}
  </div>;
}

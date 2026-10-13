import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Subscriber, Subscription, SubscriptionPlan } from '../../services/controlApi';
import { createRazorpayOrder, listRazorpay, loadCheckout, reconcileRazorpay, verifyRazorpay, type RazorpayOrder } from '../../services/razorpay';

export function RazorpayPanel({ applicationId, subscribers, plans, subscriptions }: {
  applicationId: string; subscribers: Subscriber[]; plans: SubscriptionPlan[]; subscriptions: Subscription[];
}) {
  const queryClient = useQueryClient();
  const orders = useQuery({ queryKey: ['razorpay', applicationId], queryFn: () => listRazorpay(applicationId) });
  const [form, setForm] = useState({ subscriber_id: '', plan_id: '', previous_subscription_id: '', reason: '' });
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const update = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); setRequestKey(crypto.randomUUID()); setMessage(''); };
  const refresh = async () => { await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['razorpay', applicationId] }),
    queryClient.invalidateQueries({ queryKey: ['subscriptions', applicationId] }),
    queryClient.invalidateQueries({ queryKey: ['application-overview', applicationId] }),
  ]); };
  const report = (order: RazorpayOrder) => {
    if (order.status === 'paid') setMessage('Captured payment verified. Subscription activated.');
    else if (order.status === 'review') setMessage('Payment recorded, but administrator review is required. Do not pay again.');
    else if (order.status === 'refunded') setMessage('Refund verified; this paid term is cancelled.');
    else setMessage('Payment is not yet confirmed. Wait for the webhook or reconcile; do not pay again.');
  };
  const open = async (order: RazorpayOrder) => {
    if (order.status !== 'ready' || !order.order_id) { report(order); setBusy(false); return; }
    await loadCheckout();
    if (!window.Razorpay) throw new Error('Razorpay unavailable');
    const checkout = new window.Razorpay({
      key: order.key_id, order_id: order.order_id, amount: order.amount_minor,
      currency: order.currency, name: 'Charis OS', description: 'Subscription plan term',
      modal: { ondismiss: () => { setBusy(false); setMessage('Checkout closed. Existing order remains available below; do not create a duplicate payment.'); void refresh(); } },
      handler: (result) => { void (async () => {
        try { report(await verifyRazorpay(applicationId, result)); }
        catch { setMessage('Confirmation pending. Do not pay again. Webhook/reconciliation will verify the payment.'); }
        finally { setBusy(false); await refresh(); }
      })(); },
    });
    checkout.open();
  };
  const pay = async () => {
    setBusy(true); setMessage('');
    try {
      const previous = subscriptions.find((item) => item.id === form.previous_subscription_id);
      const order = await createRazorpayOrder(applicationId, {
        subscriber_id: form.subscriber_id, plan_id: form.plan_id, reason: form.reason,
        idempotency_key: requestKey,
        ...(previous ? { previous_subscription_id: previous.id, previous_version: previous.version } : {}),
      });
      await refresh();
      await open(order);
    } catch { setMessage('Checkout could not start. Check current subscription and configuration. Review saved orders before retrying; the same request key is retained.'); setBusy(false); await refresh(); }
  };
  const reconcile = async (order: RazorpayOrder) => {
    const paymentId = window.prompt('Razorpay payment ID (pay_…) from the merchant dashboard. Verification is server-side.')?.trim();
    if (!paymentId) return;
    setBusy(true);
    try { report(await reconcileRazorpay(applicationId, order.id, paymentId)); }
    catch { setMessage('Reconciliation rejected or provider unavailable. Check the payment/order in Razorpay; do not charge again.'); }
    finally { setBusy(false); await refresh(); }
  };
  if (orders.isPending) return <p className="text-slate-400">Loading payment configuration…</p>;
  if (orders.isError) return <p role="alert" className="text-red-300">Payment configuration could not load.</p>;
  if (!orders.data.enabled) return <p className="rounded-xl border border-slate-700 p-4 text-slate-400">Razorpay is disabled. Configure backend keys and webhook before enabling checkout.</p>;
  return <section className="space-y-4 rounded-xl border border-slate-700 p-5">
    <h2 className="text-lg font-semibold">Razorpay checkout · {orders.data.mode.toUpperCase()} mode</h2>
    <p className="text-sm text-slate-400">One-time payment for a full plan term. INR only. No auto-debit, coupons, tax calculation, carry-over or proration. Plan price is the final amount charged. Replacement starts immediately after captured-payment verification.</p>
    <form onSubmit={(event) => { event.preventDefault(); void pay(); }} className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">Subscriber<select required disabled={busy} value={form.subscriber_id} onChange={(event) => update({ subscriber_id: event.target.value, previous_subscription_id: '' })} className="mt-1 w-full rounded bg-slate-950 p-2"><option value="">Select active subscriber</option>{subscribers.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm">Plan<select required disabled={busy} value={form.plan_id} onChange={(event) => update({ plan_id: event.target.value })} className="mt-1 w-full rounded bg-slate-950 p-2"><option value="">Select plan</option>{plans.filter((item) => item.status === 'active' && item.currency === 'INR' && Number(item.price) >= 1).map((item) => <option key={item.id} value={item.id}>{item.name} · INR {item.price}</option>)}</select></label>
      <label className="text-sm">Replace / renew term<select disabled={busy} value={form.previous_subscription_id} onChange={(event) => update({ previous_subscription_id: event.target.value })} className="mt-1 w-full rounded bg-slate-950 p-2"><option value="">First subscription (no current term)</option>{subscriptions.filter((item) => item.subscriber_id === form.subscriber_id && ['active', 'suspended', 'expired'].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.commercial_snapshot.plan_name} · {item.status} · {item.id.slice(0, 8)}</option>)}</select></label>
      <label className="text-sm">Reason<textarea required minLength={5} maxLength={500} disabled={busy} value={form.reason} onChange={(event) => update({ reason: event.target.value })} className="mt-1 w-full rounded bg-slate-950 p-2" /></label>
      <button disabled={busy} className="rounded bg-blue-600 p-3 disabled:opacity-40">{busy ? 'Payment in progress…' : 'Create order & pay'}</button>
    </form>
    {message && <p role="status" className="rounded bg-slate-800 p-3 text-sm">{message}</p>}
    <h3 className="font-semibold">Recent payment orders</h3>
    {orders.data.checkouts.length === 0 && <p className="text-sm text-slate-400">No orders yet.</p>}
    {orders.data.checkouts.map((order) => <div key={order.id} className="flex flex-wrap items-center gap-3 border-t border-slate-800 py-3 text-sm"><span className="flex-1">{order.order_id ?? 'Order creation unconfirmed'} · INR {(order.amount_minor / 100).toLocaleString()} · {order.status}<small className="block text-slate-500">Checkout {order.id} · {new Date(order.created_at).toLocaleString()}</small></span>{order.status === 'ready' && <button disabled={busy} onClick={() => { setBusy(true); void open(order).catch(() => { setBusy(false); setMessage('Checkout unavailable; retry this existing order.'); }); }} className="rounded border border-blue-500 p-2">Resume checkout</button>}<button disabled={busy} onClick={() => { void reconcile(order); }} className="rounded border border-slate-600 p-2">Reconcile payment</button></div>)}
  </section>;
}

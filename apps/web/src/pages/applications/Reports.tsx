import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BarChart3, Download, ReceiptText, TicketPercent, Users } from 'lucide-react';
import { exportReport, getReportSummary, type ExportReportType } from '../../services/controlApi';
import { useProductStore } from '../../store/productStore';

const inputDate = (date: Date) => date.toISOString().slice(0, 10);
const REPORT_TODAY = new Date();
const REPORT_DEFAULT_START = new Date(REPORT_TODAY.getTime() - 30 * 86_400_000);

export function Reports() {
  const application = useProductStore((state) => state.selectedProduct);
  const [startsOn, setStartsOn] = useState(inputDate(REPORT_DEFAULT_START));
  const [endsOn, setEndsOn] = useState(inputDate(REPORT_TODAY));
  const startsAt = new Date(`${startsOn}T00:00:00`).toISOString();
  const endsAt = new Date(`${endsOn}T23:59:59.999`).toISOString();
  const summary = useQuery({ queryKey: ['reports', application?.id, startsAt, endsAt], queryFn: () => getReportSummary(application!.id, startsAt, endsAt), enabled: Boolean(application) });
  const exportMutation = useMutation({ mutationFn: (type: ExportReportType) => exportReport(application!.id, type, startsAt, endsAt), onSuccess: ({ blob, filename, truncated }) => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); if (truncated) window.alert('The export reached the 10,000-row safety limit. Reduce the date range for a complete file.'); } });
  if (!application) return null;
  const cards = [
    { label: 'New subscribers', value: summary.data?.new_subscribers ?? 0, icon: Users },
    { label: 'New subscriptions', value: summary.data?.new_subscriptions ?? 0, icon: ReceiptText },
    { label: 'Active subscriptions', value: summary.data?.active_subscriptions ?? 0, icon: BarChart3 },
    { label: 'Coupon redemptions', value: summary.data?.coupon_redemptions ?? 0, icon: TicketPercent },
  ];
  const exports: Array<{ type: ExportReportType; label: string }> = [
    { type: 'subscriptions', label: 'Subscriptions' }, { type: 'payments', label: 'Payments' },
    { type: 'coupon_redemptions', label: 'Coupon redemptions' }, { type: 'affiliate_commissions', label: 'Affiliate commissions' },
    { type: 'usage_events', label: 'Usage events' },
  ];

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">{application.displayName}</p><h1 className="mt-2 text-3xl font-bold">Reports</h1><p className="mt-2 text-slate-400">Application-isolated performance, revenue, promotion and usage reporting.</p></div><div className="flex gap-3"><label className="text-xs text-slate-400">From<input type="date" value={startsOn} max={endsOn} onChange={(event) => setStartsOn(event.target.value)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label><label className="text-xs text-slate-400">To<input type="date" value={endsOn} min={startsOn} onChange={(event) => setEndsOn(event.target.value)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label></div></header>
    {summary.isError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">Unable to load this report range.</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><card.icon className="h-5 w-5 text-blue-400" /><p className="mt-5 text-3xl font-bold">{card.value.toLocaleString()}</p><p className="mt-1 text-sm text-slate-400">{card.label}</p></div>)}</div>
    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><h2 className="font-semibold">Collected revenue</h2><div className="mt-4 space-y-3">{summary.data?.collected_revenue_by_currency.map((item) => <div key={item.currency} className="flex justify-between rounded-xl bg-slate-950/60 p-3"><span>{item.currency}</span><span className="font-semibold">{Number(item.amount).toLocaleString()} <span className="text-xs font-normal text-slate-500">from {item.count}</span></span></div>)}{summary.data?.collected_revenue_by_currency.length === 0 && <p className="text-sm text-slate-500">No successful payments in this range.</p>}</div></section><section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><h2 className="font-semibold">Active plan distribution</h2><div className="mt-4 space-y-3">{summary.data?.plan_distribution.map((item) => <div key={item.plan_id} className="flex justify-between rounded-xl bg-slate-950/60 p-3"><span>{item.plan_name}</span><span className="font-semibold">{item.active_subscriptions}</span></div>)}{summary.data?.plan_distribution.length === 0 && <p className="text-sm text-slate-500">No active subscriptions.</p>}</div></section></div>
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><h2 className="font-semibold">CSV exports</h2><p className="mt-1 text-sm text-slate-500">Exports use the selected date range and are capped at 10,000 rows.</p><div className="mt-4 flex flex-wrap gap-2">{exports.map((item) => <button key={item.type} disabled={exportMutation.isPending} onClick={() => exportMutation.mutate(item.type)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-blue-500 disabled:opacity-40"><Download className="mr-2 inline h-4 w-4" />{item.label}</button>)}</div>{exportMutation.isError && <p className="mt-3 text-sm text-red-300">Export failed. Reduce the date range and try again.</p>}</section>
  </div>;
}

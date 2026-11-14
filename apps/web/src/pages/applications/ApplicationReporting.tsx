import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { controlApi } from '../../services/controlApi';

interface Summary {
  generated_at: string;
  customers: { total: number; active_30d: number; new_in_range: number };
  users: { total: number; enabled: number; active_24h: number; active_7d: number };
  usage: { projects: number; photos: number; photo_storage_bytes: number };
  metrics?: { label: string; value: number }[];
}
interface Customers {
  page: number; page_size: number; total: number;
  items: { external_id: string; company: string; owner: string | null; email: string | null;
    phone: string | null; status: 'active' | 'disabled'; last_active_at: string | null;
    users: number; projects: number }[];
  count_label?: string | null;
}

export function ApplicationReporting({ appId }: { appId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const summary = useQuery({
    queryKey: ['application-reporting', appId],
    queryFn: async () => (await controlApi.get<Summary>(`/apps/${appId}/overview/application-summary`)).data,
    retry: false, staleTime: 60_000,
  });
  const customers = useQuery({
    queryKey: ['application-customers', appId, page, search],
    queryFn: async () => (await controlApi.get<Customers>(`/apps/${appId}/overview/application-customers`, { params: { page, page_size: 25, search } })).data,
    enabled: summary.isSuccess, retry: false, staleTime: 60_000,
  });
  return <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Application activity</h2><p className="mt-1 text-sm text-slate-400">Company and activity data reported by this application. Subscription revenue remains in OS.</p></div>
      <button disabled={summary.isFetching || customers.isFetching} onClick={() => { void summary.refetch(); if (summary.isSuccess) void customers.refetch(); }} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-50">Refresh activity</button>
    </div>
    {summary.isPending && <p className="text-sm text-slate-400">Loading application activity…</p>}
    {summary.isError && <p role="status" className="text-sm text-amber-300">Application reporting is unavailable or not configured. Subscription records remain available.</p>}
    {summary.data && <>
      <p className="text-xs text-slate-500">Reported {new Date(summary.data.generated_at).toLocaleString()}{summary.isError ? ' · last successful response' : ''}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ['Companies', summary.data.customers.total], ['Active companies (30 days)', summary.data.customers.active_30d],
        ['Active users (24 hours)', summary.data.users.active_24h],
        // Apps report their own numbers as metrics (Bill Easy: invoices, items...); Civil reports projects.
        ...(summary.data.metrics?.length ? summary.data.metrics.map((metric) => [metric.label, metric.value.toLocaleString('en-IN')]) : [['Projects', summary.data.usage.projects]]),
      ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-950 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(draft.trim()); }}>
        <input aria-label="Search application customers" maxLength={100} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Search company, email, phone or city" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" />
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm">Search</button>
      </form>
      {customers.isPending && <p className="text-sm text-slate-400">Loading customers…</p>}
      {customers.isError && <p role="status" className="text-sm text-amber-300">Customer data is unavailable. Viewing it requires subscriber permissions.</p>}
      {customers.data && <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr><th className="p-2">Company</th><th className="p-2">Contact</th><th className="p-2">Status</th><th className="p-2">Users / {customers.data.count_label ?? 'projects'}</th><th className="p-2">Last active</th></tr></thead><tbody>{customers.data.items.map((item) => <tr key={item.external_id} className="border-t border-slate-800"><td className="p-2">{item.company}<p className="text-xs text-slate-500">{item.owner}</p></td><td className="p-2">{item.email ?? '—'}<p className="text-xs text-slate-500">{item.phone}</p></td><td className="p-2">{item.status}</td><td className="p-2">{item.users} / {item.projects}</td><td className="p-2">{item.last_active_at ? new Date(item.last_active_at).toLocaleString() : 'Not recorded'}</td></tr>)}</tbody></table></div>
        {customers.data.items.length === 0 && <p className="text-sm text-slate-400">No matching customers.</p>}
        <div className="flex items-center justify-between text-sm"><button disabled={page <= 1 || customers.isFetching} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Previous</button><span>Page {page} · {customers.data.total} customers</span><button disabled={page * customers.data.page_size >= customers.data.total || customers.isFetching} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Next</button></div>
      </>}
    </>}
  </section>;
}

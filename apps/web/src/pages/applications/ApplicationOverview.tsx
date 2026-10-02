import { Activity, ExternalLink, Server, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getApplicationOverview } from '../../services/controlApi';
import { useProductStore } from '../../store/productStore';

export function ApplicationOverview() {
  const application = useProductStore((state) => state.selectedProduct);
  const overview = useQuery({
    queryKey: ['application-overview', application?.id],
    queryFn: () => getApplicationOverview(application!.id),
    enabled: Boolean(application),
  });

  if (!application) return null;

  const details = [
    { label: 'Environment', value: application.environment },
    { label: 'Registry status', value: application.status },
    { label: 'Configuration version', value: String(application.version) },
    { label: 'Health contract', value: application.healthPath },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-400">Selected application</p>
          <h1 className="text-3xl font-bold tracking-tight">{application.displayName}</h1>
          <p className="mt-2 text-slate-400">Registry and integration status for this application only.</p>
        </div>
        {application.frontendUrl && <a href={application.frontendUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-blue-500/50 hover:text-white">Open application <ExternalLink className="h-4 w-4" /></a>}
      </header>

      {overview.isError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">The scoped overview endpoint is unavailable. No fallback or cross-application data was used.</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Subscribers', overview.data?.counts.subscribers],
          ['Subscriptions', overview.data?.counts.subscriptions],
          ['Active', overview.data?.counts.active_subscriptions],
          ['Plans', overview.data?.counts.plans],
          ['Active coupons', overview.data?.counts.active_coupons],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-100">{overview.isPending ? '—' : (value ?? 0)}</p></div>)}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {details.map((detail) => <div key={detail.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{detail.label}</p><p className="mt-2 truncate font-medium capitalize text-slate-100">{detail.value}</p></div>)}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-4 flex items-center gap-3"><Server className="h-5 w-5 text-blue-400" /><h2 className="font-semibold">Control API boundary</h2></div>
          <p className="break-all rounded-lg bg-slate-950 p-3 font-mono text-sm text-slate-300">{application.apiBaseUrl}</p>
          <p className="mt-4 text-sm leading-6 text-slate-400">Operational data will be read through this authenticated adapter. The Control Centre never connects directly to the application database.</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <div className="mb-4 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-400" /><h2 className="font-semibold">Isolation active</h2></div>
          <p className="text-sm leading-6 text-slate-300">The application ID is carried in the URL and enforced by backend permission dependencies. There is no all-applications customer or revenue view.</p>
          <div className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400"><Activity className="h-4 w-4" />{overview.data?.latest_health ? `${overview.data.latest_health.status} · checked ${new Date(overview.data.latest_health.checked_at).toLocaleString()}` : 'Awaiting first adapter health check'}</div>
        </div>
      </section>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMonitoring, handleMonitorAlert, runMonitorCheck, type HealthState, type MonitorAlert } from '../../services/controlApi';
import { useProductStore } from '../../store/productStore';

const STATE: Record<HealthState, { label: string; dot: string; text: string }> = {
  healthy: { label: 'Healthy', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  degraded: { label: 'Errors', dot: 'bg-amber-400', text: 'text-amber-300' },
  critical: { label: 'Down', dot: 'bg-red-500', text: 'text-red-300' },
  unknown: { label: 'Not checked', dot: 'bg-slate-500', text: 'text-slate-400' },
};
const SEVERITY: Record<MonitorAlert['severity'], string> = {
  critical: 'border-red-500/40 bg-red-500/10 text-red-200',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  low: 'border-slate-600 bg-slate-800/60 text-slate-300',
};
const EVENT_LABEL: Record<string, string> = {
  login_failed: 'Failed logins', token_reuse: 'Token reuse', brute_force_detected: 'Brute force flagged',
  tenant_access_denied: 'Other-business access refused', permission_denied: 'Permission refused',
  rate_limited: 'Rate limited', plan_limit_reached: 'Plan limit reached',
  subscription_check_failed: 'Plan checks failed', suspicious_activity: 'Suspicious activity', account_deleted: 'Accounts deleted',
};
const when = (value: string) => new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function AlertCard({ alert, appId }: { alert: MonitorAlert; appId: string }) {
  const queryClient = useQueryClient();
  const act = useMutation({
    mutationFn: (action: 'acknowledge' | 'resolve') => handleMonitorAlert(appId, alert.id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitoring', appId] }),
  });
  const detail = alert.detail as { tenants?: string[]; ip_address?: string; actor_ref?: string; count?: number; summary?: string };
  return (
    <div className={`rounded-xl border p-4 ${alert.status === 'resolved' ? 'border-slate-800 bg-slate-900/40 text-slate-400' : SEVERITY[alert.severity]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{alert.severity} · {alert.status}{alert.occurrences > 1 ? ` · seen ${alert.occurrences}×` : ''}</p>
          <p className="mt-1 font-semibold">{alert.title}</p>
          <p className="mt-1 text-xs opacity-80">
            {detail.count !== undefined && <>{detail.count} events in 10 minutes. </>}
            {detail.ip_address && <>Address {detail.ip_address}. </>}
            {detail.actor_ref && <>Account {detail.actor_ref}. </>}
            {detail.summary && <>{detail.summary}. </>}
            First seen {when(alert.first_seen_at)}, last {when(alert.last_seen_at)}.
          </p>
          {!!detail.tenants?.length && <p className="mt-2 text-xs">Businesses involved: {detail.tenants.map((tenant) => <code key={tenant} className="mr-1 rounded bg-black/30 px-1.5 py-0.5">{tenant}</code>)} <Link to={`/apps/${appId}/users`} className="underline">Open Users to restrict</Link></p>}
        </div>
        {alert.status !== 'resolved' && (
          <div className="flex gap-2">
            {alert.status === 'open' && <button disabled={act.isPending} onClick={() => act.mutate('acknowledge')} className="rounded-lg border border-current/30 px-3 py-1.5 text-xs font-semibold hover:bg-white/5 disabled:opacity-50">Acknowledge</button>}
            <button disabled={act.isPending} onClick={() => act.mutate('resolve')} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-50">Resolve</button>
          </div>
        )}
      </div>
      {act.isError && <p className="mt-2 text-xs text-red-300">Only users who can manage settings can change alerts.</p>}
    </div>
  );
}

export function Monitoring() {
  const application = useProductStore((state) => state.selectedProduct);
  const queryClient = useQueryClient();
  const monitoring = useQuery({
    queryKey: ['monitoring', application?.id],
    queryFn: () => getMonitoring(application!.id),
    enabled: Boolean(application),
    refetchInterval: 60_000,
  });
  const checkNow = useMutation({
    mutationFn: () => runMonitorCheck(application!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitoring', application?.id] }),
  });
  if (!application) return null;
  const data = monitoring.data;
  const latest = data?.latest;
  const open = data?.alerts.filter((alert) => alert.status !== 'resolved') ?? [];
  const past = data?.alerts.filter((alert) => alert.status === 'resolved') ?? [];
  const counts = Object.entries(data?.event_counts_24h ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-400">{application.displayName}</p>
          <h1 className="text-3xl font-bold tracking-tight">Monitoring</h1>
          <p className="mt-2 text-slate-400">Health checks every few minutes, security events from the app, and alerts that need you.</p>
        </div>
        <button onClick={() => checkNow.mutate()} disabled={checkNow.isPending} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-blue-500/50 disabled:opacity-50">
          {checkNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
        </button>
      </header>

      {monitoring.isError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">Monitoring data is unavailable.</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 md:col-span-2">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><Activity className="h-4 w-4" />Health now</p>
          {latest ? (
            <>
              <p className={`mt-3 flex items-center gap-2 text-2xl font-bold ${STATE[latest.status].text}`}><span className={`h-3 w-3 rounded-full ${STATE[latest.status].dot}`} />{STATE[latest.status].label}</p>
              <p className="mt-1 text-sm text-slate-400">Backend {STATE[latest.backend].label.toLowerCase()} · Website {STATE[latest.website].label.toLowerCase()}{latest.latency_ms !== null ? ` · ${latest.latency_ms} ms` : ''} · {when(latest.checked_at)}</p>
              {latest.summary && <p className="mt-2 text-sm text-amber-300">{latest.summary}</p>}
            </>
          ) : <p className="mt-3 text-sm text-slate-400">No checks yet. Turn on the monitor (MONITOR_ENABLED=true) or press Check now.</p>}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Uptime, last 24 h</p>
          <p className="mt-3 text-2xl font-bold">{data?.uptime_24h ?? '—'}{data?.uptime_24h !== null && data?.uptime_24h !== undefined ? '%' : ''}</p>
          <p className="mt-1 text-sm text-slate-400">{data?.checks_24h ?? 0} checks</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Open alerts</p>
          <p className={`mt-3 text-2xl font-bold ${open.length ? 'text-orange-300' : 'text-emerald-300'}`}>{open.length}</p>
          <p className="mt-1 text-sm text-slate-400">{open.length ? 'Need your attention' : 'All clear'}</p>
        </div>
      </section>

      {!!data?.timeline.length && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Last {data.timeline.length} checks</p>
          <div className="flex h-8 items-end gap-0.5" role="img" aria-label="Health timeline">
            {data.timeline.map((point) => <span key={point.at} title={`${when(point.at)}: ${STATE[point.status].label}${point.latency_ms !== null ? `, ${point.latency_ms} ms` : ''}`} className={`h-full flex-1 rounded-sm ${STATE[point.status].dot}`} />)}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-orange-300" />Alerts</h2>
        {open.length === 0 && <p className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4" />No open alerts.</p>}
        {open.map((alert) => <AlertCard key={alert.id} alert={alert} appId={application.id} />)}
        {!!past.length && <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"><summary className="cursor-pointer text-sm text-slate-400">Resolved alerts ({past.length})</summary><div className="mt-3 space-y-2">{past.map((alert) => <AlertCard key={alert.id} alert={alert} appId={application.id} />)}</div></details>}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="h-5 w-5 text-blue-300" />Security events, last 24 h</h2>
        {counts.length === 0 ? <p className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">No events reported. Apps send failed logins, refused cross-business access, rate limits and plan-check failures here.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{counts.map(([type, count]) => <div key={type} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs text-slate-500">{EVENT_LABEL[type] ?? type}</p><p className="mt-1 text-xl font-bold">{count.toLocaleString('en-IN')}</p></div>)}</div>
        )}
        {!!data?.recent_events.length && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Event</th><th className="px-4 py-2">Business</th><th className="px-4 py-2">Account</th><th className="px-4 py-2">Address</th><th className="px-4 py-2">Path</th></tr></thead>
              <tbody>{data.recent_events.map((event, index) => <tr key={index} className="border-t border-slate-800 text-slate-300"><td className="whitespace-nowrap px-4 py-2">{when(event.occurred_at)}</td><td className="px-4 py-2">{EVENT_LABEL[event.type] ?? event.type}</td><td className="px-4 py-2 font-mono text-xs">{event.tenant_id ?? '—'}</td><td className="px-4 py-2 font-mono text-xs">{event.actor_ref ?? '—'}</td><td className="px-4 py-2 font-mono text-xs">{event.ip ?? '—'}</td><td className="px-4 py-2 font-mono text-xs">{event.path ?? '—'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

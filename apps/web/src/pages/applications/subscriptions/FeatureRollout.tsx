import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Gift, Search, X } from 'lucide-react';
import { apiErrorMessage, applyFeatureRollout, previewFeatureRollout, type SubscriptionPlan } from '../../../services/controlApi';

/**
 * Give a plan's newer features to customers who bought it earlier.
 * Customers keep what they bought; this only adds features or raises limits, never removes.
 */
export function FeatureRollout({ applicationId, plan, onClose, onDone }: {
  applicationId: string;
  plan: SubscriptionPlan;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const preview = useQuery({ queryKey: ['feature-rollout', applicationId, plan.id], queryFn: () => previewFeatureRollout(applicationId, plan.id) });
  // null = not changed yet: start with every missing feature and everyone missing one.
  const [pickedFeatures, setFeatures] = useState<Set<string> | null>(null);
  const [pickedCustomers, setCustomers] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState('');

  const missing = useMemo(() => {
    const codes = new Set<string>();
    preview.data?.subscribers.forEach((row) => row.changes.forEach((change) => codes.add(change.feature_code)));
    return codes;
  }, [preview.data]);
  const features = pickedFeatures ?? missing;
  const customers = useMemo(() => pickedCustomers ?? new Set((preview.data?.subscribers ?? []).filter((row) => row.changes.length).map((row) => row.subscription_id)), [pickedCustomers, preview.data]);

  const gains = (row: NonNullable<typeof preview.data>['subscribers'][number]) => row.changes.filter((change) => features.has(change.feature_code));
  const rows = (preview.data?.subscribers ?? []).filter((row) => !search || `${row.name} ${row.email ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const chosen = (preview.data?.subscribers ?? []).filter((row) => customers.has(row.subscription_id) && gains(row).length);
  const toggle = (set: Set<string>, value: string, update: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    update(next);
  };

  const apply = useMutation({
    mutationFn: () => applyFeatureRollout(applicationId, plan.id, { subscription_ids: chosen.map((row) => row.subscription_id), feature_codes: [...features] }),
    onSuccess: (result) => onDone(`${result.updated_subscriptions} customer${result.updated_subscriptions === 1 ? '' : 's'} on ${plan.name} got ${result.features_added} feature update${result.features_added === 1 ? '' : 's'}. Their app shows it within a minute.`),
  });

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="rollout-title">
    <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="rollout-title" className="flex items-center gap-2 text-xl font-semibold"><Gift className="h-5 w-5 text-violet-300" />Give new features to existing customers</h2>
          <p className="mt-1 text-sm text-slate-400">Customers on <span className="text-slate-200">{plan.name}</span> keep the features they bought. Choose who gets the features this plan has now. This only adds features or raises limits. Nothing is ever taken away, and switching a feature off on the plan doesn't affect existing customers.</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
      </div>

      {preview.isPending && <div className="mt-6 h-40 animate-pulse rounded-xl bg-slate-800/60" />}
      {preview.isError && <p className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{apiErrorMessage(preview.error, 'Could not load the customers on this plan.')}</p>}

      {preview.data && (preview.data.subscribers.length === 0
        ? <p className="mt-6 rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">No current customers on this plan.</p>
        : missing.size === 0
          ? <p className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">All {preview.data.subscribers.length} customers on this plan already have every feature it includes.</p>
          : <>
            <section className="mt-6">
              <h3 className="text-sm font-semibold text-slate-300">1. Features to give</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {preview.data.features.filter((feature) => missing.has(feature.feature_code)).map((feature) => {
                  const count = preview.data.subscribers.filter((row) => row.changes.some((change) => change.feature_code === feature.feature_code)).length;
                  return <label key={feature.feature_code} className="flex items-center gap-3 rounded-lg border border-slate-800 p-2.5 text-sm">
                    <input type="checkbox" checked={features.has(feature.feature_code)} onChange={() => toggle(features, feature.feature_code, setFeatures)} />
                    <span className="min-w-0 flex-1"><span className="block truncate">{feature.feature_name}</span><span className="text-xs text-slate-500">{feature.grant} · {count} customer{count === 1 ? '' : 's'} missing it</span></span>
                  </label>;
                })}
              </div>
            </section>

            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-300">2. Customers who get them</h3>
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => setCustomers(new Set(preview.data.subscribers.filter((row) => gains(row).length).map((row) => row.subscription_id)))} className="rounded-md border border-slate-700 px-2 py-1 hover:border-slate-500">Select all</button>
                  <button onClick={() => setCustomers(new Set())} className="rounded-md border border-slate-700 px-2 py-1 hover:border-slate-500">Select none</button>
                </div>
              </div>
              <label className="mt-2 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3"><Search className="h-4 w-4 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="w-full bg-transparent py-2 text-sm outline-none" /></label>
              <div className="mt-2 max-h-80 divide-y divide-slate-800 overflow-y-auto rounded-xl border border-slate-800">
                {rows.map((row) => {
                  const theirs = gains(row);
                  return <label key={row.subscription_id} className={`flex items-start gap-3 p-3 text-sm ${theirs.length ? '' : 'opacity-50'}`}>
                    <input type="checkbox" className="mt-1" disabled={!theirs.length} checked={customers.has(row.subscription_id) && theirs.length > 0} onChange={() => toggle(customers, row.subscription_id, setCustomers)} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{row.name}</span>{row.status !== 'active' && <span className="ml-2 rounded bg-amber-500/10 px-1.5 text-xs text-amber-300">{row.status}</span>}
                      <span className="block text-xs text-slate-500">{row.email ?? 'No email'}{row.ends_at ? ` · renews or ends ${new Date(row.ends_at).toLocaleDateString('en-IN')}` : ''}</span>
                      <span className="mt-1 block text-xs text-slate-400">{theirs.length ? theirs.map((change) => `${change.feature_name}: ${change.current} → ${change.new}`).join(' · ') : 'Already has the chosen features'}</span>
                    </span>
                  </label>;
                })}
                {rows.length === 0 && <p className="p-4 text-center text-sm text-slate-500">No match.</p>}
              </div>
            </section>

            {apply.isError && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{apiErrorMessage(apply.error, 'Nothing was changed. Try again.')}</p>}
            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button disabled={!chosen.length || !features.size || apply.isPending}
                onClick={() => { if (window.confirm(`Give ${features.size} feature${features.size === 1 ? '' : 's'} to ${chosen.length} customer${chosen.length === 1 ? '' : 's'} on ${plan.name}? This can't be undone from here.`)) apply.mutate(); }}
                className="rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {apply.isPending ? 'Applying…' : `Give to ${chosen.length} customer${chosen.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>)}
    </div>
  </div>;
}

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Copy, Package, Plus, Server, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  createApplication,
  listApplications,
  type CreateApplicationPayload,
  type IssuedCredential,
} from '../../services/controlApi';
import { useAuthStore } from '../../store/authStore';

const initialForm: CreateApplicationPayload = {
  name: '',
  slug: '',
  control_api_base_url: '',
  health_path: '/control/v1/health',
  environment: 'staging',
};

export function ApplicationSelection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOwner = useAuthStore((state) => state.user?.role === 'owner');
  const applications = useQuery({ queryKey: ['applications'], queryFn: listApplications });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateApplicationPayload>(initialForm);
  const [credential, setCredential] = useState<IssuedCredential | null>(null);
  const [copied, setCopied] = useState(false);
  const createMutation = useMutation({
    mutationFn: createApplication,
    onSuccess: async (result) => {
      setCredential(result.credential);
      setShowForm(false);
      setForm(initialForm);
      await queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] px-6 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-blue-400">Control Centre</p>
            <h1 className="text-3xl font-bold tracking-tight">Choose an application</h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              Subscribers, plans, coupons, reports, and settings remain isolated inside the application you select.
            </p>
          </div>
          {isOwner && (
            <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold hover:bg-blue-500">
              <Plus className="h-4 w-4" /> Add application
            </button>
          )}
        </header>

        {applications.isPending && <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-slate-400">Loading applications…</div>}
        {applications.isError && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-300">Application registry is unavailable. Check the API connection and try again.</div>}
        {applications.data?.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">No applications are available for your account.</div>}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {applications.data?.map((application) => (
            <button key={application.id} onClick={() => navigate(`/apps/${application.id}/overview`)} className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-left shadow-xl shadow-black/10 transition hover:-translate-y-1 hover:border-blue-500/50">
              <div className="mb-7 flex items-start justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400"><Package className="h-6 w-6" /></span>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">{application.environment}</span>
              </div>
              <h2 className="text-xl font-semibold group-hover:text-blue-300">{application.displayName}</h2>
              <p className="mt-1 font-mono text-xs text-slate-500">{application.productName}</p>
              <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
                <span className="flex min-w-0 items-center gap-2"><Server className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{new URL(application.apiBaseUrl).host}</span></span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-semibold">Register application</h2><button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-blue-500" /></label>
              <label className="text-sm text-slate-300">Slug<input required value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase() })} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-white outline-none focus:border-blue-500" placeholder="bill-easy" /></label>
              <label className="sm:col-span-2 text-sm text-slate-300">Control API base URL<input required type="url" value={form.control_api_base_url} onChange={(event) => setForm({ ...form, control_api_base_url: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-white outline-none focus:border-blue-500" placeholder="https://app.example.com/control/v1" /></label>
              <label className="text-sm text-slate-300">Environment<select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value as CreateApplicationPayload['environment'] })} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></label>
              <label className="text-sm text-slate-300">Health path<input required value={form.health_path} onChange={(event) => setForm({ ...form, health_path: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-white outline-none focus:border-blue-500" /></label>
            </div>
            {createMutation.isError && <p className="mt-4 text-sm text-red-300">Unable to register this application. Verify the URL, slug, and your permissions.</p>}
            <button disabled={createMutation.isPending} className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">{createMutation.isPending ? 'Registering…' : 'Register application'}</button>
          </form>
        </div>
      )}

      {credential && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-amber-400/30 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-amber-400/10 text-amber-300"><Check className="h-5 w-5" /></span><div><h2 className="font-semibold">Application registered</h2><p className="text-sm text-amber-200/70">Copy this credential now. It will not be shown again.</p></div></div>
            <div className="break-all rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm text-slate-200">{credential.secret}</div>
            <div className="mt-5 flex gap-3"><button onClick={async () => { await navigator.clipboard.writeText(credential.secret); setCopied(true); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold"><Copy className="h-4 w-4" />{copied ? 'Copied' : 'Copy credential'}</button><button onClick={() => { setCredential(null); setCopied(false); }} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm">Done</button></div>
          </div>
        </div>
      )}
    </main>
  );
}

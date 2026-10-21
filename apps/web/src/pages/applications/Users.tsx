import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronLeft, ChevronRight, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import {
  apiErrorMessage,
  getUser,
  listAffiliates,
  listPlans,
  listUsers,
  restoreUser,
  restrictUser,
  type AppUser,
  type AppUserSubscription,
  type UserAccess,
  type UserFilters,
} from '../../services/controlApi';
import { useAuthStore } from '../../store/authStore';
import { useProductStore } from '../../store/productStore';

const PAGE_SIZE = 50;

const ACCESS: Record<UserAccess, { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  pending: { label: 'Starting soon', tone: 'bg-sky-500/10 text-sky-300 border-sky-500/20' },
  expired: { label: 'Expired', tone: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  cancelled: { label: 'Cancelled', tone: 'bg-slate-500/10 text-slate-300 border-slate-500/20' },
  suspended: { label: 'Suspended', tone: 'bg-orange-500/10 text-orange-300 border-orange-500/20' },
  no_plan: { label: 'No plan', tone: 'bg-slate-500/10 text-slate-400 border-slate-600/30' },
  restricted: { label: 'Restricted', tone: 'bg-red-500/10 text-red-300 border-red-500/30' },
};

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const money = (amount: string | number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount));
const titleCase = (value: string | null) => (value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '—');

function AccessPill({ user }: { user: Pick<AppUser, 'access'> }) {
  const access = ACCESS[user.access];
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${access.tone}`}>{access.label}</span>;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function Users() {
  const application = useProductStore((state) => state.selectedProduct);
  const [search, setSearch] = useState('');
  const [access, setAccess] = useState<UserAccess | ''>('');
  const [planId, setPlanId] = useState('');
  const [coupon, setCoupon] = useState('');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useDebounced(search.trim());

  const filters: UserFilters = {
    q: query || undefined,
    access: access || undefined,
    plan_id: planId || undefined,
    coupon: coupon === 'used' || coupon === 'none' ? coupon : undefined,
    affiliate_id: coupon.startsWith('affiliate:') ? coupon.slice('affiliate:'.length) : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  const users = useQuery({
    queryKey: ['users', application?.id, filters],
    queryFn: () => listUsers(application!.id, filters),
    enabled: Boolean(application),
    placeholderData: (previous) => previous,
  });
  const plans = useQuery({ queryKey: ['plans', application?.id], queryFn: () => listPlans(application!.id), enabled: Boolean(application) });
  const affiliates = useQuery({ queryKey: ['affiliates', application?.id], queryFn: () => listAffiliates(application!.id), enabled: Boolean(application) });
  if (!application) return null;

  const total = users.data?.total ?? 0;
  const filtered = Boolean(query || access || planId || coupon);
  const select = 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">{application.displayName}</p>
        <h1 className="mt-2 text-3xl font-bold">Users</h1>
        <p className="mt-2 text-slate-400">
          Everyone who signed up in {application.displayName}. Details come from the app and are read-only here.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
            placeholder="Search name, email, mobile or user ID"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <select aria-label="Status" value={access} onChange={(event) => { setAccess(event.target.value as UserAccess | ''); setPage(0); }} className={select}>
          <option value="">All statuses</option>
          {(Object.keys(ACCESS) as UserAccess[]).map((key) => <option key={key} value={key}>{ACCESS[key].label}</option>)}
        </select>
        <select aria-label="Plan" value={planId} onChange={(event) => { setPlanId(event.target.value); setPage(0); }} className={select}>
          <option value="">All plans</option>
          {plans.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
        <select aria-label="Coupon" value={coupon} onChange={(event) => { setCoupon(event.target.value); setPage(0); }} className={select}>
          <option value="">Any coupon</option>
          <option value="used">Used a coupon</option>
          <option value="none">No coupon</option>
          {affiliates.data?.map((affiliate) => (
            <option key={affiliate.id} value={`affiliate:${affiliate.id}`}>Via {affiliate.company_name || affiliate.contact_name}</option>
          ))}
        </select>
      </div>

      {users.isError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">Unable to load users.</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="p-4">User</th>
              <th className="p-4">Contact</th>
              <th className="p-4">Plan</th>
              <th className="p-4">Subscribed</th>
              <th className="p-4">Ends</th>
              <th className="p-4">Coupon</th>
              <th className="p-4">Last active</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.data?.items.map((user) => (
              <tr key={user.id} onClick={() => setOpenId(user.id)} className="cursor-pointer bg-slate-950/30 hover:bg-slate-900/60">
                <td className="p-4">
                  <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-400"><UserRound className="h-4 w-4" /></span>
                    <span>
                      <span className="block font-medium text-slate-100">{user.contact_name || user.business_name}</span>
                      {user.contact_name && <span className="block text-xs text-slate-500">{user.business_name}</span>}
                    </span>
                  </span>
                </td>
                <td className="p-4 text-slate-400">
                  <span className="block">{user.email ?? '—'}</span>
                  <span className="block text-xs">{user.mobile_number ?? ''}</span>
                </td>
                <td className="p-4">
                  {user.subscription ? (
                    <>
                      <span className="block text-slate-200">{user.subscription.plan_name}</span>
                      <span className="block text-xs text-slate-500">{user.subscription.billing}</span>
                    </>
                  ) : <span className="text-slate-500">—</span>}
                </td>
                <td className="whitespace-nowrap p-4 text-slate-400">{date(user.subscription?.starts_at)}</td>
                <td className="whitespace-nowrap p-4 text-slate-400">{date(user.subscription?.ends_at)}</td>
                <td className="p-4">
                  {user.subscription?.coupon ? (
                    <>
                      <span className="block font-mono text-xs text-slate-200">{user.subscription.coupon.code}</span>
                      <span className="block text-xs text-slate-500">{user.subscription.coupon.affiliate_name ?? 'Promotion'}</span>
                    </>
                  ) : <span className="text-slate-500">—</span>}
                </td>
                <td className="whitespace-nowrap p-4 text-slate-400">{date(user.last_active_at)}</td>
                <td className="p-4">
                  <AccessPill user={user} />
                  {user.inactive_since && <span className="mt-1 block text-xs text-slate-500">since {date(user.inactive_since)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.data?.items.length === 0 && (
          <p className="p-8 text-center text-slate-500">
            {filtered ? 'No users match these filters.' : `No one has signed up in ${application.displayName} yet. Users appear here automatically.`}
          </p>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>{page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}</span>
          <span className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-700 p-2 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-700 p-2 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </span>
        </div>
      )}
      {total > 0 && total <= PAGE_SIZE && <p className="text-sm text-slate-500">{total} {total === 1 ? 'user' : 'users'}</p>}

      {openId && <UserPanel applicationId={application.id} appName={application.displayName} userId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-200">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">{title}</h3>
      {children}
    </section>
  );
}

function TermRow({ term }: { term: AppUserSubscription }) {
  return (
    <tr>
      <td className="py-2 pr-3 text-slate-200">{term.plan_name}<span className="block text-xs text-slate-500">{term.billing} · {money(term.price, term.currency)}</span></td>
      <td className="py-2 pr-3 text-slate-400">{date(term.starts_at)} – {date(term.ends_at)}</td>
      <td className="py-2 pr-3 text-slate-400">{term.coupon ? `${term.coupon.code}${term.coupon.affiliate_name ? ` · ${term.coupon.affiliate_name}` : ''}` : '—'}</td>
      <td className="py-2 capitalize text-slate-400">{term.status}</td>
    </tr>
  );
}

function UserPanel({ applicationId, appName, userId, onClose }: { applicationId: string; appName: string; userId: string; onClose: () => void }) {
  const isOwner = useAuthStore((state) => state.user?.role === 'owner');
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const detail = useQuery({ queryKey: ['user', applicationId, userId], queryFn: () => getUser(applicationId, userId) });
  const user = detail.data;
  const restricted = Boolean(user?.restricted_at);
  const change = useMutation({
    mutationFn: () => (restricted ? restoreUser(applicationId, userId, reason.trim()) : restrictUser(applicationId, userId, reason.trim())),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['user', applicationId, userId], updated);
      setConfirming(false);
      setReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users', applicationId] }),
        queryClient.invalidateQueries({ queryKey: ['application-overview', applicationId] }),
      ]);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside onClick={(event) => event.stopPropagation()} className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{user ? user.contact_name || user.business_name : 'Loading…'}</h2>
            {user && <p className="mt-1 text-sm text-slate-400">{user.business_name}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {detail.isError && <p className="mt-6 text-red-300">Unable to load this user.</p>}
        {user && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <AccessPill user={user} />
              {user.inactive_since && <span className="text-sm text-slate-400">Inactive since {date(user.inactive_since)}</span>}
              <span className="text-sm text-slate-500">Read-only · synced from {appName} {dateTime(user.profile_synced_at)}</span>
            </div>

            <Section title="Personal">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Name">{user.contact_name ?? '—'}</Field>
                <Field label="User ID in app"><span className="font-mono text-xs">{user.contact_user_id ?? '—'}</span></Field>
                <Field label="Email">{user.email ?? '—'}</Field>
                <Field label="Mobile">{user.mobile_number ?? '—'}</Field>
                <Field label="Gender">{titleCase(user.gender)}</Field>
                <Field label="Date of birth">{date(user.date_of_birth)}</Field>
              </dl>
            </Section>

            <Section title="Business">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Business name">{user.business_name}</Field>
                <Field label="Account ID in app"><span className="font-mono text-xs">{user.external_id}</span></Field>
                <Field label="Location">{user.location ?? '—'}</Field>
                <Field label="Team members">{user.team_size ?? '—'}</Field>
              </dl>
            </Section>

            <Section title="Activity">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Joined the app">{date(user.joined_at)}</Field>
                <Field label="Subscriber since">{date(user.first_subscribed_at)}</Field>
                <Field label="Last active">{dateTime(user.last_active_at)}</Field>
                <Field label="Inactive since">{date(user.inactive_since)}</Field>
              </dl>
            </Section>

            <Section title="Subscription">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Current plan">{user.subscription ? `${user.subscription.plan_name} (${user.subscription.billing})` : 'No plan'}</Field>
                <Field label="Price">{user.subscription ? money(user.subscription.price, user.subscription.currency) : '—'}</Field>
                <Field label="Subscribed on">{date(user.subscription?.starts_at)}</Field>
                <Field label="Ends on">{date(user.subscription?.ends_at)}</Field>
                <Field label="Coupon applied">{user.subscription?.coupon ? `${user.subscription.coupon.code} (saved ${money(user.subscription.coupon.discount_amount)})` : '—'}</Field>
                <Field label="Affiliate program">{user.subscription?.coupon?.affiliate_name ?? (user.subscription?.coupon ? 'Promotion (no affiliate)' : '—')}</Field>
                <Field label="Total paid (after refunds)">{money(user.total_paid)}</Field>
              </dl>
              {user.subscriptions.length > 1 && (
                <table className="mt-4 w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-2">Plan</th><th className="pb-2">Term</th><th className="pb-2">Coupon</th><th className="pb-2">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-800">{user.subscriptions.map((term) => <TermRow key={term.id} term={term} />)}</tbody>
                </table>
              )}
            </Section>

            {user.payments.length > 0 && (
              <Section title="Payments">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-2">Date</th><th className="pb-2">Amount</th><th className="pb-2">Status</th><th className="pb-2">Reference</th></tr></thead>
                  <tbody className="divide-y divide-slate-800">
                    {user.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="py-2 text-slate-400">{date(payment.paid_at)}</td>
                        <td className="py-2 text-slate-200">{money(payment.amount, payment.currency)}{Number(payment.net_amount) !== Number(payment.amount) && <span className="block text-xs text-slate-500">net {money(payment.net_amount, payment.currency)}</span>}</td>
                        <td className="py-2 capitalize text-slate-400">{payment.status.replace('_', ' ')}</td>
                        <td className="py-2 font-mono text-xs text-slate-500">{payment.provider_payment_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {restricted && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                <p className="font-semibold">Restricted on {dateTime(user.restricted_at)}</p>
                <p className="mt-1">{user.restriction_reason}</p>
                <p className="mt-2 text-red-300/80">This user cannot sign in to {appName}, use it or buy a plan until the restriction is removed.</p>
              </div>
            )}

            {isOwner && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                className={restricted
                  ? 'flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 py-3 text-sm font-semibold text-emerald-300'
                  : 'flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-3 text-sm font-semibold text-white'}
              >
                {restricted ? <><ShieldCheck className="h-4 w-4" />Remove restriction</> : <><Ban className="h-4 w-4" />Restrict user</>}
              </button>
            )}
            {isOwner && confirming && (
              <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
                <p className="text-sm text-slate-300">
                  {restricted
                    ? `${user.contact_name || user.business_name} will be able to use ${appName} again. Their current plan is unchanged.`
                    : `${user.contact_name || user.business_name} and their team will be blocked from ${appName} within a minute. Their data and paid plan are kept.`}
                </p>
                <label className="block text-sm">
                  {restricted ? 'Note (kept in the audit log)' : 'Reason (kept in the audit log)'}
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5"
                    rows={3}
                    placeholder={restricted ? 'Why access is being returned' : 'What the user did'}
                  />
                </label>
                {change.isError && <p className="text-sm text-red-300">{apiErrorMessage(change.error, 'The change could not be saved.')}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setConfirming(false); setReason(''); }} className="flex-1 rounded-lg border border-slate-700 py-2.5 text-sm">Cancel</button>
                  <button disabled={change.isPending || reason.trim().length < 5} className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${restricted ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {restricted ? 'Remove restriction' : 'Restrict user'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

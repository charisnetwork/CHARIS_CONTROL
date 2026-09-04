import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Users } from 'lucide-react';
import { useProductStore } from '../../store/productStore';

const apiBase = (import.meta.env.VITE_Control_api_Backend || 'https://chariscontrol-production.up.railway.app').replace(/\/+$/, '');

/** Customers are downstream tenants. We deliberately do not manufacture rows
 * when the selected product has not supplied a secured control adapter. */
export function CustomersList() {
  const { selectedProduct, isAllApplications } = useProductStore();
  const { data, isLoading, error } = useQuery({
    queryKey: ['customers', selectedProduct?.id],
    enabled: !isAllApplications && !!selectedProduct?.id,
    queryFn: async () => (await axios.get(`${apiBase}/api/customers`, { params: { applicationId: selectedProduct?.id } })).data,
  });
  const customers = data?.data || [];
  if (isAllApplications || !selectedProduct) return <div className="text-slate-400">Select one application to view its tenant customers.</div>;
  if (isLoading) return <div className="text-slate-400">Loading tenants…</div>;
  if (error) return <div className="text-rose-400">The product customer adapter is unavailable or has not been configured.</div>;
  return <div className="space-y-6 w-full">
    <div><h2 className="text-2xl font-semibold text-white">Customers / tenants</h2><p className="text-gray-400 text-sm mt-1">Operational tenant data from {selectedProduct.displayName}, combined with Control Centre subscription status.</p></div>
    <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <table className="w-full text-left text-sm"><thead className="text-slate-400"><tr><th className="p-4">Tenant</th><th className="p-4">Owner</th><th className="p-4">Current plan</th><th className="p-4">Subscription</th><th className="p-4">Entitlement</th></tr></thead>
        <tbody>{customers.length ? customers.map((customer: any) => <tr key={customer.tenantId} className="border-t border-[var(--border-color)] text-slate-300"><td className="p-4"><div className="flex items-center gap-2"><Users className="w-4 h-4 text-blue-400"/><span>{customer.companyName}</span></div><div className="text-xs text-slate-500">{customer.tenantId}</div></td><td className="p-4">{customer.owner?.name || '—'}<div className="text-xs text-slate-500">{customer.email || '—'}</div></td><td className="p-4">{customer.controlCentreSubscription?.plan?.name || customer.subscription?.plan?.name || 'Unassigned'}</td><td className="p-4">{customer.controlCentreSubscription?.status || customer.subscription?.status || 'None'}</td><td className="p-4">{customer.controlCentreSubscription?.entitlementStatus || 'Not issued'}</td></tr>) : <tr><td className="p-8 text-center text-slate-500" colSpan={5}>No tenant customers were returned by this application.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}

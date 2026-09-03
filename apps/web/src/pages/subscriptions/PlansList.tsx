import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AlertCircle, Archive, CheckCircle, Edit2, Plus, X } from 'lucide-react';
import { useProductStore } from '../../store/productStore';

const API_BASE = (import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '');
const DURATIONS = [1, 3, 6, 12, 24, 36];

type PriceOption = { durationMonths: number; baseAmount: number | string; currency?: string; isActive?: boolean };
type Plan = {
  id: string; name: string; code: string; description?: string | null; order: number; isActive: boolean;
  priceOptions?: PriceOption[];
  featureEntitlements?: Array<{ id: string; isEnabled: boolean; limitValue?: string | null; feature: { code: string; name: string } }>;
};
type PlanForm = { name: string; code: string; description: string; order: number; isActive: boolean; priceOptions: PriceOption[] };

const emptyForm = (): PlanForm => ({
  name: '', code: '', description: '', order: 0, isActive: true,
  priceOptions: DURATIONS.map((durationMonths) => ({ durationMonths, baseAmount: 0, currency: 'INR', isActive: true })),
});
const toAmount = (value: number | string | undefined) => Number(value || 0);
const formatMoney = (amount: number | string | undefined, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(toAmount(amount));

export const PlansList = () => {
  const { selectedProduct, isAllApplications } = useProductStore();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<PlanForm>(emptyForm());

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ['plans', selectedProduct?.id],
    queryFn: async () => (await axios.get(`${API_BASE}/api/plans?productId=${selectedProduct?.id}`)).data,
    enabled: !isAllApplications && Boolean(selectedProduct?.id),
  });
  const invalidatePlans = () => queryClient.invalidateQueries({ queryKey: ['plans', selectedProduct?.id] });
  const closeModal = () => { setIsModalOpen(false); setEditingPlan(null); };
  const payload = () => ({ applicationId: selectedProduct?.id, ...formData });
  const createPlanMutation = useMutation({ mutationFn: () => axios.post(`${API_BASE}/api/plans`, payload()), onSuccess: () => { void invalidatePlans(); closeModal(); } });
  const updatePlanMutation = useMutation({ mutationFn: ({ id }: { id: string }) => axios.put(`${API_BASE}/api/plans/${id}`, payload()), onSuccess: () => { void invalidatePlans(); closeModal(); } });
  const archivePlanMutation = useMutation({ mutationFn: (id: string) => axios.put(`${API_BASE}/api/plans/${id}`, { applicationId: selectedProduct?.id, isActive: false }), onSuccess: () => { void invalidatePlans(); } });

  const openModal = (plan?: Plan) => {
    if (!plan) { setEditingPlan(null); setFormData(emptyForm()); }
    else {
      const byDuration = new Map((plan.priceOptions || []).map((option) => [option.durationMonths, option]));
      setEditingPlan(plan);
      setFormData({ name: plan.name, code: plan.code, description: plan.description || '', order: plan.order || 0, isActive: plan.isActive,
        priceOptions: DURATIONS.map((durationMonths) => byDuration.get(durationMonths) || ({ durationMonths, baseAmount: 0, currency: 'INR', isActive: true })), });
    }
    setIsModalOpen(true);
  };
  const updatePrice = (durationMonths: number, value: string) => setFormData((current) => ({ ...current,
    priceOptions: current.priceOptions.map((option) => option.durationMonths === durationMonths ? { ...option, baseAmount: value === '' ? 0 : Number(value) } : option),
  }));
  const handleSubmit = (event: FormEvent) => { event.preventDefault(); if (editingPlan) updatePlanMutation.mutate({ id: editingPlan.id }); else createPlanMutation.mutate(); };

  if (isAllApplications) return <div className="flex flex-col items-center justify-center h-[60vh] text-center"><div className="w-16 h-16 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center mb-4"><AlertCircle className="w-8 h-8" /></div><h2 className="text-xl font-bold text-white mb-2">Select an Application</h2><p className="text-slate-400 max-w-md">Plans belong to a subscription model mapped to one application. Select an application to manage its catalog.</p></div>;

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><div><h1 className="text-2xl font-bold text-white tracking-tight">Subscription Plans</h1><p className="text-slate-400 text-sm">Manage the reusable catalog for {selectedProduct?.displayName}.</p></div><button onClick={() => openModal()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold"><Plus className="w-4 h-4" /> Create Plan</button></div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {isLoading ? <div className="col-span-full text-center py-12 text-slate-500">Loading plans...</div> : plans.length === 0 ? <div className="col-span-full text-center py-12 text-slate-500">No plans are configured for this application.</div> : plans.map((plan) => {
        const entitlements = (plan.featureEntitlements || []).filter((item) => item.isEnabled);
        return <div key={plan.id} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden hover:border-indigo-500/30 transition-colors"><div className="p-6 border-b border-[var(--border-color)]"><div className="flex justify-between items-start gap-3 mb-3"><div><h3 className="text-xl font-black text-white">{plan.name}</h3><p className="font-mono text-xs text-indigo-300 mt-1">{plan.code}</p></div><span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${plan.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>{plan.isActive ? 'Active' : 'Archived'}</span></div><p className="text-sm text-slate-400 min-h-[40px]">{plan.description || 'No description provided.'}</p><p className="text-xs text-slate-500 mt-3">Catalog order: {plan.order}</p></div><div className="p-6 bg-[var(--bg-secondary)] space-y-5"><div><h4 className="text-xs font-bold text-slate-300 uppercase mb-3">Duration pricing</h4><div className="space-y-2">{(plan.priceOptions || []).filter((option) => option.isActive !== false).map((option) => <div key={option.durationMonths} className="flex justify-between text-sm text-slate-400"><span>{option.durationMonths} month{option.durationMonths === 1 ? '' : 's'}</span><span className="font-medium text-white">{formatMoney(option.baseAmount, option.currency)}</span></div>)}</div></div><div><h4 className="text-xs font-bold text-slate-300 uppercase mb-3">Included entitlements</h4>{entitlements.length ? <ul className="space-y-2">{entitlements.slice(0, 4).map((item) => <li key={item.id} className="flex gap-2 text-sm text-slate-400"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />{item.feature.name}{item.limitValue ? `: ${item.limitValue}` : ''}</li>)}</ul> : <p className="text-sm text-slate-500">No explicit entitlements assigned.</p>}</div><div className="flex gap-2 pt-4 border-t border-[var(--border-color)]"><button onClick={() => openModal(plan)} className="flex-1 flex justify-center items-center gap-2 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-sm font-medium hover:bg-slate-800 text-slate-300"><Edit2 className="w-4 h-4" /> Edit</button>{plan.isActive && <button onClick={() => archivePlanMutation.mutate(plan.id)} className="p-2 rounded-lg border border-[var(--border-color)] hover:bg-rose-500/10 hover:text-rose-500 text-slate-400" title="Archive plan"><Archive className="w-4 h-4" /></button>}</div></div></div>;
      })}
    </div>
    {isModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"><div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"><div className="flex justify-between items-center p-6 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10"><h2 className="text-xl font-bold text-white">{editingPlan ? 'Edit Plan' : 'Create Plan'}</h2><button onClick={closeModal} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button></div><form onSubmit={handleSubmit} className="p-6 space-y-5"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label className="space-y-1 text-sm font-medium text-slate-300">Plan name<input required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white" /></label><label className="space-y-1 text-sm font-medium text-slate-300">Immutable code<input required disabled={Boolean(editingPlan)} value={formData.code} onChange={(event) => setFormData({ ...formData, code: event.target.value })} placeholder="billeasy.pro" className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white disabled:opacity-60" /></label><label className="space-y-1 text-sm font-medium text-slate-300">Description<input value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white" /></label><label className="space-y-1 text-sm font-medium text-slate-300">Catalog order<input type="number" min="0" value={formData.order} onChange={(event) => setFormData({ ...formData, order: Number(event.target.value) })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white" /></label></div><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={formData.isActive} onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })} /> Available for new subscriptions</label><div className="border-t border-[var(--border-color)] pt-5"><h3 className="text-sm font-semibold text-white">Base price by subscription duration</h3><p className="text-xs text-slate-500 mt-1">Promotions and coupons are applied separately when assigning a plan.</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">{formData.priceOptions.map((option) => <label key={option.durationMonths} className="text-sm text-slate-300">{option.durationMonths} month{option.durationMonths === 1 ? '' : 's'}<div className="flex mt-1"><span className="px-3 py-2 rounded-l-lg bg-slate-800 border border-[var(--border-color)] text-slate-400">₹</span><input required type="number" min="0" step="0.01" value={option.baseAmount} onChange={(event) => updatePrice(option.durationMonths, event.target.value)} className="w-full bg-[var(--bg-secondary)] border border-l-0 border-[var(--border-color)] rounded-r-lg px-3 py-2 text-white" /></div></label>)}</div></div><div className="flex justify-end gap-3 pt-4"><button type="button" onClick={closeModal} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800">Cancel</button><button type="submit" disabled={createPlanMutation.isPending || updatePlanMutation.isPending} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">{editingPlan ? 'Save changes' : 'Create plan'}</button></div></form></div></div>}
  </div>;
};

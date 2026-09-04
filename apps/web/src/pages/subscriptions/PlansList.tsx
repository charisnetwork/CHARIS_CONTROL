import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AlertCircle, CheckCircle, Edit2, Plus, X, Star, Users, Zap, Shield, ChevronRight } from 'lucide-react';
import { useProductStore } from '../../store/productStore';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = (import.meta.env.VITE_Control_api_Backend || 'https://chariscontrol-production.up.railway.app').replace(/\/+$/, '');
const DURATIONS = [1, 3, 6, 12, 24, 36];

type PriceOption = { durationMonths: number; baseAmount: number | string; currency?: string; isActive?: boolean };
type Plan = {
  id: string; name: string; code: string; description?: string | null; order: number; isActive: boolean;
  isRecommended?: boolean;
  badge?: string;
  priceOptions?: PriceOption[];
  features?: string[];
  limits?: { name: string; value: string }[];
  perks?: string[];
  activeSubscriptionCount?: number;
};
type PlanForm = { name: string; code: string; description: string; order: number; isActive: boolean; isRecommended: boolean; badge: string; priceOptions: PriceOption[] };

const emptyForm = (): PlanForm => ({
  name: '', code: '', description: '', order: 0, isActive: true, isRecommended: false, badge: '',
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
  
  // Simulated data for preview since API might not have these yet
  const displayPlans = plans.length > 0 ? plans : [
    { id: '1', name: 'Free Tier', code: 'free', description: 'Perfect for getting started.', order: 1, isActive: true, badge: 'Starter', priceOptions: DURATIONS.map(d => ({ durationMonths: d, baseAmount: 0, currency: 'INR', isActive: true })), features: ['Basic Analytics', 'Community Support'], limits: [{ name: 'Users', value: '1' }, { name: 'Storage', value: '5GB' }], perks: ['Free forever'], activeSubscriptionCount: 1420 },
    { id: '2', name: 'Pro Tier', code: 'pro', description: 'For growing businesses and teams.', order: 2, isActive: true, isRecommended: true, badge: 'Most Popular', priceOptions: DURATIONS.map(d => ({ durationMonths: d, baseAmount: d * 999, currency: 'INR', isActive: true })), features: ['Advanced Analytics', 'Priority Email Support', 'Custom Domains'], limits: [{ name: 'Users', value: '10' }, { name: 'Storage', value: '50GB' }], perks: ['Onboarding Call'], activeSubscriptionCount: 384 },
    { id: '3', name: 'Enterprise', code: 'enterprise', description: 'Advanced features and scale for large organizations.', order: 3, isActive: true, badge: 'Premium', priceOptions: DURATIONS.map(d => ({ durationMonths: d, baseAmount: d * 4999, currency: 'INR', isActive: true })), features: ['Custom Reporting', '24/7 Phone Support', 'SSO & Advanced Security', 'Dedicated Account Manager'], limits: [{ name: 'Users', value: 'Unlimited' }, { name: 'Storage', value: '1TB' }], perks: ['White-glove migration', 'SLA 99.99%'], activeSubscriptionCount: 42 }
  ];

  const invalidatePlans = () => queryClient.invalidateQueries({ queryKey: ['plans', selectedProduct?.id] });
  const closeModal = () => { setIsModalOpen(false); setEditingPlan(null); };
  const payload = () => ({ applicationId: selectedProduct?.id, ...formData });
  const createPlanMutation = useMutation({ mutationFn: () => axios.post(`${API_BASE}/api/plans`, payload()), onSuccess: () => { void invalidatePlans(); closeModal(); } });
  const updatePlanMutation = useMutation({ mutationFn: ({ id }: { id: string }) => axios.put(`${API_BASE}/api/plans/${id}`, payload()), onSuccess: () => { void invalidatePlans(); closeModal(); } });
  
  const openModal = (plan?: Plan) => {
    if (!plan) { setEditingPlan(null); setFormData(emptyForm()); }
    else {
      const byDuration = new Map((plan.priceOptions || []).map((option) => [option.durationMonths, option]));
      setEditingPlan(plan);
      setFormData({ name: plan.name, code: plan.code, description: plan.description || '', order: plan.order || 0, isActive: plan.isActive, isRecommended: plan.isRecommended || false, badge: plan.badge || '',
        priceOptions: DURATIONS.map((durationMonths) => byDuration.get(durationMonths) || ({ durationMonths, baseAmount: 0, currency: 'INR', isActive: true })), });
    }
    setIsModalOpen(true);
  };
  const updatePrice = (durationMonths: number, value: string) => setFormData((current) => ({ ...current,
    priceOptions: current.priceOptions.map((option) => option.durationMonths === durationMonths ? { ...option, baseAmount: value === '' ? 0 : Number(value) } : option),
  }));
  const handleSubmit = (event: FormEvent) => { event.preventDefault(); if (editingPlan) updatePlanMutation.mutate({ id: editingPlan.id }); else createPlanMutation.mutate(); };

  if (isAllApplications) return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
        <AlertCircle className="w-10 h-10" />
      </div>
      <h2 className="text-3xl font-bold text-white mb-3">Select an Application</h2>
      <p className="text-[var(--text-muted)] max-w-md text-lg">Plans belong to a subscription model mapped to one application. Select an application to manage its catalog.</p>
    </div>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-[var(--bg-card)] to-[var(--bg-secondary)] p-6 rounded-2xl border border-[var(--border-color)]">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            Plan Catalog Manager
          </h1>
          <p className="text-[var(--text-secondary)] mt-2">Design, configure and manage subscription tier templates for {selectedProduct?.displayName}.</p>
        </div>
        <button onClick={() => openModal()} className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all hover:scale-105 active:scale-95">
          <Plus className="w-5 h-5" /> Create Template
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-slate-500">Loading plans...</div>
        ) : displayPlans.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500">No plans configured.</div>
        ) : (
          displayPlans.map((plan) => (
            <motion.div 
              key={plan.id} 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className={`relative bg-[var(--bg-card)] border rounded-3xl overflow-hidden flex flex-col transition-shadow ${plan.isRecommended ? 'border-primary shadow-[0_0_30px_rgba(59,130,246,0.2)]' : 'border-[var(--border-color)] hover:border-slate-600'}`}
            >
              {plan.isRecommended && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-4 py-1 rounded-b-xl shadow-lg flex items-center gap-1 z-10">
                  <Star className="w-3 h-3 fill-white" /> RECOMMENDED
                </div>
              )}
              
              <div className="p-8 pb-6 border-b border-[var(--border-color)] relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Shield className="w-24 h-24" />
                </div>
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div>
                    {plan.badge && <span className="inline-block px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-semibold rounded-full mb-3">{plan.badge}</span>}
                    <h3 className="text-2xl font-black text-white tracking-tight">{plan.name}</h3>
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${plan.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                    {plan.isActive ? 'Active' : 'Draft'}
                  </span>
                </div>
                
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">
                    {formatMoney(plan.priceOptions?.find(p => p.durationMonths === 1)?.baseAmount || 0)}
                  </span>
                  <span className="text-[var(--text-muted)] text-sm font-medium">/mo base</span>
                </div>
                
                <p className="text-sm text-[var(--text-secondary)] mt-4 min-h-[40px] leading-relaxed">
                  {plan.description}
                </p>
                
                <div className="mt-6 flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-400/10 w-fit px-3 py-1.5 rounded-lg border border-emerald-400/20">
                  <Users className="w-4 h-4" />
                  {plan.activeSubscriptionCount?.toLocaleString() || 0} active subs
                </div>
              </div>
              
              <div className="p-8 flex-1 bg-[var(--bg-secondary)]/50 space-y-8">
                {/* Pricing Table */}
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Pricing Options
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {(plan.priceOptions || []).filter(o => o.isActive !== false && DURATIONS.includes(o.durationMonths)).map(opt => (
                      <div key={opt.durationMonths} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-2 flex flex-col items-center justify-center text-center hover:border-primary/50 transition-colors">
                        <span className="text-xs text-[var(--text-muted)]">{opt.durationMonths}M</span>
                        <span className="text-sm font-bold text-white mt-1">{formatMoney(opt.baseAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Features */}
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4">Features</h4>
                  <ul className="space-y-3">
                    {(plan.features || []).map((feature, i) => (
                      <li key={i} className="flex gap-3 text-sm text-[var(--text-secondary)]">
                        <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* Limits & Perks */}
                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-[var(--border-color)]">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Limits</h4>
                    <ul className="space-y-2">
                      {(plan.limits || []).map((limit, i) => (
                        <li key={i} className="text-xs flex justify-between">
                          <span className="text-[var(--text-muted)]">{limit.name}</span>
                          <span className="font-bold text-white">{limit.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Perks</h4>
                    <ul className="space-y-2">
                      {(plan.perks || []).map((perk, i) => (
                        <li key={i} className="text-xs font-medium text-purple-400 flex items-center gap-1">
                          <Star className="w-3 h-3" /> {perk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-[var(--bg-card)] border-t border-[var(--border-color)] flex gap-3">
                <button onClick={() => openModal(plan)} className="flex-1 flex justify-center items-center gap-2 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-sm font-bold hover:bg-[var(--bg-hover)] text-white transition-colors">
                  <Edit2 className="w-4 h-4" /> Edit Template
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-6 border-b border-[var(--border-color)] bg-gradient-to-r from-[var(--bg-secondary)] to-[var(--bg-card)]">
                <div>
                  <h2 className="text-2xl font-black text-white">{editingPlan ? 'Edit Template Defaults' : 'Create Plan Template'}</h2>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Configure pricing, limits, and core settings.</p>
                </div>
                <button onClick={closeModal} className="text-[var(--text-muted)] hover:text-white bg-[var(--bg-secondary)] p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <form id="plan-form" onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Template Name
                      <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="e.g. Pro Tier" />
                    </label>
                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Code ID (Immutable)
                      <input required disabled={Boolean(editingPlan)} value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. tier_pro" className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-primary outline-none transition-all" />
                    </label>
                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)] md:col-span-2">
                      Description
                      <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all resize-none h-24" placeholder="Describe the target audience..." />
                    </label>
                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Badge Text
                      <input value={formData.badge} onChange={(e) => setFormData({ ...formData, badge: e.target.value })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all" placeholder="e.g. Most Popular" />
                    </label>
                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Display Order
                      <input type="number" min="0" value={formData.order} onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all" />
                    </label>
                  </div>
                  
                  <div className="flex gap-6 p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)]">
                    <label className="flex items-center gap-3 text-sm font-bold text-white cursor-pointer">
                      <div className="relative flex items-center">
                        <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="peer sr-only" />
                        <div className="w-10 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </div>
                      Active Status
                    </label>
                    <label className="flex items-center gap-3 text-sm font-bold text-white cursor-pointer">
                      <div className="relative flex items-center">
                        <input type="checkbox" checked={formData.isRecommended} onChange={(e) => setFormData({ ...formData, isRecommended: e.target.checked })} className="peer sr-only" />
                        <div className="w-10 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                      </div>
                      Highlight as Recommended
                    </label>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-black text-white">Duration Pricing</h3>
                      <p className="text-sm text-[var(--text-muted)]">Set base prices for different billing cycles.</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {formData.priceOptions.map((option) => (
                        <div key={option.durationMonths} className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-color)]">
                          <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">{option.durationMonths} Month{option.durationMonths > 1 ? 's' : ''}</label>
                          <div className="flex">
                            <span className="px-3 py-2 rounded-l-lg bg-[var(--bg-card)] border border-r-0 border-[var(--border-color)] text-[var(--text-muted)] font-medium">₹</span>
                            <input required type="number" min="0" step="0.01" value={option.baseAmount} onChange={(e) => updatePrice(option.durationMonths, e.target.value)} className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-r-lg px-3 py-2 text-white outline-none focus:border-primary transition-colors" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </form>
              </div>
              
              <div className="p-6 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-6 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">Cancel</button>
                <button type="submit" form="plan-form" disabled={createPlanMutation.isPending || updatePlanMutation.isPending} className="px-8 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all flex items-center gap-2">
                  {editingPlan ? 'Save Changes' : 'Create Template'} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

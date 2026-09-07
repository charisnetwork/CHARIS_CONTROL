import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AlertCircle, CheckCircle, Edit2, Plus, X, Star, ChevronRight, Sliders, Check, Lock } from 'lucide-react';
import { useProductStore } from '../../store/productStore';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = (import.meta.env.VITE_Control_api_Backend || 'https://chariscontrol-production.up.railway.app').replace(/\/+$/, '');
const DURATIONS = [1, 3, 6, 12, 24, 36];

type Feature = { id: string; name: string; code: string; description?: string; sortOrder: number };
type FeatureGroup = { id: string; name: string; code: string; sortOrder: number; features: Feature[] };

type PriceOption = { durationMonths: number; baseAmount: number | string; currency?: string; isActive?: boolean };
type Plan = {
  id: string; name: string; code: string; description?: string | null; order: number; isActive: boolean;
  isRecommended?: boolean;
  badge?: string;
  priceMonthly?: number;
  priceYearly?: number;
  currency?: string;
  priceOptions?: PriceOption[];
  featureEntitlements?: Array<{ id: string; featureId: string; isEnabled: boolean; feature: Feature }>;
  features?: string[];
  limits?: { name: string; value: string }[];
  perks?: string[];
  activeSubscriptionCount?: number;
};

type PlanForm = {
  name: string;
  code: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  order: number;
  isActive: boolean;
  isRecommended: boolean;
  badge: string;
  priceOptions: PriceOption[];
};

const emptyForm = (): PlanForm => ({
  name: '', code: '', description: '', priceMonthly: 0, priceYearly: 0, currency: 'INR', order: 0, isActive: true, isRecommended: false, badge: '',
  priceOptions: DURATIONS.map((durationMonths) => ({ durationMonths, baseAmount: 0, currency: 'INR', isActive: true })),
});

const toAmount = (value: number | string | undefined) => Number(value || 0);
const formatMoney = (amount: number | string | undefined, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(toAmount(amount));

export const PlansList = () => {
  const { selectedProduct, isAllApplications } = useProductStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'cards' | 'matrix'>('cards');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<PlanForm>(emptyForm());

  // Feature Matrix state
  const [matrixPlanId, setMatrixPlanId] = useState<string>('');
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});

  const { data: plans = [], isLoading: isPlansLoading } = useQuery<Plan[]>({
    queryKey: ['plans', selectedProduct?.id],
    queryFn: async () => (await axios.get(`${API_BASE}/api/plans?productId=${selectedProduct?.id || 'all'}`)).data,
  });

  const { data: featureGroups = [] } = useQuery<FeatureGroup[]>({
    queryKey: ['featureGroups'],
    queryFn: async () => (await axios.get(`${API_BASE}/api/plans/feature-groups`)).data,
  });

  // Select first plan for matrix if none selected
  const activeMatrixPlan = plans.find(p => p.id === matrixPlanId) || plans[0];

  const loadMatrixForPlan = (plan: Plan) => {
    setMatrixPlanId(plan.id);
    const toggles: Record<string, boolean> = {};
    if (plan.featureEntitlements) {
      plan.featureEntitlements.forEach(fe => {
        toggles[fe.featureId] = fe.isEnabled;
      });
    }
    setFeatureToggles(toggles);
  };

  const invalidatePlans = () => queryClient.invalidateQueries({ queryKey: ['plans'] });
  const closeModal = () => { setIsModalOpen(false); setEditingPlan(null); };

  const payload = () => ({ applicationId: selectedProduct?.id, ...formData });
  const createPlanMutation = useMutation({ mutationFn: () => axios.post(`${API_BASE}/api/plans`, payload()), onSuccess: () => { void invalidatePlans(); closeModal(); } });
  const updatePlanMutation = useMutation({ mutationFn: ({ id }: { id: string }) => axios.put(`${API_BASE}/api/plans/${id}`, payload()), onSuccess: () => { void invalidatePlans(); closeModal(); } });

  const saveMatrixMutation = useMutation({
    mutationFn: async () => {
      if (!activeMatrixPlan) return;
      const featuresArray = Object.entries(featureToggles).map(([featureId, isEnabled]) => ({ featureId, isEnabled }));
      await axios.put(`${API_BASE}/api/plans/${activeMatrixPlan.id}/features`, { features: featuresArray });
    },
    onSuccess: () => {
      void invalidatePlans();
      alert('Plan feature matrix saved successfully!');
    }
  });

  const openModal = (plan?: Plan) => {
    if (!plan) {
      setEditingPlan(null);
      setFormData(emptyForm());
    } else {
      const byDuration = new Map((plan.priceOptions || []).map((option) => [option.durationMonths, option]));
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        code: plan.code,
        description: plan.description || '',
        priceMonthly: plan.priceMonthly || 0,
        priceYearly: plan.priceYearly || 0,
        currency: plan.currency || 'INR',
        order: plan.order || 0,
        isActive: plan.isActive,
        isRecommended: plan.isRecommended || false,
        badge: plan.badge || '',
        priceOptions: DURATIONS.map((durationMonths) => byDuration.get(durationMonths) || ({ durationMonths, baseAmount: 0, currency: 'INR', isActive: true })),
      });
    }
    setIsModalOpen(true);
  };

  const toggleFeature = (featureId: string) => {
    setFeatureToggles(prev => ({
      ...prev,
      [featureId]: !prev[featureId]
    }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (editingPlan) updatePlanMutation.mutate({ id: editingPlan.id });
    else createPlanMutation.mutate();
  };

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-[var(--bg-card)] to-[var(--bg-secondary)] p-6 rounded-2xl border border-[var(--border-color)]">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            Plans & Features Control Matrix
          </h1>
          <p className="text-[var(--text-secondary)] mt-2">
            Configure subscription tiers, custom description text, monthly/yearly pricing, and 28 feature toggles per plan for {selectedProduct?.displayName || 'Bill Easy'}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex p-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl">
            <button
              onClick={() => setActiveTab('cards')}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'cards' ? 'bg-primary text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-white'}`}
            >
              Plan Cards
            </button>
            <button
              onClick={() => {
                setActiveTab('matrix');
                if (plans.length > 0 && !matrixPlanId) loadMatrixForPlan(plans[0]);
              }}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'matrix' ? 'bg-primary text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-white'}`}
            >
              <Sliders className="w-4 h-4" /> Feature Matrix (28)
            </button>
          </div>
          <button onClick={() => openModal()} className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all hover:scale-105 active:scale-95">
            <Plus className="w-5 h-5" /> Create Plan
          </button>
        </div>
      </div>

      {/* PLAN CARDS TAB */}
      {activeTab === 'cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {isPlansLoading ? (
            <div className="col-span-full text-center py-12 text-slate-500">Loading plans...</div>
          ) : plans.length === 0 ? (
            <div className="col-span-full text-center py-12 text-slate-500">No plans configured.</div>
          ) : (
            plans.map((plan) => (
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

                <div className="p-6 pb-4 border-b border-[var(--border-color)] relative overflow-hidden">
                  <div className="flex justify-between items-start mb-3 relative z-10">
                    <div>
                      {plan.badge && <span className="inline-block px-3 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-semibold rounded-full mb-2">{plan.badge}</span>}
                      <h3 className="text-xl font-black text-white tracking-tight">{plan.name}</h3>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${plan.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {plan.isActive ? 'Active' : 'Draft'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white">
                      {formatMoney(plan.priceMonthly || 0)}
                    </span>
                    <span className="text-[var(--text-muted)] text-xs font-medium">/month</span>
                  </div>
                  <div className="text-xs text-emerald-400 font-semibold mt-1">
                    Yearly: {formatMoney(plan.priceYearly || 0)} /yr
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] mt-3 min-h-[40px] leading-relaxed bg-[var(--bg-secondary)] p-2.5 rounded-xl border border-[var(--border-color)]">
                    "{plan.description || 'No description added.'}"
                  </p>
                </div>

                <div className="p-6 flex-1 bg-[var(--bg-secondary)]/50 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Feature Summary</h4>
                    <div className="space-y-2">
                      {plan.featureEntitlements?.filter(fe => fe.isEnabled).slice(0, 6).map((fe, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{fe.feature.name}</span>
                        </div>
                      ))}
                      {(plan.featureEntitlements?.filter(fe => fe.isEnabled).length || 0) > 6 && (
                        <div className="text-xs font-bold text-primary pt-1">
                          + {(plan.featureEntitlements?.filter(fe => fe.isEnabled).length || 0) - 6} more sub-features enabled
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[var(--bg-card)] border-t border-[var(--border-color)] flex gap-2">
                  <button onClick={() => openModal(plan)} className="flex-1 flex justify-center items-center gap-1.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-bold hover:bg-[var(--bg-hover)] text-white transition-colors">
                    <Edit2 className="w-3.5 h-3.5" /> Metadata
                  </button>
                  <button
                    onClick={() => {
                      loadMatrixForPlan(plan);
                      setActiveTab('matrix');
                    }}
                    className="flex-1 flex justify-center items-center gap-1.5 py-2.5 rounded-xl bg-primary/20 border border-primary/40 text-xs font-bold text-blue-400 hover:bg-primary/30 transition-colors"
                  >
                    <Sliders className="w-3.5 h-3.5" /> 28 Matrix
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* 28-FEATURE TOGGLE MATRIX TAB */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          {/* Plan Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-white">Select Plan to Edit Matrix:</span>
              <div className="flex gap-2">
                {plans.map(p => (
                  <button
                    key={p.id}
                    onClick={() => loadMatrixForPlan(p)}
                    className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                      activeMatrixPlan?.id === p.id
                        ? 'bg-primary text-white border-primary shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-slate-500'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {activeMatrixPlan && (
              <button
                onClick={() => saveMatrixMutation.mutate()}
                disabled={saveMatrixMutation.isPending}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all"
              >
                <Check className="w-5 h-5" /> Save 28-Feature Matrix
              </button>
            )}
          </div>

          {/* Active Plan Metadata Header */}
          {activeMatrixPlan && (
            <div className="p-6 bg-gradient-to-r from-blue-900/20 via-[var(--bg-card)] to-purple-900/20 border border-blue-500/30 rounded-2xl flex flex-col md:flex-row justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black text-white">{activeMatrixPlan.name}</h2>
                  <span className="px-3 py-1 bg-primary/20 text-blue-400 text-xs font-mono font-bold rounded-lg border border-primary/30">
                    code: {activeMatrixPlan.code}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-2xl">
                  {activeMatrixPlan.description || 'No description provided.'}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-xs text-[var(--text-muted)] font-bold uppercase">Monthly Price</div>
                  <div className="text-2xl font-black text-white">{formatMoney(activeMatrixPlan.priceMonthly || 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)] font-bold uppercase">Yearly Price</div>
                  <div className="text-2xl font-black text-emerald-400">{formatMoney(activeMatrixPlan.priceYearly || 0)}</div>
                </div>
              </div>
            </div>
          )}

          {/* 9 Feature Groups Accordion Matrix */}
          <div className="space-y-6">
            {featureGroups.map((group, groupIdx) => (
              <div key={group.id} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
                <div className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center border border-primary/30">
                      {groupIdx + 1}
                    </span>
                    <h3 className="text-base font-bold text-white tracking-wide">{group.name}</h3>
                    <span className="text-xs text-[var(--text-muted)] font-mono">({group.features.length} sub-features)</span>
                  </div>
                  <div className="text-xs text-emerald-400 font-semibold">
                    {group.features.filter(f => featureToggles[f.id]).length} / {group.features.length} Enabled
                  </div>
                </div>

                <div className="divide-y divide-[var(--border-color)]">
                  {group.features.map((feature) => {
                    const isEnabled = Boolean(featureToggles[feature.id]);
                    return (
                      <div key={feature.id} className="p-4 flex items-center justify-between hover:bg-[var(--bg-secondary)]/40 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{feature.name}</span>
                            <span className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded border border-[var(--border-color)]">
                              {feature.code}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] max-w-xl">{feature.description}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleFeature(feature.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                            isEnabled
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          }`}
                        >
                          {isEnabled ? (
                            <>
                              <Check className="w-4 h-4" /> Enabled (ON)
                            </>
                          ) : (
                            <>
                              <Lock className="w-4 h-4" /> Disabled (OFF)
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {activeMatrixPlan && (
            <div className="flex justify-end p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl">
              <button
                onClick={() => saveMatrixMutation.mutate()}
                disabled={saveMatrixMutation.isPending}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all"
              >
                <Check className="w-5 h-5" /> Save 28-Feature Matrix Changes
              </button>
            </div>
          )}
        </div>
      )}

      {/* PLAN METADATA MODAL */}
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
                  <h2 className="text-2xl font-black text-white">{editingPlan ? 'Edit Plan Details & Custom Description' : 'Create New Plan'}</h2>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Write your custom plan description text and set pricing.</p>
                </div>
                <button onClick={closeModal} className="text-[var(--text-muted)] hover:text-white bg-[var(--bg-secondary)] p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <form id="plan-form" onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Plan Name
                      <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all" placeholder="e.g. Pro Plan" />
                    </label>
                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Unique Code (Immutable)
                      <input required disabled={Boolean(editingPlan)} value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. pro" className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-primary outline-none transition-all" />
                    </label>

                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Monthly Price (₹)
                      <input type="number" min="0" value={formData.priceMonthly} onChange={(e) => setFormData({ ...formData, priceMonthly: Number(e.target.value) })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all" placeholder="e.g. 499" />
                    </label>
                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Yearly Price (₹)
                      <input type="number" min="0" value={formData.priceYearly} onChange={(e) => setFormData({ ...formData, priceYearly: Number(e.target.value) })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all" placeholder="e.g. 3600" />
                    </label>

                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)] md:col-span-2">
                      Custom Description Text (Write in your own words)
                      <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all resize-none h-28" placeholder="Write your own custom description for this plan..." />
                    </label>

                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Badge Label (e.g. Most Popular)
                      <input value={formData.badge} onChange={(e) => setFormData({ ...formData, badge: e.target.value })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all" placeholder="e.g. Most Popular" />
                    </label>
                    <label className="space-y-2 text-sm font-bold text-[var(--text-secondary)]">
                      Display Sequence Order
                      <input type="number" min="0" value={formData.order} onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all" />
                    </label>
                  </div>

                  <div className="flex gap-6 p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)]">
                    <label className="flex items-center gap-3 text-sm font-bold text-white cursor-pointer">
                      <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="w-5 h-5 accent-blue-500 rounded" />
                      Active Status
                    </label>
                    <label className="flex items-center gap-3 text-sm font-bold text-white cursor-pointer">
                      <input type="checkbox" checked={formData.isRecommended} onChange={(e) => setFormData({ ...formData, isRecommended: e.target.checked })} className="w-5 h-5 accent-purple-500 rounded" />
                      Highlight as Recommended
                    </label>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-6 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">Cancel</button>
                <button type="submit" form="plan-form" disabled={createPlanMutation.isPending || updatePlanMutation.isPending} className="px-8 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all flex items-center gap-2">
                  {editingPlan ? 'Save Details' : 'Create Plan'} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};


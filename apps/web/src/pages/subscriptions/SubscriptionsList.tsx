import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Plus, Search, Filter, MoreVertical, CreditCard, CheckCircle, 
  XCircle, Clock, AlertTriangle, Download, Building, ArrowRight,
  Package, Shield, Zap, User, Calculator, Layers, ArrowLeft
} from 'lucide-react';
import { useProductStore } from '../../store/productStore';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

const API_BASE = (import.meta.env.VITE_Control_api_Backend || 'https://chariscontrol-production.up.railway.app').replace(/\/+$/, '');

// Types
type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused';
type Subscription = {
  id: string; customerId: string; planId: string; status: SubscriptionStatus;
  currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean;
  tenantId?: string;
  customer?: { id: string; name: string; email: string; companyName?: string };
  plan?: { id: string; name: string; application?: { id: string; name: string } };
};

const STEPS = [
  { id: 1, title: 'Product', icon: Package },
  { id: 2, title: 'Tier', icon: Layers },
  { id: 3, title: 'Duration', icon: Clock },
  { id: 4, title: 'Pricing', icon: Calculator },
  { id: 5, title: 'Features', icon: Zap },
  { id: 6, title: 'Limits', icon: Shield },
  { id: 7, title: 'Perks', icon: CheckCircle },
  { id: 8, title: 'Customer', icon: User },
  { id: 9, title: 'Confirm', icon: CheckCircle },
];

const mockPlans = [
  { id: '1', name: 'Free Tier', badge: 'Starter', isRecommended: false, features: ['Basic Analytics', 'Community Support'], limits: [{name:'Users',value:'1'}, {name:'Storage',value:'5GB'}], perks: ['Free forever'], priceOptions: [{durationMonths: 1, baseAmount: 0}, {durationMonths: 12, baseAmount: 0}] },
  { id: '2', name: 'Pro Tier', badge: 'Most Popular', isRecommended: true, features: ['Advanced Analytics', 'Priority Email Support', 'Custom Domains'], limits: [{name:'Users',value:'10'}, {name:'Storage',value:'50GB'}], perks: ['Onboarding Call'], priceOptions: [{durationMonths: 1, baseAmount: 999}, {durationMonths: 12, baseAmount: 9990}] },
  { id: '3', name: 'Enterprise', badge: 'Premium', isRecommended: false, features: ['Custom Reporting', '24/7 Phone Support', 'SSO & Advanced Security'], limits: [{name:'Users',value:'Unlimited'}, {name:'Storage',value:'1TB'}], perks: ['White-glove migration', 'SLA 99.99%'], priceOptions: [{durationMonths: 1, baseAmount: 4999}, {durationMonths: 12, baseAmount: 49990}] }
];

export const SubscriptionsList = () => {
  const { selectedProduct, isAllApplications, products } = useProductStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Builder State
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [builderState, setBuilderState] = useState({
    productId: selectedProduct?.id || '',
    tierId: '',
    duration: 1,
    couponCode: '',
    customerId: '',
    tenantId: ''
  });

  const { data: subscriptions = [], isLoading } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', selectedProduct?.id, isAllApplications],
    queryFn: async () => {
      const url = isAllApplications 
        ? `${API_BASE}/api/subscriptions` 
        : `${API_BASE}/api/subscriptions?productId=${selectedProduct?.id}`;
      return (await axios.get(url)).data;
    }
  });

  // Export to CSV
  const exportCsv = () => {
    const headers = ['ID,Customer,Email,Plan,Status,Period Start,Period End\n'];
    const rows = subscriptions.map(sub => 
      `${sub.id},"${sub.customer?.name || ''}","${sub.customer?.email || ''}","${sub.plan?.name || ''}",${sub.status},${format(new Date(sub.currentPeriodStart), 'yyyy-MM-dd')},${format(new Date(sub.currentPeriodEnd), 'yyyy-MM-dd')}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscriptions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'canceled': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'past_due': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'trialing': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const filteredSubs = subscriptions.filter(sub => {
    const matchesSearch = sub.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          sub.customer?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          sub.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Builder Helper Functions
  const selectedPlanDetails = mockPlans.find(p => p.id === builderState.tierId) || mockPlans[1];
  const selectedPrice = selectedPlanDetails?.priceOptions?.find(p => p.durationMonths === builderState.duration) || selectedPlanDetails?.priceOptions?.[0];
  const basePrice = selectedPrice?.baseAmount || 0;
  const couponDiscount = builderState.couponCode === 'PROMO20' ? 0.2 : 0;
  const finalPrice = basePrice * (1 - couponDiscount);
  
  const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, 9));
  const handlePrev = () => setCurrentStep(prev => Math.max(prev - 1, 1));
  const submitSubscription = () => {
    setIsBuilderOpen(false);
    setCurrentStep(1);
    // Submit API Call would go here
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border-color)] shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-primary" />
            Subscription Management
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Manage billing, upgrades, and active tenant subscriptions.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportCsv} className="flex items-center gap-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-white px-4 py-2 rounded-xl text-sm font-bold transition-all">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setIsBuilderOpen(true)} className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all">
            <Plus className="w-4 h-4" /> New Subscription
          </button>
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[var(--border-color)] flex flex-col sm:flex-row gap-4 items-center justify-between bg-[var(--bg-secondary)]/30">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input 
              type="text" 
              placeholder="Search by customer, email or ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:border-primary outline-none transition-colors"
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-[var(--text-muted)]" />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-sm text-white focus:border-primary outline-none flex-1 sm:flex-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
              <option value="trialing">Trialing</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--bg-secondary)]/80 text-[var(--text-muted)] font-semibold border-b border-[var(--border-color)]">
              <tr>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Plan / App</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Billing Cycle</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-12 text-[var(--text-muted)]">Loading subscriptions...</td></tr>
              ) : filteredSubs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mb-4">
                        <CreditCard className="w-8 h-8 text-[var(--text-muted)]" />
                      </div>
                      <p className="text-[var(--text-secondary)] font-medium">No subscriptions found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSubs.map((sub) => (
                  <tr key={sub.id} className="hover:bg-[var(--bg-secondary)]/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/20 text-primary flex items-center justify-center font-bold">
                          {sub.customer?.name.charAt(0) || 'C'}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{sub.customer?.name || 'Unknown'}</div>
                          <div className="text-xs text-[var(--text-muted)]">{sub.customer?.email}</div>
                          {sub.tenantId && (
                            <div className="flex items-center gap-1 text-[10px] text-purple-400 mt-0.5">
                              <Building className="w-3 h-3" /> {sub.tenantId}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{sub.plan?.name || 'Custom Plan'}</div>
                      <div className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                        <Package className="w-3 h-3" /> {sub.plan?.application?.name || 'All'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${getStatusColor(sub.status)}`}>
                        {sub.status.replace('_', ' ')}
                      </span>
                      {sub.cancelAtPeriodEnd && (
                        <div className="text-[10px] text-orange-400 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Cancels at end
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[var(--text-secondary)]">
                      <div className="text-xs">
                        <div><span className="text-[var(--text-muted)]">Starts:</span> {format(new Date(sub.currentPeriodStart), 'MMM d, yyyy')}</div>
                        <div><span className="text-[var(--text-muted)]">Ends:</span> {format(new Date(sub.currentPeriodEnd), 'MMM d, yyyy')}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block group/menu">
                        <button className="p-2 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] transition-colors">
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-50 py-1">
                          <button className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[var(--bg-hover)]">Upgrade / Downgrade</button>
                          <button className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[var(--bg-hover)]">Renew Early</button>
                          {sub.status === 'active' ? (
                            <button className="w-full text-left px-4 py-2 text-sm text-orange-400 hover:bg-orange-500/10">Suspend</button>
                          ) : (
                            <button className="w-full text-left px-4 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10">Activate</button>
                          )}
                          <div className="h-px bg-[var(--border-color)] my-1" />
                          <button className="w-full text-left px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/10">Cancel Subscription</button>
                          <button className="w-full text-left px-4 py-2 text-sm text-rose-500 hover:bg-rose-500/10 font-medium">Revoke Access Immediately</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advanced Multi-Step Subscription Builder */}
      <AnimatePresence>
        {isBuilderOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden"
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/50">
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" /> Subscription Builder
                </h2>
                <button onClick={() => setIsBuilderOpen(false)} className="text-[var(--text-muted)] hover:text-white p-1 rounded-full hover:bg-[var(--bg-hover)] transition-colors"><XCircle className="w-6 h-6" /></button>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Sidebar Navigation */}
                <div className="w-64 bg-[var(--bg-secondary)] border-r border-[var(--border-color)] p-6 overflow-y-auto hidden md:block">
                  <ul className="space-y-1">
                    {STEPS.map(step => (
                      <li key={step.id}>
                        <button 
                          onClick={() => setCurrentStep(step.id)}
                          className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-bold transition-all ${
                            currentStep === step.id 
                              ? 'bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                              : currentStep > step.id 
                                ? 'text-emerald-400 hover:bg-[var(--bg-hover)]' 
                                : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-white'
                          }`}
                        >
                          <step.icon className="w-5 h-5" /> {step.title}
                          {currentStep > step.id && <CheckCircle className="w-4 h-4 ml-auto" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-8 overflow-y-auto bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-secondary)]/20 custom-scrollbar relative">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="min-h-full flex flex-col"
                    >
                      <h3 className="text-3xl font-black text-white mb-6">
                        {STEPS.find(s => s.id === currentStep)?.title}
                      </h3>

                      {currentStep === 1 && (
                        <div className="space-y-4 flex-1">
                          <p className="text-[var(--text-secondary)] mb-4">Select the core product/application for this subscription.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {products.map(p => (
                              <div 
                                key={p.id} 
                                onClick={() => setBuilderState(prev => ({ ...prev, productId: p.id }))}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${builderState.productId === p.id ? 'border-primary bg-primary/10' : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-slate-500'}`}
                              >
                                <Package className={`w-8 h-8 mb-3 ${builderState.productId === p.id ? 'text-primary' : 'text-[var(--text-muted)]'}`} />
                                <h4 className="font-bold text-white">{p.displayName}</h4>
                                <p className="text-sm text-[var(--text-secondary)]">App ID: {p.id}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {currentStep === 2 && (
                        <div className="space-y-4 flex-1">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {mockPlans.map(plan => (
                              <div 
                                key={plan.id}
                                onClick={() => setBuilderState(prev => ({ ...prev, tierId: plan.id }))}
                                className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all ${builderState.tierId === plan.id ? 'border-primary bg-primary/5 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-slate-500'}`}
                              >
                                {plan.isRecommended && <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-black px-2 py-1 rounded-bl-lg rounded-tr-xl uppercase">Recommended</div>}
                                <h4 className="text-xl font-black text-white mb-1">{plan.name}</h4>
                                <span className="inline-block px-2 py-0.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded text-xs text-[var(--text-muted)] mb-4">{plan.badge}</span>
                                <ul className="space-y-2 mt-4 text-sm text-[var(--text-secondary)]">
                                  {plan.features.slice(0,2).map(f => <li key={f} className="flex gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> {f}</li>)}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {currentStep === 3 && (
                        <div className="space-y-4 flex-1">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {[1, 3, 6, 12, 24, 36].map(duration => (
                              <div 
                                key={duration}
                                onClick={() => setBuilderState(prev => ({ ...prev, duration }))}
                                className={`p-6 rounded-2xl border-2 text-center cursor-pointer transition-all ${builderState.duration === duration ? 'border-primary bg-primary/10' : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-slate-500'}`}
                              >
                                <span className="text-3xl font-black text-white block mb-1">{duration}</span>
                                <span className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">Month{duration>1?'s':''}</span>
                                {duration >= 12 && <div className="mt-3 text-xs font-bold text-emerald-400 bg-emerald-400/10 py-1 rounded-md">Save 20%</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {currentStep === 4 && (
                        <div className="space-y-6 flex-1 max-w-2xl mx-auto w-full">
                          <div className="bg-[var(--bg-secondary)] p-6 rounded-2xl border border-[var(--border-color)]">
                            <h4 className="font-bold text-white mb-4">Promo Code</h4>
                            <div className="flex gap-3">
                              <input 
                                type="text" 
                                placeholder="Enter code (e.g. PROMO20)" 
                                value={builderState.couponCode}
                                onChange={e => setBuilderState(prev => ({ ...prev, couponCode: e.target.value.toUpperCase() }))}
                                className="flex-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-white uppercase focus:border-primary outline-none"
                              />
                              <button className="bg-slate-700 text-white px-6 py-3 rounded-xl font-bold">Apply</button>
                            </div>
                            {builderState.couponCode === 'PROMO20' && <p className="text-emerald-400 text-sm font-bold mt-2 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> 20% Discount applied!</p>}
                          </div>

                          <div className="bg-gradient-to-br from-slate-800 to-[var(--bg-secondary)] p-8 rounded-3xl border border-[var(--border-color)] shadow-2xl relative overflow-hidden">
                            <div className="absolute -right-10 -top-10 opacity-5 text-white">
                              <Calculator className="w-64 h-64" />
                            </div>
                            <h4 className="text-[var(--text-muted)] font-bold uppercase tracking-wider mb-6 text-sm relative z-10">Pricing Summary</h4>
                            <div className="space-y-4 text-lg relative z-10">
                              <div className="flex justify-between text-[var(--text-secondary)]">
                                <span>Base Price ({builderState.duration} mo)</span>
                                <span>₹{basePrice.toLocaleString()}</span>
                              </div>
                              {couponDiscount > 0 && (
                                <div className="flex justify-between text-emerald-400 font-medium">
                                  <span>Coupon Discount (20%)</span>
                                  <span>-₹{(basePrice * couponDiscount).toLocaleString()}</span>
                                </div>
                              )}
                              <div className="border-t border-[var(--border-color)] pt-4 mt-4 flex justify-between text-2xl font-black text-white">
                                <span>Total Payable</span>
                                <span>₹{finalPrice.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Review Steps (5,6,7) combined in UI logic for brevity, but structurally separate */}
                      {(currentStep === 5 || currentStep === 6 || currentStep === 7) && (
                        <div className="space-y-6 flex-1">
                          <div className="bg-[var(--bg-secondary)] p-8 rounded-2xl border border-[var(--border-color)]">
                            <h4 className="text-xl font-bold text-white mb-6">Included in {selectedPlanDetails?.name}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {currentStep === 5 && selectedPlanDetails?.features.map((f,i) => (
                                <div key={i} className="flex items-center gap-3 bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)]"><CheckCircle className="w-5 h-5 text-emerald-400" /> <span className="font-medium text-white">{f}</span></div>
                              ))}
                              {currentStep === 6 && selectedPlanDetails?.limits.map((l,i) => (
                                <div key={i} className="flex justify-between items-center bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)]"><span className="text-[var(--text-muted)] font-medium">{l.name}</span> <span className="font-black text-white bg-slate-800 px-3 py-1 rounded-lg">{l.value}</span></div>
                              ))}
                              {currentStep === 7 && selectedPlanDetails?.perks.map((p,i) => (
                                <div key={i} className="flex items-center gap-3 bg-gradient-to-r from-purple-500/10 to-transparent p-4 rounded-xl border border-purple-500/20"><Zap className="w-5 h-5 text-purple-400" /> <span className="font-bold text-purple-100">{p}</span></div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {currentStep === 8 && (
                        <div className="space-y-6 flex-1 max-w-2xl">
                          <label className="block space-y-2">
                            <span className="text-sm font-bold text-[var(--text-secondary)]">Search Customer / Company Name</span>
                            <div className="relative">
                              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                              <input type="text" placeholder="Start typing..." className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl pl-12 pr-4 py-4 text-white focus:border-primary outline-none text-lg" />
                            </div>
                          </label>
                          <div className="flex items-center gap-4 my-6">
                            <div className="h-px bg-[var(--border-color)] flex-1"></div>
                            <span className="text-[var(--text-muted)] text-sm font-bold">OR</span>
                            <div className="h-px bg-[var(--border-color)] flex-1"></div>
                          </div>
                          <label className="block space-y-2">
                            <span className="text-sm font-bold text-[var(--text-secondary)]">Assign Tenant ID directly</span>
                            <input type="text" value={builderState.tenantId} onChange={e => setBuilderState(prev => ({...prev, tenantId: e.target.value}))} placeholder="e.g. tnt_12345" className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-4 text-white focus:border-primary outline-none" />
                          </label>
                        </div>
                      )}

                      {currentStep === 9 && (
                        <div className="space-y-6 flex-1">
                          <div className="bg-[var(--bg-secondary)] p-8 rounded-2xl border border-[var(--border-color)]">
                            <div className="flex justify-center mb-6">
                              <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                                <CheckCircle className="w-10 h-10" />
                              </div>
                            </div>
                            <h4 className="text-2xl font-black text-white text-center mb-8">Confirm Subscription Setup</h4>
                            
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8 max-w-2xl mx-auto">
                              <div className="text-[var(--text-muted)]">Product</div>
                              <div className="font-bold text-white text-right">{products.find(p=>p.id===builderState.productId)?.displayName || 'Unknown'}</div>
                              <div className="text-[var(--text-muted)]">Plan Tier</div>
                              <div className="font-bold text-white text-right">{selectedPlanDetails?.name}</div>
                              <div className="text-[var(--text-muted)]">Duration</div>
                              <div className="font-bold text-white text-right">{builderState.duration} Months</div>
                              <div className="text-[var(--text-muted)]">Payable Amount</div>
                              <div className="font-black text-emerald-400 text-right text-xl">₹{finalPrice.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              
              {/* Footer Actions */}
              <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-card)] flex justify-between items-center mt-auto">
                <button 
                  onClick={handlePrev}
                  disabled={currentStep === 1}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                
                {currentStep < 9 ? (
                  <button 
                    onClick={handleNext}
                    className="flex items-center gap-2 px-8 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                  >
                    Next Step <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button 
                    onClick={submitSubscription}
                    className="flex items-center gap-2 px-8 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all"
                  >
                    <CheckCircle className="w-5 h-5" /> Activate Subscription
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

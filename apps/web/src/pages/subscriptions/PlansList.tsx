import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useProductStore } from '../../store/productStore';
import { Plus, AlertCircle, Edit2, Archive, Copy, CheckCircle } from 'lucide-react';

export const PlansList = () => {
  const { selectedProduct, isAllApplications } = useProductStore();
  const [searchTerm] = useState('');

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans', selectedProduct?.id],
    queryFn: async () => {
      if (isAllApplications) return [];
      const res = await axios.get(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/plans?productId=${selectedProduct?.id}`);
      return res.data;
    },
    enabled: !isAllApplications && !!selectedProduct?.id
  });

  if (isAllApplications) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="w-16 h-16 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Product Context</h2>
        <p className="text-slate-400 max-w-md">
          To manage plans, please select a specific product. Plans are product-specific.
        </p>
      </div>
    );
  }

  const filteredPlans = plans.filter((plan: any) => 
    plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Subscription Plans</h1>
          <p className="text-slate-400 text-sm">Manage pricing and entitlements for {selectedProduct?.displayName}.</p>
        </div>
        
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
          <Plus className="w-4 h-4" /> Create New Plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-slate-500">Loading plans...</div>
        ) : filteredPlans.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500">No plans configured for this product.</div>
        ) : (
          filteredPlans.map((plan: any) => (
            <div key={plan.id} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden hover:border-indigo-500/30 transition-colors group">
              <div className="p-6 border-b border-[var(--border-color)]">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors">{plan.name}</h3>
                  <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${plan.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                    {plan.isActive ? 'ACTIVE' : 'ARCHIVED'}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mb-6 min-h-[40px]">{plan.description}</p>
                
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-white">₹{plan.monthlyPrice.toLocaleString()}</span>
                  <span className="text-slate-500 mb-1">/ month</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">or ₹{plan.yearlyPrice.toLocaleString()} / year</div>
              </div>
              
              <div className="p-6 bg-[var(--bg-secondary)]">
                <h4 className="text-xs font-bold text-slate-300 uppercase mb-4">Entitlements included</h4>
                <ul className="space-y-3 mb-6">
                  {plan.features.slice(0, 3).map((feature: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-sm text-slate-400">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    Up to {plan.maxUsers} Users
                  </li>
                  <li className="flex items-start gap-2 text-sm text-slate-400">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    {plan.maxStorageGb} GB Storage
                  </li>
                </ul>
                
                <div className="flex items-center gap-2 pt-4 border-t border-[var(--border-color)]">
                  <button className="flex-1 flex justify-center items-center gap-2 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-sm font-medium hover:bg-slate-800 text-slate-300 transition-colors">
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                  <button className="p-2 rounded-lg border border-[var(--border-color)] hover:bg-slate-800 text-slate-400 transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button className="p-2 rounded-lg border border-[var(--border-color)] hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20 text-slate-400 transition-colors">
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

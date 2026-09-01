import { useState } from "react";
import { useProductStore } from "../../store/productStore";
import { Plus, Edit, Trash2 } from 'lucide-react';

const SubscriptionsModule = () => {
  const { selectedProduct, isAllApplications } = useProductStore();
  const [plans] = useState([
    { id: '1', planName: 'Free', monthlyPrice: 0, yearlyPrice: 0, trialDays: 14, maxUsers: 1, maxStorage: 50, maxBranches: 1, isActive: true },
    { id: '2', planName: 'Premium', monthlyPrice: 999, yearlyPrice: 9999, trialDays: 0, maxUsers: 5, maxStorage: 500, maxBranches: 3, isActive: true },
    { id: '3', planName: 'Enterprise', monthlyPrice: 2999, yearlyPrice: 29999, trialDays: 0, maxUsers: 50, maxStorage: 5000, maxBranches: 10, isActive: true },
  ]);

  const [, setShowModal] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-white">Subscription Plans</h3>
          <p className="text-slate-500 text-sm mt-1">Manage pricing and features for {isAllApplications ? 'all products' : selectedProduct?.displayName}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
          <Plus className="w-4 h-4" /> CREATE PLAN
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map(plan => (
          <div key={plan.id} className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col relative overflow-hidden group hover:border-indigo-500/50 transition-all">
            <div className="absolute top-0 right-0 p-4">
              <span className={`text-[8px] font-black uppercase px-2 py-1 rounded ${plan.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                {plan.isActive ? 'Active' : 'Disabled'}
              </span>
            </div>
            
            <h4 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">{plan.planName}</h4>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-2xl font-black text-indigo-400">₹{plan.monthlyPrice}</span>
              <span className="text-xs text-slate-500 font-bold uppercase">/mo</span>
            </div>

            <div className="space-y-3 mb-8 flex-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Max Users</span>
                <span className="text-white font-bold">{plan.maxUsers}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Max Storage</span>
                <span className="text-white font-bold">{plan.maxStorage} MB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Max Branches</span>
                <span className="text-white font-bold">{plan.maxBranches}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Trial Period</span>
                <span className="text-white font-bold">{plan.trialDays} Days</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-auto">
              <button className="bg-slate-950 hover:bg-slate-800 text-slate-300 py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 transition-all">
                <Edit className="w-3 h-3" /> EDIT
              </button>
              <button className="bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 transition-all">
                <Trash2 className="w-3 h-3" /> DELETE
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubscriptionsModule;
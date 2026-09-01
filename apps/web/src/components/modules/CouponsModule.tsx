import { useState } from "react";
import { useProductStore } from "../../store/productStore";
import { Plus, Trash2, BarChart3 } from 'lucide-react';

const CouponsModule = () => {
  useProductStore();
  const [coupons] = useState([
    { id: '1', code: 'SUMMER50', discountType: 'percentage', discountValue: 50, usageCount: 45, maxUses: 100, isActive: true, expiresAt: '2026-08-01' },
    { id: '2', code: 'WELCOME1000', discountType: 'flat', discountValue: 1000, usageCount: 120, maxUses: null, isActive: true, expiresAt: null },
    { id: '3', code: 'EXPIRED20', discountType: 'percentage', discountValue: 20, usageCount: 500, maxUses: 500, isActive: false, expiresAt: '2025-12-31' },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-white">Discount Coupons</h3>
          <p className="text-slate-500 text-sm mt-1">Manage promotional codes and limits</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
          <Plus className="w-4 h-4" /> CREATE COUPON
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {coupons.map(c => (
          <div key={c.id} className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl hover:border-indigo-500/50 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
               <span className={`text-[8px] font-black uppercase px-2 py-1 rounded ${c.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                 {c.isActive ? 'Active' : 'Expired'}
               </span>
            </div>
            <h4 className="text-2xl font-black text-white font-mono tracking-tighter mb-1">{c.code}</h4>
            <p className="text-indigo-400 text-[10px] font-black uppercase mb-6">
              {c.discountType === 'percentage' ? `${c.discountValue}% OFF` : `₹${c.discountValue} OFF`}
            </p>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
               <div>
                  <p className="text-slate-500 text-[8px] font-black uppercase">Usage</p>
                  <p className="text-white font-black">{c.usageCount} / {c.maxUses || '∞'}</p>
               </div>
               <div>
                  <p className="text-slate-500 text-[8px] font-black uppercase">Expiry</p>
                  <p className="text-white font-black">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never'}</p>
               </div>
            </div>

            <div className="flex gap-2">
               <button className="flex-1 bg-slate-950 hover:bg-indigo-600 text-white py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                 <BarChart3 className="w-3 h-3" /> Analytics
               </button>
               <button className="bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white px-4 py-2 rounded-xl transition-all">
                 <Trash2 className="w-3 h-3" />
               </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CouponsModule;
import React, { useState } from "react";
import { useProductStore } from "../../store/productStore";
import { Plus, Trash2, Calendar, Image as ImageIcon } from 'lucide-react';

const OffersModule = () => {
  const { selectedProduct, isAllApplications } = useProductStore();
  const [offers, setOffers] = useState([
    { id: '1', title: 'Diwali Festival Bonanza', description: 'Get 50% off on all Yearly Plans', startDate: '2026-10-15', endDate: '2026-11-05', status: 'upcoming' },
    { id: '2', title: 'Welcome Offer', description: 'Flat ₹1000 off for new signups', startDate: '2025-01-01', endDate: '2027-12-31', status: 'active' },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-white">Promotional Offers</h3>
          <p className="text-slate-500 text-sm mt-1">Manage marketing banners and campaigns</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
          <Plus className="w-4 h-4" /> CREATE OFFER
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {offers.map(o => (
          <div key={o.id} className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden hover:border-indigo-500/50 transition-all flex flex-col">
            <div className="h-32 bg-slate-800 flex items-center justify-center relative">
               <ImageIcon className="w-8 h-8 text-slate-700" />
               <div className="absolute top-4 right-4">
                 <span className={`text-[8px] font-black uppercase px-2 py-1 rounded ${o.status === 'active' ? 'bg-emerald-500/90 text-white' : 'bg-amber-500/90 text-white'}`}>
                   {o.status}
                 </span>
               </div>
            </div>
            <div className="p-6">
              <h4 className="text-xl font-black text-white mb-2">{o.title}</h4>
              <p className="text-slate-400 text-sm mb-6">{o.description}</p>
              
              <div className="flex items-center gap-4 text-xs font-bold text-slate-500 mb-6 bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                 <Calendar className="w-4 h-4 text-indigo-400" />
                 <span>{new Date(o.startDate).toLocaleDateString()}</span>
                 <span>→</span>
                 <span>{new Date(o.endDate).toLocaleDateString()}</span>
              </div>

              <div className="flex gap-2">
                 <button className="bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white py-2 px-4 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 transition-all">
                   <Trash2 className="w-3 h-3" /> DELETE
                 </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OffersModule;
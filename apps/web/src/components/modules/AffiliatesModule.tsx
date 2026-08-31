import React, { useState } from "react";
import { Plus, Download, BarChart3, TrendingUp, Users } from 'lucide-react';

const AffiliatesModule = () => {
  const [affiliates, setAffiliates] = useState([
    { id: '1', company: 'Digital Growth Agency', contact: 'Sarah Jenkins', email: 'sarah@dga.com', referrals: 450, activeCustomers: 310, commissionPct: 20, earnings: 450000, status: 'active' },
    { id: '2', company: 'Tech Partners India', contact: 'Rahul V.', email: 'rahul@tpi.in', referrals: 120, activeCustomers: 85, commissionPct: 15, earnings: 85000, status: 'active' },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-white">Affiliate Partners</h3>
          <p className="text-slate-500 text-sm mt-1">Manage referral agencies and commissions (Platform Wide)</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white border border-emerald-500/20 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
            <Download className="w-4 h-4" /> EXPORT
          </button>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
            <Plus className="w-4 h-4" /> NEW AFFILIATE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <TrendingUp className="w-8 h-8 text-indigo-500 mb-4" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Total Affiliates</p>
          <h3 className="text-3xl font-black text-white mt-1">2</h3>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <Users className="w-8 h-8 text-sky-500 mb-4" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Total Referrals</p>
          <h3 className="text-3xl font-black text-white mt-1">570</h3>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <BarChart3 className="w-8 h-8 text-emerald-500 mb-4" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Commissions Paid</p>
          <h3 className="text-3xl font-black text-white mt-1">₹5.35L</h3>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-950/50 text-slate-500 font-bold uppercase">
            <tr>
              <th className="px-6 py-4">Agency</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Conversion Rate</th>
              <th className="px-6 py-4">Commission</th>
              <th className="px-6 py-4">Total Earnings</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {affiliates.map(a => (
              <tr key={a.id} className="hover:bg-slate-800/20">
                <td className="px-6 py-4 font-bold text-white">{a.company}</td>
                <td className="px-6 py-4">
                  <div className="text-slate-300 font-bold">{a.contact}</div>
                  <div className="text-slate-500">{a.email}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-300 font-bold">{a.activeCustomers} / {a.referrals}</span>
                    <span className="text-indigo-400 font-bold text-[10px]">
                      {Math.round((a.activeCustomers / a.referrals) * 100)}% CONVERSION
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 font-bold text-slate-300">{a.commissionPct}%</td>
                <td className="px-6 py-4 font-bold text-emerald-500">₹{a.earnings.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-black uppercase ${a.status === 'active' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {a.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AffiliatesModule;
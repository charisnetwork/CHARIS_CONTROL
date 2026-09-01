import { useState } from "react";
import { Plus, TrendingUp, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MarketingModule = () => {
  const [campaigns] = useState([
    { id: '1', name: 'Q3 Software Expansion', platform: 'Google Ads', budget: 50000, spent: 32000, clicks: 12050, leads: 850, conversions: 120, revenue: 1200000, status: 'active' },
    { id: '2', name: 'Retargeting Flow', platform: 'Facebook', budget: 20000, spent: 19500, clicks: 8000, leads: 400, conversions: 80, revenue: 800000, status: 'active' },
  ]);

  const chartData = campaigns.map(c => ({
    name: c.name,
    Spent: c.spent,
    Revenue: c.revenue
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-white">Marketing Analytics</h3>
          <p className="text-slate-500 text-sm mt-1">Track ad campaigns and ROI (Platform Wide)</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
          <Plus className="w-4 h-4" /> ADD CAMPAIGN
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-black text-white mb-6">ROI Overview</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                <Bar dataKey="Spent" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl flex flex-col gap-4">
          <h3 className="text-lg font-black text-white mb-2">Metrics</h3>
          
          <div className="flex justify-between items-center p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase">Total Budget</p>
              <p className="text-white font-black text-xl">₹70,000</p>
            </div>
            <DollarSign className="w-5 h-5 text-indigo-500" />
          </div>

          <div className="flex justify-between items-center p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase">Total Revenue</p>
              <p className="text-emerald-500 font-black text-xl">₹2,000,000</p>
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-950/50 text-slate-500 font-bold uppercase">
            <tr>
              <th className="px-6 py-4">Campaign Name</th>
              <th className="px-6 py-4">Platform</th>
              <th className="px-6 py-4">Budget / Spent</th>
              <th className="px-6 py-4">Conversions</th>
              <th className="px-6 py-4">Revenue</th>
              <th className="px-6 py-4">ROI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {campaigns.map(c => {
              const roi = (((c.revenue - c.spent) / c.spent) * 100).toFixed(0);
              return (
                <tr key={c.id} className="hover:bg-slate-800/20">
                  <td className="px-6 py-4 font-bold text-white">{c.name}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 font-black text-[10px] uppercase rounded">
                      {c.platform}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-300 font-bold">₹{c.budget.toLocaleString()}</div>
                    <div className="text-rose-500 font-bold text-[10px]">₹{c.spent.toLocaleString()} spent</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-300 font-bold">{c.conversions}</div>
                    <div className="text-slate-500 font-medium text-[10px]">{c.leads} leads</div>
                  </td>
                  <td className="px-6 py-4 font-bold text-emerald-500">₹{c.revenue.toLocaleString()}</td>
                  <td className="px-6 py-4 font-black text-emerald-500">+{roi}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MarketingModule;
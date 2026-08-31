import React, { useEffect, useState } from "react";
import { useProductStore } from "../../store/productStore";
import { fetchProductDashboardSummary } from "../../services/productApi";
import { Users, DollarSign, CreditCard, Ticket, Activity, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const DashboardModule = () => {
  const { selectedProduct, isAllApplications } = useProductStore();
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchProductDashboardSummary(selectedProduct, isAllApplications);
      setSummary(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProduct, isAllApplications]);

  if (loading) {
    return <div className="animate-pulse text-indigo-400 font-black flex items-center gap-2"><RefreshCw className="w-5 h-5 animate-spin" /> SYNCING PRODUCT DATA...</div>;
  }

  const mockRevenueData = [
    { name: 'Jan', revenue: summary.monthlyRevenue * 0.8 },
    { name: 'Feb', revenue: summary.monthlyRevenue * 0.9 },
    { name: 'Mar', revenue: summary.monthlyRevenue * 1.1 },
    { name: 'Apr', revenue: summary.monthlyRevenue },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <Users className="w-8 h-8 text-indigo-500 mb-4" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Total Customers</p>
          <h3 className="text-3xl font-black text-white mt-1">{summary.totalCustomers.toLocaleString()}</h3>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <Activity className="w-8 h-8 text-sky-500 mb-4" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Active Users Today</p>
          <h3 className="text-3xl font-black text-white mt-1">{summary.activeUsersToday.toLocaleString()}</h3>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <DollarSign className="w-8 h-8 text-emerald-500 mb-4" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Total Revenue</p>
          <h3 className="text-3xl font-black text-white mt-1">₹{summary.totalRevenue.toLocaleString()}</h3>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <CreditCard className="w-8 h-8 text-amber-500 mb-4" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Active Subscriptions</p>
          <h3 className="text-3xl font-black text-white mt-1">{summary.activeSubscriptions.toLocaleString()}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-black text-white mb-6">Revenue Growth</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl flex flex-col gap-4">
          <h3 className="text-lg font-black text-white mb-2">Metrics</h3>
          
          <div className="flex justify-between items-center p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase">New Registrations</p>
              <p className="text-white font-black text-xl">{summary.newRegistrations}</p>
            </div>
            <Users className="w-5 h-5 text-indigo-500" />
          </div>

          <div className="flex justify-between items-center p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase">Coupons Used</p>
              <p className="text-white font-black text-xl">{summary.couponUsage}</p>
            </div>
            <Ticket className="w-5 h-5 text-emerald-500" />
          </div>

          <div className="flex justify-between items-center p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase">Expired Subscriptions</p>
              <p className="text-rose-500 font-black text-xl">{summary.expiredSubscriptions}</p>
            </div>
            <CreditCard className="w-5 h-5 text-rose-500" />
          </div>

        </div>
      </div>
    </div>
  );
};

export default DashboardModule;
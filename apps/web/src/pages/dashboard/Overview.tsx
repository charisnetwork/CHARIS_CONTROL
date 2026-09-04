
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { motion } from 'framer-motion';
import { DollarSign, Users, Activity } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

import { useProductStore } from '../../store/productStore';

export function Overview() {
  const { selectedProduct, isAllApplications } = useProductStore();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboardStats', selectedProduct?.id, isAllApplications],
    queryFn: async () => {
      const apiBase = (import.meta.env.VITE_Control_api_Backend || 'https://chariscontrol-production.up.railway.app').replace(/\/+$/, '');
      const params = (!isAllApplications && selectedProduct?.id) ? { applicationId: selectedProduct.id } : {};
      const response = await axios.get(`${apiBase}/api/dashboard/stats`, { params });
      return response.data;
    }
  });

  if (isLoading) return <div className="text-gray-400">Loading dashboard...</div>;
  if (error) return <div className="text-red-400">Error loading dashboard stats</div>;

  const apiStats = data?.stats;
  const stats = apiStats ? {
    mrr: apiStats.mrr,
    arr: apiStats.arr,
    tenants: apiStats.totalTenants,
    activeSubscriptions: apiStats.activeSubscriptions,
    revenueGrowth: apiStats.revenueData.map((d: any) => d.revenue),
    planDistribution: apiStats.planDistribution || []
  } : {
    mrr: 0, arr: 0, tenants: 0, activeSubscriptions: 0,
    revenueGrowth: [0, 0, 0, 0, 0, 0],
    planDistribution: []
  };

  const chartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Revenue ($)',
        data: stats.revenueGrowth,
        borderColor: 'rgba(147, 197, 253, 1)',
        backgroundColor: 'rgba(147, 197, 253, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index' as const, intersect: false }
    },
    scales: {
      x: { grid: { display: false, color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'rgba(255,255,255,0.5)' } },
      y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'rgba(255,255,255,0.5)' } }
    },
    maintainAspectRatio: false
  };

  return (
    <div className="space-y-6 text-white w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Monthly Recurring Revenue" value={`₹${stats.mrr.toLocaleString()}`} icon={<DollarSign />} delay={0.1} />
        <StatCard title="Active subscriptions" value={stats.activeSubscriptions.toLocaleString()} icon={<Activity />} delay={0.2} />
        <StatCard title="Tenants with subscriptions" value={stats.tenants.toLocaleString()} icon={<Users />} delay={0.3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-2xl h-[400px]"
        >
          <h3 className="text-lg font-medium text-gray-200 mb-4">Revenue Growth (6 Months)</h3>
          <div className="h-full pb-8">
            <Line data={chartData} options={chartOptions as any} />
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-2xl space-y-6"
        >
          <h3 className="text-lg font-medium text-gray-200">Plan distribution</h3>
          {stats.planDistribution.length ? stats.planDistribution.map((plan: { name: string; count: number }) => (
            <div key={plan.name} className="flex justify-between text-sm text-gray-300"><span>{plan.name}</span><span>{plan.count}</span></div>
          )) : <p className="text-sm text-gray-500">No active subscriptions yet.</p>}
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, delay }: { title: string, value: string, icon: React.ReactNode, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-2xl flex items-center space-x-4"
    >
      <div className="p-3 bg-white/10 rounded-xl text-blue-400">
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-400 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-100 mt-1">{value}</p>
      </div>
    </motion.div>
  );
}

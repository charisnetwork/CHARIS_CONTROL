
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

export function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const response = await axios.get(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/dashboard/stats`);
      return response.data;
    }
  });

  if (isLoading) return <div className="text-gray-400">Loading dashboard...</div>;
  if (error) return <div className="text-red-400">Error loading dashboard stats</div>;

  const apiStats = data?.stats;
  const stats = apiStats ? {
    mrr: apiStats.mrr,
    arr: apiStats.arr,
    users: apiStats.totalUsers,
    revenueGrowth: apiStats.revenueData.map((d: any) => d.revenue),
    serverHealth: apiStats.health
  } : {
    mrr: 0, arr: 0, users: 0,
    revenueGrowth: [0, 0, 0, 0, 0, 0],
    serverHealth: { cpu: 0, ram: 0 }
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
        <StatCard title="Monthly Recurring Revenue" value={`$${stats.mrr.toLocaleString()}`} icon={<DollarSign />} delay={0.1} />
        <StatCard title="Annual Recurring Revenue" value={`$${stats.arr.toLocaleString()}`} icon={<Activity />} delay={0.2} />
        <StatCard title="Total Users" value={stats.users.toLocaleString()} icon={<Users />} delay={0.3} />
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
          <h3 className="text-lg font-medium text-gray-200">Server Health</h3>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-400">
              <span>CPU Usage</span>
              <span>{stats.serverHealth.cpu}%</span>
            </div>
            <div className="w-full bg-black/40 rounded-full h-3 overflow-hidden border border-white/5">
              <div 
                className="bg-gradient-to-r from-blue-500 to-cyan-400 h-3 rounded-full transition-all duration-1000"
                style={{ width: `${stats.serverHealth.cpu}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-400">
              <span>RAM Usage</span>
              <span>{stats.serverHealth.ram}%</span>
            </div>
            <div className="w-full bg-black/40 rounded-full h-3 overflow-hidden border border-white/5">
              <div 
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-1000"
                style={{ width: `${stats.serverHealth.ram}%` }}
              />
            </div>
          </div>
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

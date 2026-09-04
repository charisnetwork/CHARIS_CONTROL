import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Users, Plus, Search, Download, DollarSign, TrendingUp, 
  Activity, CheckCircle, XCircle, MoreVertical, Building, Mail, Phone,
  FileText, Briefcase, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = (import.meta.env.VITE_Control_api_Backend || 'https://chariscontrol-production.up.railway.app').replace(/\/+$/, '');

type Affiliate = {
  id: string;
  name: string;
  company?: string;
  email: string;
  mobile?: string;
  address?: string;
  pan?: string;
  gstin?: string;
  affiliateCode: string;
  couponCode: string;
  commissionType: 'percentage' | 'fixed';
  commissionBasis: 'net' | 'gross';
  commissionValue: number;
  isActive: boolean;
};

const emptyAffiliate = (): Partial<Affiliate> => ({
  name: '', company: '', email: '', mobile: '', address: '', pan: '', gstin: '', 
  affiliateCode: '', couponCode: '', commissionType: 'percentage', commissionBasis: 'net', commissionValue: 0, isActive: true
});

export const AffiliatesList = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'directory' | 'reports'>('reports');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Affiliate>>(emptyAffiliate());
  const [searchTerm, setSearchTerm] = useState('');

  // Mock Queries (replace with real API later)
  const { data: affiliates = [] } = useQuery<Affiliate[]>({
    queryKey: ['affiliates'],
    queryFn: async () => {
      try {
        return (await axios.get(`${API_BASE}/api/affiliates`)).data;
      } catch (e) {
        // Fallback Mock Data
        return [
          { id: '1', name: 'John Doe', company: 'Tech Promoters Inc.', email: 'john@techpromo.com', mobile: '+919876543210', affiliateCode: 'JD001', couponCode: 'JOHN20', commissionType: 'percentage', commissionBasis: 'net', commissionValue: 15, isActive: true },
          { id: '2', name: 'Alice Smith', email: 'alice.smith@gmail.com', affiliateCode: 'AS002', couponCode: 'ALICE10', commissionType: 'fixed', commissionBasis: 'gross', commissionValue: 500, isActive: true }
        ];
      }
    }
  });

  const { data: reports } = useQuery({
    queryKey: ['affiliate-reports'],
    queryFn: async () => {
      try {
        return (await axios.get(`${API_BASE}/api/affiliates/reports`)).data;
      } catch (e) {
        // Fallback Mock Data
        return {
          metrics: { totalAffiliates: 24, activeAffiliates: 18, salesThisMonth: 142, revenue: 425000, commissionPayable: 45000, commissionPaid: 32000 },
          table: [
            { id: '1', affiliate: 'John Doe', coupon: 'JOHN20', salesCount: 45, grossSales: 150000, netRevenue: 135000, commission: 20250 },
            { id: '2', affiliate: 'Alice Smith', coupon: 'ALICE10', salesCount: 12, grossSales: 60000, netRevenue: 60000, commission: 6000 }
          ]
        };
      }
    }
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Affiliate>) => axios.post(`${API_BASE}/api/affiliates`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['affiliates'] }); setIsModalOpen(false); setFormData(emptyAffiliate()); }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const filteredAffiliates = affiliates.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.affiliateCode.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border-color)] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" /> Affiliate Management
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Manage partner network, commissions, and track monthly sales performance.</p>
        </div>
        <div className="flex bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border-color)]">
          <button 
            onClick={() => setActiveTab('reports')} 
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'reports' ? 'bg-[var(--bg-card)] text-white shadow-md' : 'text-[var(--text-muted)] hover:text-white'}`}
          >
            Monthly Reports
          </button>
          <button 
            onClick={() => setActiveTab('directory')} 
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'directory' ? 'bg-[var(--bg-card)] text-white shadow-md' : 'text-[var(--text-muted)] hover:text-white'}`}
          >
            Directory
          </button>
        </div>
      </div>

      {activeTab === 'reports' && reports && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Metrics Dashboard */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Active Affiliates', value: reports.metrics.activeAffiliates, total: reports.metrics.totalAffiliates, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10' },
              { label: 'Sales This Month', value: reports.metrics.salesThisMonth, icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
              { label: 'Total Revenue', value: `₹${reports.metrics.revenue.toLocaleString()}`, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-400/10' },
              { label: 'Commission Payable', value: `₹${reports.metrics.commissionPayable.toLocaleString()}`, icon: DollarSign, color: 'text-orange-400', bg: 'bg-orange-400/10' },
              { label: 'Commission Paid', value: `₹${reports.metrics.commissionPaid.toLocaleString()}`, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
            ].map((metric, i) => (
              <div key={i} className="bg-[var(--bg-card)] p-5 rounded-2xl border border-[var(--border-color)] flex flex-col justify-between hover:border-slate-500 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-2 rounded-lg ${metric.bg} ${metric.color}`}><metric.icon className="w-5 h-5" /></div>
                </div>
                <div>
                  <h4 className="text-2xl font-black text-white">{metric.value}{metric.total && <span className="text-sm font-medium text-[var(--text-muted)] ml-1">/ {metric.total}</span>}</h4>
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mt-1">{metric.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Reports Table */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-secondary)]/50">
              <h3 className="font-bold text-white text-lg">Monthly Performance</h3>
              <button className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--bg-secondary)]/80 text-[var(--text-muted)] font-semibold border-b border-[var(--border-color)]">
                  <tr>
                    <th className="px-6 py-4">Affiliate</th>
                    <th className="px-6 py-4">Coupon Used</th>
                    <th className="px-6 py-4 text-center">Sales Count</th>
                    <th className="px-6 py-4 text-right">Gross Sales</th>
                    <th className="px-6 py-4 text-right">Net Revenue</th>
                    <th className="px-6 py-4 text-right text-emerald-400">Commission Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {reports.table.map((row: any) => (
                    <tr key={row.id} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-white flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/20 text-primary flex items-center justify-center">{row.affiliate.charAt(0)}</div>
                        {row.affiliate}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs bg-[var(--bg-secondary)] rounded my-2 inline-block px-2 py-1 text-slate-300">{row.coupon}</td>
                      <td className="px-6 py-4 text-center font-bold text-white">{row.salesCount}</td>
                      <td className="px-6 py-4 text-right text-[var(--text-secondary)]">₹{row.grossSales.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right text-white font-medium">₹{row.netRevenue.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-black text-emerald-400">₹{row.commission.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'directory' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
              <input type="text" placeholder="Search affiliates by name or code..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl pl-12 pr-4 py-3 text-white focus:border-primary outline-none shadow-sm" />
            </div>
            <button onClick={() => setIsModalOpen(true)} className="flex items-center justify-center gap-2 bg-primary hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all">
              <Plus className="w-5 h-5" /> Add Affiliate
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAffiliates.map(affiliate => (
              <div key={affiliate.id} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden hover:border-slate-500 transition-colors shadow-sm group">
                <div className="p-6 border-b border-[var(--border-color)] relative">
                  <div className="absolute top-4 right-4">
                    <button className="text-[var(--text-muted)] hover:text-white p-1 rounded-md hover:bg-[var(--bg-hover)]"><MoreVertical className="w-5 h-5" /></button>
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-purple-500 p-[2px]">
                      <div className="w-full h-full rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-xl font-black text-white">
                        {affiliate.name.charAt(0)}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">{affiliate.name}</h3>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-sm ${affiliate.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>{affiliate.isActive ? 'Active' : 'Inactive'}</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                    {affiliate.company && <div className="flex items-center gap-2"><Building className="w-4 h-4 text-[var(--text-muted)]" /> {affiliate.company}</div>}
                    <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-[var(--text-muted)]" /> {affiliate.email}</div>
                    {affiliate.mobile && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-[var(--text-muted)]" /> {affiliate.mobile}</div>}
                  </div>
                </div>
                <div className="p-6 bg-[var(--bg-secondary)]/30 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3 rounded-xl text-center">
                      <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-1">Affiliate Code</div>
                      <div className="font-mono text-sm text-white font-bold">{affiliate.affiliateCode}</div>
                    </div>
                    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3 rounded-xl text-center">
                      <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-1">Coupon Code</div>
                      <div className="font-mono text-sm text-purple-400 font-bold">{affiliate.couponCode}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-4">
                    <div className="text-sm text-[var(--text-muted)] flex items-center gap-1"><Briefcase className="w-4 h-4" /> Commission</div>
                    <div className="font-black text-emerald-400 text-lg">
                      {affiliate.commissionType === 'percentage' ? `${affiliate.commissionValue}%` : `₹${affiliate.commissionValue}`}
                      <span className="text-[10px] text-[var(--text-muted)] ml-1 uppercase">{affiliate.commissionBasis}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Affiliate Form Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="flex justify-between items-center p-6 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <h2 className="text-xl font-black text-white">Add New Affiliate</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-white p-1 rounded-full hover:bg-[var(--bg-hover)]"><XCircle className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <form id="affiliate-form" onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2"><User className="w-4 h-4" /> Personal / Company Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="space-y-1"><span className="text-sm font-bold text-white">Full Name *</span><input required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-white focus:border-primary outline-none" /></label>
                      <label className="space-y-1"><span className="text-sm font-bold text-white">Company (Optional)</span><input value={formData.company} onChange={e=>setFormData({...formData, company: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-white focus:border-primary outline-none" /></label>
                      <label className="space-y-1"><span className="text-sm font-bold text-white">Email Address *</span><input type="email" required value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-white focus:border-primary outline-none" /></label>
                      <label className="space-y-1"><span className="text-sm font-bold text-white">Mobile Number</span><input value={formData.mobile} onChange={e=>setFormData({...formData, mobile: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-white focus:border-primary outline-none" /></label>
                      <label className="space-y-1 md:col-span-2"><span className="text-sm font-bold text-white">Full Address</span><textarea value={formData.address} onChange={e=>setFormData({...formData, address: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-white focus:border-primary outline-none resize-none h-20" /></label>
                    </div>
                  </div>

                  <div className="border-t border-[var(--border-color)] pt-6 space-y-4">
                    <h3 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2"><FileText className="w-4 h-4" /> Tax & Identification</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="space-y-1"><span className="text-sm font-bold text-white">PAN Number</span><input value={formData.pan} onChange={e=>setFormData({...formData, pan: e.target.value.toUpperCase()})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-white uppercase focus:border-primary outline-none" /></label>
                      <label className="space-y-1"><span className="text-sm font-bold text-white">GSTIN</span><input value={formData.gstin} onChange={e=>setFormData({...formData, gstin: e.target.value.toUpperCase()})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-white uppercase focus:border-primary outline-none" /></label>
                    </div>
                  </div>

                  <div className="border-t border-[var(--border-color)] pt-6 space-y-4">
                    <h3 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2"><Briefcase className="w-4 h-4" /> Affiliate Tracking & Commission</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--bg-secondary)]/50 p-4 rounded-xl border border-[var(--border-color)]">
                      <label className="space-y-1"><span className="text-sm font-bold text-white">Affiliate Code *</span><input required value={formData.affiliateCode} onChange={e=>setFormData({...formData, affiliateCode: e.target.value.toUpperCase()})} placeholder="e.g. REF_JD01" className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-white uppercase font-mono focus:border-primary outline-none" /></label>
                      <label className="space-y-1"><span className="text-sm font-bold text-white">Assigned Coupon Code *</span><input required value={formData.couponCode} onChange={e=>setFormData({...formData, couponCode: e.target.value.toUpperCase()})} placeholder="e.g. SAVE20" className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-white uppercase font-mono focus:border-primary outline-none" /></label>
                      
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <label className="space-y-1"><span className="text-sm font-bold text-[var(--text-muted)]">Type</span>
                          <select value={formData.commissionType} onChange={e=>setFormData({...formData, commissionType: e.target.value as any})} className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-white focus:border-primary outline-none">
                            <option value="percentage">Percentage (%)</option>
                            <option value="fixed">Fixed Amount (₹)</option>
                          </select>
                        </label>
                        <label className="space-y-1"><span className="text-sm font-bold text-[var(--text-muted)]">Basis</span>
                          <select value={formData.commissionBasis} onChange={e=>setFormData({...formData, commissionBasis: e.target.value as any})} className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-white focus:border-primary outline-none">
                            <option value="net">Net Revenue</option>
                            <option value="gross">Gross Sales</option>
                          </select>
                        </label>
                      </div>
                      
                      <label className="space-y-1 mt-2"><span className="text-sm font-bold text-white">Commission Value *</span>
                        <div className="flex">
                          <span className="bg-[var(--bg-card)] border border-[var(--border-color)] border-r-0 rounded-l-xl px-4 py-2 text-[var(--text-muted)] font-bold">{formData.commissionType === 'percentage' ? '%' : '₹'}</span>
                          <input required type="number" min="0" step="0.01" value={formData.commissionValue} onChange={e=>setFormData({...formData, commissionValue: Number(e.target.value)})} className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-r-xl px-4 py-2 text-white focus:border-primary outline-none" />
                        </div>
                      </label>
                    </div>
                  </div>
                </form>
              </div>
              <div className="p-6 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 rounded-xl font-bold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors">Cancel</button>
                <button type="submit" form="affiliate-form" disabled={createMutation.isPending} className="px-8 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(59,130,246,0.4)] transition-all flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Save Affiliate
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

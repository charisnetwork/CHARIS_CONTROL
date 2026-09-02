import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useProductStore } from '../../store/productStore';
import { Search, Filter, Download, Plus, AlertCircle, X, MoreVertical } from 'lucide-react';
import { cn } from '../../layouts/DashboardLayout';

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    TRIAL: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    PAST_DUE: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    CANCELLED: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    EXPIRED: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  };
  
  return (
    <span className={cn("px-2.5 py-1 rounded-full text-xs font-bold border", styles[status] || styles.EXPIRED)}>
      {status.replace('_', ' ')}
    </span>
  );
};

export const SubscriptionsList = () => {
  const { selectedProduct, isAllApplications } = useProductStore();
  const [searchTerm, setSearchTerm] = useState('');
  
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    planId: '',
    billingCycle: 'monthly'
  });

  // Close dropdown on click outside
  useEffect(() => {
    const closeDropdown = () => setActiveDropdown(null);
    document.addEventListener('click', closeDropdown);
    return () => document.removeEventListener('click', closeDropdown);
  }, []);

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ['subscriptions', isAllApplications ? 'all' : selectedProduct?.id],
    queryFn: async () => {
      if (isAllApplications) return []; // In a real app, this might fetch platform wide or we disable it
      const res = await axios.get(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/subscriptions?productId=${selectedProduct?.id}`);
      return res.data;
    },
    enabled: !isAllApplications && !!selectedProduct?.id
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['plans', selectedProduct?.id],
    queryFn: async () => {
      const res = await axios.get(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/plans?productId=${selectedProduct?.id}`);
      return res.data;
    },
    enabled: !!selectedProduct?.id && isModalOpen
  });

  const createSubMutation = useMutation({
    mutationFn: async (newSub: any) => {
      return axios.post(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/subscriptions`, { ...newSub, productId: selectedProduct?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions', selectedProduct?.id] });
      setIsModalOpen(false);
      setFormData({ customerName: '', customerEmail: '', planId: '', billingCycle: 'monthly' });
    }
  });

  const updateSubMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      return axios.put(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/subscriptions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions', selectedProduct?.id] });
    }
  });

  if (isAllApplications) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="w-16 h-16 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Product Context</h2>
        <p className="text-slate-400 max-w-md">
          To manage and view subscriptions, please select a specific product from the context menu in the header.
        </p>
      </div>
    );
  }

  const filteredSubs = subscriptions.filter((sub: any) => 
    sub.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.customerEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    const headers = ['Customer Name', 'Email', 'Plan', 'Billing Cycle', 'Price', 'Status', 'Next Renewal'];
    const csvContent = [
      headers.join(','),
      ...filteredSubs.map((sub: any) => 
        `"${sub.customerName}","${sub.customerEmail}","${sub.planName}","${sub.billingCycle}","${sub.price}","${sub.status}","${new Date(sub.nextRenewalDate).toLocaleDateString()}"`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `subscriptions_${selectedProduct?.displayName || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createSubMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Subscriptions</h1>
          <p className="text-slate-400 text-sm">Manage {selectedProduct?.displayName} subscriptions and billing lifecycle.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={handleExport} className="flex items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] px-4 py-2 rounded-lg text-sm font-medium hover:border-[var(--primary)] transition-colors text-[var(--text-secondary)] hover:text-white">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            <Plus className="w-4 h-4" /> Create Plan
          </button>
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[var(--border-color)] flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-500"
            />
          </div>
          <button className="flex items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] px-4 py-2 rounded-lg text-sm font-medium hover:border-[var(--primary)] transition-colors text-slate-300">
            <Filter className="w-4 h-4" /> Filters
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[var(--bg-secondary)] text-slate-400 font-medium">
              <tr>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Plan</th>
                <th className="px-6 py-4">Price</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Next Renewal</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">Loading subscriptions...</td>
                </tr>
              ) : filteredSubs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">No subscriptions found.</td>
                </tr>
              ) : (
                filteredSubs.map((sub: any) => (
                  <tr key={sub.id} className="hover:bg-[var(--bg-hover)] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{sub.customerName}</div>
                      <div className="text-xs text-slate-500">{sub.customerEmail}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-indigo-400">{sub.planName}</div>
                      <div className="text-xs text-slate-500 uppercase">{sub.billingCycle}</div>
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-slate-300">
                      ₹{sub.price.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {new Date(sub.nextRenewalDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block text-left" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setActiveDropdown(activeDropdown === sub.id ? null : sub.id)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {activeDropdown === sub.id && (
                          <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none py-1">
                            <button 
                              onClick={() => { updateSubMutation.mutate({ id: sub.id, data: { action: 'upgrade' } }); setActiveDropdown(null); }}
                              className="block w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
                              Upgrade Plan
                            </button>
                            <button 
                              onClick={() => { updateSubMutation.mutate({ id: sub.id, data: { action: 'downgrade' } }); setActiveDropdown(null); }}
                              className="block w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
                              Downgrade Plan
                            </button>
                            <button 
                              onClick={() => { updateSubMutation.mutate({ id: sub.id, data: { action: 'extend' } }); setActiveDropdown(null); }}
                              className="block w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
                              Extend Renewal
                            </button>
                            <button 
                              onClick={() => { updateSubMutation.mutate({ id: sub.id, data: { status: 'CANCELLED' } }); setActiveDropdown(null); }}
                              className="block w-full text-left px-4 py-2 text-sm text-rose-500 hover:bg-rose-500/10 hover:text-rose-400">
                              Cancel Subscription
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination mock */}
        <div className="p-4 border-t border-[var(--border-color)] flex items-center justify-between text-sm text-slate-400">
          <div>Showing {filteredSubs.length} of {subscriptions.length} results</div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 border border-[var(--border-color)] rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50" disabled>Prev</button>
            <button className="px-3 py-1 border border-[var(--border-color)] rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50" disabled>Next</button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-bold text-white">Create Subscription</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300">Customer Name</label>
                <input required type="text" value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300">Customer Email</label>
                <input required type="email" value={formData.customerEmail} onChange={e => setFormData({...formData, customerEmail: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:outline-none" />
              </div>
              
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300">Plan</label>
                <select required value={formData.planId} onChange={e => setFormData({...formData, planId: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:outline-none">
                  <option value="" disabled>Select a plan</option>
                  {plans.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} - ₹{p.monthlyPrice}/mo</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300">Billing Cycle</label>
                <select required value={formData.billingCycle} onChange={e => setFormData({...formData, billingCycle: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:outline-none">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-6 mt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={createSubMutation.isPending} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
                  Create Subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

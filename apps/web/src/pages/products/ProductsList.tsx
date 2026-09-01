import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useProductStore } from '../../store/productStore';
import { Plus, Package, Globe, Key, Link as LinkIcon, Trash2 } from 'lucide-react';


export const ProductsList = () => {
  const queryClient = useQueryClient();
  const { setProducts } = useProductStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    applicationName: '',
    displayName: '',
    apiBaseUrl: '',
    description: ''
  });

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await axios.get('http://localhost:4000/api/applications');
      setProducts(res.data);
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await axios.post('http://localhost:4000/api/applications', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      setShowAddForm(false);
      setFormData({ applicationName: '', displayName: '', apiBaseUrl: '', description: '' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`http://localhost:4000/api/applications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    }
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Connected Applications</h1>
          <p className="text-slate-400 text-sm">Register external applications to sync their subscription and billing data.</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Application
        </button>
      </div>

      {showAddForm && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-xl">
          <h2 className="text-lg font-bold text-white mb-4">Register New Application</h2>
          <form 
            onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">System Name (unique code)</label>
              <input 
                required
                placeholder="e.g. charis_civil"
                value={formData.applicationName}
                onChange={e => setFormData({ ...formData, applicationName: e.target.value })}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Display Name</label>
              <input 
                required
                placeholder="e.g. Charis Civil"
                value={formData.displayName}
                onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white text-sm"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-400 uppercase">API Base URL</label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  required
                  placeholder="https://civil.charis.com"
                  value={formData.apiBaseUrl}
                  onChange={e => setFormData({ ...formData, apiBaseUrl: e.target.value })}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg pl-9 pr-4 py-2 text-white text-sm"
                />
              </div>
            </div>
            <div className="md:col-span-2 pt-4 flex justify-end gap-3">
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={createMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                {createMutation.isPending ? 'Saving...' : 'Register Application'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="col-span-full text-slate-400 py-10 text-center">Loading applications...</div>
        ) : applications.length === 0 ? (
          <div className="col-span-full text-slate-400 py-10 text-center">No applications registered. Click "Add Application" to connect one.</div>
        ) : (
          applications.map((app: any) => (
            <div key={app.id} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 flex items-start justify-between group hover:border-indigo-500/50 transition-colors">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-[var(--bg-secondary)] rounded-lg flex items-center justify-center text-indigo-400 border border-[var(--border-color)]">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg leading-tight">{app.displayName}</h3>
                  <div className="text-slate-500 text-xs font-mono mb-2">{app.applicationName}</div>
                  
                  <div className="flex items-center gap-2 text-xs text-slate-400 bg-[var(--bg-secondary)] px-2 py-1 rounded w-fit border border-[var(--border-color)]">
                    <Globe className="w-3 h-3 text-emerald-500" /> {app.apiBaseUrl}
                  </div>
                  {app.apiKey && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-indigo-300 bg-indigo-500/10 px-2 py-1.5 rounded w-fit border border-indigo-500/20 font-mono">
                      <Key className="w-3 h-3" /> {app.apiKey}
                    </div>
                  )}
                </div>
              </div>
              
              <button 
                onClick={() => {
                  if (confirm(`Are you sure you want to delete ${app.displayName}?`)) {
                    deleteMutation.mutate(app.id);
                  }
                }}
                className="text-slate-500 hover:text-rose-500 p-2 rounded hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

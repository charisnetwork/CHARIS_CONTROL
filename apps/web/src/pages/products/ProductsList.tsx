import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useProductStore } from '../../store/productStore';
import { Plus, Package, Globe, Link as LinkIcon, Trash2, Copy, Eye, EyeOff, Shield, RefreshCw, ChevronDown } from 'lucide-react';

const CredentialRow = ({ label, value, onCopy }: { label: string, value: string, onCopy: () => void }) => (
  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3 rounded-lg flex items-center justify-between group hover:border-indigo-500/30 transition-colors">
    <div className="flex-1 overflow-hidden">
      <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">{label}</div>
      <div className="font-mono text-xs text-slate-300 truncate pr-4">
        {value || 'Not configured'}
      </div>
    </div>
    <button 
      onClick={onCopy}
      className="p-1.5 text-slate-400 hover:text-indigo-400 bg-[var(--bg-secondary)] hover:bg-indigo-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
      title="Copy to Clipboard"
    >
      <Copy className="w-4 h-4" />
    </button>
  </div>
);

const ApplicationCard = ({ app, deleteMutation }: { app: any, deleteMutation: any }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'integration'>('overview');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const queryClient = useQueryClient();

  const rotateKeys = useMutation({
    mutationFn: async () => {
      await axios.post(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/applications/${app.id}/keys`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] })
  });

  const rotateWebhook = useMutation({
    mutationFn: async () => {
      await axios.post(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/applications/${app.id}/webhook-secret`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] })
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden transition-all duration-300 shadow-sm hover:shadow-indigo-500/10 hover:border-indigo-500/30">
        <div className="p-5 flex items-start justify-between group hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex gap-4">
             <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
               <Package className="w-6 h-6" />
             </div>
             <div>
               <h3 className="text-white font-bold text-lg leading-tight flex items-center gap-2">
                 {app.displayName}
                 <span className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
                   <ChevronDown className="w-4 h-4 text-slate-500" />
                 </span>
               </h3>
               <div className="text-slate-500 text-xs font-mono mb-2">{app.applicationName}</div>
               
               <div className="flex items-center gap-2 text-xs text-slate-400 bg-[var(--bg-secondary)] px-2 py-1 rounded w-fit border border-[var(--border-color)]">
                 <Globe className="w-3 h-3 text-emerald-500" /> {app.apiBaseUrl}
               </div>
             </div>
          </div>
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Are you sure you want to delete ${app.displayName}?`)) {
                deleteMutation.mutate(app.id);
              }
            }}
            className="text-slate-500 hover:text-rose-500 p-2 rounded hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {expanded && (
          <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/50 p-5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex gap-4 mb-4 border-b border-[var(--border-color)] pb-2">
              <button 
                onClick={() => setActiveTab('overview')}
                className={`text-sm font-medium px-1 pb-2 border-b-2 transition-colors ${activeTab === 'overview' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Overview
              </button>
              <button 
                onClick={() => setActiveTab('integration')}
                className={`text-sm font-medium px-1 pb-2 border-b-2 transition-colors ${activeTab === 'integration' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Developer Integration
              </button>
            </div>

            {activeTab === 'overview' && (
              <div className="space-y-4 text-sm text-slate-300">
                <p>{app.description || 'No description provided.'}</p>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-[var(--bg-card)] p-3 rounded-lg border border-[var(--border-color)]">
                    <div className="text-xs text-slate-500 mb-1 uppercase font-bold">Environment</div>
                    <div className="flex items-center gap-2">
                       <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></span>
                       {app.environment || 'PRODUCTION'}
                    </div>
                  </div>
                  <div className="bg-[var(--bg-card)] p-3 rounded-lg border border-[var(--border-color)]">
                    <div className="text-xs text-slate-500 mb-1 uppercase font-bold">Status</div>
                    <div>{app.status || 'ACTIVE'}</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'integration' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    API Credentials
                  </h4>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => rotateKeys.mutate()}
                      disabled={rotateKeys.isPending}
                      className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${rotateKeys.isPending ? 'animate-spin' : ''}`} />
                      Rotate Keys
                    </button>
                    <button 
                      onClick={() => rotateWebhook.mutate()}
                      disabled={rotateWebhook.isPending}
                      className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${rotateWebhook.isPending ? 'animate-spin' : ''}`} />
                      Rotate Webhook
                    </button>
                  </div>
                </div>

                <div className="grid gap-3">
                  <CredentialRow label="API Key" value={app.apiKey} onCopy={() => copyToClipboard(app.apiKey)} />
                  <CredentialRow label="Public Key" value={app.publicKey} onCopy={() => copyToClipboard(app.publicKey)} />
                  <CredentialRow label="Webhook URL" value={app.webhookUrl || 'Not configured'} onCopy={() => app.webhookUrl && copyToClipboard(app.webhookUrl)} />
                  
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3 rounded-lg flex items-center justify-between group hover:border-indigo-500/30 transition-colors">
                    <div className="flex-1 overflow-hidden">
                      <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Webhook Secret</div>
                      <div className="font-mono text-xs text-indigo-200 truncate pr-4">
                        {app.webhookSecret ? (showWebhookSecret ? app.webhookSecret : '•'.repeat(32)) : 'Not configured'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        className="p-1.5 text-slate-400 hover:text-white bg-[var(--bg-secondary)] hover:bg-[var(--bg-card)] rounded transition-colors"
                        title={showWebhookSecret ? "Hide Secret" : "Reveal Secret"}
                      >
                        {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => app.webhookSecret && copyToClipboard(app.webhookSecret)}
                        className="p-1.5 text-slate-400 hover:text-indigo-400 bg-[var(--bg-secondary)] hover:bg-indigo-500/10 rounded transition-colors"
                        title="Copy to Clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
  );
};

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
      const res = await axios.get(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/applications`);
      setProducts(res.data);
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await axios.post(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/applications`, data);
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
      await axios.delete(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/applications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    }
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
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
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
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

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="text-slate-400 py-10 text-center animate-pulse">Loading applications...</div>
        ) : applications.length === 0 ? (
          <div className="text-slate-400 py-10 text-center border border-dashed border-[var(--border-color)] rounded-xl">
            No applications registered. Click "Add Application" to connect one.
          </div>
        ) : (
          applications.map((app: any) => (
            <ApplicationCard key={app.id} app={app} deleteMutation={deleteMutation} />
          ))
        )}
      </div>
    </div>
  );
};

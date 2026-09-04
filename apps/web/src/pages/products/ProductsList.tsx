import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useProductStore } from '../../store/productStore';
import { Plus, Package, Globe, Link as LinkIcon, Trash2, Copy, Eye, EyeOff, Shield, RefreshCw, ChevronDown, Check, Save, Sparkles, Key } from 'lucide-react';

const CredentialRow = ({ label, value, envName, onCopy }: { label: string, value: string, envName?: string, onCopy: () => void }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3.5 rounded-lg flex items-center justify-between group hover:border-indigo-500/30 transition-colors">
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{label}</span>
          {envName && (
            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
              {envName}
            </span>
          )}
        </div>
        <div className="font-mono text-xs text-slate-200 truncate pr-4">
          {value || 'Not configured'}
        </div>
      </div>
      <button 
        onClick={handleCopy}
        className="p-2 text-slate-400 hover:text-indigo-400 bg-[var(--bg-secondary)] hover:bg-indigo-500/10 rounded-lg transition-colors flex items-center gap-1 text-xs"
        title="Copy to Clipboard"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        <span className="hidden sm:inline text-[11px] font-medium">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
};

const ApplicationCard = ({ app, deleteMutation }: { app: any, deleteMutation: any }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'integration'>('overview');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [webhookUrlInput, setWebhookUrlInput] = useState('');
  const [copiedEnv, setCopiedEnv] = useState(false);
  const queryClient = useQueryClient();

  const getApiUrl = (path: string) => {
    const base = (import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '');
    return `${base}${path}`;
  };

  const { data: credentials, isLoading: loadingCredentials } = useQuery({
    queryKey: ['application-credentials', app.id],
    queryFn: async () => {
      const res = await axios.get(getApiUrl(`/api/applications/${app.id}/credentials`));
      return res.data;
    },
    enabled: expanded && activeTab === 'integration'
  });

  useEffect(() => {
    if (credentials?.webhookUrl !== undefined) {
      setWebhookUrlInput(credentials.webhookUrl || '');
    } else if (app.webhookUrl) {
      setWebhookUrlInput(app.webhookUrl);
    }
  }, [credentials, app.webhookUrl]);

  const updateWebhookUrlMutation = useMutation({
    mutationFn: async (webhookUrl: string) => {
      const res = await axios.put(getApiUrl(`/api/applications/${app.id}/credentials`), { webhookUrl });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application-credentials', app.id] });
    }
  });

  const generateAllMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(getApiUrl(`/api/applications/${app.id}/generate-all`));
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application-credentials', app.id] });
    }
  });

  const rotateKeys = useMutation({
    mutationFn: async () => {
      await axios.post(getApiUrl(`/api/applications/${app.id}/keys`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application-credentials', app.id] });
    }
  });

  const rotateWebhook = useMutation({
    mutationFn: async () => {
      await axios.post(getApiUrl(`/api/applications/${app.id}/webhook-secret`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application-credentials', app.id] });
    }
  });

  const copyToClipboard = (text: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
    }
  };

  const activeApiKey = credentials?.apiKey || app.apiKey || '';
  const activePublicKey = credentials?.publicKey || app.publicKey || '';
  const activeWebhookSecret = credentials?.webhookSecret || app.webhookSecret || '';
  const activeWebhookUrl = credentials?.webhookUrl || app.webhookUrl || '';
  const activeAppId = credentials?.id || app.id || '';

  const formattedEnvBlock = `CONTROL_CENTER_URL=https://chariscontrol-production.up.railway.app
CONTROL_CENTER_APPLICATION_ID=${activeAppId}
CONTROL_CENTER_API_KEY=${activeApiKey}
CONTROL_CENTER_PUBLIC_KEY="${(activePublicKey || '').replace(/\n/g, '\\n')}"
CONTROL_CENTER_WEBHOOK_SECRET=${activeWebhookSecret}`;

  const copyAllEnv = () => {
    navigator.clipboard.writeText(formattedEnvBlock);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const isMissingKeys = !activeApiKey || !activePublicKey || !activeWebhookSecret;

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
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    API Credentials & Webhook Listener
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Connect {app.displayName} backend to Control Centre for live subscriptions & RSA-signed entitlement checks.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => generateAllMutation.mutate()}
                    disabled={generateAllMutation.isPending}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${generateAllMutation.isPending ? 'animate-spin' : ''}`} />
                    {generateAllMutation.isPending ? 'Generating...' : isMissingKeys ? 'Generate All Credentials' : 'Regenerate All Keys'}
                  </button>
                  <button 
                    onClick={() => rotateKeys.mutate()}
                    disabled={rotateKeys.isPending}
                    className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rotateKeys.isPending ? 'animate-spin' : ''}`} />
                    Rotate Signing Keys
                  </button>
                  <button 
                    onClick={() => rotateWebhook.mutate()}
                    disabled={rotateWebhook.isPending}
                    className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rotateWebhook.isPending ? 'animate-spin' : ''}`} />
                    Rotate Webhook Secret
                  </button>
                </div>
              </div>

              {loadingCredentials ? (
                <div className="py-6 text-center text-xs text-slate-400 animate-pulse">Loading API credentials...</div>
              ) : (
                <div className="grid gap-3">
                  <CredentialRow 
                    label="Application ID" 
                    envName="CONTROL_CENTER_APPLICATION_ID"
                    value={activeAppId} 
                    onCopy={() => copyToClipboard(activeAppId)} 
                  />

                  <CredentialRow 
                    label="API Key" 
                    envName="CONTROL_CENTER_API_KEY"
                    value={activeApiKey} 
                    onCopy={() => copyToClipboard(activeApiKey)} 
                  />
                  
                  <CredentialRow 
                    label="Public Key (RSA 2048)" 
                    envName="CONTROL_CENTER_PUBLIC_KEY"
                    value={activePublicKey} 
                    onCopy={() => copyToClipboard(activePublicKey)} 
                  />

                  {/* Editable Webhook URL */}
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3.5 rounded-lg space-y-2 hover:border-indigo-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Webhook Listener URL</span>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          Target Endpoint
                        </span>
                      </div>
                      {activeWebhookUrl && (
                        <button 
                          onClick={() => copyToClipboard(activeWebhookUrl)}
                          className="text-xs text-slate-400 hover:text-indigo-400 flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">Copy</span>
                        </button>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <input 
                        type="url"
                        placeholder="e.g. https://bill-easy-production.up.railway.app/api/webhooks/charis"
                        value={webhookUrlInput}
                        onChange={(e) => setWebhookUrlInput(e.target.value)}
                        className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                      />
                      <button 
                        onClick={() => updateWebhookUrlMutation.mutate(webhookUrlInput)}
                        disabled={updateWebhookUrlMutation.isPending}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {updateWebhookUrlMutation.isPending ? 'Saving...' : 'Save Webhook URL'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Webhook Secret */}
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3.5 rounded-lg flex items-center justify-between group hover:border-indigo-500/30 transition-colors">
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Webhook Secret</span>
                        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                          CONTROL_CENTER_WEBHOOK_SECRET
                        </span>
                      </div>
                      <div className="font-mono text-xs text-indigo-200 truncate pr-4">
                        {activeWebhookSecret ? (showWebhookSecret ? activeWebhookSecret : '•'.repeat(32)) : 'Not configured'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        className="p-2 text-slate-400 hover:text-white bg-[var(--bg-secondary)] hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                        title={showWebhookSecret ? "Hide Secret" : "Reveal Secret"}
                      >
                        {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => activeWebhookSecret && copyToClipboard(activeWebhookSecret)}
                        className="p-2 text-slate-400 hover:text-indigo-400 bg-[var(--bg-secondary)] hover:bg-indigo-500/10 rounded-lg transition-colors"
                        title="Copy to Clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Instructions & Ready-to-paste Railway Environment Block */}
                  <div className="mt-4 p-4 bg-slate-900/80 border border-indigo-500/30 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                        <Key className="w-4 h-4 text-indigo-400" />
                        Railway / Bill Easy .env Configuration
                      </div>
                      <button 
                        onClick={copyAllEnv}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                      >
                        {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedEnv ? 'Copied All Vars!' : 'Copy All .env Variables'}
                      </button>
                    </div>
                    
                    <p className="text-xs text-slate-400">
                      Copy these environment variables directly into your Bill Easy Railway Variables or local <code className="text-indigo-300 font-mono">.env</code> file.
                    </p>

                    <pre className="bg-black/60 p-3 rounded-lg font-mono text-[11px] text-emerald-300 border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                      {formattedEnvBlock}
                    </pre>
                  </div>
                </div>
              )}
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
    webhookUrl: '',
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
      setFormData({ applicationName: '', displayName: '', apiBaseUrl: '', webhookUrl: '', description: '' });
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
                placeholder="e.g. billeasy"
                value={formData.applicationName}
                onChange={e => setFormData({ ...formData, applicationName: e.target.value })}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Display Name</label>
              <input 
                required
                placeholder="e.g. Bill Easy"
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
                  placeholder="https://bill-easy-production.up.railway.app"
                  value={formData.apiBaseUrl}
                  onChange={e => setFormData({ ...formData, apiBaseUrl: e.target.value })}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg pl-9 pr-4 py-2 text-white text-sm"
                />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Webhook Listener URL (Optional)</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  placeholder="https://bill-easy-production.up.railway.app/api/webhooks/charis"
                  value={formData.webhookUrl}
                  onChange={e => setFormData({ ...formData, webhookUrl: e.target.value })}
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


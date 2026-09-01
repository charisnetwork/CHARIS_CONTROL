import React, { useState, useEffect } from 'react';
import { useProductStore } from '../store/productStore';
import type { Product } from '../store/productStore';
import { Package, Globe, Plus, Server, ArrowRight, X } from 'lucide-react';

interface Props {
  api: any;
}

const ProductSelectionScreen: React.FC<Props> = ({ api }) => {
  const { products, setProducts, selectProduct } = useProductStore();
  const [loading, setLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>({
    productName: '', displayName: '', logo: '', description: '', version: '1.0.0',
    environment: 'PRODUCTION', apiBaseUrl: '', healthApi: '', customerApi: '',
    subscriptionApi: '', couponApi: '', notificationApi: '', authenticationMethod: 'JWT', status: 'ACTIVE'
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res.data);
    } catch (error) {
      console.error('Failed to fetch products', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/products', formData);
      setShowRegisterModal(false);
      fetchProducts();
    } catch (error) {
      console.error(error);
      alert('Failed to register product');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-500 font-black animate-pulse">LOADING REGISTRY...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 selection:bg-indigo-500/30">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-white mb-2">Charis Control Center</h1>
          <p className="text-slate-400 font-medium">Select a product context to begin administration.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {products.map(product => (
            <button
              key={product.id}
              onClick={() => selectProduct(product.id)}
              className="group bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-6 text-left transition-all hover:shadow-2xl hover:shadow-indigo-500/10"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Package className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">
                  {product.environment}
                </span>
              </div>
              <h3 className="text-xl font-black text-white mb-1 group-hover:text-indigo-400 transition-colors">{product.displayName}</h3>
              <p className="text-slate-500 text-sm mb-4 line-clamp-2">{product.description || 'No description provided.'}</p>
              <div className="flex items-center text-[10px] font-black text-slate-400 uppercase gap-4 mt-auto">
                <span className="flex items-center gap-1"><Server className="w-3 h-3" /> {new URL(product.apiBaseUrl).hostname}</span>
              </div>
            </button>
          ))}
          
          <button
            onClick={() => selectProduct('all')}
            className="group bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 hover:border-indigo-500 rounded-3xl p-6 text-left transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white">
                <Globe className="w-6 h-6" />
              </div>
            </div>
            <h3 className="text-xl font-black text-white mb-1 group-hover:text-indigo-300 transition-colors">All Applications</h3>
            <p className="text-indigo-200/60 text-sm mb-4">View combined analytics and manage platform-wide operations.</p>
            <div className="flex items-center text-indigo-400 font-black text-xs uppercase gap-1 mt-auto">
              Enter Platform <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>

        <div className="text-center">
          <button 
            onClick={() => setShowRegisterModal(true)}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-6 py-3 rounded-xl font-bold transition-all text-sm"
          >
            <Plus className="w-5 h-5" /> Register New Product
          </button>
        </div>
      </div>

      {showRegisterModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-black text-white">Register Product</h2>
              <button onClick={() => setShowRegisterModal(false)} className="text-slate-500 hover:text-white"><X /></button>
            </div>
            <form onSubmit={handleRegister} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Product ID (Unique)</label>
                  <input required value={formData.productName} onChange={e => setFormData({...formData, productName: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm focus:border-indigo-500 outline-none" placeholder="e.g. charis_crm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Display Name</label>
                  <input required value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm focus:border-indigo-500 outline-none" placeholder="e.g. Charis CRM" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Description</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm focus:border-indigo-500 outline-none h-20" placeholder="Brief description..." />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Environment</label>
                  <select value={formData.environment} onChange={e => setFormData({...formData, environment: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm focus:border-indigo-500 outline-none">
                    <option value="PRODUCTION">Production</option>
                    <option value="DEVELOPMENT">Development</option>
                    <option value="SANDBOX">Sandbox</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Version</label>
                  <input value={formData.version} onChange={e => setFormData({...formData, version: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm focus:border-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm focus:border-indigo-500 outline-none">
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="MAINTENANCE">Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <h3 className="text-sm font-bold text-white mb-4">API Configurations</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">API Base URL <span className="text-rose-500">*</span></label>
                    <input required value={formData.apiBaseUrl} onChange={e => setFormData({...formData, apiBaseUrl: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm focus:border-indigo-500 outline-none font-mono" placeholder="https://api.billeasy.com" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Customer API Endpoint</label>
                      <input value={formData.customerApi} onChange={e => setFormData({...formData, customerApi: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white text-xs outline-none mt-1 font-mono" placeholder="/v1/admin/customers" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Health API Endpoint</label>
                      <input value={formData.healthApi} onChange={e => setFormData({...formData, healthApi: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white text-xs outline-none mt-1 font-mono" placeholder="/v1/health" />
                    </div>
                  </div>
                </div>
              </div>

              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl transition-colors">
                REGISTER PRODUCT
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductSelectionScreen;

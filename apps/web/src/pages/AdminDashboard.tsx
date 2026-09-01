import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  LayoutDashboard, Globe, Tag, Megaphone, 
  Shield, LogOut,
  Users, CreditCard, ChevronRight,
  Settings, FileText, Bell, Percent
} from 'lucide-react';
import Login from './AdminLogin';
import { useProductStore } from '../store/productStore';
import ProductSelectionScreen from '../components/ProductSelectionScreen';
import DashboardModule from '../components/modules/DashboardModule';
import CustomersModule from '../components/modules/CustomersModule';
import SubscriptionsModule from '../components/modules/SubscriptionsModule';
import CouponsModule from '../components/modules/CouponsModule';
import OffersModule from '../components/modules/OffersModule';
import AffiliatesModule from '../components/modules/AffiliatesModule';
import MarketingModule from '../components/modules/MarketingModule';
import NotificationsModule from '../components/modules/NotificationsModule';
import ReportsModule from '../components/modules/ReportsModule';
import SettingsModule from '../components/modules/SettingsModule';

const API_BASE_URL = ((import.meta.env.VITE_Control_api_Backend || 'http://localhost:8001').replace(/\/+$/, '')) + '/api/admin';

const AdminApp = () => {
  const [token, setToken] = useState(localStorage.getItem('admin_token'));
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  const { selectedProduct, isAllApplications, selectProduct } = useProductStore();

  const apiRef = useRef(axios.create({ baseURL: API_BASE_URL }));
  const api = apiRef.current;

  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use(
      (config) => {
        const currentToken = localStorage.getItem('admin_token');
        if (currentToken) config.headers['Authorization'] = `Bearer ${currentToken}`;
        return config;
      },
      (error) => Promise.reject(error)
    );
    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 || error.response?.status === 403) handleLogout();
        return Promise.reject(error);
      }
    );
    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const response = await api.get('/auth/me');
        setUser(response.data);
      } catch (err) {
        localStorage.removeItem('admin_token');
        setToken(null);
      } finally {
        setAuthLoading(false);
      }
    };
    validateToken();
  }, [token]);

  const handleLogin = (newToken: string, userData: any) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('admin_token', newToken);
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch (err) {}
    localStorage.removeItem('admin_token');
    setToken(null);
    setUser(null);
    selectProduct(null); // Reset product selection on logout
    window.location.reload();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-indigo-400 font-black">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Verifying session...
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <Login onLogin={handleLogin} />;
  }

  // FIRST SCREEN: Product Selection
  if (!selectedProduct && !isAllApplications) {
    return <ProductSelectionScreen api={api} />;
  }

  const SIDEBAR_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'coupons', label: 'Coupons', icon: Tag },
    { id: 'offers', label: 'Offers', icon: Percent },
    { id: 'affiliates', label: 'Affiliates', icon: Globe },
    { id: 'marketing', label: 'Marketing', icon: Megaphone },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderModule = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardModule />;
      case 'customers': return <CustomersModule />;
      case 'subscriptions': return <SubscriptionsModule />;
      case 'coupons': return <CouponsModule />;
      case 'offers': return <OffersModule />;
      case 'affiliates': return <AffiliatesModule />;
      case 'marketing': return <MarketingModule />;
      case 'notifications': return <NotificationsModule />;
      case 'reports': return <ReportsModule />;
      case 'settings': return <SettingsModule />;
      default: return <DashboardModule />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-300 font-sans selection:bg-indigo-500/30">
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col p-6">
        <div className="mb-8">
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-500" />
            CONTROL CENTER
          </h1>
          <p className="text-[10px] text-indigo-400 font-bold tracking-widest mt-1">
            {isAllApplications ? 'ALL APPLICATIONS' : selectedProduct?.productName.toUpperCase()}
          </p>
        </div>

        <button 
          onClick={() => selectProduct(null)} 
          className="mb-6 flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Change Product
        </button>

        <nav className="flex-1 space-y-2 overflow-y-auto pr-2">
          {SIDEBAR_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-bold ${
                activeTab === item.id 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                  : 'text-slate-500 hover:text-white hover:bg-slate-900'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="px-4 py-3 mb-3">
            <p className="text-xs font-bold text-white truncate">{user.email}</p>
            <p className="text-[10px] text-indigo-400 uppercase">{user.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all duration-200 text-sm font-bold"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-white capitalize">{activeTab.replace('-', ' ')}</h2>
            <p className="text-slate-500 text-sm mt-1">
              Data scope: <span className="font-bold text-indigo-400">{isAllApplications ? 'Platform Wide' : selectedProduct?.displayName}</span>
            </p>
          </div>
        </header>

        <div className="animate-in fade-in duration-500">
          {renderModule()}
        </div>
      </main>
    </div>
  );
};

export default AdminApp;

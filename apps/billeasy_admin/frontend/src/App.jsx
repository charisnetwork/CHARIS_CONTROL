import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  LayoutDashboard, Globe, Tag, Megaphone, DollarSign, 
  TrendingUp, TrendingDown, Shield, LogOut, Search, Filter,
  Users, CreditCard, Calendar, BarChart3, Plus, Trash2, Edit, ChevronRight, ExternalLink, Download, Clock
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line 
} from 'recharts';
import * as XLSX from 'xlsx';
import Login from './components/Login';

// Detect if we're running through the main gateway or standalone
const host = window.location.host;
const isGateway = window.location.pathname.startsWith('/admin-portal');

// Admin API URL: all admin routes go through main backend at /api/admin/*
const API_BASE_URL = isGateway 
  ? '/admin/api'  // Through gateway - proxied by main backend
  : ((import.meta.env.VITE_ADMIN_BACKEND_URL || 'http://localhost:8001').replace(/\/+$/, '')) + '/api/admin';

const SAAS_URL = import.meta.env.VITE_SAAS_URL || 'https://charisbilleasy.store';

const AdminApp = () => {
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('admin_token'));
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Axios instance ref
  const apiRef = useRef(axios.create({ baseURL: API_BASE_URL }));
  const api = apiRef.current;
  
  // App state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [summary, setSummary] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [revenueType, setRevenueType] = useState('weekly');
  const [subscribers, setSubscribers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expireFilter, setExpireFilter] = useState('15days');

  const handleExportXLSX = (filteredData) => {
    const exportData = filteredData.map(s => {
      const owner = s.Company?.Users?.[0] || {};
      return {
        'Company Name': s.Company?.name || 'N/A',
        'Plan': s.Plan?.plan_name || 'N/A',
        'Amount': s.price,
        'Status': s.status,
        'Expiry Date': s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : 'N/A',
        'Owner Email': owner.email || 'N/A',
        'Owner Mobile': owner.mobile_number || 'N/A'
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expiring Users");
    XLSX.writeFile(wb, "Expiring_Users.xlsx");
  };
  
  const ALL_FEATURES = [
    { id: 'gst_billing', label: 'GST Invoicing' },
    { id: 'inventory_management', label: 'Inventory Management' },
    { id: 'reports', label: '25+ Reports' },
    { id: 'quotations', label: 'Quotations & Estimates' },
    { id: 'eway_bills', label: 'E-way Bills' },
    { id: 'staff_attendance_payroll', label: 'Staff Attendance & Payroll' },
    { id: 'multi_godowns', label: 'Multiple Godowns/Warehouses' },
    { id: 'manage_businesses', label: 'Manage Multiple Businesses' },
    { id: 'user_activity_tracker', label: 'User Activity Tracker' },
    { id: 'priority_support', label: 'Priority Support' },
  ];
  const [selectedCoupon, setSelectedCoupon] = useState(null);
  const [couponAnalytics, setCouponAnalytics] = useState(null);
  
  // Modal states
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [showAffiliateModal, setShowAffiliateModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  
  const [couponForm, setCouponForm] = useState({
    code: '',
    discount_type: 'percentage',
    discount_value: 0,
    expiry_date: '',
    usage_limit: 100,
    company_id: ''
  });

  const [affiliateForm, setAffiliateForm] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    mobile_no: ''
  });

  const [planForm, setPlanForm] = useState({
    id: '',
    plan_name: '',
    price: 0,
    price_per_month: 0,
    billing_cycle: 'monthly',
    is_active: true
  });

  // Add request interceptor to inject token dynamically
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use(
      (config) => {
        const currentToken = localStorage.getItem('admin_token');
        console.log('[Axios Interceptor] Token:', currentToken ? 'present' : 'missing');
        if (currentToken) {
          config.headers['Authorization'] = `Bearer ${currentToken}`;
          console.log('[Axios Interceptor] Added Authorization header');
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          handleLogout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  // Validate token on mount
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
        console.error('Token validation failed:', err);
        localStorage.removeItem('admin_token');
        setToken(null);
      } finally {
        setAuthLoading(false);
      }
    };
    
    validateToken();
  }, []);

  // Fetch data when authenticated
  useEffect(() => {
    if (token && user) {
      fetchAllData();
    }
  }, [token, user]);

  useEffect(() => {
    if (token && user) {
      fetchRevenue();
    }
  }, [revenueType, token, user]);

  const handleLogin = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('admin_token', newToken);
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // Ignore logout errors
    }
    localStorage.removeItem('admin_token');
    setToken(null);
    setUser(null);
    window.location.reload();
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [sRes, subRes, cRes, afRes, pRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/dashboard/subscribers'),
        api.get('/coupons'),
        api.get('/affiliates'),
        api.get('/plans')
      ]);
      setSummary(sRes.data);
      setSubscribers(subRes.data);
      setCoupons(cRes.data);
      setAffiliates(afRes.data);
      setPlans(pRes.data);
      fetchRevenue();
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFeature = async (planName, featureKey, currentState) => {
    try {
      await api.patch('/plans/update', {
        plan_name: planName,
        feature_key: featureKey,
        is_enabled: !currentState
      });
      const pRes = await api.get('/plans');
      setPlans(pRes.data);
    } catch (err) {
      console.error(err);
      alert('Failed to update feature');
    }
  };

  const handleUpdatePlan = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/plans/${planForm.id}`, {
        price: planForm.price,
        price_per_month: planForm.price_per_month,
        billing_cycle: planForm.billing_cycle,
        is_active: planForm.is_active
      });
      setShowPlanModal(false);
      alert('Plan updated successfully!');
      fetchAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to update plan');
    }
  };

  const handleCreateAffiliate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/affiliates', affiliateForm);
      setShowAffiliateModal(false);
      setAffiliateForm({ company_name: '', contact_person: '', email: '', mobile_no: '' });
      alert('Affiliate added successfully!');
      fetchAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to add affiliate: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteAffiliate = async (id) => {
    if (window.confirm('Delete this affiliate?')) {
      try {
        await api.delete(`/affiliates/${id}`);
        alert('Affiliate deleted!');
        fetchAllData();
      } catch (err) {
        console.error(err);
        alert('Failed to delete affiliate');
      }
    }
  };

  const fetchRevenue = async () => {
    try {
      const res = await api.get(`/dashboard/revenue?type=${revenueType}`);
      setRevenueData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCouponAnalytics = async (id) => {
    try {
      const res = await api.get(`/coupons/${id}/analytics`);
      setCouponAnalytics(res.data);
      setActiveTab('coupon-drilldown');
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    try {
      await api.post('/coupons', couponForm);
      setShowCouponModal(false);
      alert('Coupon created successfully!');
      fetchAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to create coupon: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteCoupon = async (id) => {
    if (window.confirm('Delete this coupon?')) {
      try {
        await api.delete(`/coupons/${id}`);
        fetchAllData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Show loading while validating token
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

  // Show login if not authenticated
  if (!token || !user) {
    return <Login onLogin={handleLogin} />;
  }

  // Main app
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 text-indigo-400 font-black animate-pulse">
      BOOTING CONTROL CENTER...
    </div>
  );

  return (
    <>
      <div className="flex h-screen bg-slate-950 text-slate-300 font-sans selection:bg-indigo-500/30">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col p-6">
        <div className="mb-10">
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-500" />
            DEV CORE
          </h1>
          <p className="text-[10px] text-indigo-400 font-bold tracking-widest mt-1">PLATFORM CONTROL</p>
        </div>

        <nav className="flex-1 space-y-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'subscribers', label: 'Subscribers', icon: Users },
            { id: 'expiring-users', label: 'Expiring Users', icon: Clock },
            { id: 'plans', label: 'Plan Features', icon: Shield },
            { id: 'affiliates', label: 'Affiliates', icon: Globe },
            { id: 'coupons', label: 'Coupons', icon: Tag },
          ].map(item => (
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
          
          <div className="pt-4 border-t border-slate-800 mt-4">
            <a 
              href={SAAS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-white hover:bg-slate-900 transition-all duration-200 text-sm font-bold"
            >
              <ExternalLink className="w-5 h-5" />
              Go to SaaS
            </a>
          </div>
        </nav>

        {/* User Info & Logout */}
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-white capitalize">{activeTab.replace('-', ' ')}</h2>
            <p className="text-slate-500 text-sm mt-1">Lightweight analytics for subscription and sales growth.</p>
          </div>
          <div className="flex gap-4">
            <button onClick={fetchAllData} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors">Refresh Data</button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
                <Users className="w-8 h-8 text-indigo-500 mb-4" />
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Total Active Subscribers</p>
                <h3 className="text-3xl font-black text-white mt-1">{summary?.totalSubscribers}</h3>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
                <DollarSign className="w-8 h-8 text-emerald-500 mb-4" />
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Total Revenue</p>
                <h3 className="text-3xl font-black text-white mt-1">₹{summary?.totalRevenue?.toLocaleString()}</h3>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
                <BarChart3 className="w-8 h-8 text-amber-500 mb-4" />
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Plan Breakdown</p>
                <div className="mt-2 flex gap-2">
                   {summary?.planCounts.map(p => (
                     <div key={p.plan_name} className="flex flex-col">
                        <span className="text-[10px] text-slate-500 uppercase font-black">{p.plan_name}</span>
                        <span className="text-lg font-black text-white">{p.count}</span>
                     </div>
                   ))}
                </div>
              </div>
            </div>

            {/* Revenue Chart */}
            <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-white">Revenue Analytics</h3>
                <div className="flex bg-slate-950 p-1 rounded-xl">
                  {['weekly', 'monthly'].map(t => (
                    <button 
                      key={t}
                      onClick={() => setRevenueType(t)}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${revenueType === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey={revenueType === 'weekly' ? 'date' : 'month'} stroke="#64748b" fontSize={10} tickFormatter={(val) => new Date(val).toLocaleDateString()} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Subscribers */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
               <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-lg font-black text-white">Latest Subscriptions</h3>
                  <button onClick={() => setActiveTab('subscribers')} className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">View All</button>
               </div>
               <table className="w-full text-left text-xs">
                 <thead className="bg-slate-950/50 text-slate-500 font-bold uppercase">
                    <tr>
                      <th className="px-6 py-4">Company</th>
                      <th className="px-6 py-4">Plan</th>
                      <th className="px-6 py-4">Revenue</th>
                      <th className="px-6 py-4">Coupon</th>
                      <th className="px-6 py-4">Date</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-800/50">
                   {subscribers.slice(0, 5).map(s => (
                     <tr key={s.id} className="hover:bg-slate-800/20">
                       <td className="px-6 py-4 font-bold text-white">{s.Company?.name}</td>
                       <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-black">{s.Plan?.plan_name}</span>
                       </td>
                       <td className="px-6 py-4 font-bold text-emerald-500">₹{s.price}</td>
                       <td className="px-6 py-4 text-slate-500 font-mono">{s.Coupon?.code || '-'}</td>
                       <td className="px-6 py-4 text-slate-500">{new Date(s.createdAt).toLocaleDateString()}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
          </div>
        )}

        {activeTab === 'plans' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {plans.map(plan => (
                <div key={plan.id} className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden flex flex-col">
                  <div className="p-6 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tighter">{plan.plan_name}</h3>
                      <p className="text-indigo-400 font-bold text-xs mt-1">₹{plan.price} / {plan.billing_cycle}</p>
                    </div>
                    <button 
                      onClick={() => {
                        setPlanForm({
                          id: plan.id || '',
                          plan_name: plan.plan_name || '',
                          price: plan.price ?? 0,
                          price_per_month: plan.price_per_month ?? 0,
                          billing_cycle: plan.billing_cycle || 'monthly',
                          is_active: plan.is_active ?? true
                        });
                        setShowPlanModal(true);
                      }}
                      className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-6 space-y-4 flex-1">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-4">Core Gatekeeper</p>
                    {ALL_FEATURES.map(feature => {
                      const granular = plan.granular_features?.find(f => f.feature_key === feature.id);
                      const isEnabled = granular ? granular.is_enabled : false;
                      
                      return (
                        <div key={feature.id} className="flex items-center justify-between group">
                          <span className={`text-xs font-bold ${isEnabled ? 'text-slate-300' : 'text-slate-600'}`}>{feature.label}</span>
                          <button 
                            onClick={() => handleToggleFeature(plan.plan_name, feature.id, isEnabled)}
                            className={`w-10 h-5 rounded-full relative transition-all duration-300 ${isEnabled ? 'bg-indigo-600' : 'bg-slate-800'}`}
                          >
                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${isEnabled ? 'right-1' : 'left-1'}`}></div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-4 bg-slate-950/50 text-center">
                     <p className="text-[8px] text-slate-600 font-medium uppercase">Changes sync globally instantly</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'affiliates' && (
          <div className="space-y-6 animate-in fade-in duration-500">
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white">Affiliate Partners</h3>
                <button onClick={() => setShowAffiliateModal(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
                  <Plus className="w-4 h-4" /> ADD AFFILIATE
                </button>
             </div>

             <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/50 text-slate-500 font-bold uppercase">
                    <tr>
                      <th className="px-6 py-4">Company Name</th>
                      <th className="px-6 py-4">Contact Person</th>
                      <th className="px-6 py-4">Mobile</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {affiliates.map(af => (
                      <tr key={af.id} className="hover:bg-slate-800/20">
                        <td className="px-6 py-4 font-bold text-white">{af.company_name}</td>
                        <td className="px-6 py-4 text-slate-400">{af.contact_person}</td>
                        <td className="px-6 py-4 text-indigo-400 font-bold">{af.mobile_no}</td>
                        <td className="px-6 py-4 text-slate-500">{af.email}</td>
                        <td className="px-6 py-4">
                           <button onClick={() => handleDeleteAffiliate(af.id)} className="text-rose-500 hover:text-rose-400 font-black uppercase text-[10px]">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'subscribers' && (
           <div className="space-y-4 animate-in fade-in duration-500">
             {/* Top bar with export button */}
             <div className="flex justify-end">
               <button
                 onClick={() => handleExportXLSX(subscribers)}
                 className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all"
               >
                 <Download className="w-4 h-4" /> EXPORT TO XLSX
               </button>
             </div>

             <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden overflow-x-auto">
               <table className="w-full text-left text-xs whitespace-nowrap">
                 <thead className="bg-slate-950/50 text-slate-500 font-bold uppercase">
                   <tr>
                     <th className="px-6 py-4">Company</th>
                     <th className="px-6 py-4">Email</th>
                     <th className="px-6 py-4">Mobile No</th>
                     <th className="px-6 py-4">Plan</th>
                     <th className="px-6 py-4">Amount</th>
                     <th className="px-6 py-4">Coupon</th>
                     <th className="px-6 py-4">Status</th>
                     <th className="px-6 py-4">Expiry</th>
                     <th className="px-6 py-4">Date</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-800/50">
                   {subscribers.map(s => {
                     const owner = s.Company?.Users?.[0] || {};
                     return (
                       <tr key={s.id} className="hover:bg-slate-800/20">
                         <td className="px-6 py-4">
                           <div className="font-bold text-white">{s.Company?.name}</div>
                           <div className="text-[10px] text-slate-500">{s.id}</div>
                         </td>
                         <td className="px-6 py-4 text-slate-300">{owner.email || '-'}</td>
                         <td className="px-6 py-4 text-indigo-300 font-medium">{owner.mobile_number || '-'}</td>
                         <td className="px-6 py-4">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-black uppercase">{s.Plan?.plan_name}</span>
                         </td>
                         <td className="px-6 py-4 font-bold text-emerald-500">₹{s.price}</td>
                         <td className="px-6 py-4 font-mono text-indigo-400">{s.Coupon?.code || '-'}</td>
                         <td className="px-6 py-4">
                            <span className={`text-[10px] font-black uppercase ${s.status === 'active' ? 'text-emerald-500' : 'text-rose-500'}`}>{s.status}</span>
                         </td>
                         <td className="px-6 py-4 text-slate-500">{s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : 'N/A'}</td>
                         <td className="px-6 py-4 text-slate-500">{new Date(s.createdAt).toLocaleDateString()}</td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           </div>
        )}

        {activeTab === 'expiring-users' && (() => {
          const now = new Date();
          const filtered = subscribers.filter(s => {
            if (!s.expiry_date || s.status !== 'active') return false;
            const expiryDate = new Date(s.expiry_date);
            const diffTime = expiryDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (expireFilter === '15days') return diffDays >= 0 && diffDays <= 15;
            if (expireFilter === '1month') return diffDays >= 0 && diffDays <= 30;
            return false;
          });

          return (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-400">Filter Expiry:</span>
                  <div className="flex bg-slate-950 p-1 rounded-xl">
                    <button 
                      onClick={() => setExpireFilter('15days')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${expireFilter === '15days' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                    >
                      Next 15 Days
                    </button>
                    <button 
                      onClick={() => setExpireFilter('1month')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${expireFilter === '1month' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                    >
                      Next 1 Month
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => handleExportXLSX(filtered)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all"
                >
                  <Download className="w-4 h-4" /> EXPORT TO XLSX
                </button>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-950/50 text-slate-500 font-bold uppercase">
                    <tr>
                      <th className="px-6 py-4">Company</th>
                      <th className="px-6 py-4">Contact (Owner)</th>
                      <th className="px-6 py-4">Plan</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Expiry</th>
                      <th className="px-6 py-4">Days Left</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-8 text-center text-slate-500 font-medium">
                          No users expiring in this timeframe.
                        </td>
                      </tr>
                    ) : filtered.map(s => {
                      const owner = s.Company?.Users?.[0] || {};
                      const daysLeft = Math.ceil((new Date(s.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      return (
                        <tr key={s.id} className="hover:bg-slate-800/20">
                          <td className="px-6 py-4">
                            <div className="font-bold text-white">{s.Company?.name}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-slate-300 font-medium">{owner.email || '-'}</div>
                            <div className="text-[10px] text-slate-500">{owner.mobile_number || '-'}</div>
                          </td>
                          <td className="px-6 py-4">
                             <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-black uppercase">{s.Plan?.plan_name}</span>
                          </td>
                          <td className="px-6 py-4 font-bold text-emerald-500">₹{s.price}</td>
                          <td className="px-6 py-4 text-slate-300 font-medium">{new Date(s.expiry_date).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded font-black text-[10px] ${daysLeft <= 7 ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>
                              {daysLeft} Days
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {activeTab === 'coupons' && (
          <div className="space-y-6 animate-in fade-in duration-500">
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white">Growth Vouchers</h3>
                <button onClick={() => setShowCouponModal(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
                  <Plus className="w-4 h-4" /> CREATE NEW COUPON
                </button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {coupons.map(c => (
                  <div key={c.id} className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl hover:border-indigo-500/50 transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4">
                       <span className={`text-[8px] font-black uppercase px-2 py-1 rounded ${c.is_expired ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                         {c.is_expired ? 'Expired' : 'Active'}
                       </span>
                    </div>
                    <h4 className="text-2xl font-black text-white font-mono tracking-tighter mb-1">{c.code}</h4>
                    <p className="text-indigo-400 text-[10px] font-black uppercase mb-1">
                      {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
                    </p>
                    {c.affiliate && (
                      <p className="text-slate-500 text-[8px] font-black uppercase mb-4 flex items-center gap-1">
                        <Globe className="w-2 h-2" /> Partner: {c.affiliate.company_name}
                      </p>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4 mb-6">
                       <div>
                          <p className="text-slate-500 text-[8px] font-black uppercase">Usage</p>
                          <p className="text-white font-black">{c.usage_count} / {c.usage_limit}</p>
                       </div>
                       <div>
                          <p className="text-slate-500 text-[8px] font-black uppercase">Revenue</p>
                          <p className="text-emerald-500 font-black">₹{c.revenue_generated?.toLocaleString()}</p>
                       </div>
                    </div>

                    <div className="flex gap-2">
                       <button onClick={() => fetchCouponAnalytics(c.id)} className="flex-1 bg-slate-950 hover:bg-indigo-600 text-white py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                         <BarChart3 className="w-3 h-3" /> Analytics
                       </button>
                       <button onClick={() => handleDeleteCoupon(c.id)} className="w-10 h-10 bg-slate-950 hover:bg-rose-500 text-slate-500 hover:text-white rounded-xl flex items-center justify-center transition-all">
                         <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'coupon-drilldown' && couponAnalytics && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
             <button onClick={() => setActiveTab('coupons')} className="text-indigo-400 font-black text-[10px] uppercase flex items-center gap-2 hover:text-white transition-colors mb-4">
                <ChevronRight className="w-4 h-4 rotate-180" /> Back to Coupons
             </button>

             <div className="flex items-center gap-6">
                <div className="p-8 bg-indigo-600 rounded-3xl">
                   <Tag className="w-12 h-12 text-white" />
                </div>
                <div>
                   <h3 className="text-4xl font-black text-white font-mono tracking-tighter">{couponAnalytics.coupon.code}</h3>
                   <div className="flex items-center gap-2 mt-1">
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Detailed performance audit</p>
                      {couponAnalytics.coupon.affiliate && (
                        <>
                          <span className="text-slate-700">•</span>
                          <p className="text-indigo-400 font-black uppercase tracking-widest text-xs flex items-center gap-1">
                            <Globe className="w-3 h-3" /> Partner: {couponAnalytics.coupon.affiliate.company_name}
                          </p>
                        </>
                      )}
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { label: 'Total Usage', val: couponAnalytics.usageCount, icon: Users, color: 'text-indigo-500' },
                  { label: 'Revenue Generated', val: `₹${couponAnalytics.totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-500' },
                  { label: 'Usage Limit', val: couponAnalytics.coupon.usage_limit, icon: Shield, color: 'text-amber-500' },
                  { label: 'Expiry Date', val: couponAnalytics.coupon.expiry_date ? new Date(couponAnalytics.coupon.expiry_date).toLocaleDateString() : 'Never', icon: Calendar, color: 'text-slate-500' },
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
                    <stat.icon className={`w-6 h-6 ${stat.color} mb-4`} />
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
                    <h3 className="text-xl font-black text-white mt-1">{stat.val}</h3>
                  </div>
                ))}
             </div>

             <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
                <h4 className="text-white font-black text-lg mb-6 uppercase tracking-tight">Weekly Adoption Trend</h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={couponAnalytics.weeklyPerformance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={(val) => new Date(val).toLocaleDateString('en-IN', { weekday: 'short' })} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                      <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
             </div>

             <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
                <div className="p-6 border-b border-slate-800">
                  <h4 className="text-white font-black text-lg uppercase tracking-tight">Conversion List</h4>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/50 text-slate-500 font-bold uppercase">
                    <tr>
                      <th className="px-6 py-4">Company</th>
                      <th className="px-6 py-4">Subscription</th>
                      <th className="px-6 py-4">Revenue</th>
                      <th className="px-6 py-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {couponAnalytics.users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-800/20">
                        <td className="px-6 py-4 font-bold text-white">{u.Company?.name}</td>
                        <td className="px-6 py-4">
                           <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-black uppercase">{u.Plan?.plan_name}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-500">₹{u.price}</td>
                        <td className="px-6 py-4 text-slate-500">{new Date(u.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}

        {/* Coupon Modal */}
        {showCouponModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
             <div className="form-container w-full max-w-md animate-in zoom-in-95 duration-200">
                <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">Forge Growth Voucher</h3>
                <form onSubmit={handleCreateCoupon} className="space-y-4">
                   <div className="form-group">
                      <label className="form-label">Voucher Code</label>
                      <input 
                        required
                        type="text" 
                        value={couponForm.code}
                        onChange={e => setCouponForm({...couponForm, code: e.target.value.toUpperCase()})}
                        className="form-input"
                        placeholder="SUMMER50"
                      />
                   </div>
                   <div className="form-group">
                      <label className="form-label">Affiliate Partner (Optional)</label>
                      <select 
                        value={couponForm.company_id}
                        onChange={e => setCouponForm({...couponForm, company_id: e.target.value})}
                        className="form-select"
                      >
                        <option value="">No Affiliate</option>
                        {affiliates.map(af => (
                          <option key={af.id} value={af.id}>{af.company_name}</option>
                        ))}
                      </select>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="form-group">
                        <label className="form-label">Type</label>
                        <select 
                          value={couponForm.discount_type}
                          onChange={e => setCouponForm({...couponForm, discount_type: e.target.value})}
                          className="form-select"
                        >
                          <option value="percentage">Percentage</option>
                          <option value="flat">Flat Amount</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Value</label>
                        <input 
                          required
                          type="number" 
                          value={couponForm.discount_value}
                          onChange={e => setCouponForm({...couponForm, discount_value: e.target.value})}
                          className="form-input"
                        />
                      </div>
                   </div>
                   <div className="form-group">
                      <label className="form-label">Expiry Date</label>
                      <input 
                        type="date" 
                        value={couponForm.expiry_date}
                        onChange={e => setCouponForm({...couponForm, expiry_date: e.target.value})}
                        className="form-input"
                      />
                   </div>
                   <div className="form-group">
                      <label className="form-label">Usage Limit</label>
                      <input 
                        type="number" 
                        value={couponForm.usage_limit}
                        onChange={e => setCouponForm({...couponForm, usage_limit: e.target.value})}
                        className="form-input"
                      />
                   </div>
                   <div className="flex gap-4 pt-4">
                      <button type="button" onClick={() => setShowCouponModal(false)} className="btn-secondary flex-1">ABORT</button>
                      <button type="submit" className="btn-primary flex-1">INITIALIZE</button>
                   </div>
                </form>
             </div>
          </div>
          )}

          {/* Plan Edit Modal */}
          {showPlanModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
             <div className="form-container w-full max-w-md animate-in zoom-in-95 duration-200">
                <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">Edit {planForm.plan_name}</h3>
                <form onSubmit={handleUpdatePlan} className="space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                     <div className="form-group">
                        <label className="form-label">Legacy Total Price (INR)</label>
                        <input 
                          required
                          type="number" 
                          value={planForm.price ?? ''}
                          onChange={e => setPlanForm({...planForm, price: e.target.value})}
                          className="form-input"
                        />
                     </div>
                     <div className="form-group">
                        <label className="form-label">Price Per Month (INR)</label>
                        <input 
                          required
                          type="number" 
                          value={planForm.price_per_month ?? ''}
                          onChange={e => setPlanForm({...planForm, price_per_month: e.target.value})}
                          className="form-input"
                        />
                     </div>
                   </div>
                   <div className="form-group">
                      <label className="form-label">Billing Cycle</label>
                      <select 
                        value={planForm.billing_cycle ?? 'monthly'}
                        onChange={e => setPlanForm({...planForm, billing_cycle: e.target.value})}
                        className="form-select"
                      >
                        <option value="monthly">1 Month (Monthly)</option>
                        <option value="3month">3 Months</option>
                        <option value="6month">6 Months</option>
                        <option value="yearly">1 Year (Yearly)</option>
                        <option value="lifetime">Lifetime</option>
                      </select>
                   </div>
                   <div className="flex items-center gap-2 py-2">
                      <input 
                        type="checkbox" 
                        id="is_active"
                        checked={planForm.is_active}
                        onChange={e => setPlanForm({...planForm, is_active: e.target.checked})}
                        className="form-checkbox"
                      />
                      <label htmlFor="is_active" className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer">Plan Is Active</label>
                   </div>
                   <div className="flex gap-4 pt-4">
                      <button type="button" onClick={() => setShowPlanModal(false)} className="btn-secondary flex-1">ABORT</button>
                      <button type="submit" className="btn-primary flex-1">UPDATE PLAN</button>
                   </div>
                </form>
             </div>
          </div>
          )}

          {/* Affiliate Modal */}
        {showAffiliateModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
             <div className="form-container w-full max-w-md animate-in zoom-in-95 duration-200">
                <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">Onboard Affiliate</h3>
                <form onSubmit={handleCreateAffiliate} className="space-y-4">
                   <div className="form-group">
                      <label className="form-label">Company Name</label>
                      <input 
                        required
                        type="text" 
                        value={affiliateForm.company_name}
                        onChange={e => setAffiliateForm({...affiliateForm, company_name: e.target.value})}
                        className="form-input"
                      />
                   </div>
                   <div className="form-group">
                      <label className="form-label">Contact Person</label>
                      <input 
                        required
                        type="text" 
                        value={affiliateForm.contact_person}
                        onChange={e => setAffiliateForm({...affiliateForm, contact_person: e.target.value})}
                        className="form-input"
                      />
                   </div>
                   <div className="form-group">
                      <label className="form-label">Mobile No</label>
                      <input 
                        required
                        type="text" 
                        value={affiliateForm.mobile_no}
                        onChange={e => setAffiliateForm({...affiliateForm, mobile_no: e.target.value})}
                        className="form-input"
                      />
                   </div>
                   <div className="form-group">
                      <label className="form-label">Email ID</label>
                      <input 
                        required
                        type="email" 
                        value={affiliateForm.email}
                        onChange={e => setAffiliateForm({...affiliateForm, email: e.target.value})}
                        className="form-input"
                      />
                   </div>
                   <div className="flex gap-4 pt-4">
                      <button type="button" onClick={() => setShowAffiliateModal(false)} className="btn-secondary flex-1">ABORT</button>
                      <button type="submit" className="btn-primary flex-1">ONBOARD</button>
                   </div>
                </form>
             </div>
          </div>
        )}
      </main>
    </div>
    </>
  );
};

export default AdminApp;

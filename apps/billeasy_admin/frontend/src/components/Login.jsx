import React, { useState, useEffect } from 'react';
import { Shield, Lock, Mail, Eye, EyeOff, Loader2 } from 'lucide-react';
import axios from 'axios';

// Detect if we're running through the main gateway or standalone
const host = window.location.host;
const isGateway = window.location.pathname.startsWith('/admin-portal');

// All admin API calls go through the main backend at /api/admin/*
// Railway only exposes one port, admin routes are served from main backend
const API_BASE_URL = isGateway 
  ? '/admin/api'  // Through gateway - use relative path
  : ((import.meta.env.VITE_ADMIN_BACKEND_URL || 'http://localhost:8001').replace(/\/+$/, '')) + '/api/admin';

console.log('[Admin Login] API_BASE_URL:', API_BASE_URL, '| Host:', host, '| isGateway:', isGateway);

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check if already logged in
    const token = localStorage.getItem('admin_token');
    if (token) {
      validateToken(token);
    }
  }, []);

  const validateToken = async (token) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.data) {
        onLogin(token, response.data);
      }
    } catch (err) {
      // Token invalid, remove it
      localStorage.removeItem('admin_token');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // SECURITY: Always use the password the user typed - NEVER use env vars in frontend
    const userPassword = password;

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: email.toLowerCase().trim(),
        password: userPassword
      });

      if (response.data.success && response.data.token) {
        const { token, user } = response.data;
        localStorage.setItem('admin_token', token);
        onLogin(token, user);
      }
    } catch (err) {
      console.error('Login error:', err);
      const errorMessage = err.response?.data?.error || 'Login failed. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className={`w-full max-w-md transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-2xl mb-4 shadow-2xl shadow-indigo-600/30">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">DEV CORE</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">Admin Control Center</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 backdrop-blur-sm shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Welcome Back</h2>
            <p className="text-slate-500 text-sm mt-1">Sign in to access the admin panel</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <p className="text-rose-400 text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-12 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 pt-6 border-t border-slate-800">
            <p className="text-xs text-slate-600 text-center">
              🔒 Secure JWT authentication enabled
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Bill Easy Admin Portal © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default Login;

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import axios from 'axios';
import { useAuthStore } from './store/authStore.ts';

axios.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token || 
                localStorage.getItem('cc_token') || 
                localStorage.getItem('admin_token') || 
                localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

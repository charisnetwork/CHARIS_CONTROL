import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('cc_token'),
  user: localStorage.getItem('cc_user') ? JSON.parse(localStorage.getItem('cc_user') as string) : null,
  setAuth: (token, user) => {
    localStorage.setItem('cc_token', token);
    localStorage.setItem('cc_user', JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_user');
    set({ token: null, user: null });
  },
}));

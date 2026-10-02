import { create } from 'zustand';

export interface ControlUser {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'team_member';
}

interface AuthState {
  token: string | null;
  csrfToken: string | null;
  user: ControlUser | null;
  initialized: boolean;
  setAuth: (token: string, csrfToken: string, user: ControlUser) => void;
  markInitialized: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  csrfToken: sessionStorage.getItem('cc_csrf_token'),
  user: null,
  initialized: false,
  setAuth: (token, csrfToken, user) => {
    sessionStorage.setItem('cc_csrf_token', csrfToken);
    set({ token, csrfToken, user, initialized: true });
  },
  markInitialized: () => set({ initialized: true }),
  logout: () => {
    sessionStorage.removeItem('cc_csrf_token');
    set({ token: null, csrfToken: null, user: null, initialized: true });
  },
}));

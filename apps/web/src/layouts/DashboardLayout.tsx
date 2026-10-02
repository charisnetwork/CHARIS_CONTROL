import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Bell,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  Menu,
  Package,
  Search,
  Settings,
  Ticket,
  Users,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useProductStore } from '../store/productStore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navigation = [
  { name: 'Overview', path: 'overview', icon: LayoutDashboard },
  { name: 'Subscribers', path: 'subscribers', icon: Users },
  { name: 'Subscriptions', path: 'subscriptions', icon: CreditCard },
  { name: 'Plans', path: 'plans', icon: Package },
  { name: 'Coupons', path: 'coupons', icon: Ticket },
  { name: 'Affiliates', path: 'affiliates', icon: Users },
  { name: 'Notifications', path: 'notifications', icon: Bell },
  { name: 'Reports', path: 'reports', icon: BarChart3 },
];

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { appId } = useParams();
  const products = useProductStore((state) => state.products);
  const selectedProduct = useProductStore((state) => state.selectedProduct);
  const basePath = `/apps/${appId}`;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="flex h-16 items-center border-b border-[var(--border-color)] px-6">
          <button onClick={() => navigate('/apps')} className="flex items-center gap-2 text-left">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 shadow-lg shadow-blue-600/20"><span className="h-3.5 w-3.5 rounded-full bg-white" /></span>
            <span className="text-lg font-semibold tracking-tight">Charis Control</span>
          </button>
        </div>
        <div className="px-3 pt-4">
          <button onClick={() => navigate('/apps')} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-left hover:border-blue-500/40">
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{selectedProduct?.displayName}</span><span className="block truncate text-[10px] uppercase tracking-wider text-slate-500">{selectedProduct?.environment}</span></span>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navigation.map((item) => (
            <NavLink key={item.path} to={`${basePath}/${item.path}`} className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white')}>
              <item.icon className="h-4 w-4" />{item.name}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-[var(--border-color)] p-4">
          <NavLink to={`${basePath}/settings`} className={({ isActive }) => cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm', isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white')}><Settings className="h-4 w-4" />Settings</NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--border-color)] px-6">
          <div className="flex flex-1 items-center">
            <button className="mr-4 rounded-md p-2 hover:bg-[var(--bg-hover)] lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5 text-slate-400" /></button>
            <div className="relative hidden w-full max-w-md sm:block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input type="search" placeholder={`Search ${selectedProduct?.displayName ?? 'application'}…`} className="w-full rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] py-1.5 pl-9 pr-4 text-sm text-white outline-none focus:border-blue-500" /></div>
            <select value={appId} onChange={(event) => navigate(`/apps/${event.target.value}/overview`)} className="ml-6 max-w-56 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              {products.map((product) => <option key={product.id} value={product.id}>{product.displayName}</option>)}
            </select>
          </div>
          <button className="relative rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Notifications"><Bell className="h-5 w-5" /></button>
        </header>

        <main className="relative flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }} className="h-full"><Outlet /></motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

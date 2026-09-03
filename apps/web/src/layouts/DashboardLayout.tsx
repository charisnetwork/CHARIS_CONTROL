import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Users,
  CreditCard,
  Ticket,
  Bell,
  Activity,
  BarChart3,
  Search,
  Settings,
  Menu,
  ChevronDown,
  Globe
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';
import { useProductStore } from '../store/productStore';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NAVIGATION = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Applications', to: '/products', icon: Package },
  { name: 'Customers', to: '/customers', icon: Users },
  { name: 'Subscriptions', to: '/subscriptions', icon: CreditCard },
  { name: 'Plans', to: '/plans', icon: Package },
  { name: 'Coupons', to: '/coupons', icon: Ticket },
  { name: 'Offers', to: '/offers', icon: Package }, // Or a gift icon
  { name: 'Affiliates', to: '/affiliates', icon: Users },
  { name: 'Marketing', to: '/marketing', icon: Activity },
  { name: 'Notifications', to: '/notifications', icon: Bell },
  { name: 'Reports', to: '/reports', icon: BarChart3 },
];

export function DashboardLayout() {
  const location = useLocation();
  const { products, selectedProduct, isAllApplications, selectProduct } = useProductStore();

  return (
    <div className="flex h-screen w-full bg-[var(--bg-primary)] overflow-hidden text-[var(--text-primary)]">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col transition-all duration-300">
        <div className="h-16 flex items-center px-6 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              <div className="w-4 h-4 rounded-full bg-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight text-lg">Charis Control</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAVIGATION.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              className={({ isActive }) => cn(
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-200",
                isActive
                  ? "text-white"
                  : "text-[var(--text-secondary)] hover:text-white"
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-bg"
                      className="absolute inset-0 bg-[var(--bg-hover)] rounded-md -z-10"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <item.icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", isActive && "text-primary")} />
                  {item.name}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-[var(--border-color)]">
          <button className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-sm font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]/50 transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-6 glass sticky top-0 z-10 border-b border-[var(--border-color)]">
          <div className="flex items-center flex-1">
            <button className="p-2 mr-4 rounded-md hover:bg-[var(--bg-hover)] lg:hidden">
              <Menu className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
            <div className="relative w-full max-w-md hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search resources..."
                className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-full pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-white placeholder-[var(--text-muted)] shadow-inner"
              />
            </div>
            
            {/* Product Selector Context */}
            <div className="ml-6 relative group">
              <button className="flex items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] px-3 py-1.5 rounded-lg hover:border-[var(--primary)] transition-colors">
                {isAllApplications ? (
                  <><Globe className="w-4 h-4 text-primary" /> <span className="text-sm font-medium">All Applications</span></>
                ) : (
                  <><Package className="w-4 h-4 text-emerald-400" /> <span className="text-sm font-medium">{selectedProduct?.displayName || 'Select Product'}</span></>
                )}
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)] ml-2" />
              </button>
              
              <div className="absolute top-full mt-1 left-0 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden">
                <button
                  onClick={() => selectProduct('all')}
                  className={cn("w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[var(--bg-hover)] transition-colors", isAllApplications && "bg-[var(--bg-hover)] text-primary")}
                >
                  <Globe className="w-4 h-4" /> All Applications
                </button>
                <div className="h-px bg-[var(--border-color)] my-1 w-full" />
                <div className="max-h-60 overflow-y-auto">
                  {products.map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectProduct(p.id)}
                      className={cn("w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[var(--bg-hover)] transition-colors", selectedProduct?.id === p.id && "bg-[var(--bg-hover)] text-emerald-400")}
                    >
                      <Package className="w-4 h-4" /> {p.displayName}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-purple-600 p-[2px] cursor-pointer hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] transition-shadow">
              <div className="w-full h-full rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                <Users className="w-4 h-4 text-[var(--text-secondary)]" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

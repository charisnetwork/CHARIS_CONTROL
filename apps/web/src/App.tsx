import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardLayout } from './layouts/DashboardLayout';
import Login from './pages/auth/Login';
import { Overview } from './pages/dashboard/Overview';
import { SubscriptionsList } from './pages/subscriptions/SubscriptionsList';
import { PlansList } from './pages/subscriptions/PlansList';
import { ProductsList } from './pages/products/ProductsList';
import AdminDashboard from './pages/AdminDashboard';
import { useAuthStore } from './store/authStore';
import { useProductStore } from './store/productStore';
import { Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import axios from 'axios';

import { CustomersList } from './pages/customers/CustomersList';
import { CouponsList } from './pages/coupons/CouponsList';
import { OffersList } from './pages/offers/OffersList';
import { MarketingList } from './pages/marketing/MarketingList';
import { NotificationsList } from './pages/notifications/NotificationsList';
import { ReportsList } from './pages/reports/ReportsList';
import { AffiliatesList } from './pages/affiliates/AffiliatesList';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((state) => state.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Overview />,
      },
      {
        path: "subscriptions",
        element: <SubscriptionsList />
      },
      {
        path: "plans",
        element: <PlansList />
      },
      {
        path: "products",
        element: <ProductsList />
      },
      {
        path: "customers",
        element: <CustomersList />
      },
      {
        path: "coupons",
        element: <CouponsList />
      },
      {
        path: "offers",
        element: <OffersList />
      },
      {
        path: "marketing",
        element: <MarketingList />
      },
      {
        path: "notifications",
        element: <NotificationsList />
      },
      {
        path: "reports",
        element: <ReportsList />
      },
      {
        path: "affiliates",
        element: <AffiliatesList />
      }
    ],
  },
  {
    path: "/admin-dashboard",
    element: (
      <ProtectedRoute>
        <AdminDashboard />
      </ProtectedRoute>
    )
  },
]);

function App() {
  const setProducts = useProductStore(state => state.setProducts);

  useEffect(() => {
    // Initial fetch of applications to populate the context switcher
    axios.get(`${(import.meta.env.VITE_Control_api_Backend || 'https://chariscontrol-production.up.railway.app').replace(/\/+$/, '')}/api/applications`)
      .then(res => setProducts(res.data))
      .catch(err => console.error('Failed to fetch applications', err));
  }, [setProducts]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;

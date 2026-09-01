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
      }
      // Other routes like customers, coupons, etc. can be added here
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
    axios.get(`${(import.meta.env.VITE_Control_api_Backend || 'http://localhost:4000').replace(/\/+$/, '')}/api/applications`)
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

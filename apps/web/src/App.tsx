import { useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useParams,
} from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Affiliates } from './pages/applications/Affiliates';
import { ApplicationOverview } from './pages/applications/ApplicationOverview';
import { ApplicationSelection } from './pages/applications/ApplicationSelection';
import { Coupons } from './pages/applications/Coupons';
import { Notifications } from './pages/applications/Notifications';
import { Reports } from './pages/applications/Reports';
import { Settings } from './pages/applications/Settings';
import { PlansCatalog } from './pages/applications/PlansCatalog';
import { Subscribers } from './pages/applications/Subscribers';
import { Subscriptions } from './pages/applications/Subscriptions';
import Login from './pages/auth/Login';
import { listApplications, restoreSession } from './services/controlApi';
import { useAuthStore } from './store/authStore';
import { useProductStore } from './store/productStore';

function ProtectedRoute() {
  const token = useAuthStore((state) => state.token);
  const initialized = useAuthStore((state) => state.initialized);
  if (!initialized) {
    return <div className="grid min-h-screen place-items-center text-slate-400">Restoring session…</div>;
  }
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

function ApplicationScope() {
  const { appId } = useParams();
  const setProducts = useProductStore((state) => state.setProducts);
  const selectProduct = useProductStore((state) => state.selectProduct);
  const selectedProduct = useProductStore((state) => state.selectedProduct);
  const applications = useQuery({ queryKey: ['applications'], queryFn: listApplications });

  useEffect(() => {
    if (!applications.data) return;
    setProducts(applications.data);
    selectProduct(appId ?? null);
  }, [appId, applications.data, selectProduct, setProducts]);

  if (applications.isError) return <Navigate to="/apps" replace />;
  if (applications.data && !applications.data.some((application) => application.id === appId)) {
    return <Navigate to="/apps" replace />;
  }
  if (applications.isPending || selectedProduct?.id !== appId) {
    return <div className="grid min-h-screen place-items-center text-slate-400">Loading application…</div>;
  }
  return <Outlet />;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <Navigate to="/apps" replace /> },
      { path: '/apps', element: <ApplicationSelection /> },
      {
        path: '/apps/:appId',
        element: <ApplicationScope />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              { index: true, element: <Navigate to="overview" replace /> },
              { path: 'overview', element: <ApplicationOverview /> },
              { path: 'subscribers', element: <Subscribers /> },
              { path: 'subscriptions', element: <Subscriptions /> },
              { path: 'plans', element: <PlansCatalog /> },
              { path: 'coupons', element: <Coupons /> },
              { path: 'affiliates', element: <Affiliates /> },
              { path: 'notifications', element: <Notifications /> },
              { path: 'reports', element: <Reports /> },
              { path: 'settings', element: <Settings /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

function App() {
  useEffect(() => {
    void restoreSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;

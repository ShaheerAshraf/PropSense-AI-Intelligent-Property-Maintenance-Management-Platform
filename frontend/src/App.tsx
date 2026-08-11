import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { LoadingBlock } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OverviewPage as OwnerOverviewPage } from './pages/owner/OverviewPage';
import { PropertiesPage } from './pages/owner/PropertiesPage';
import { PropertyDetailPage } from './pages/owner/PropertyDetailPage';
import { TenantsPage } from './pages/owner/TenantsPage';
import { MaintenanceListPage } from './pages/owner/MaintenanceListPage';
import { MaintenanceDetailPage } from './pages/owner/MaintenanceDetailPage';
import { TechniciansPage } from './pages/owner/TechniciansPage';
import { ExpensesPage } from './pages/owner/ExpensesPage';
import { AiInsightsPage } from './pages/owner/AiInsightsPage';
import { OverviewPage as TenantOverviewPage } from './pages/tenant/OverviewPage';
import { RequestsPage } from './pages/tenant/RequestsPage';
import { CreateRequestPage } from './pages/tenant/CreateRequestPage';
import { RequestDetailPage } from './pages/tenant/RequestDetailPage';
import { OverviewPage as TechOverviewPage } from './pages/technician/OverviewPage';
import { AssignmentsPage } from './pages/technician/AssignmentsPage';
import { AssignmentDetailPage } from './pages/technician/AssignmentDetailPage';
import type { UserRole } from './lib/api';

function RequireAuth({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: UserRole[];
}) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingBlock label="Checking session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/app/overview" replace />;
  }
  return children;
}

function RoleOverview() {
  const { user } = useAuth();
  if (user?.role === 'OWNER' || user?.role === 'ADMIN') {
    return <OwnerOverviewPage />;
  }
  if (user?.role === 'TENANT') return <TenantOverviewPage />;
  return <TechOverviewPage />;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingBlock />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/app/overview" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<RoleOverview />} />
        <Route path="notifications" element={<NotificationsPage />} />

        {/* Owner */}
        <Route
          path="properties"
          element={
            <RequireAuth roles={['OWNER', 'ADMIN']}>
              <PropertiesPage />
            </RequireAuth>
          }
        />
        <Route
          path="properties/:id"
          element={
            <RequireAuth roles={['OWNER', 'ADMIN']}>
              <PropertyDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="tenants"
          element={
            <RequireAuth roles={['OWNER', 'ADMIN']}>
              <TenantsPage />
            </RequireAuth>
          }
        />
        <Route
          path="maintenance"
          element={
            <RequireAuth roles={['OWNER', 'ADMIN']}>
              <MaintenanceListPage />
            </RequireAuth>
          }
        />
        <Route
          path="maintenance/:id"
          element={
            <RequireAuth roles={['OWNER', 'ADMIN']}>
              <MaintenanceDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="technicians"
          element={
            <RequireAuth roles={['OWNER', 'ADMIN']}>
              <TechniciansPage />
            </RequireAuth>
          }
        />
        <Route
          path="expenses"
          element={
            <RequireAuth roles={['OWNER', 'ADMIN']}>
              <ExpensesPage />
            </RequireAuth>
          }
        />
        <Route
          path="ai"
          element={
            <RequireAuth roles={['OWNER', 'ADMIN']}>
              <AiInsightsPage />
            </RequireAuth>
          }
        />

        {/* Tenant */}
        <Route
          path="requests"
          element={
            <RequireAuth roles={['TENANT']}>
              <RequestsPage />
            </RequireAuth>
          }
        />
        <Route
          path="requests/new"
          element={
            <RequireAuth roles={['TENANT']}>
              <CreateRequestPage />
            </RequireAuth>
          }
        />
        <Route
          path="requests/:id"
          element={
            <RequireAuth roles={['TENANT']}>
              <RequestDetailPage />
            </RequireAuth>
          }
        />

        {/* Technician */}
        <Route
          path="assignments"
          element={
            <RequireAuth roles={['TECHNICIAN']}>
              <AssignmentsPage />
            </RequireAuth>
          }
        />
        <Route
          path="assignments/:id"
          element={
            <RequireAuth roles={['TECHNICIAN']}>
              <AssignmentDetailPage />
            </RequireAuth>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

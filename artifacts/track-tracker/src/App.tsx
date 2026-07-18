import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { AuthProvider, useAuth } from '@/store/AuthContext';
import type { Role } from '@/store/AuthContext';
import { AppProvider } from '@/store/AppContext';
import NotFound from '@/pages/not-found';
import RoleSelection from '@/pages/RoleSelection';
import DriverAuth from '@/pages/DriverAuth';
import CompanyAuth from '@/pages/CompanyAuth';
import OwnerDashboard from '@/pages/OwnerDashboard';
import ProfilePage from '@/pages/ProfilePage';
import SubscriptionsPage from '@/pages/SubscriptionsPage';
import DriverDetails from '@/pages/DriverDetails';
import DriverDashboard from '@/pages/DriverDashboard';
import DriverProfilePage from '@/pages/DriverProfilePage';
import type { ComponentType } from 'react';

const queryClient = new QueryClient();

// ── Loading screen (shown while session is being resolved) ────────────────────

function AuthLoading() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-muted rounded-full animate-spin"
          style={{ borderTopColor: '#0D3B4A' }} />
        <p className="text-sm text-muted-foreground font-medium">جارٍ التحميل...</p>
      </div>
    </div>
  );
}

// ── Route guards ──────────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  component: ComponentType<object>;
  requiredRole: Role;
  redirectTo?: string;
}

function ProtectedRoute({ component: Component, requiredRole, redirectTo }: ProtectedRouteProps) {
  const { role, isLoading } = useAuth();

  if (isLoading) return <AuthLoading />;
  if (role !== requiredRole) {
    const dest = redirectTo ?? (requiredRole === 'company' ? '/company-auth' : '/driver-auth');
    return <Redirect to={dest} />;
  }
  return <Component />;
}

/** Redirects already-authenticated users away from auth pages. */
function GuestRoute({ component: Component }: { component: ComponentType<object> }) {
  const { role, isLoading } = useAuth();

  if (isLoading) return <AuthLoading />;
  if (role === 'company') return <Redirect to="/owner-dashboard" />;
  if (role === 'driver') return <Redirect to="/driver-dashboard" />;
  return <Component />;
}

// ── Router ────────────────────────────────────────────────────────────────────

function Router() {
  return (
    <Switch>
      {/* Public — redirects away if already logged in */}
      <Route path="/" component={() => <GuestRoute component={RoleSelection} />} />
      <Route path="/driver-auth" component={() => <GuestRoute component={DriverAuth} />} />
      <Route path="/company-auth" component={() => <GuestRoute component={CompanyAuth} />} />

      {/* Company-protected routes */}
      <Route path="/owner-dashboard" component={() => <ProtectedRoute component={OwnerDashboard} requiredRole="company" />} />
      <Route path="/profile" component={() => <ProtectedRoute component={ProfilePage} requiredRole="company" />} />
      <Route path="/subscriptions" component={() => <ProtectedRoute component={SubscriptionsPage} requiredRole="company" />} />
      <Route path="/driver/:id" component={() => <ProtectedRoute component={DriverDetails} requiredRole="company" />} />

      {/* Driver-protected routes */}
      <Route path="/driver-dashboard" component={() => <ProtectedRoute component={DriverDashboard} requiredRole="driver" />} />
      <Route path="/driver-profile" component={() => <ProtectedRoute component={DriverProfilePage} requiredRole="driver" />} />

      <Route component={NotFound} />
    </Switch>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            {/* AppProvider is inside AuthProvider so it can call useAuth() */}
            <AppProvider>
              <Router />
            </AppProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

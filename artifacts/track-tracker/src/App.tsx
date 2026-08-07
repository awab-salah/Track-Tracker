import { Component, type ComponentType, type ReactNode } from 'react';
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
import { PWAUpdateBanner } from '@/components/PWAUpdateBanner';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';

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
  console.log('[ProtectedRoute]', { requiredRole, role, isLoading });

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
  console.log('[GuestRoute]', { role, isLoading });

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

// ── Error Boundary ────────────────────────────────────────────────────────────
// Catches unhandled React render errors that would otherwise produce a
// permanent white screen. Previously, an infinite redirect loop between
// /driver-dashboard and /driver-auth crashed React with "Maximum update
// depth exceeded" and left the user staring at a blank page forever.
// This boundary catches any such error and shows a recoverable UI.

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null; componentStack: string }> {
  state = { hasError: false, error: null as Error | null, componentStack: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[AppErrorBoundary] Unhandled render error:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background gap-4 p-6 overflow-auto">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive text-2xl">⚠</span>
          </div>
          <p className="text-base font-bold text-foreground">حدث خطأ غير متوقع</p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            حدث خطأ أثناء تحميل التطبيق. يرجى تحديث الصفحة للمحاولة مرة أخرى.
          </p>
          {/* DEBUG: Show exact error for root-cause investigation */}
          <div className="mt-2 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg max-w-lg w-full overflow-auto">
            <p className="text-xs font-bold text-red-800 dark:text-red-200 mb-1">[DEBUG] Error:</p>
            <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">{err?.message ?? 'unknown'}</pre>
            <p className="text-xs font-bold text-red-800 dark:text-red-200 mt-2 mb-1">[DEBUG] Stack:</p>
            <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">{err?.stack ?? ''}</pre>
            <p className="text-xs font-bold text-red-800 dark:text-red-200 mt-2 mb-1">[DEBUG] Component Stack:</p>
            <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">{this.state.componentStack}</pre>
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: null, componentStack: '' }); window.location.reload(); }}
            className="mt-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:scale-[0.97] transition-transform"
          >
            تحديث الصفحة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppErrorBoundary>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AuthProvider>
              {/* AppProvider is inside AuthProvider so it can call useAuth() */}
              <AppProvider>
                <PWAShell />
                <Router />
              </AppProvider>
            </AuthProvider>
          </WouterRouter>
        </AppErrorBoundary>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/**
 * PWAShell — renders PWA-related UI (update banner, install prompt,
 * offline indicator) and activates the auto-reconnect hook.
 * Must be inside AuthProvider so hooks that depend on auth can work.
 */
function PWAShell() {
  useAutoReconnect();
  return (
    <>
      <PWAUpdateBanner />
      <PWAInstallBanner />
      <OfflineIndicator />
    </>
  );
}

export default App;

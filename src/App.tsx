import { Component, type ReactNode, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ToastProvider } from "@/components/ToastProvider";
import { NotificationBubbleProvider } from "@/components/NotificationBubble";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
// Retry wrapper for lazy imports — handles stale cache serving old HTML
// that references chunk hashes that no longer exist after a deploy
function lazyRetry<T extends { default: React.ComponentType<Record<string, never>> }>(
  factory: () => Promise<T>,
): React.LazyExoticComponent<T["default"]> {
  return lazy(() =>
    factory().catch((err) => {
      // Only retry once to avoid infinite loops
      const key = "chunk-retry-" + factory.toString().slice(0, 64);
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
      throw err;
    }),
  );
}

// Lazy-loaded pages & layout for code splitting
const Layout = lazyRetry(() => import("@/components/Layout"));
const Login = lazyRetry(() => import("@/pages/Login"));
const Onboarding = lazyRetry(() => import("@/pages/Onboarding"));
const PrivacyPolicy = lazyRetry(() => import("@/pages/PrivacyPolicy"));
const Home = lazyRetry(() => import("@/pages/Home"));
const Log = lazyRetry(() => import("@/pages/Log"));
const History = lazyRetry(() => import("@/pages/History"));
const Settings = lazyRetry(() => import("@/pages/Settings"));
const Program = lazyRetry(() => import("@/pages/Program"));
const Run = lazyRetry(() => import("@/pages/Run"));
const RunSummary = lazyRetry(() => import("@/pages/RunSummary"));
const RunDetail = lazyRetry(() => import("@/pages/RunDetail"));
const Social = lazyRetry(() => import("@/pages/Social"));
const UserProfile = lazyRetry(() => import("@/pages/UserProfile"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-12" role="status" aria-label="Loading page">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/* ================================
   ERROR BOUNDARY
================================ */

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, componentStack: null };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // On iPhone you won't reliably see console logs, so store the stack in state.
    console.error("App crash:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack || null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-6" role="alert">
          <div className="text-center space-y-4 max-w-sm w-full">
            <p className="text-4xl" aria-hidden="true">Warning</p>
            <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>

            <p className="text-sm text-muted-foreground break-words">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>

            {/* This is the key: it tells you which component triggered the crash */}
            {this.state.componentStack && (
              <details className="text-left bg-card border border-border/50 rounded-xl p-3">
                <summary className="text-sm font-medium text-foreground cursor-pointer">
                  Show component trace
                </summary>
                <pre className="mt-2 text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap break-words">
                  {this.state.componentStack}
                </pre>
              </details>
            )}

            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, componentStack: null });
                window.location.reload();
              }}
              className="w-full px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/* ================================
   ROUTES
================================ */

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-label="Loading application">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading Tropos...</span>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </Suspense>
    );
  }

  // Logged in but hasn't completed onboarding
  if (!profile?.onboardingComplete) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="*" element={<Onboarding />} />
        </Routes>
      </Suspense>
    );
  }

  // Fully authenticated
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route element={<Layout />}>
          <Route path="/" element={<RouteErrorBoundary><Home /></RouteErrorBoundary>} />
          <Route path="/log" element={<RouteErrorBoundary><Log /></RouteErrorBoundary>} />
          <Route path="/history" element={<RouteErrorBoundary><History /></RouteErrorBoundary>} />
          <Route path="/settings" element={<RouteErrorBoundary><Settings /></RouteErrorBoundary>} />
          <Route path="/program" element={<RouteErrorBoundary><Program /></RouteErrorBoundary>} />
          <Route path="/social" element={<RouteErrorBoundary><Social /></RouteErrorBoundary>} />
          <Route path="/user/:uid" element={<RouteErrorBoundary><UserProfile /></RouteErrorBoundary>} />
          <Route path="/run/:runId" element={<RouteErrorBoundary><RunDetail /></RouteErrorBoundary>} />
        </Route>
        <Route path="/run" element={<RouteErrorBoundary><Run /></RouteErrorBoundary>} />
        <Route path="/run-summary" element={<RouteErrorBoundary><RunSummary /></RouteErrorBoundary>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

/* ================================
   APP
================================ */

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename="/Maiin/">
        <AuthProvider>
          <NotificationBubbleProvider>
            <ToastProvider />
            <AppRoutes />
          </NotificationBubbleProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
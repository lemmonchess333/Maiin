import { Component, type ReactNode, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ToastProvider } from "@/components/ToastProvider";
import { NotificationBubbleProvider } from "@/components/NotificationBubble";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import PrivacyPolicy from "@/pages/PrivacyPolicy";

// Lazy-loaded pages for code splitting
const Home = lazy(() => import("@/pages/Home"));
const Log = lazy(() => import("@/pages/Log"));
const History = lazy(() => import("@/pages/History"));
const Settings = lazy(() => import("@/pages/Settings"));
const Program = lazy(() => import("@/pages/Program"));
const Run = lazy(() => import("@/pages/Run"));
const RunSummary = lazy(() => import("@/pages/RunSummary"));
const RunDetail = lazy(() => import("@/pages/RunDetail"));
const Social = lazy(() => import("@/pages/Social"));
const UserProfile = lazy(() => import("@/pages/UserProfile"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
        <div className="min-h-screen bg-background flex items-center justify-center px-6">
          <div className="text-center space-y-4 max-w-sm w-full">
            <p className="text-4xl">Warning</p>
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Logged in but hasn't completed onboarding
  if (!profile?.onboardingComplete) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }

  // Fully authenticated
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/log" element={<Log />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/program" element={<Program />} />
          <Route path="/social" element={<Social />} />
          <Route path="/user/:uid" element={<UserProfile />} />
          <Route path="/run/:runId" element={<RunDetail />} />
        </Route>
        <Route path="/run" element={<Run />} />
        <Route path="/run-summary" element={<RunSummary />} />
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
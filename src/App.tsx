import { type ReactNode, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ToastProvider } from "@/components/ToastProvider";
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
}

import { Component } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("App crash:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-6">
          <div className="text-center space-y-4 max-w-sm">
            <p className="text-4xl">Warning</p>
            <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm"
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
        </Route>
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
          <ToastProvider />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

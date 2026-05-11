import { Component, type ReactNode, lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ToastProvider } from "@/components/ToastProvider";
import ShareComposerSheet from "@/components/social/ShareComposerSheet";
import OneTimeMaintenance from "@/components/OneTimeMaintenance";
import { NotificationBubbleProvider } from "@/components/NotificationBubble";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import { StreakReminderPrimingModal } from "@/components/StreakReminderPrimingModal";
import { StreaksProvider } from "@/features/streaks/useStreaks";
import { RemindersProvider } from "@/hooks/RemindersProvider";
import { DailyLogsProvider } from "@/hooks/DailyLogsProvider";
import { Spinner } from "@/components/ui/Spinner";
// Retry wrapper for lazy imports — handles stale cache serving old HTML
// that references chunk hashes that no longer exist after a deploy.
// Also catches "Failed to fetch dynamically imported module" errors from
// stale Service Worker caches.
function lazyRetry<T extends { default: React.ComponentType<Record<string, never>> }>(
  factory: () => Promise<T>,
): React.LazyExoticComponent<T["default"]> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const isChunkError =
        message.includes("Failed to fetch dynamically imported module") ||
        message.includes("Importing a module script failed") ||
        message.includes("error loading dynamically imported module") ||
        message.includes("Loading chunk") ||
        message.includes("Loading CSS chunk");

      if (isChunkError) {
        // Clear SW caches so the next reload fetches fresh assets
        if ("caches" in window) {
          caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
        }
        // Only auto-reload once per session to avoid infinite loops
        const key = "chunk-retry";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          // Return a never-resolving promise to prevent React from rendering
          // the error while the page is reloading
          return new Promise<T>(() => {});
        }
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
const TermsOfService = lazyRetry(() => import("@/pages/TermsOfService"));
const Home = lazyRetry(() => import("@/pages/Home"));
const Food = lazyRetry(() => import("@/pages/Food"));
const History = lazyRetry(() => import("@/pages/History"));
const Settings = lazyRetry(() => import("@/pages/Settings"));
const Upgrade = lazyRetry(() => import("@/pages/Upgrade"));
const Program = lazyRetry(() => import("@/pages/Program"));
const Run = lazyRetry(() => import("@/pages/Run"));
const RunSummary = lazyRetry(() => import("@/pages/RunSummary"));
const RunDetail = lazyRetry(() => import("@/pages/RunDetail"));
const Social = lazyRetry(() => import("@/pages/Social"));
const Crew = lazyRetry(() => import("@/pages/Crew"));
const Routine = lazyRetry(() => import("@/pages/Routine"));
const UserProfile = lazyRetry(() => import("@/pages/UserProfile"));
const ExerciseHistory = lazyRetry(() => import("@/pages/ExerciseHistory"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner size="md" label="Loading page" />
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
    console.error("App crash:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack || null });
  }

  render() {
    if (this.state.hasError) {
      // Sprint 5: hide raw error message + component stack from
      // users in production. Showing "Cannot read properties of
      // undefined (reading 'foo')" to a TestFlight user reads as
      // a crashed app, not a designed error state. The technical
      // details remain visible in dev so debugging stays fast, and
      // the full error continues to log via console.error in
      // componentDidCatch above (line 102) for operator triage.
      const isDev = import.meta.env.DEV;
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-6" role="alert">
          <div className="text-center space-y-4 max-w-sm w-full">
            <p className="text-4xl" aria-hidden="true">Warning</p>
            <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>

            <p className="text-sm text-muted-foreground break-words">
              {isDev
                ? this.state.error?.message || "An unexpected error occurred."
                : "Try refreshing the app. If it keeps happening, contact support."}
            </p>

            {isDev && this.state.componentStack && (
              <details className="text-left bg-card border border-border/50 rounded-xl p-3">
                <summary className="text-sm font-medium text-foreground cursor-pointer">
                  Show component trace (dev only)
                </summary>
                <pre className="mt-2 text-xs leading-snug text-muted-foreground whitespace-pre-wrap break-words">
                  {this.state.componentStack}
                </pre>
              </details>
            )}

            <button
              onClick={async () => {
                // Purge the stale-chunk recovery latch so lazyRetry can
                // reload-and-retry again on the next failure. Previously
                // the latch was session-scoped, which meant a user who
                // hit ONE module-import error (typically post-deploy)
                // exhausted their one-shot retry and then saw this
                // error boundary on every subsequent navigation until
                // they killed the PWA.
                try {
                  sessionStorage.removeItem("chunk-retry");
                } catch {
                  // Private mode / storage disabled — fine, the flag
                  // just wasn't set.
                }
                // Blow away the service-worker caches so the reload
                // fetches fresh HTML + chunks instead of the stale
                // bundle the SW is still serving.
                if ("caches" in window) {
                  try {
                    const names = await caches.keys();
                    await Promise.all(names.map((n) => caches.delete(n)));
                  } catch {
                    // Best-effort; a cache error shouldn't block reload.
                  }
                }
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
   ROUTE PREFETCHING
================================ */

const PREFETCH_MAP: Record<string, (() => Promise<unknown>)[]> = {
  "/": [() => import("@/pages/Food"), () => import("@/pages/Program")],
  "/food": [() => import("@/pages/Home"), () => import("@/pages/History")],
  "/program": [() => import("@/pages/Home"), () => import("@/pages/Food")],
  "/social": [() => import("@/pages/Home")],
  "/history": [() => import("@/pages/Home"), () => import("@/pages/Settings")],
};

function RoutePrefetcher() {
  const location = useLocation();

  useEffect(() => {
    const prefetches = PREFETCH_MAP[location.pathname];
    if (!prefetches) return;

    const rIC = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(cb, 1) as unknown as number);
    const cIC = window.cancelIdleCallback ?? ((id: number) => window.clearTimeout(id));

    const id = rIC(() => {
      prefetches.forEach(load => load().catch(() => {}));
    });

    return () => cIC(id);
  }, [location.pathname]);

  return null;
}

/* ================================
   ROUTES
================================ */

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (user && navigator.onLine) {
      import('@/lib/offlineQueue').then(({ flushQueue }) => {
        import('@/lib/firebase').then(({ db }) => {
          flushQueue(db).catch(() => {});
        });
      });
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="lg" label="Loading Tropos" />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </Suspense>
    );
  }

  if (!profile?.onboardingComplete) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="*" element={<Onboarding />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      {/* One <StreaksProvider> per authenticated session — consumers
          (Home, BadgeGrid, useStreakReminder, priming modal) all read
          from context instead of each spawning their own 4 Firestore
          subscriptions. */}
      <StreaksProvider>
        {/* RemindersProvider runs the three reminder hooks once at the
            authenticated root so scheduling doesn't drift whenever the
            user skips the Settings page. Must sit inside StreaksProvider
            because useStreakReminderInternal reads useStreaks(). */}
        <RemindersProvider>
        {/* DailyLogsProvider owns the single `users/{uid}/logs` live
            subscription — useDailyLogs / useWeeklyStats / useMonthlyStats
            / useWeeklyDayMap all read from it, collapsing four listeners
            into one. */}
        <DailyLogsProvider>
        <RoutePrefetcher />
        {/* Mounted at App root (not in Settings) so the priming check runs
            on every foreground event regardless of which page the user is
            on. The modal internally gates on currentStreak >= 2 and
            primingShown === false — renders nothing on most sessions. */}
        <StreakReminderPrimingModal />
        <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route element={<Layout />}>
          <Route path="/" element={<RouteErrorBoundary><Home /></RouteErrorBoundary>} />
          <Route path="/food" element={<RouteErrorBoundary><Food /></RouteErrorBoundary>} />
          <Route path="/history" element={<RouteErrorBoundary><History /></RouteErrorBoundary>} />
          <Route path="/history/exercise/:name" element={<RouteErrorBoundary><ExerciseHistory /></RouteErrorBoundary>} />
          <Route path="/settings" element={<RouteErrorBoundary><Settings /></RouteErrorBoundary>} />
          <Route path="/upgrade" element={<RouteErrorBoundary><Upgrade /></RouteErrorBoundary>} />
          <Route path="/program" element={<RouteErrorBoundary><Program /></RouteErrorBoundary>} />
          <Route path="/social" element={<RouteErrorBoundary><Social /></RouteErrorBoundary>} />
          <Route path="/user/:uid" element={<RouteErrorBoundary><UserProfile /></RouteErrorBoundary>} />
          <Route path="/crew/:crewId" element={<RouteErrorBoundary><Crew /></RouteErrorBoundary>} />
          <Route path="/routine/:routineId" element={<RouteErrorBoundary><Routine /></RouteErrorBoundary>} />
          <Route path="/run/:runId" element={<RouteErrorBoundary><RunDetail /></RouteErrorBoundary>} />
        </Route>
        <Route path="/run" element={<RouteErrorBoundary><Run /></RouteErrorBoundary>} />
        <Route path="/run-summary" element={<RouteErrorBoundary><RunSummary /></RouteErrorBoundary>} />
        <Route path="/log" element={<Navigate to="/food" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
        </DailyLogsProvider>
        </RemindersProvider>
      </StreaksProvider>
    </Suspense>
  );
}

/* ================================
   APP
================================ */

function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <NotificationBubbleProvider>
              <ToastProvider />
              <ShareComposerSheet />
              <OneTimeMaintenance />
              <AppRoutes />
            </NotificationBubbleProvider>
          </AuthProvider>
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}

export default App;

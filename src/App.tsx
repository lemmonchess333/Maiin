import { Component, type ReactNode, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AuthProvider, useAuth } from "@/lib/auth";
import { RevenueCatIdentity } from "@/hooks/useRevenueCatIdentity";
import { ToastProvider } from "@/components/ToastProvider";
import ShareComposerSheet from "@/components/social/ShareComposerSheet";
import OneTimeMaintenance from "@/components/OneTimeMaintenance";
import { NotificationBubbleProvider } from "@/components/NotificationBubble";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import { StreakReminderPrimingModal } from "@/components/StreakReminderPrimingModal";
import { StreaksProvider } from "@/features/streaks/useStreaks";
import { DailyNutritionSnapshot } from "@/hooks/useDailyNutritionSnapshot";
import { RemindersProvider } from "@/hooks/RemindersProvider";
import { DailyLogsProvider } from "@/hooks/DailyLogsProvider";
import { SurfaceCoordinatorProvider } from "@/components/SurfaceCoordinatorProvider";
import { EducationLaneProvider } from "@/components/EducationLaneProvider";
import { Spinner } from "@/components/ui/Spinner";
import { PageContentSkeleton } from "@/components/LoadingSkeleton";
import { captureError } from "@/lib/errorReporting";
/* Chunk-error-recovering lazy wrapper. Extracted to src/lib/lazyRetry
   so sub-component lazy loads (Soc5 item 10) can share it. */
import { lazyRetry } from "@/lib/lazyRetry";
import MinVersionGate from "@/components/MinVersionGate";
// Shipped ambient brand glow — eager (tiny, renders on every authed page).
import AmbientGlow from "@/components/AmbientGlow";

// Lazy-loaded pages & layout for code splitting
const Layout = lazyRetry(() => import("@/components/Layout"));
const Login = lazyRetry(() => import("@/pages/Login"));
const Onboarding = lazyRetry(() => import("@/pages/Onboarding"));
const PrivacyPolicy = lazyRetry(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazyRetry(() => import("@/pages/TermsOfService"));
const Support = lazyRetry(() => import("@/pages/Support"));
const WeeklyReviewPage = lazyRetry(() => import("@/pages/WeeklyReview"));
const Home = lazyRetry(() => import("@/pages/Home"));
const Food = lazyRetry(() => import("@/pages/Food"));
const History = lazyRetry(() => import("@/pages/History"));
const Settings = lazyRetry(() => import("@/pages/Settings"));
const SettingsIndex = lazyRetry(() => import("@/pages/SettingsIndex"));
const SettingsProfile = lazyRetry(
  () => import("@/pages/settings/SettingsProfile")
);
const SettingsTraining = lazyRetry(
  () => import("@/pages/settings/SettingsTraining")
);
const SettingsRunPlan = lazyRetry(
  () => import("@/pages/settings/SettingsRunPlan")
);
const SettingsNutrition = lazyRetry(
  () => import("@/pages/settings/SettingsNutrition")
);
const SettingsWorkoutPrefs = lazyRetry(
  () => import("@/pages/settings/SettingsWorkoutPrefs")
);
const SettingsUnitsAppearance = lazyRetry(
  () => import("@/pages/settings/SettingsUnitsAppearance")
);
const SettingsPrivacy = lazyRetry(
  () => import("@/pages/settings/SettingsPrivacy")
);
const SettingsShoes = lazyRetry(() => import("@/pages/settings/SettingsShoes"));
const SettingsNotifications = lazyRetry(
  () => import("@/pages/settings/SettingsNotifications")
);
const SettingsSubscription = lazyRetry(
  () => import("@/pages/settings/SettingsSubscription")
);
const SettingsSupportLegal = lazyRetry(
  () => import("@/pages/settings/SettingsSupportLegal")
);
const SettingsAccount = lazyRetry(
  () => import("@/pages/settings/SettingsAccount")
);
const SettingsRecentlyDeleted = lazyRetry(
  () => import("@/pages/settings/SettingsRecentlyDeleted")
);
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
// PR N (audit P2 #17): hidden operator-diagnostics route. Lazy-loaded
// like every other page; not wired into any nav. Reachable only by
// direct URL (/diagnostics) so the support flow is "open this URL
// and screenshot it" without exposing it to the average user.
const Diagnostics = lazyRetry(() => import("@/pages/Diagnostics"));
// Admin moderation queue — hidden behind the client-side admin
// allowlist (VITE_ADMIN_UIDS). Non-admin signed-in users see a
// 403 placeholder; the underlying callable also re-checks admin
// server-side so the route gate is UX only, not a trust boundary.
const AdminModeration = lazyRetry(() => import("@/pages/AdminModeration"));

// Dev-only brand bake-off comparison route. `import.meta.env.MODE` is
// statically replaced at build time, so in the real production build
// (`npm run build`, mode "production") this is null and the dynamic import —
// plus the candidate-font chunk it pulls in — is dead-code-eliminated. It is
// present in `vite dev` and the e2e/test build (mode "test") so the Playwright
// rig can capture it. Nothing here ever ships to users.
const BrandBakeoff =
  import.meta.env.MODE !== "production"
    ? lazyRetry(() => import("@/pages/dev/BrandBakeoff"))
    : null;

// The ambient-emission bake-off (#1252) concluded: candidate A (single
// brand-purple glow) ships as <AmbientGlow>. The dev harness was retired
// to avoid a double-render with the shipped layer; it's recoverable from
// history + the contact sheet in docs/visual-audit/ambient/ if a future
// re-tune needs it.

function PageLoader() {
  // Route-aware skeleton instead of a bare centered spinner. This is the
  // app-root Suspense fallback — under BrowserRouter it's the boundary that
  // reliably catches a page chunk that isn't cached yet, so shaping it per
  // route turns the lone-spinner "loading…" into a placeholder that mirrors
  // the page about to mount (no full-screen spinner, no layout jump). The
  // in-Layout <Suspense> handles the nav-persistent case; this covers the
  // first paint of an un-cached chunk. Padding matches Layout's <main>.
  const { pathname } = useLocation();
  return (
    <div className="max-w-md mx-auto px-4 py-6 sm:py-7">
      <PageContentSkeleton pathname={pathname} />
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

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, componentStack: null };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // PR G (audit P1 #14): route the crash through the structured
    // error-reporting helper instead of a raw console.error. Future
    // observability backends pick this up; production crashes stay
    // searchable / correlatable rather than scrolling past as
    // unstructured console noise.
    captureError(error, "component", {
      source: "react-error-boundary",
      componentStack: info.componentStack,
    });
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
        <div
          className="min-h-screen bg-background flex items-center justify-center px-6"
          role="alert"
        >
          <div className="text-center space-y-4 max-w-sm w-full">
            <p className="text-4xl" aria-hidden="true">
              Warning
            </p>
            <h1 className="text-lg font-bold text-foreground">
              Something went wrong
            </h1>

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
              type="button"
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
                this.setState({
                  hasError: false,
                  error: null,
                  componentStack: null,
                });
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
  // Pull pathname out of the react-router location object before the
  // effect so the dep array reads a primitive — react-doctor's
  // "mutable in deps" heuristic flags `location.*` patterns by name
  // (assuming `window.location`) even though react-router's
  // `useLocation()` returns a fresh object per navigation. Extracting
  // makes the dep explicit and lint-clean without changing semantics.
  const { pathname } = useLocation();

  useEffect(() => {
    const prefetches = PREFETCH_MAP[pathname];
    if (!prefetches) return;

    const rIC =
      window.requestIdleCallback ??
      ((cb: IdleRequestCallback) =>
        window.setTimeout(cb, 1) as unknown as number);
    const cIC =
      window.cancelIdleCallback ?? ((id: number) => window.clearTimeout(id));

    const id = rIC(() => {
      prefetches.forEach((load) => load().catch(() => {}));
    });

    return () => cIC(id);
  }, [pathname]);

  return null;
}

/* ================================
   ROUTES
================================ */

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const tryFlush = () => {
      if (!navigator.onLine) return;
      // Lazy-load so this only ships when the user is signed in.
      import("@/lib/offlineQueue").then(({ flushQueue }) => {
        import("@/lib/firebase").then(({ db }) => {
          flushQueue(db, uid).catch(() => {});
        });
      });
    };
    // Initial flush on sign-in (covers the resumed-session case
    // where writes were queued in a prior tab / session).
    tryFlush();
    // Render foreground FCM pushes — when the app is open, the message goes
    // to onMessage (not the SW), so without this a push that arrives while
    // the tab is focused is silently dropped. Idempotent + guarded.
    import("@/lib/pushNotifications").then(({ listenForForegroundPush }) => {
      listenForForegroundPush().catch(() => {});
    });
    // Re-flush whenever the browser regains connectivity. Listener
    // captures `uid` in closure so it can never flush under a
    // different user — the cleanup removes it on auth change.
    window.addEventListener("online", tryFlush);
    return () => window.removeEventListener("online", tryFlush);
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
          <Route path="/support" element={<Support />} />
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
          <Route path="/support" element={<Support />} />
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
        {/* Single session-wide writer for the per-day macro-target snapshot
            (users/{uid}/dailyNutrition/{date}) the nutrition badges read. */}
        <DailyNutritionSnapshot />
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
            {/* #995: app-global tier-4 coordinator. Wraps BOTH the global
                priming modal and the routes (Home's trial/fell-behind/badge),
                so at most one blocking surface shows per app-open. */}
            <SurfaceCoordinatorProvider>
              {/* #995 tier-3: ≤1 inline education card at a time. */}
              <EducationLaneProvider>
                <RoutePrefetcher />
                {/* Shipped single-hue brand ambient glow. Authenticated root
                    only, so it sits behind every app page but the
                    unauthenticated auth-shell branch (its own ambience) is
                    untouched. Renders nothing on run/map routes and under
                    prefers-reduced-transparency. */}
                <AmbientGlow />
                {/* Mounted at App root (not in Settings) so the priming check runs
            on every foreground event regardless of which page the user is
            on. The modal internally gates on currentStreak >= 2 and
            primingShown === false — renders nothing on most sessions. */}
                <StreakReminderPrimingModal />
                <Routes>
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/support" element={<Support />} />
                  <Route path="/review" element={<WeeklyReviewPage />} />
                  <Route element={<Layout />}>
                    <Route
                      path="/"
                      element={
                        <RouteErrorBoundary>
                          <Home />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/food"
                      element={
                        <RouteErrorBoundary>
                          <Food />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/history"
                      element={
                        <RouteErrorBoundary>
                          <History />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/history/exercise/:name"
                      element={
                        <RouteErrorBoundary>
                          <ExerciseHistory />
                        </RouteErrorBoundary>
                      }
                    />
                    {/* Set1.1: nested-page Settings IA. /settings is the index;
              each section gets its own route. The legacy flat page
              stays reachable at /settings/legacy until each section
              has been migrated (the SettingsIndex rows route there
              for non-migrated sections). */}
                    <Route
                      path="/settings"
                      element={
                        <RouteErrorBoundary>
                          <SettingsIndex />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/legacy"
                      element={
                        <RouteErrorBoundary>
                          <Settings />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/profile"
                      element={
                        <RouteErrorBoundary>
                          <SettingsProfile />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/training"
                      element={
                        <RouteErrorBoundary>
                          <SettingsTraining />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/run-plan"
                      element={
                        <RouteErrorBoundary>
                          <SettingsRunPlan />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/nutrition"
                      element={
                        <RouteErrorBoundary>
                          <SettingsNutrition />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/workout-prefs"
                      element={
                        <RouteErrorBoundary>
                          <SettingsWorkoutPrefs />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/units-appearance"
                      element={
                        <RouteErrorBoundary>
                          <SettingsUnitsAppearance />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/privacy"
                      element={
                        <RouteErrorBoundary>
                          <SettingsPrivacy />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/shoes"
                      element={
                        <RouteErrorBoundary>
                          <SettingsShoes />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/notifications"
                      element={
                        <RouteErrorBoundary>
                          <SettingsNotifications />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/subscription"
                      element={
                        <RouteErrorBoundary>
                          <SettingsSubscription />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/support-legal"
                      element={
                        <RouteErrorBoundary>
                          <SettingsSupportLegal />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/account"
                      element={
                        <RouteErrorBoundary>
                          <SettingsAccount />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings/recently-deleted-meals"
                      element={
                        <RouteErrorBoundary>
                          <SettingsRecentlyDeleted />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/upgrade"
                      element={
                        <RouteErrorBoundary>
                          <Upgrade />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/program"
                      element={
                        <RouteErrorBoundary>
                          <Program />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/social"
                      element={
                        <RouteErrorBoundary>
                          <Social />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/user/:uid"
                      element={
                        <RouteErrorBoundary>
                          <UserProfile />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/crew/:crewId"
                      element={
                        <RouteErrorBoundary>
                          <Crew />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/routine/:routineId"
                      element={
                        <RouteErrorBoundary>
                          <Routine />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/run/:runId"
                      element={
                        <RouteErrorBoundary>
                          <RunDetail />
                        </RouteErrorBoundary>
                      }
                    />
                  </Route>
                  <Route
                    path="/run"
                    element={
                      <RouteErrorBoundary>
                        <Run />
                      </RouteErrorBoundary>
                    }
                  />
                  <Route
                    path="/run-summary"
                    element={
                      <RouteErrorBoundary>
                        <RunSummary />
                      </RouteErrorBoundary>
                    }
                  />
                  {/* Hidden operator diagnostics — not in Layout so it doesn't
            render the nav, full-screen surface for screenshotting. */}
                  <Route
                    path="/diagnostics"
                    element={
                      <RouteErrorBoundary>
                        <Diagnostics />
                      </RouteErrorBoundary>
                    }
                  />
                  {/* Admin moderation queue. Client gate via VITE_ADMIN_UIDS,
            server gate via listPendingReports callable's ADMIN_UIDS
            check — non-admin signed-in users see a 403 placeholder
            from the page itself. */}
                  <Route
                    path="/admin/moderation"
                    element={
                      <RouteErrorBoundary>
                        <AdminModeration />
                      </RouteErrorBoundary>
                    }
                  />
                  <Route
                    path="/log"
                    element={<Navigate to="/food" replace />}
                  />
                  {/* Dev/test-only brand bake-off — absent from production
                      builds (BrandBakeoff is null there). Standalone (no
                      Layout nav) for clean full-page captures. */}
                  {BrandBakeoff && (
                    <Route
                      path="/dev/brand-bakeoff"
                      element={
                        <RouteErrorBoundary>
                          <BrandBakeoff />
                        </RouteErrorBoundary>
                      }
                    />
                  )}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </EducationLaneProvider>
            </SurfaceCoordinatorProvider>
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
          <MinVersionGate>
            <AuthProvider>
              <NotificationBubbleProvider>
                <ToastProvider />
                <ShareComposerSheet />
                <OneTimeMaintenance />
                <RevenueCatIdentity />
                <AppRoutes />
              </NotificationBubbleProvider>
            </AuthProvider>
          </MinVersionGate>
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}

export default App;

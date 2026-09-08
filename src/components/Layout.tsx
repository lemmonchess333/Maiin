import { Outlet, useLocation } from "react-router-dom";
import BottomNavigation from "@/components/BottomNavigation";
import {
  Home,
  BarChart3,
  Dumbbell,
  Users,
  WifiOff,
  Check,
  Apple,
  CloudUpload,
} from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import {
  getQueueLength,
  getFailedWorkoutCompletionCount,
  subscribeQueuedWrites,
  flushQueue,
} from "@/lib/offlineQueue";
import { db } from "@/lib/firebase";
import Button from "@/components/ui/Button";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { haptic } from "@/lib/haptic";
import { outboxLength } from "@/features/program/commandOutbox";
import { useUid } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { useEffect, useSyncExternalStore, useCallback, useState } from "react";

/** Queue state describes local persistence, not network connectivity. */
function useQueuedChanges(uid: string | null) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!uid) return () => {};
      // Firestore queue changes publish immediately. Programme commands
      // retain the existing poll; it must continue after reconnection.
      const unsubscribe = subscribeQueuedWrites(cb);
      const id = setInterval(cb, 3000);
      window.addEventListener("storage", cb);
      return () => {
        unsubscribe();
        clearInterval(id);
        window.removeEventListener("storage", cb);
      };
    },
    [uid]
  );
  const getSnapshot = useCallback(
    // A stable primitive snapshot avoids allocating a new object on each
    // external-store read. Both queues and failures belong to THIS account.
    () =>
      uid
        ? `${getQueueLength(uid) + outboxLength(uid)}:${getFailedWorkoutCompletionCount(uid)}`
        : "0:0",
    [uid]
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const [count, failedWorkouts] = snapshot.split(":").map(Number);
  return { count, failedWorkouts };
}

const tabs: { to: string; icon: typeof Home; label: string }[] = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/program", icon: Dumbbell, label: "Train" },
  { to: "/food", icon: Apple, label: "Food" },
  { to: "/social", icon: Users, label: "Social" },
  { to: "/history", icon: BarChart3, label: "Analytics" },
];

export default function Layout() {
  const location = useLocation();
  const hideNav = location.pathname === "/run";
  const { isOnline, wasOffline } = useOnlineStatus();
  const { count: unreadCount, markSeen } = useUnreadCount();
  const prefersReducedMotion = useReducedMotion();
  const uid = useUid();
  const { count: queueCount, failedWorkouts } = useQueuedChanges(uid);
  const [retryingUid, setRetryingUid] = useState<string | null>(null);
  const waitingCount = Math.max(0, queueCount - failedWorkouts);
  const pendingText =
    failedWorkouts > 0
      ? `${failedWorkouts} workout${failedWorkouts === 1 ? " needs" : "s need"} attention · saved on this phone${waitingCount > 0 ? `. ${waitingCount} other change${waitingCount === 1 ? "" : "s"} waiting to sync` : ""}`
      : `${queueCount} change${queueCount === 1 ? "" : "s"} saved on this phone · waiting to sync`;

  async function retryWorkouts() {
    if (!uid) return;
    const owner = uid;
    haptic();
    setRetryingUid(owner);
    try {
      await flushQueue(db, owner);
    } catch {
      // The durable record remains queued. Keep its status visible; a
      // failed retry must never turn into a server-saved acknowledgement.
    } finally {
      setRetryingUid((current) => (current === owner ? null : current));
    }
  }

  // Swipe-between-tabs. Active only on the tab roots (the hook no-ops on
  // sub-pages); conflict avoidance lives in the hook + the data-no-page-swipe
  // / data-swipe-card opt-outs on horizontal-gesture owners.
  const tabRoutes = tabs.map((t) => t.to);
  const { onTouchStart: onSwipeStart, onTouchEnd: onSwipeEnd } =
    useSwipeNavigation(tabRoutes, location.pathname);

  // Directional page transition: slide toward the new tab's side. Derived
  // from the tab-index delta so a TAP on the nav slides the same way a swipe
  // does. Uses React's "adjust state during render" pattern to remember the
  // previous tab index — computing slideDir synchronously so the keyed
  // motion.div below mounts with the correct entry offset (an effect would
  // land one render too late). Sub-page nav (idx -1) just fades (slideDir 0).
  const activeIdx = tabRoutes.indexOf(location.pathname);
  const [prevIdx, setPrevIdx] = useState(activeIdx);
  const [slideDir, setSlideDir] = useState<-1 | 0 | 1>(0);
  if (prevIdx !== activeIdx) {
    setSlideDir(
      activeIdx !== -1 && prevIdx !== -1 ? (activeIdx > prevIdx ? 1 : -1) : 0
    );
    setPrevIdx(activeIdx);
  }

  // PWA Safeguard 2: Fix iOS 17+ position:fixed drift after backgrounding
  useEffect(() => {
    const fixDrift = () => {
      const bar = document.querySelector("nav[data-tab-bar]");
      if (bar) {
        const rect = bar.getBoundingClientRect();
        if (rect.bottom > window.innerHeight + 2) {
          (bar as HTMLElement).style.bottom = "0px";
        }
      }
    };
    window.addEventListener("resize", fixDrift);
    document.addEventListener("visibilitychange", fixDrift);
    return () => {
      window.removeEventListener("resize", fixDrift);
      document.removeEventListener("visibilitychange", fixDrift);
    };
  }, []);

  return (
    <div
      className="min-h-screen transition-colors"
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "var(--page-bottom-pad)",
      }}
    >
      {/* Top safe-area occluder — hides scrolling content under the iOS status bar.
          Uses the shared `.ds-safe-top-occluder` class (translucent
          background + backdrop-blur) so the ambient background gradient
          flows continuously through the safe area rather than getting
          cut by a 95%-opaque flat strip. Mirrors the role of the bottom
          nav at the bottom of the screen. */}
      <div
        aria-hidden="true"
        /* z-40, deliberately ABOVE the page-chrome tier (sticky bars like
           FoodDateBar + the bottom nav sit at z-30): at an equal z-30 the
           later-DOM sticky bars painted OVER the occluder while transiting
           the status-bar zone on scroll. Stays BELOW sheets/drawers (z-50),
           which must cover the full screen including the safe area. */
        className="fixed top-0 left-0 right-0 z-40 ds-safe-top-occluder"
        style={{ height: "var(--safe-top)" }}
      />
      {/* Sprint 5: removed the React-rendered skip link from this
          component. The canonical skip link lives in index.html (line
          99) — it loads before React hydration so a keyboard user
          hitting Tab during page load gets it immediately, and it
          targets the same #main-content anchor this Layout renders.
          Pre-Sprint-5 both rendered, producing two consecutive focus
          stops with slightly different text ('Skip to main content'
          vs 'Skip to content') for the same destination. */}

      {/* Connectivity and pending local changes use the existing banner.
          Animations gated on `prefersReducedMotion` — the
          height/opacity reveal is decorative, not informational.
          aria-live="polite" announces the banner text regardless of
          whether the transition plays. */}
      <div aria-live="polite">
        <AnimatePresence>
          {(!isOnline || queueCount > 0) && (
            <motion.div
              key="pending-sync"
              initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { height: 0, opacity: 0 }
              }
              transition={
                prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }
              }
              className="overflow-hidden"
            >
              <div className="ds-status-banner ds-status-banner--warning">
                {isOnline ? (
                  <CloudUpload
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  <InlineNumerals>
                    {queueCount > 0
                      ? `${isOnline ? "" : "You're offline · "}${pendingText}`
                      : "You're offline"}
                  </InlineNumerals>
                </span>
                {isOnline && failedWorkouts > 0 && (
                  <Button
                    variant="ghost"
                    className="shrink-0 px-2 text-xs text-warning-strong"
                    loading={retryingUid === uid}
                    onClick={retryWorkouts}
                    aria-label="Retry syncing workouts"
                  >
                    Retry
                  </Button>
                )}
              </div>
            </motion.div>
          )}
          {isOnline && wasOffline && queueCount === 0 && (
            <motion.div
              key="back-online"
              initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { height: 0, opacity: 0 }
              }
              transition={
                prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }
              }
              className="overflow-hidden"
            >
              <div className="ds-status-banner ds-status-banner--success">
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
                <span>Back online</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Page fade also gated on reduced motion — the cross-page
          opacity transition is purely cosmetic. Reduced-motion users
          get an instant change. */}
      <main
        id="main-content"
        className="max-w-md mx-auto px-4 py-6 sm:py-7"
        onTouchStart={onSwipeStart}
        onTouchEnd={onSwipeEnd}
      >
        <motion.div
          key={location.pathname}
          initial={
            prefersReducedMotion ? false : { opacity: 0, x: slideDir * 24 }
          }
          animate={{ opacity: 1, x: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }
          }
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Bottom tab bar */}
      {!hideNav && (
        <BottomNavigation
          tabs={tabs}
          pathname={location.pathname}
          unreadCount={unreadCount}
          onSocialVisit={markSeen}
        />
      )}
    </div>
  );
}

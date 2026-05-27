import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Home,
  BarChart3,
  Dumbbell,
  Users,
  WifiOff,
  Check,
  UtensilsCrossed,
} from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getQueueLength } from "@/lib/offlineQueue";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useEffect, useSyncExternalStore, useCallback } from "react";

/** Subscribe to offline queue length — polls every 3s while offline */
function useQueueCount(isOnline: boolean): number {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (isOnline) return () => {};
      const id = setInterval(cb, 3000);
      return () => clearInterval(id);
    },
    [isOnline]
  );
  const getSnapshot = useCallback(
    () => (isOnline ? 0 : getQueueLength()),
    [isOnline]
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

const tabs: { to: string; icon: typeof Home; label: string }[] = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/program", icon: Dumbbell, label: "Programme" },
  { to: "/food", icon: UtensilsCrossed, label: "Food" },
  { to: "/social", icon: Users, label: "Social" },
  { to: "/history", icon: BarChart3, label: "History" },
];

export default function Layout() {
  const location = useLocation();
  const hideNav = location.pathname === "/run";
  const { isOnline, wasOffline } = useOnlineStatus();
  const { count: unreadCount, markSeen } = useUnreadCount();
  const prefersReducedMotion = useReducedMotion();
  const queueCount = useQueueCount(isOnline);

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
        className="fixed top-0 left-0 right-0 z-30 ds-safe-top-occluder"
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

      {/* Offline / back-online banner.
          Animations gated on `prefersReducedMotion` — the
          height/opacity reveal is decorative, not informational.
          aria-live="polite" announces the banner text regardless of
          whether the transition plays. */}
      <div aria-live="polite">
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              key="offline"
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
                <WifiOff className="size-3.5 shrink-0" />
                <span>
                  You're offline
                  {queueCount > 0
                    ? ` — ${queueCount} change${queueCount > 1 ? "s" : ""} saved locally`
                    : " — changes will sync when reconnected"}
                </span>
              </div>
            </motion.div>
          )}
          {isOnline && wasOffline && (
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
                <Check className="size-3.5 shrink-0" />
                <span>Back online — syncing changes</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Page fade also gated on reduced motion — the cross-page
          opacity transition is purely cosmetic. Reduced-motion users
          get an instant change. */}
      <main id="main-content" className="max-w-md mx-auto px-4 py-6 sm:py-7">
        <motion.div
          key={location.pathname}
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : { duration: 0.15 }
          }
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Bottom tab bar */}
      {!hideNav && (
        <nav
          aria-label="Main navigation"
          data-tab-bar
          className="fixed bottom-0 left-0 right-0 bottom-nav-frost safe-area-pb z-30"
          style={{ overflow: "visible" }}
        >
          <LayoutGroup>
            {/* The wrapping <nav aria-label="Main navigation"> on the
            parent element already gives this surface the correct
            semantics. The Codex PR added role="tablist" but a real
            tablist needs role="tab" + aria-selected + roving tabindex
            + tabpanel relationships — none of which fit the
            page-navigation pattern. Removing the role rather than
            implementing a half-tablist that would confuse screen
            readers. */}
            <div className="max-w-md mx-auto flex items-end px-1.5">
              {tabs.map((tab) => {
                const hasBadge = tab.to === "/social" && unreadCount > 0;
                const Icon = tab.icon;
                return (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    end={tab.to === "/"}
                    aria-label={tab.label}
                    onClick={() => {
                      haptic("light");
                      if (tab.to === "/social") markSeen();
                      /* Soc5 cross-cutting pin (3): tap on already-active
                     Social tab → scroll-to-top + dispatch a retap event
                     so the visible feed refreshes. Standard iOS pattern
                     (Twitter/X). Scoped to /social by the lock — other
                     tabs keep their default Link behaviour. */
                      if (
                        tab.to === "/social" &&
                        location.pathname === "/social"
                      ) {
                        try {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        } catch {
                          window.scrollTo(0, 0);
                        }
                        window.dispatchEvent(
                          new CustomEvent("tropos:social-tab-retap")
                        );
                      }
                    }}
                    className={({ isActive }) =>
                      cn(
                        // `min-w-0` lets flex-1 actually shrink the cells
                        // on iPhone SE width so the "Programme" label
                        // (the longest of the five) doesn't push siblings
                        // off-screen.
                        "flex-1 min-w-0 min-h-[60px] flex flex-col items-center justify-center gap-1 rounded-2xl py-2.5 transition-colors",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/45"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <motion.div
                          className="relative"
                          whileTap={
                            prefersReducedMotion ? undefined : { scale: 0.85 }
                          }
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 17,
                          }}
                        >
                          <motion.div
                            initial={false}
                            animate={
                              !prefersReducedMotion && isActive
                                ? { scale: [1, 1.15, 1] }
                                : { scale: 1 }
                            }
                            transition={{ duration: 0.25, ease: "easeOut" }}
                          >
                            <Icon
                              aria-hidden="true"
                              className={cn(
                                "size-5",
                                isActive && "ds-tab-active-icon"
                              )}
                              fill={isActive ? "currentColor" : "none"}
                              strokeWidth={isActive ? 2 : 1.75}
                            />
                          </motion.div>
                          {/* Notification badge */}
                          {hasBadge && (
                            <div className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive" />
                          )}
                          {/* Active indicator dot */}
                          {isActive &&
                            (prefersReducedMotion ? (
                              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary" />
                            ) : (
                              <motion.div
                                layoutId="tab-indicator"
                                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary"
                                transition={{
                                  type: "spring",
                                  stiffness: 500,
                                  damping: 30,
                                }}
                              />
                            ))}
                        </motion.div>
                        <span className="max-w-full truncate text-xs font-medium tracking-wide">
                          {tab.label}
                        </span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </LayoutGroup>
        </nav>
      )}
    </div>
  );
}

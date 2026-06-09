import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { activeTabForPath } from "@/lib/activeTab";
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
  { to: "/program", icon: Dumbbell, label: "Train" },
  { to: "/food", icon: UtensilsCrossed, label: "Food" },
  { to: "/social", icon: Users, label: "Social" },
  { to: "/history", icon: BarChart3, label: "Analytics" },
];

export default function Layout() {
  const location = useLocation();
  const hideNav = location.pathname === "/run";
  // Single source of truth for the active tab — drives the pill below instead
  // of each NavLink's own isActive (which let the shared layoutId pill linger
  // on non-tab routes like /upgrade and /run/:id). null = no tab active.
  const activeTab = activeTabForPath(location.pathname);
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
                const isActive = activeTab === tab.to;
                return (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    end={tab.to === "/"}
                    aria-label={
                      hasBadge
                        ? `${tab.label}, ${
                            unreadCount > 9 ? "9+" : unreadCount
                          } unread`
                        : tab.label
                    }
                    onClick={() => {
                      haptic("light");
                      if (tab.to === "/social") markSeen();
                      /* Tap on an already-active tab → scroll to top. The
                     standard iOS tab-bar convention applies to ALL tabs
                     (matches Twitter/X / Apple's first-party apps), so the
                     plain scroll-to-top runs for Home/Programme/Food/
                     Social/Analytics alike.
                       Soc5 cross-cutting pin (3) additionally locks the
                     Social tab to *refresh its feed* on retap — that part
                     stays scoped to /social via the retap CustomEvent below;
                     the other tabs get scroll-to-top only. */
                      if (location.pathname === tab.to) {
                        try {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        } catch {
                          window.scrollTo(0, 0);
                        }
                        if (tab.to === "/social") {
                          window.dispatchEvent(
                            new CustomEvent("tropos:social-tab-retap")
                          );
                        }
                      }
                    }}
                    className={cn(
                      // `min-w-0` lets flex-1 actually shrink the cells on
                      // iPhone SE width so the longest label ("Analytics")
                      // doesn't push siblings off-screen. Active state comes
                      // from activeTabForPath (not NavLink's isActive) so the
                      // pill never lingers on non-tab routes.
                      "relative flex-1 min-w-0 min-h-[60px] flex flex-col items-center justify-center gap-1 rounded-2xl py-2.5 transition-colors",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/45"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {
                      <>
                        {/* Active-destination indicator: a single shared pill
                            (layoutId) that GLIDES + morphs between tabs with a
                            crisp spring — motion continuity is what makes the
                            bar feel premium vs a per-cell cross-fade. Inset so
                            it reads as a contained chip, sitting behind the
                            icon + label. Reduced-motion → static, no slide. */}
                        {isActive &&
                          (prefersReducedMotion ? (
                            <div className="absolute inset-x-2 inset-y-1.5 rounded-2xl bg-primary/10 z-0" />
                          ) : (
                            <motion.div
                              layoutId="nav-active-pill"
                              className="absolute inset-x-2 inset-y-1.5 rounded-2xl bg-primary/10 z-0"
                              transition={{
                                type: "spring",
                                stiffness: 600,
                                damping: 38,
                              }}
                            />
                          ))}
                        <motion.div
                          className="relative z-10"
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
                            animate={{
                              scale:
                                !prefersReducedMotion && isActive ? 1.06 : 1,
                            }}
                            transition={{
                              type: "spring",
                              stiffness: 500,
                              damping: 30,
                            }}
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
                          {/* Unread Social activity is "new", not an error —
                              use the brand token, NOT bg-destructive (reserved
                              for genuine errors / destructive states; a red dot
                              over-escalates ordinary unread to "problem"). The
                              dot stays small to keep the 5-tab nav calm; the
                              count + accessible unread detail live in the
                              aria-label above and the Social header. */}
                          {hasBadge && (
                            <div className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                          )}
                        </motion.div>
                        <span className="relative z-10 max-w-full truncate text-xs font-medium tracking-wide">
                          {tab.label}
                        </span>
                      </>
                    }
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

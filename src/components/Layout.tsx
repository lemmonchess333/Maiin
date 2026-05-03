import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, BarChart3, Dumbbell, Users, WifiOff, Check, UtensilsCrossed } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getQueueLength } from "@/lib/offlineQueue";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useEffect, useSyncExternalStore, useCallback } from "react";

/** Subscribe to offline queue length — polls every 3s while offline */
function useQueueCount(isOnline: boolean): number {
  const subscribe = useCallback((cb: () => void) => {
    if (isOnline) return () => {};
    const id = setInterval(cb, 3000);
    return () => clearInterval(id);
  }, [isOnline]);
  const getSnapshot = useCallback(() => isOnline ? 0 : getQueueLength(), [isOnline]);
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
  const hideNav = location.pathname === '/run';
  const { isOnline, wasOffline } = useOnlineStatus();
  const { count: unreadCount, markSeen } = useUnreadCount();
  const prefersReducedMotion = useReducedMotion();
  const queueCount = useQueueCount(isOnline);

  // PWA Safeguard 2: Fix iOS 17+ position:fixed drift after backgrounding
  useEffect(() => {
    const fixDrift = () => {
      const bar = document.querySelector('nav[data-tab-bar]');
      if (bar) {
        const rect = bar.getBoundingClientRect();
        if (rect.bottom > window.innerHeight + 2) {
          (bar as HTMLElement).style.bottom = '0px';
        }
      }
    };
    window.addEventListener('resize', fixDrift);
    document.addEventListener('visibilitychange', fixDrift);
    return () => {
      window.removeEventListener('resize', fixDrift);
      document.removeEventListener('visibilitychange', fixDrift);
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-background transition-colors"
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "var(--page-bottom-pad)",
      }}
    >
      {/* Top safe-area occluder — hides scrolling content under the iOS status bar.
          Uses bg-background (page grey) so scrolling content disappears into
          the same colour as the gaps between cards. Mirrors the role of the
          bottom nav at the bottom of the screen. */}
      <div
        aria-hidden="true"
        className="fixed top-0 left-0 right-0 z-30 bg-background"
        style={{ height: "var(--safe-top)" }}
      />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      {/* Offline / back-online banner */}
      <div aria-live="polite">
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            key="offline"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-center gap-2 py-2 px-4 bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-medium">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-center gap-2 py-2 px-4 bg-green-500/15 text-green-600 dark:text-green-400 text-xs font-medium">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>Back online — syncing changes</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      <main id="main-content" className="max-w-md mx-auto px-4 py-6">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
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
        <div className="max-w-md mx-auto flex items-end" role="tablist">
          {tabs.map((tab) => {
            const hasBadge = tab.to === "/social" && unreadCount > 0;
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === "/"}
                aria-label={tab.label}
                onClick={() => { haptic('light'); if (tab.to === "/social") markSeen(); }}
                className={({ isActive }) =>
                  cn(
                    "flex-1 flex flex-col items-center gap-1 py-3 transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <motion.div
                      className="relative"
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    >
                      <motion.div
                        initial={false}
                        animate={!prefersReducedMotion && isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                      >
                        <Icon
                          aria-hidden="true"
                          className={cn("w-5 h-5", isActive && "ds-tab-active-icon")}
                          fill={isActive ? "currentColor" : "none"}
                          strokeWidth={isActive ? 2 : 1.75}
                        />
                      </motion.div>
                      {/* Notification badge */}
                      {hasBadge && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive" />
                      )}
                      {/* Active indicator dot */}
                      {isActive && (
                        prefersReducedMotion ? (
                          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                        ) : (
                          <motion.div
                            layoutId="tab-indicator"
                            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          />
                        )
                      )}
                    </motion.div>
                    <span className="text-xs font-medium tracking-wide">{tab.label}</span>
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

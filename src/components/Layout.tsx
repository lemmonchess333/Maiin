import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, PlusCircle, BarChart3, Dumbbell, Users, WifiOff, Check } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { motion, AnimatePresence } from "framer-motion";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/log", icon: PlusCircle, label: "Log" },
  { to: "/program", icon: Dumbbell, label: "Program" },
  { to: "/social", icon: Users, label: "Social" },
  { to: "/history", icon: BarChart3, label: "History" },
];

export default function Layout() {
  const location = useLocation();
  const hideNav = location.pathname === '/run';
  const { isOnline, wasOffline } = useOnlineStatus();
  const { count: unreadCount, markSeen } = useUnreadCount();

  return (
    <div className="min-h-screen bg-background transition-colors pb-20">
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
              <span>You're offline — changes will sync when reconnected</span>
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
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 bottom-nav-frost safe-area-pb z-30">
        <div className="max-w-md mx-auto flex" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const hasBadge = tab.to === "/social" && unreadCount > 0;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === "/"}
                aria-label={tab.label}
                onClick={tab.to === "/social" ? markSeen : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex-1 flex flex-col items-center gap-1 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="relative">
                      <Icon aria-hidden="true" className={cn("w-5 h-5", isActive && "ds-tab-active-icon")} />
                      {/* Notification badge */}
                      {hasBadge && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive" />
                      )}
                      {/* Active indicator dot */}
                      {isActive && (
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className="text-[11px] font-medium tracking-wide">{tab.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
      )}
    </div>
  );
}

import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, PlusCircle, BarChart3, Dumbbell, Users } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-background transition-colors pb-20">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      <main id="main-content" className="max-w-md mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      {!hideNav && (
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 bottom-nav-frost safe-area-pb z-30">
        <div className="max-w-md mx-auto flex" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === "/"}
                aria-label={tab.label}
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
                    <Icon aria-hidden="true" className={cn("w-5 h-5", isActive && "ds-tab-active-icon")} />
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

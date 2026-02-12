import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Home, PlusCircle, BarChart3, Settings } from "lucide-react";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/log", icon: PlusCircle, label: "Log" },
  { to: "/history", icon: BarChart3, label: "History" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  const { profile } = useAuth();
  const dark = profile?.darkMode ?? false;

  return (
    <div className={cn(dark && "dark")}>
      <div className="min-h-screen bg-background transition-colors pb-20">
        <div className="max-w-md mx-auto px-4 py-6">
          <Outlet />
        </div>

        {/* Bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border/50 safe-area-pb">
          <div className="max-w-md mx-auto flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex-1 flex flex-col items-center gap-1 py-3 transition-colors",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

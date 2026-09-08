import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import { activeTabForPath } from "@/lib/activeTab";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface BottomNavigationProps {
  tabs: readonly { to: string; icon: LucideIcon; label: string }[];
  pathname: string;
  unreadCount: number;
  onSocialVisit: () => void;
}

/** Web navigation surface. Layout owns routes and data; a future native
 * bar can replace this renderer without changing page content or queries.
 * CSS frost is a web treatment, not Apple's native Liquid Glass API. */
export default function BottomNavigation({
  tabs,
  pathname,
  unreadCount,
  onSocialVisit,
}: BottomNavigationProps) {
  const activeTab = activeTabForPath(pathname);
  const prefersReducedMotion = useReducedMotion();

  return (
    <nav
      aria-label="Main navigation"
      data-tab-bar
      className="bottom-nav-frame fixed bottom-0 left-0 right-0 z-30"
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
        <div className="bottom-nav-frost max-w-md mx-auto flex items-stretch rounded-full p-1">
          {tabs.map((tab) => {
            const hasBadge = tab.to === "/social" && unreadCount > 0;
            const Icon = tab.icon;
            const isActive = activeTab === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-label={
                  hasBadge
                    ? `${tab.label}, ${
                        unreadCount > 9 ? "9+" : unreadCount
                      } unread`
                    : tab.label
                }
                onClick={() => {
                  haptic("light");
                  if (tab.to === "/social") onSocialVisit();
                  /* Tap on an already-active tab → scroll to top. The
                 standard iOS tab-bar convention applies to ALL tabs
                 (matches Twitter/X / Apple's first-party apps), so the
                 plain scroll-to-top runs for Home/Programme/Food/
                 Social/Analytics alike.
                   Soc5 cross-cutting pin (3) additionally locks the
                 Social tab to *refresh its feed* on retap — that part
                 stays scoped to /social via the retap CustomEvent below;
                 the other tabs get scroll-to-top only. */
                  if (pathname === tab.to) {
                    try {
                      window.scrollTo({
                        top: 0,
                        behavior: prefersReducedMotion ? "instant" : "smooth",
                      });
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
                  // from activeTabForPath; Link also preserves aria-current
                  // on owned routes such as /user/:uid outside /social.
                  "bottom-nav-link relative flex-1 min-w-0 min-h-[54px] flex flex-col items-center justify-center gap-1 rounded-full py-1.5 motion-safe:transition-colors",
                  isActive
                    ? "bottom-nav-link--active"
                    : "text-foreground hover:bg-muted/45"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {
                  <>
                    {/* Active-destination indicator: a single shared pill
                        (layoutId) that GLIDES + morphs between tabs with a
                        crisp spring — motion continuity is what makes the
                        bar feel premium vs a per-cell cross-fade. It sits behind the
                        icon + label. Reduced-motion → static, no slide. */}
                    {isActive &&
                      (prefersReducedMotion ? (
                        <div className="bottom-nav-pill absolute inset-0 rounded-full ring-1 ring-inset ring-primary/15 z-0" />
                      ) : (
                        <motion.div
                          layoutId="nav-active-pill"
                          className="bottom-nav-pill absolute inset-0 rounded-full ring-1 ring-inset ring-primary/15 z-0"
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
                          scale: !prefersReducedMotion && isActive ? 1.06 : 1,
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
                        <div
                          aria-hidden="true"
                          className="absolute -top-1 -right-1 size-2 rounded-full bg-primary"
                        />
                      )}
                    </motion.div>
                    <span
                      className={cn(
                        "relative z-10 max-w-full text-xs",
                        isActive ? "font-semibold" : "font-medium"
                      )}
                    >
                      {tab.label}
                    </span>
                  </>
                }
              </Link>
            );
          })}
        </div>
      </LayoutGroup>
    </nav>
  );
}

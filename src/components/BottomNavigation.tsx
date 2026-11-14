import { Link } from "react-router-dom";
import type { TabIcon } from "@/components/icons/TabIcons";
import { activeTabForPath } from "@/lib/activeTab";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { preloadTab } from "@/lib/preloadTab";

interface BottomNavigationProps {
  tabs: readonly { to: string; icon: TabIcon; label: string }[];
  pathname: string;
  /** The notification tray holds something unread: someone's props, a
   *  comment, a follow request (App1 Q34). A dot on Social, and the tab's
   *  name says so. It clears when the tray is opened, not on this tab. */
  socialNewActivity: boolean;
}

/** What the Social tab's name adds while its dot shows: "Social, new
 *  activity". The dot is drawn for sight; this is the same news for
 *  VoiceOver (DESIGN_GUIDE §10). */
export const SOCIAL_NEW_ACTIVITY = "new activity";

/** Web navigation surface. Layout owns routes and data; a future native
 * bar can replace this renderer without changing page content or queries.
 * CSS frost is a web treatment, not Apple's native Liquid Glass API. */
export default function BottomNavigation({
  tabs,
  pathname,
  socialNewActivity,
}: BottomNavigationProps) {
  const activeTab = activeTabForPath(pathname);
  const prefersReducedMotion = useReducedMotion();

  return (
    <nav
      aria-label="Main navigation"
      data-tab-bar
      className="bottom-nav-frame fixed bottom-0 left-0 right-0 z-30"
    >
      <>
        {/* The wrapping <nav aria-label="Main navigation"> on the
        parent element already gives this surface the correct
        semantics. The Codex PR added role="tablist" but a real
        tablist needs role="tab" + aria-selected + roving tabindex
        + tabpanel relationships — none of which fit the
        page-navigation pattern. Removing the role rather than
        implementing a half-tablist that would confuse screen
        readers. */}
        <div className="bottom-nav-frost max-w-md mx-auto flex items-stretch rounded-full p-[4px]">
          {tabs.map((tab) => {
            const hasDot = tab.to === "/social" && socialNewActivity;
            const Icon = tab.icon;
            const isActive = activeTab === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                onPointerEnter={(event) => {
                  if (!isActive && event.pointerType === "mouse")
                    preloadTab(tab.to);
                }}
                onPointerDown={() => {
                  if (!isActive) preloadTab(tab.to);
                }}
                onFocus={() => {
                  if (!isActive) preloadTab(tab.to);
                }}
                aria-label={
                  hasDot ? `${tab.label}, ${SOCIAL_NEW_ACTIVITY}` : tab.label
                }
                onClick={() => {
                  haptic("light");
                  /* Tap on an already-active tab → scroll to top. The
                 standard iOS tab-bar convention applies to ALL tabs
                 (matches Twitter/X / Apple's first-party apps), so the
                 plain scroll-to-top runs for Home/Programme/Food/
                 Social/Progress alike.
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
                  // iPhone SE width so the longest label ("Progress")
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
                    {/* Active-destination indicator, behind the icon and
                        label. It moves with the tab at once, as a native
                        tab bar's does: its shared-layout glide ran on the
                        main thread just as the next page mounted
                        (DESIGN_GUIDE §14h). */}
                    {isActive && (
                      <div className="bottom-nav-pill absolute inset-0 rounded-full ring-1 ring-inset ring-primary/15 z-0" />
                    )}
                    <div className="bottom-nav-icon relative z-10">
                      {/* DS3's own tab icons: an outline, and a
                          filled form drawn for the open tab. */}
                      <Icon active={isActive} className="size-[22px]" />
                      {/* New activity is "new", not an error — the brand
                          token, NOT bg-destructive (reserved for genuine
                          errors / destructive states; a red dot
                          over-escalates ordinary news to "problem"). The
                          dot stays small, with no number, to keep the
                          five-tab bar calm; the count is on Social's bell,
                          and the tab's name carries the news. */}
                      {hasDot && (
                        <div
                          aria-hidden="true"
                          data-new-activity
                          className="absolute -top-1 -right-1 size-2 rounded-full bg-primary"
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        "bottom-nav-label relative z-10 max-w-full",
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
      </>
    </nav>
  );
}

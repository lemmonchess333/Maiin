/**
 * Bottom-nav active-tab resolution.
 *
 * The nav previously leaned on each `NavLink`'s own `isActive` plus a shared
 * Framer `layoutId` pill. On a route OUTSIDE every tab's subtree (e.g.
 * `/upgrade`, `/run/:id`) no NavLink matched, but the shared pill lingered on
 * whichever tab was last active during SPA navigation — so the audit caught
 * the Food pill stuck on `/upgrade` and `/run/:id`.
 *
 * This pure function is the single source of truth for "which tab owns this
 * route", driven off the App.tsx route table. The nav renders the active pill
 * ONLY on the returned tab; a path outside every subtree returns `null` and
 * NO tab lights up — it never falls through to a default.
 */
export type TabPath = "/" | "/program" | "/food" | "/social" | "/history";

export function activeTabForPath(pathname: string): TabPath | null {
  // Normalise a trailing slash (but keep root "/").
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (p === "/") return "/"; // Home (exact)
  if (p === "/food" || p.startsWith("/food/")) return "/food";
  // Programme owns /program (+ the in-page workout session, which is not its
  // own route).
  if (p === "/program" || p.startsWith("/program/")) return "/program";
  // Analytics owns History + the per-exercise history drill-down.
  if (p === "/history" || p.startsWith("/history/")) return "/history";
  // Social owns the feed/crews/people surface plus the destinations reached
  // from it: other users' profiles (/user/:uid) and crews (/crew/:crewId).
  if (
    p === "/social" ||
    p.startsWith("/social/") ||
    p.startsWith("/user/") ||
    p.startsWith("/crew/")
  )
    return "/social";

  // Everything else has no tab home — settings/*, /upgrade, /run, /run/:id,
  // /run-summary, /routine/:id, /diagnostics, /admin/*, legal. NEVER default
  // to a tab; the nav shows no active pill on these routes.
  return null;
}

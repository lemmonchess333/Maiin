import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { THEME } from "@/lib/theme";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { getCardColour } from "@/lib/performanceColour";
import { getVerb } from "@/lib/performanceLine";
import type { LoadBand } from "@/lib/performanceTypes";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/* Hist5b pin 3 — Performance fold. PerformanceTab's content
   (semicircle gauge + sub-score cards + 12-week chart) lives inline
   as an accordion-expandable section on the Analytics scroll, NOT
   as a dedicated tab.

   Surface contract:
   - Compact strip (always visible): current week's PI value +
     verb-coded colour + chevron. Tap to expand.
   - Inline accordion (expandable): full PerformanceTab content
     reused as-is. Framer-motion height transition.
   - URL hash `#performance-expanded` persists the expanded state
     across refresh (Hist5b pin 3). `#performance` alone (the
     anchor target for scroll-spy + deep-links) scrolls but does
     not force expansion.

   Lazy-loaded so the heavier chart machinery doesn't ship on
   Analytics's first paint. PerformanceTab itself already lazy-loads
   PerformanceIndexChart internally. */
const PerformanceTab = lazy(() => import("@/components/analytics/PerformanceTab"));

const EXPANDED_HASH = "#performance-expanded";

export default function PerformanceSection() {
  const { currentWeek, loading } = usePerformanceWeeks(4);
  const prefersReducedMotion = useReducedMotion();

  /* Restore expanded state from URL hash on mount. Subsequent toggles
     write the hash via window.history.replaceState so a back-tap
     returns to the previous page rather than collapsing the section. */
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.location.hash === EXPANDED_HASH;
  });

  /* Smooth-scroll the expanded section into view after the height
     animation kicks off so the user sees the new content unfurl
     without manually scrolling. */
  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded || !sectionRef.current) return;
    sectionRef.current.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [expanded, prefersReducedMotion]);

  /* Hist5b pin 3 deep-link continuity — when the URL lands with
     `#performance` (the canonical Home PI hero deep-link target
     from PR #635), scroll to the section on mount even if the
     accordion stays collapsed. Distinct from #performance-expanded
     which ALSO scrolls but additionally opens the body. */
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if ((hash === "#performance" || hash === "#performance-expanded")
        && sectionRef.current) {
      /* Tiny delay so the section's content has mounted (lazy-load
         + Suspense fallback) before we scroll — otherwise the
         scrollIntoView target is unstable. */
      const id = window.setTimeout(() => {
        sectionRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }, 100);
      return () => window.clearTimeout(id);
    }
  }, [prefersReducedMotion]);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (typeof window !== "undefined") {
      const base = window.location.pathname + window.location.search;
      const newUrl = next ? base + EXPANDED_HASH : base;
      window.history.replaceState(null, "", newUrl);
    }
  };

  /* Resolve the compact strip's data — same surface contract as
     PI1's PerformanceHeroCard on Home (current week, not window
     average) so the two surfaces never disagree. */
  const pi = currentWeek ? Math.round(currentWeek.performanceIndex ?? 0) : 0;
  const loadBand = (currentWeek?.labels?.loadBand ?? currentWeek?.loadBand ?? "moderate") as LoadBand;
  const deloadRecommended = currentWeek?.flags?.deloadRecommended ?? false;
  const verb = getVerb(loadBand, deloadRecommended);
  const { hue } = getCardColour(pi, loadBand, deloadRecommended);

  if (loading) {
    return (
      <section
        id="analytics-performance"
        ref={sectionRef}
        aria-label="Performance Index"
      >
        <p
          className="text-xs font-semibold uppercase tracking-wide mt-6 mb-2"
          style={{ color: THEME.brand }}
        >
          Performance
        </p>
        <div className="p-4 rounded-2xl bg-card animate-pulse">
          <div className="h-8 w-20 bg-muted rounded" />
        </div>
      </section>
    );
  }

  /* No perf doc yet — show the compact strip empty state. Different
     from PI1's Home hero which renders a full ring + line; here we
     just sublabel the section and offer no chevron (nothing to
     expand to). */
  if (!currentWeek) {
    return (
      <section
        id="analytics-performance"
        ref={sectionRef}
        aria-label="Performance Index"
      >
        <p
          className="text-xs font-semibold uppercase tracking-wide mt-6 mb-2"
          style={{ color: THEME.brand }}
        >
          Performance
        </p>
        <div className="p-4 rounded-2xl bg-card">
          <p className="text-sm text-muted-foreground">
            Your Performance Index will appear after your first logged session.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="analytics-performance"
      ref={sectionRef}
      aria-label="Performance Index"
    >
      <p
        className="text-xs font-semibold uppercase tracking-wide mt-6 mb-2"
        style={{ color: THEME.brand }}
      >
        Performance
      </p>
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        aria-controls="analytics-performance-detail"
        className="w-full p-4 rounded-2xl bg-card flex items-center gap-3 text-left motion-safe:active:scale-[0.99] motion-safe:transition-transform"
      >
        <div className="flex-shrink-0">
          <p
            className="text-3xl font-extrabold leading-none font-mono tabular-nums"
            style={{ color: hue }}
          >
            {pi}
          </p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: hue }}>
            {verb.label}
          </p>
          <p className="text-xs text-muted-foreground">Current week · tap for details</p>
        </div>
        <motion.div
          animate={prefersReducedMotion ? undefined : { rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          aria-hidden="true"
        >
          <ChevronDown
            className="w-5 h-5 shrink-0"
            style={{ color: THEME.text.muted }}
          />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="performance-detail"
            id="analytics-performance-detail"
            initial={prefersReducedMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
            className="mt-3"
          >
            <Suspense
              fallback={
                <div className="p-4 rounded-2xl bg-card animate-pulse h-48" />
              }
            >
              <PerformanceTab />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

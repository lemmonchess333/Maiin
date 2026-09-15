import { useEffect, useRef, Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import SectionLabel from "@/components/ui/SectionLabel";
import { Activity } from "lucide-react";
import { THEME } from "@/lib/theme";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { performanceEmptyCopy } from "@/lib/performanceLine";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

/* Hist6 — the Performance surface is the Analytics HERO, not a fold.
   The prior double-fold (this section's expand accordion + PerformanceTab's
   own "show technical details") buried the gauge two taps deep. The outer
   accordion is removed: PerformanceTab renders always-visible, and its own
   single "Details" disclosure is the only remaining fold.

   Deep-link continuity: `#performance` (the canonical Home PI-hero
   "tap for details" target from PR #635) still scrolls to this section on
   mount. The former `#performance-expanded` hash is retired — there is no
   longer anything to expand here, so it is treated as a plain scroll
   anchor for backward compatibility.

   PerformanceTab stays lazy-loaded (heavier chart machinery) behind a
   Suspense skeleton so it doesn't block Analytics's first paint. */

const PerformanceTab = lazyRetry(
  () => import("@/components/analytics/PerformanceTab")
);

interface PerformanceSectionProps {
  /** Whether the user has any logged session at all. Distinguishes the
   *  cold-start empty state from the short window after a first session is
   *  saved but before the server has written its performance doc — see
   *  performanceEmptyCopy. Defaults to false, the cold-start reading. */
  hasLoggedSession?: boolean;
}

export default function PerformanceSection({
  hasLoggedSession = false,
}: PerformanceSectionProps = {}) {
  /* usePerformanceWeeks here only gates loading / empty — PerformanceTab
     fetches its own 12-week window for the gauge, trend, and breakdown. */
  const { currentWeek, loading } = usePerformanceWeeks(4);
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (
      (hash === "#performance" || hash === "#performance-expanded") &&
      sectionRef.current
    ) {
      /* Tiny delay so the lazy PerformanceTab has mounted (Suspense
         fallback → content) before we scroll — otherwise the
         scrollIntoView target height is unstable. */
      const id = window.setTimeout(() => {
        sectionRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }, 100);
      return () => window.clearTimeout(id);
    }
  }, [prefersReducedMotion]);

  if (loading) {
    return (
      <section
        id="analytics-performance"
        ref={sectionRef}
        aria-label="Performance Index"
        className="space-y-2"
      >
        {/* Matches its four peers on this page: `tier="section"` in a
            `-strong` utility, placed by the section's own stack rather
            than by margins of its own. The bare brand purple measures
            3.28:1 as 12px text on the page. */}
        <SectionLabel tier="section" className="text-lifting-strong">
          Performance
        </SectionLabel>
        <div className="p-4 rounded-2xl bg-card motion-safe:animate-pulse">
          <div className="h-8 w-20 bg-muted rounded" />
        </div>
      </section>
    );
  }

  /* No perf doc yet — designed hexagon empty state. Which sentence, and
     whether there is an action at all, depends on whether anything has been
     logged; performanceEmptyCopy owns that split for both surfaces. */
  if (!currentWeek) {
    const copy = performanceEmptyCopy(hasLoggedSession);
    return (
      <section
        id="analytics-performance"
        ref={sectionRef}
        aria-label="Performance Index"
        className="space-y-2"
      >
        <SectionLabel tier="section" className="text-lifting-strong">
          Performance
        </SectionLabel>
        <div className="rounded-2xl bg-card">
          <EmptyState
            compact
            icon={Activity}
            accent={THEME.brand}
            headline={copy.headline}
            sub={copy.sub}
            action={
              copy.showAction
                ? { label: "Start a workout", href: "/program" }
                : undefined
            }
          />
        </div>
      </section>
    );
  }

  return (
    <section
      id="analytics-performance"
      ref={sectionRef}
      aria-label="Performance Index"
      className="space-y-2"
    >
      <SectionLabel tier="section" className="text-lifting-strong">
        Performance
      </SectionLabel>
      <SectionErrorBoundary sectionName="performance-tab-body">
        <Suspense
          fallback={
            <div className="p-4 rounded-2xl bg-card motion-safe:animate-pulse h-48" />
          }
        >
          <PerformanceTab />
        </Suspense>
      </SectionErrorBoundary>
    </section>
  );
}

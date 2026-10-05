import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { getCardColour } from "@/lib/performanceColour";
import {
  resolveLoadBand,
  resolveDeloadRecommended,
  isEstablishingBaseline,
} from "@/lib/performanceDocFields";
import {
  getVerb,
  getLine,
  getEstablishingLine,
  performanceEmptyCopy,
} from "@/lib/performanceLine";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";
import ProgressRing from "@/components/ui/ProgressRing";
import { Skeleton } from "@/components/LoadingSkeleton";

interface PerformanceHeroCardProps {
  /** Most recent week's perf doc, or null when no rollup exists yet. */
  currentWeek: PerformanceWeekDoc | null;
  /** Prior week, used for the delta chip. Hidden when low-confidence. */
  previousWeek: PerformanceWeekDoc | null;
  /** How many performance documents the snapshot has delivered:
   *  `usePerformanceWeeks().docsAvailable`. The documents are written per
   *  compute day, so this counts days rather than weeks, whatever the
   *  name says. It is `isEstablishingBaseline`'s `docsAvailable`, whose
   *  floor of 2 asks whether the engine has written anything yet; below
   *  it the delta chip stays hidden. */
  weeksAvailable: number;
  /** True until the perf snapshot's initial delivery. */
  loading: boolean;
  /** Whether the user has any logged session at all. Distinguishes the
   *  cold-start empty state from the short window after a first session is
   *  saved but before the server has written its performance doc — see
   *  performanceEmptyCopy. Defaults to false, the cold-start reading. */
  hasLoggedSession?: boolean;
}

const RING = 52;
const STROKE = 6;
// Wraps once the words cannot keep 7em beside the ring (larger text on
// the phone): the words and the chevron go under the ring, rather than
// "Performance" running past the card.
const ROW =
  "flex flex-wrap items-center gap-4 rounded-xl -mx-1 px-1 py-1 motion-safe:active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function trackTap() {
  haptic();
  trackHomeEvent("home_card_tapped", { card: "performance" });
}

/**
 * The week's Performance Index, as the closing row of Home's "This week"
 * card (DS3; it was a standalone hero card below Today).
 *
 * What stayed is what made it the week's verdict rather than a number: the
 * ring in the band's colour with the score inside, the verb, the line that
 * explains it, and the delta chip against last week. What went is the
 * blurred halo and the ring's glow, the colour blobs DS3 retired. The row
 * opens Analytics' performance section.
 */
export default function PerformanceHeroCard({
  currentWeek,
  previousWeek,
  weeksAvailable,
  loading,
  hasLoggedSession = false,
}: PerformanceHeroCardProps) {
  const pi = currentWeek ? Math.round(currentWeek.performanceIndex ?? 0) : 0;
  /* Called unconditionally for the Rules of Hooks; the loading and empty
     branches do not render it. */
  const piDisplay = useCountUp(pi, { sessionKey: "perf", duration: 1 });

  if (!currentWeek) {
    /* Loading has its own row so the copy never says "your Performance
       will appear" while the doc is still on its way. Past loading, the
       doc is written by the server, so "no doc" is not "no session":
       performanceEmptyCopy decides whether the row says nothing is logged
       yet (and then opens Train, where the first session starts) or that
       the score is catching up. */
    const copy = loading ? null : performanceEmptyCopy(hasLoggedSession);
    return (
      <Link
        to={copy?.showAction ? "/program" : "/history#performance"}
        onClick={trackTap}
        className={ROW}
        aria-label={
          copy ? `${copy.headline}. ${copy.sub}` : "Performance — loading"
        }
      >
        <ProgressRing value={0} size={RING} stroke={STROKE} color="transparent">
          <span className="text-base font-extrabold font-mono tabular-nums text-muted-foreground">
            —
          </span>
        </ProgressRing>
        <div className="min-w-[min(100%,7em)] flex-1">
          <p className="text-base font-bold text-foreground">
            {copy ? copy.headline : "Performance"}
          </p>
          {copy ? (
            <p className="text-sm text-muted-foreground">{copy.sub}</p>
          ) : (
            <Skeleton className="mt-1 h-3 w-40" />
          )}
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    );
  }

  // Shared canonical reads (performanceDocFields.ts), so this surface and
  // Analytics cannot drift apart again.
  const loadBand = resolveLoadBand(currentWeek);
  const deloadRecommended = resolveDeloadRecommended(currentWeek);
  const verb = getVerb(loadBand, deloadRecommended);
  const { hue, textHue } = getCardColour(pi, loadBand, deloadRecommended);
  const lowConfidence = isEstablishingBaseline({
    docsAvailable: weeksAvailable,
    lifetimeWeeks: currentWeek.signals?.lifetimeWeeks,
  });
  const line = lowConfidence
    ? getEstablishingLine(currentWeek.signals)
    : getLine(verb.state, currentWeek.signals);
  const delta = previousWeek
    ? Math.round(
        (currentWeek.performanceIndex ?? 0) -
          (previousWeek.performanceIndex ?? 0)
      )
    : null;
  const showDelta = !lowConfidence && delta !== null && delta !== 0;

  return (
    <Link
      to="/history#performance"
      onClick={trackTap}
      className={ROW}
      aria-label={`Performance Index ${pi}, ${verb.label}`}
      aria-describedby={`perf-detail-${currentWeek.weekKey}`}
    >
      <ProgressRing
        value={Math.min(pi, 100) / 100}
        size={RING}
        stroke={STROKE}
        color={hue}
      >
        <motion.span
          className="text-base font-extrabold font-mono tabular-nums leading-none"
          style={{ color: textHue }}
        >
          {piDisplay}
        </motion.span>
      </ProgressRing>
      <div className="min-w-[min(100%,7em)] flex-1">
        {/* Wraps: at larger text the chip moved under the title rather
            than off the right edge of the screen. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-base font-bold text-foreground">Performance</p>
          {/* Delta chip — hidden when low-confidence (sparse data makes
              week-over-week noise dominate the signal). */}
          {showDelta && (
            <span
              className={
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold font-mono tabular-nums " +
                (delta! > 0
                  ? "bg-success/10 text-success-strong"
                  : "bg-running/10 text-running-strong")
              }
              aria-hidden="true"
            >
              {delta! > 0 ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {delta! > 0 ? "+" : ""}
              {delta}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold" style={{ color: textHue }}>
            {verb.label}
          </span>
          {". "}
          {line}
        </p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      {/* Screen-reader sibling for aria-describedby — the supporting line,
          the delta and the low-confidence note the label cannot carry. */}
      <span id={`perf-detail-${currentWeek.weekKey}`} className="sr-only">
        {line}
        {showDelta
          ? `, ${delta! > 0 ? "up" : "down"} ${Math.abs(delta!)} from last week`
          : ""}
        {lowConfidence ? ", establishing baseline" : ""}
      </span>
    </Link>
  );
}

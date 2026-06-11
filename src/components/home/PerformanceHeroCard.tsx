import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import { THEME } from "@/lib/theme";
import { useCountUp } from "@/hooks/useCountUp";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { getCardColour } from "@/lib/performanceColour";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getVerb,
  getLine,
  EMPTY_STATE_LINE,
  type VerbState,
} from "@/lib/performanceLine";
import type { LoadBand, PerformanceWeekDoc } from "@/lib/performanceTypes";

interface PerformanceHeroCardProps {
  /** Most recent week's perf doc, or null when no rollup exists yet. */
  currentWeek: PerformanceWeekDoc | null;
  /** Prior week, used for the delta chip. Hidden when low-confidence. */
  previousWeek: PerformanceWeekDoc | null;
  /** Total weeks of performance data the snapshot has delivered.
   *  Drives the low-confidence gating (delta chip hidden when <2). */
  weeksAvailable: number;
  /** True until the perf snapshot's initial delivery. Renders the
   *  loading variant; downstream consumers see the empty state once
   *  loading clears with no doc. */
  loading: boolean;
}

/* Card geometry — preserved from HealthScoreCard chrome so the
   visual identity transfers cleanly with the Heart → Activity icon
   swap. 24x ring, 270° arc, -135° rotated SVG. */
const RING_RADIUS = 40;
const RING_STROKE = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_ARC_LENGTH = RING_CIRCUMFERENCE * 0.75;

/** Muted ring placeholder — used by the LOADING branch only (the genuine
 *  no-data branch now renders the hexagon <EmptyState> primitive). No ring
 *  fill, no verb, no delta. */
function EmptyRing() {
  return (
    <div className="flex items-center gap-6">
      <div className="relative size-24 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-[135deg]">
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke={THEME.text.muted + "1A"}
            strokeWidth={RING_STROKE}
            strokeDasharray={`${RING_ARC_LENGTH} ${RING_CIRCUMFERENCE}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p
            className="text-display font-extrabold leading-none font-mono tabular-nums"
            style={{ color: THEME.text.muted }}
          >
            —
          </p>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs" style={{ color: THEME.text.muted }}>
          {EMPTY_STATE_LINE}
        </p>
      </div>
    </div>
  );
}

export default function PerformanceHeroCard({
  currentWeek,
  previousWeek,
  weeksAvailable,
  loading,
}: PerformanceHeroCardProps) {
  const pi = currentWeek ? Math.round(currentWeek.performanceIndex ?? 0) : 0;
  /* useCountUp is called unconditionally to satisfy the Rules of Hooks
     — for the empty / loading branches we just don't render its
     value. sessionKey changes (`perf` not `health`) so any stale HS
     cache from the prior session doesn't bleed into the new card's
     animation baseline. */
  const piDisplay = useCountUp(pi, { sessionKey: "perf", duration: 1 });

  /* Loading state — muted ring + dash, no verb / delta. Framer-motion
     fade-in handled by the parent wrapper. Distinct from empty so the
     copy doesn't read "your Performance will appear" while we're
     still fetching. */
  if (loading && !currentWeek) {
    return (
      <Link
        to="/history#performance"
        onClick={() => {
          haptic();
          trackHomeEvent("home_card_tapped", { card: "performance" });
        }}
        className="block p-4 rounded-2xl bg-card active:scale-[0.98] transition-transform card-shadow"
        aria-label="Performance — loading"
      >
        <div className="flex items-center gap-2 mb-3">
          <Activity
            className="size-4"
            style={{ color: THEME.text.muted }}
            aria-hidden="true"
          />
          <p
            className="text-xs font-medium"
            style={{ color: THEME.text.muted }}
          >
            Performance
          </p>
        </div>
        <EmptyRing />
      </Link>
    );
  }

  /* Empty state — loading has cleared but no doc exists (pre-first-log).
     Cold-start users genuinely have no data. Wave3 F: the undesigned
     ring + sentence is replaced by the hexagon EmptyState primitive with
     a real next step (start a workout — Performance is computed FROM
     logged sessions, so that's the unlock). */
  if (!currentWeek) {
    return (
      <div className="p-4 rounded-2xl bg-card card-shadow">
        <div className="flex items-center gap-2 mb-1">
          <Activity
            className="size-4"
            style={{ color: THEME.text.muted }}
            aria-hidden="true"
          />
          <p
            className="text-xs font-medium"
            style={{ color: THEME.text.muted }}
          >
            Performance
          </p>
        </div>
        <EmptyState
          compact
          icon={Activity}
          accent={THEME.brand}
          headline="No sessions logged yet"
          sub={EMPTY_STATE_LINE}
          action={{ label: "Start a workout", href: "/program" }}
        />
      </div>
    );
  }

  /* Steady / low-confidence — both render the full card. The only
     difference is the delta chip (hidden when low-confidence) and
     the line text (getLine handles sparse-data variants via
     signals.lifetimeWeeks / daysSinceLastTraining). */
  const loadBand = (currentWeek.labels?.loadBand ??
    currentWeek.loadBand) as LoadBand;
  const deloadRecommended = currentWeek.flags?.deloadRecommended ?? false;
  const verb = getVerb(loadBand, deloadRecommended);
  const { hue, glowIntensity } = getCardColour(pi, loadBand, deloadRecommended);
  const line = getLine(verb.state, currentWeek.signals);

  const lowConfidence =
    weeksAvailable < 2 || currentWeek.signals.lifetimeWeeks < 4;

  const delta = previousWeek
    ? Math.round(
        (currentWeek.performanceIndex ?? 0) -
          (previousWeek.performanceIndex ?? 0)
      )
    : null;

  const ringOffset =
    RING_ARC_LENGTH - (RING_ARC_LENGTH * Math.min(pi, 100)) / 100;

  return (
    <Link
      to="/history#performance"
      onClick={() => {
        haptic();
        trackHomeEvent("home_card_tapped", { card: "performance" });
      }}
      className="relative overflow-hidden block p-5 rounded-2xl bg-card active:scale-[0.98] transition-transform card-shadow"
      aria-label={`Performance Index ${pi}, ${verb.label}`}
      aria-describedby={`perf-detail-${currentWeek.weekKey}`}
    >
      {/* Band-state halo — extends the PI3 ring-glow mechanic to a soft
          ambient wash behind the ring so the hero reads as state-aware on
          every band (incl. amber, where the ring drop-shadow is suppressed).
          Functional state expression, not decoration; band hue at low alpha,
          fades to transparent. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-8 -top-8 size-48 rounded-full"
        style={{
          background: `radial-gradient(circle, ${hue}33, transparent 70%)`,
        }}
      />
      <div className="relative flex items-center gap-2 mb-4">
        <Activity
          className="size-4"
          style={{ color: hue }}
          aria-hidden="true"
        />
        <p className="text-xs font-medium" style={{ color: THEME.text.muted }}>
          Performance
        </p>
      </div>
      <div className="relative flex items-center gap-6">
        <div className="relative size-28 flex-shrink-0">
          <svg
            viewBox="0 0 100 100"
            className="size-full -rotate-[135deg] motion-safe:transition-[filter] motion-safe:duration-300"
            style={{
              /* Glow synchronises with the ring fill. PI3 spec uses
                 drop-shadow blur scaling 0..10px across PI 45-100;
                 amber (Backing off) suppresses glow. */
              filter:
                glowIntensity > 0
                  ? `drop-shadow(0 0 ${glowIntensity * 10}px ${hue})`
                  : undefined,
            }}
          >
            <defs>
              <linearGradient
                id={`perfRingFill-${currentWeek.weekKey}`}
                x1="0"
                y1="0"
                x2="0"
                y2="100"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={hue} stopOpacity={0.5} />
                <stop offset="100%" stopColor={hue} stopOpacity={1} />
              </linearGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              stroke={hue + "1A"}
              strokeWidth={RING_STROKE}
              strokeDasharray={`${RING_ARC_LENGTH} ${RING_CIRCUMFERENCE}`}
              strokeLinecap="round"
            />
            <motion.circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              stroke={`url(#perfRingFill-${currentWeek.weekKey})`}
              strokeWidth={RING_STROKE}
              strokeDasharray={`${RING_ARC_LENGTH} ${RING_CIRCUMFERENCE}`}
              strokeLinecap="round"
              initial={{ strokeDashoffset: RING_ARC_LENGTH }}
              animate={{ strokeDashoffset: ringOffset }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p
              className="text-display font-extrabold leading-none font-mono tabular-nums"
              style={{ color: hue }}
            >
              <motion.span>{piDisplay}</motion.span>
            </p>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <motion.p
            className="text-base font-bold leading-tight"
            style={{ color: hue }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.2 }}
          >
            {verb.label}
          </motion.p>
          <p className="text-xs mt-1" style={{ color: THEME.text.muted }}>
            {line}
          </p>
          {/* Delta chip — hidden when low-confidence (sparse data
              makes week-over-week noise dominate signal). Per PI1
              spec: "delta chip HIDDEN" in the low-confidence state. */}
          {!lowConfidence && delta !== null && delta !== 0 && (
            <div className="mt-1">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-medium"
                style={{
                  backgroundColor:
                    (delta > 0
                      ? THEME.semantic.positive
                      : THEME.semantic.vitals) + "1A",
                  color:
                    delta > 0 ? THEME.semantic.positive : THEME.semantic.vitals,
                }}
              >
                {delta > 0 ? (
                  <TrendingUp className="size-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-3" aria-hidden="true" />
                )}
                {delta > 0 ? "+" : ""}
                {delta} from last week
              </span>
            </div>
          )}
        </div>
      </div>
      {/* Screen-reader sibling for aria-describedby — carries the
          supporting line + delta + low-confidence note that the
          aria-label alone can't surface compactly. */}
      <span id={`perf-detail-${currentWeek.weekKey}`} className="sr-only">
        {line}
        {!lowConfidence && delta !== null && delta !== 0
          ? `, ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} from last week`
          : ""}
        {lowConfidence ? ", establishing baseline" : ""}
      </span>
    </Link>
  );
}

/* Re-export VerbState so consumers can type their own
   pre-derivation if needed (eg. InsightStrip wants the same state
   in a future grill). */
export type { VerbState };

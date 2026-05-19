/**
 * PerformanceCard — Home compact tile for the weekly Performance
 * Index (locked P2a + P2b + P2c + P2d).
 *
 * Surfaces the PI as a glanceable tile on the home dashboard, not a
 * hero card. Tap → deep-links to /analytics#performance per P2c.
 *
 * Content:
 *   - PI number (large mono tabular) + score band tint
 *   - Delta vs prior week as an arrow + value (success-green for
 *     positive, muted for negative — calm voice, not red, per P2d
 *     pin 2)
 *   - One-line insight from performanceInsights.ts — lowest-sub-
 *     score-keyed by default; deload / baseline / decline special
 *     cases supersede
 *   - Empty state for users with no performance week yet
 *
 * Pre-Sub2 this PI was gated behind a Pro paywall; Sub2 moved it to
 * free, so this card is shown to every user with logged sessions
 * regardless of subscription tier. Pro upsells still live on the
 * adaptive-macros / adaptive-TDEE surfaces (AdaptiveSummary).
 */
import { useNavigate } from "react-router-dom";
import { ChevronRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import { buildPerformanceInsight } from "@/lib/performanceInsights";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";

interface PerformanceCardProps {
  /** Most recent performance week. `null` when the user has no
   *  rollup yet — renders the empty state. */
  currentWeek: PerformanceWeekDoc | null;
  /** Prior week, used for the delta chip. `null` on first week. */
  previousWeek: PerformanceWeekDoc | null;
  /** Total weeks of performance data available (drives the
   *  baseline-establishing insight when <4). */
  weeksAvailable: number;
  /** Current user's UID — feeds the deterministic insight hash so
   *  two users on different devices see different variants. */
  uid: string | null;
}

function bandColor(score: number): string {
  if (score >= 80) return THEME.success;
  if (score >= 60) return THEME.teal;
  if (score >= 40) return THEME.warning;
  return THEME.running;
}

export default function PerformanceCard({
  currentWeek,
  previousWeek,
  weeksAvailable,
  uid,
}: PerformanceCardProps) {
  const navigate = useNavigate();

  function handleTap() {
    haptic();
    // Hash fragment is the canonical deep-link target per P2c pin 6.
    // PerformanceTab listens for it and scrolls to the section.
    navigate("/history#performance");
  }

  // Empty state — no rollup doc yet. Keeps card chrome so the tile
  // doesn't pop in/out as weeks accumulate.
  if (!currentWeek) {
    return (
      <button
        type="button"
        onClick={handleTap}
        aria-label="Performance Index — no data yet"
        className="w-full rounded-xl bg-muted p-3 text-left motion-safe:active:scale-[0.98] motion-safe:transition-transform"
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Performance Index
          </p>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="font-mono tabular-nums text-2xl font-extrabold text-muted-foreground mt-1">
          —
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-snug">
          Log a few sessions this week to see your Performance Index.
        </p>
      </button>
    );
  }

  const pi = Math.round(currentWeek.performanceIndex);
  const delta = previousWeek
    ? Math.round(currentWeek.performanceIndex - previousWeek.performanceIndex)
    : null;
  const color = bandColor(pi);

  const insight = uid
    ? buildPerformanceInsight({
        uid,
        weekKey: currentWeek.weekKey,
        loadScore: currentWeek.breakdown.liftLoadScore + currentWeek.breakdown.runLoadScore,
        recoveryScore: currentWeek.breakdown.recoveryScore,
        adherenceScore: currentWeek.breakdown.adherenceScore,
        weeksAvailable,
        delta,
        loadBand: currentWeek.labels?.loadBand ?? currentWeek.loadBand,
      })
    : null;

  // Delta presentation per P2d pin 2:
  //   positive → success-green up arrow
  //   negative → muted-foreground down arrow (NOT red — calm voice)
  //   zero → em-dash, no colour
  const deltaPresentation = (() => {
    if (delta === null) return null;
    if (delta === 0) return { sign: "—", color: "var(--color-muted-foreground)", Icon: null };
    if (delta > 0) return { sign: `+${delta}`, color: THEME.success, Icon: ArrowUpRight };
    return { sign: `${delta}`, color: "var(--color-muted-foreground)", Icon: ArrowDownRight };
  })();

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label={`Performance Index ${pi}${delta !== null ? `, change ${delta} from last week` : ""}`}
      className="w-full rounded-xl bg-muted p-3 text-left motion-safe:active:scale-[0.98] motion-safe:transition-transform"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Performance Index
        </p>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span
          className="font-mono tabular-nums text-2xl font-extrabold"
          style={{ color }}
        >
          {pi}
        </span>
        {deltaPresentation ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold font-mono tabular-nums",
            )}
            style={{ color: deltaPresentation.color }}
          >
            {deltaPresentation.Icon ? (
              <deltaPresentation.Icon className="w-3 h-3" aria-hidden="true" />
            ) : null}
            {deltaPresentation.sign}
          </span>
        ) : null}
      </div>
      {insight ? (
        <p className="text-xs text-muted-foreground mt-1 leading-snug">
          <span className="font-medium text-foreground">{insight.headline}.</span>{" "}
          {insight.body}
        </p>
      ) : null}
    </button>
  );
}

import PerformanceReadError from "./PerformanceReadError";
import type { ReactNode } from "react";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import WeeklyReviewRow from "@/components/analytics/WeeklyReviewRow";
import PerformanceIndexChart from "@/components/analytics/PerformanceIndexChart";
import StatCard from "@/components/analytics/StatCard";
import PerformanceWeekBreakdown from "@/components/analytics/PerformanceWeekBreakdown";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { performanceWeekBreakdown } from "@/lib/performanceWeekBreakdown";
import type { DistanceUnit } from "@/lib/distanceUnits";
import {
  averagePerformanceIndex,
  averageWeekCount,
} from "@/lib/performanceAverage";
import { THEME } from "@/lib/theme";
import {
  resolveLoadBand,
  isEstablishingBaseline,
} from "@/lib/performanceDocFields";
import { Footprints } from "lucide-react";

// Mini bar for breakdown scores
function ScoreBar({
  label,
  value,
  color,
  textColor,
}: {
  label: string;
  value: number;
  /** Bar fill — the fixed identity hex (decorative, 1.4.11's 3:1 bar). */
  color: string;
  /** The 12px value numeral — the identity's theme-aware AA text step.
   *  At text-xs the identities all miss 4.5:1 on the light card, so the
   *  value must not reuse the fill colour (DS2). */
  textColor: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className="text-xs font-bold font-mono tabular-nums"
          style={{ color: textColor }}
        >
          {Math.round(value)}
        </p>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden track-cut">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

/**
 * Display label for a load band.
 *
 * `LoadBand` is a lowercase enum (`deload | low | moderate | high |
 * overreach`) and this card rendered it RAW, so the Analytics screen
 * showed users the literal token "overreach". The enum is a wire value;
 * this is the only place it is shown to a person, so the mapping lives
 * here rather than becoming a shared vocabulary nothing else needs.
 */
function loadBandLabel(band: string): string {
  switch (band) {
    case "deload":
      return "Deload";
    case "low":
      return "Low";
    case "moderate":
      return "Moderate";
    case "high":
      return "High";
    case "overreach":
      return "Overreaching";
    default:
      // An unrecognised band is a data problem, not a display one — show
      // it rather than inventing a label that hides the drift.
      return band;
  }
}

/**
 * What the Performance Index is made of, opened in place under the
 * overview's Performance card by "Score details" (Trim1 call 5).
 *
 * The score itself, its verb and its change on last week are the card's
 * (`PerformanceSection`), and are not repeated here. This was the
 * Performance page's body, which opened with a gauge of the same score
 * under a second set of words; both went with the page.
 *
 * One tap shows all of it. The four factor bars, the load band and the
 * average sat behind a second "Score details" fold inside the page, which
 * is the double fold Hist6 removed once already.
 */
export default function PerformanceDetails({
  distanceUnit = "km",
  children,
}: {
  /** The reader's unit, for the running figures in the breakdown. */
  distanceUnit?: DistanceUnit;
  /** Drawn after the index chart: the training load card, the load
   *  behind the index, which History feeds from its own range. */
  children?: ReactNode;
} = {}) {
  const { weeks, currentWeek, docsAvailable, loading, failed, refresh } =
    usePerformanceWeeks(12);
  const liftUnit = useLiftUnit();

  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-card">
        <p className="text-sm text-muted-foreground">Loading performance…</p>
      </div>
    );
  }

  /* The training load reads the sessions, not the score's documents, so
     it is still drawn when those cannot be read. */
  if (failed) {
    return (
      <div className="space-y-4">
        <PerformanceReadError onRetry={refresh} />
        {children}
      </div>
    );
  }

  // The card above says so when there is no score; nothing to add here.
  if (!weeks.length || !currentWeek) return <>{children}</>;

  const avgPI = averagePerformanceIndex(weeks);
  const avgWeeks = averageWeekCount(weeks);
  const b = currentWeek.breakdown;

  /* Canonical read (2026-08-09 fix). This was `currentWeek.labels?.loadBand`
     — a field NO writer emits — so it resolved undefined on every doc.
     `resolveLoadBand` is total and shared with the card above and the PI
     chart, so the surfaces cannot disagree again. */
  const loadBand = resolveLoadBand(currentWeek);
  // Cold-start gate: until the baseline is established the load band and
  // the "against your usual week" framing aren't meaningful (the baseline
  // is derived from prior weeks). The same predicate as the card's.
  const establishing = isEstablishingBaseline({
    docsAvailable,
    lifetimeWeeks: currentWeek.signals?.lifetimeWeeks,
  });

  /* What went into the score, from the score's own document: the seven
     days against the usual week, and the food logged. It replaces the
     server's bullets ("…great progression"), one of which cited sleep the
     app never records. */
  const weekBreakdown = performanceWeekBreakdown(currentWeek, {
    distanceUnit,
    liftUnit,
    establishing,
  });
  const runSuggestions =
    (currentWeek as { planAdjustments?: { run?: string[] } }).planAdjustments
      ?.run ?? [];

  return (
    <div className="space-y-4">
      <PerformanceWeekBreakdown breakdown={weekBreakdown} />

      {/* The canonical PI area chart (zone reference lines, band-coloured
          dots, tap telemetry): the single twelve-week trend. The card's
          six-week line gives way to it while this is open. */}
      {weeks.length >= 2 && <PerformanceIndexChart weeks={weeks} />}

      {children}

      {/* Breakdown bars */}
      <div className="p-4 rounded-2xl bg-card space-y-3">
        <h3 className="text-base font-bold text-foreground">Breakdown</h3>
        <ScoreBar
          label="Lift load"
          value={b.liftLoadScore}
          color={THEME.lifting}
          textColor="hsl(var(--lifting-strong))"
        />
        <ScoreBar
          label="Run load"
          value={b.runLoadScore}
          color={THEME.running}
          textColor="hsl(var(--running-strong))"
        />
        <ScoreBar
          label="Recovery"
          value={b.recoveryScore}
          color={THEME.success}
          textColor="hsl(var(--success-strong))"
        />
        <ScoreBar
          label="Adherence"
          value={b.adherenceScore}
          color={THEME.teal}
          textColor="hsl(var(--teal))"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Load band"
          /* Was `labels?.loadBand || "—"`, so this card rendered a
             literal em-dash for every user. Same canonical read. */
          value={establishing ? "Establishing" : loadBandLabel(loadBand)}
          /* A word, not a number — see StatCard's `valueKind`. At the
             numeral treatment "Establishing" ran off the card and
             rendered as "Establishin". */
          valueKind="text"
          unit=""
          accentColor={THEME.brand}
        />
        {/* The window in the label is the window in the number.

            It read "Avg PI (12w)" over a mean of every fetched week, so
            a user three weeks in was told twelve, and a user back from
            a break had their silent weeks pulling the figure down. P2d
            pins both halves by hand — "user with 5 weeks shows 5-week
            average … honest about sample size", and "computed only
            from weeks with confidence >= medium — inactive weeks
            excluded". `performanceAverage` owns the arithmetic; this
            reads the count it actually used. */}
        <StatCard
          label={`Avg PI (${avgWeeks}w)`}
          value={avgPI === null ? "—" : String(avgPI)}
          unit={avgPI === null ? "" : "/100"}
          accentColor={THEME.brand}
        />
      </div>

      {/* The "This week adjustments" ratios (lifting and running against
          baseline, and a run pace adjustment the engine writes as a
          constant 0) are gone: the breakdown above states both weeks'
          figures, which the ratios were made from. */}
      {/* The engine's running suggestions. Its lifting ones are gone
          (Lift4 (3): no suggestion cards), and a week stored before that
          still carries them, so they're not read. */}
      {runSuggestions.length > 0 && (
        <div className="p-4 rounded-2xl bg-running/8">
          <div className="flex items-center gap-2 mb-2">
            <Footprints className="size-4 text-running" />
            <h3 className="text-base font-bold text-running-strong">
              Running suggestions
            </h3>
          </div>
          <ul className="space-y-1">
            {runSuggestions.map((s, i) => (
              <li
                key={i}
                className="text-xs text-muted-foreground leading-relaxed"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rev1 — the Weekly Review's permanent way in, with the same
          eligibility as the Home entry (hidden until the reviewed week
          has content, so no dead row for a new account). It was one tap
          from the overview on the Performance page and is one tap from
          it here. */}
      <WeeklyReviewRow />
    </div>
  );
}

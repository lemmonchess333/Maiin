import PerformanceReadError from "./PerformanceReadError";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import WeeklyReviewRow from "@/components/analytics/WeeklyReviewRow";
import PerformanceIndexChart from "@/components/analytics/PerformanceIndexChart";
import StatCard from "@/components/analytics/StatCard";
import Card from "@/components/ui/Card";
import ProgressRing from "@/components/ui/ProgressRing";
import UITooltip from "@/components/ui/Tooltip";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import {
  performanceWeekBreakdown,
  type WeekFood,
} from "@/lib/performanceWeekBreakdown";
import type { DistanceUnit } from "@/lib/distanceUnits";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";
import {
  averagePerformanceIndex,
  averageWeekCount,
} from "@/lib/performanceAverage";
import { THEME } from "@/lib/theme";
import {
  resolveLoadBand,
  resolveDeloadRecommended,
  isEstablishingBaseline,
} from "@/lib/performanceDocFields";
import { scoreWindowLabel } from "@/lib/performanceLine";
import { getCardColour } from "@/lib/performanceColour";
import { formatSigned } from "@/utils/formatters";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";
import { Footprints, Info, TrendingDown, TrendingUp } from "lucide-react";

/* The only explanation of the 0–100 number anywhere in the app. PI = 65%
 * load + 25% recovery + 10% adherence per `src/lib/performanceTypes.ts`;
 * the tooltip distils that without leaking the weights, which would invite
 * over-optimisation against a single dimension.
 *
 * The engine scores a 7-day window (`WINDOW_DAYS`) against a 28-day
 * baseline (`BASELINE_DAYS`) normalised to a 7-day equivalent, so every
 * one of the three factors is measured over the scored seven days, and a
 * hard week is scored against a calm four. `piExplainerWindow.test.ts`
 * reads both constants out of `functions/performanceEngine.js` and fails
 * if this sentence stops agreeing with the engine that actually runs. */
const PI_EXPLAINER =
  "0–100 score for your last 7 days: training load, recovery and consistency, measured against your previous 4 weeks. A higher score is not a recommendation to train harder.";

/** The ring's size at the default text size. A step down from the lead's
 *  verb above it, which is the screen's largest text (§14m); sized in rem
 *  (`scaleWithText`), so the score inside still fits at larger text. */
const RING = 72;
const RING_STROKE = 6;

/**
 * The 0–100 score, the first of its details (App1 Q10: "the single score
 * moves into the details"). Its ring in the band's colour with the figure
 * in it, the window it covers (Q13) and its change on the seven days
 * before. The verb is the lead's, above, and is not repeated here.
 */
function ScoreCard({
  week,
  previous,
  establishing,
}: {
  week: PerformanceWeekDoc;
  previous: PerformanceWeekDoc | null;
  establishing: boolean;
}) {
  const pi = Math.round(week.performanceIndex ?? 0);
  // Until the baseline forms the colour is the brand's, as the lead's is.
  const hue = establishing
    ? THEME.brand
    : getCardColour(pi, resolveLoadBand(week), resolveDeloadRecommended(week))
        .hue;
  // The window directly before, never an older one standing in for it.
  const delta = previous
    ? Math.round(
        (week.performanceIndex ?? 0) - (previous.performanceIndex ?? 0)
      )
    : null;
  // A change is noise until the baseline forms, and a zero is not a gain.
  const showDelta = !establishing && delta !== null && delta !== 0;
  return (
    <Card as="section" aria-label="Your score">
      {/* The words keep at least 9em beside the ring and go under it
          when they cannot, rather than one word to a line at larger
          text. */}
      <div className="flex flex-wrap items-center gap-4">
        <ProgressRing
          value={pi / 100}
          size={RING}
          stroke={RING_STROKE}
          color={hue}
          cut
          scaleWithText
        >
          <p className="text-h2 font-extrabold font-figure tabular-nums leading-none text-foreground">
            <span className="sr-only">Performance Index </span>
            {pi}
          </p>
        </ProgressRing>
        <div className="min-w-[min(100%,9em)] flex-1 space-y-1">
          <div className="flex items-center gap-1">
            <h3 className="text-base font-bold text-foreground">Your score</h3>
            <UITooltip content={PI_EXPLAINER}>
              <button
                type="button"
                aria-label="About your score"
                className="p-4 -m-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="size-3" aria-hidden="true" />
              </button>
            </UITooltip>
          </div>
          <p className="text-xs text-muted-foreground">
            {scoreWindowLabel(week.weekKey, new Date())} · out of 100
          </p>
          {showDelta && (
            <span
              className={
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold font-mono tabular-nums " +
                (delta! > 0
                  ? "bg-success/10 text-success-strong"
                  : "bg-running/10 text-running-strong")
              }
            >
              {delta! > 0 ? (
                <TrendingUp className="size-3" aria-hidden="true" />
              ) : (
                <TrendingDown className="size-3" aria-hidden="true" />
              )}
              <span aria-hidden="true">{formatSigned(delta!)}</span>
              <span className="sr-only">
                {`${delta! > 0 ? "Up" : "Down"} ${Math.abs(delta!)} on the 7 days before`}
              </span>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/** The food logged in the score's seven days, which its recovery and
 *  adherence read. The lifting and running beside the usual week lead the
 *  page (`LoadAgainstUsual`), so they are not repeated here. */
function FoodLogged({ food }: { food: WeekFood }) {
  return (
    <div className="space-y-1 border-t border-border/60 pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-nutrition"
          />
          Food
        </span>
        <span className="text-xs font-bold font-mono tabular-nums text-foreground">
          {food.daysLogged} of 7 days
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">
          {formatCalories(food.caloriesPerDay)}
        </span>{" "}
        {CALORIE_UNIT} and{" "}
        <span className="font-mono tabular-nums">{food.proteinPerDay}</span> g
        protein a day, on the days logged
      </p>
    </div>
  );
}

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
 * The score and what it is made of, opened in place under the Progress
 * lead by "Score details" (Trim1 call 5; App1 Q10 moved the score itself
 * here). Pro for a free account (Q84), so its page never mounts it there.
 *
 * The verdict and the last seven days against the usual week are the
 * lead's (`PerformanceSection`), and are not repeated here. One load model,
 * the score's own (Q16): the factor bars and the band below read the same
 * document as the lead. A second, minutes-based curve with its own two
 * warnings stood here, so one week could read two ways; it is gone, and
 * the lighter-week offer stays the engine's alone (Q11).
 *
 * One tap shows all of it. The four factor bars, the load band and the
 * average sat behind a second "Score details" fold inside the page, which
 * is the double fold Hist6 removed once already.
 */
export default function PerformanceDetails({
  distanceUnit = "km",
}: {
  /** The reader's unit, for the running figures in the breakdown. */
  distanceUnit?: DistanceUnit;
} = {}) {
  const {
    weeks,
    currentWeek,
    previousWeek,
    docsAvailable,
    loading,
    failed,
    refresh,
  } = usePerformanceWeeks(12);
  const liftUnit = useLiftUnit();

  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-card">
        <p className="text-sm text-muted-foreground">Loading performance…</p>
      </div>
    );
  }

  if (failed) return <PerformanceReadError onRetry={refresh} />;

  // The lead says so when there is no score; nothing to add here.
  if (!weeks.length || !currentWeek) return null;

  const avgPI = averagePerformanceIndex(weeks);
  const avgWeeks = averageWeekCount(weeks);
  const b = currentWeek.breakdown;

  /* Canonical read (2026-08-09 fix). This was `currentWeek.labels?.loadBand`
     — a field NO writer emits — so it resolved undefined on every doc.
     `resolveLoadBand` is total and shared with the lead above and the PI
     chart, so the surfaces cannot disagree again. */
  const loadBand = resolveLoadBand(currentWeek);
  // Cold-start gate: until the baseline is established the load band
  // isn't meaningful (the baseline is derived from prior weeks). The same
  // predicate as the lead's.
  const establishing = isEstablishingBaseline({
    docsAvailable,
    lifetimeWeeks: currentWeek.signals?.lifetimeWeeks,
  });

  /* The food logged in the seven days, from the score's own document. */
  const { food } = performanceWeekBreakdown(currentWeek, {
    distanceUnit,
    liftUnit,
    establishing,
  });
  const runSuggestions =
    (currentWeek as { planAdjustments?: { run?: string[] } }).planAdjustments
      ?.run ?? [];

  return (
    <div className="space-y-4">
      <ScoreCard
        week={currentWeek}
        previous={previousWeek}
        establishing={establishing}
      />

      {/* The canonical PI area chart (zone reference lines, band-coloured
          dots, tap telemetry): the score over twelve weeks. */}
      {weeks.length >= 2 && <PerformanceIndexChart weeks={weeks} />}

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
        {food && <FoodLogged food={food} />}
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

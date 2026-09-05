import { useState } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import WeeklyReviewRow from "@/components/analytics/WeeklyReviewRow";
import PerformanceIndexChart from "@/components/analytics/PerformanceIndexChart";
import StatCard from "@/components/analytics/StatCard";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { getPlainLanguageSummary } from "@/lib/performanceSummary";
import { getVerbState, VERB_LABEL } from "@/lib/performanceLine";
import {
  resolveLoadBand,
  resolveDeloadRecommended,
  isEstablishingBaseline,
} from "@/lib/performanceDocFields";
import { ChevronDown, Flame, Dumbbell, Footprints, Info } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import UITooltip from "@/components/ui/Tooltip";

/* Body copy reused at both render sites (gauge headline + summary card)
 * so they stay in sync. PI = 65% load + 25% recovery + 10% adherence
 * per `src/lib/performanceTypes.ts`; the tooltip distils that without
 * leaking the weights, which would invite over-optimisation against
 * a single dimension. */
const PI_EXPLAINER =
  "0–100 score combining your training load, recovery, and consistency over the last 4 weeks. A higher score is not a recommendation to train harder — read it alongside your load and recovery guidance.";

function pctSigned(x: number) {
  const v = Math.round(x * 100);
  return (v >= 0 ? "+" : "") + `${v}%`;
}

/* Band colour, in the CardColour hue/textHue shape (DS2). `identity` is
 * the fixed THEME hex — correct for the gauge arc (decorative data-viz)
 * and the large PI numeral (3:1 large-text bar). `text` is the theme-aware
 * AA step for SMALL text in the same hue: every one of the five identities
 * fails 4.5:1 on the light card (best case brand at 3.87), so the 12px
 * band label and the 16px verdict headline must not take the identity.
 * The same fix as PerformanceHeroCard's textHue, applied to this tab's
 * own five-way scale — the two ternaries this replaces had already
 * drifted into gauge and summary as separate copies. */
function bandPalette(
  score: number,
  establishing: boolean,
  backingOff: boolean
): { identity: string; text: string } {
  if (establishing)
    return { identity: THEME.brand, text: "hsl(var(--primary-strong))" };
  if (backingOff)
    return { identity: THEME.amber, text: "hsl(var(--warning-strong))" };
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= 80)
    return { identity: THEME.success, text: "hsl(var(--success-strong))" };
  if (clamped >= 60) return { identity: THEME.teal, text: "hsl(var(--teal))" };
  if (clamped >= 40)
    return { identity: THEME.warning, text: "hsl(var(--warning-strong))" };
  return { identity: THEME.running, text: "hsl(var(--running-strong))" };
}

// Semicircle gauge for the Performance Index
function PIGauge({
  score,
  establishing,
  backingOff,
}: {
  score: number;
  /**
   * Suppresses the band VERDICT while the baseline is still forming.
   *
   * The band was derived from the score alone, so a first-week 81 printed
   * a confident "Peak" directly above copy reading "Establishing your
   * baseline — your weekly read sharpens after about 4 weeks." Both on
   * screen at once, contradicting each other. The score is a real number
   * and stays; what it is NOT yet is a verdict, and the word was the part
   * claiming otherwise.
   */
  establishing?: boolean;
  backingOff: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const RADIUS = 70;
  const CX = 90;
  const CY = 90;
  const arcLength = Math.PI * RADIUS;
  const progress = clamped / 100;
  const dashOffset = arcLength * (1 - progress);

  // Colour is a verdict too — a confident green on a first-week score
  // says "peak" as loudly as the word did.
  const { identity: color, text: bandTextColor } = bandPalette(
    clamped,
    !!establishing,
    backingOff
  );

  const band = establishing
    ? "Early read"
    : backingOff
      ? VERB_LABEL["backing-off"]
      : clamped >= 80
        ? "Peak"
        : clamped >= 60
          ? "Building"
          : clamped >= 40
            ? "Moderate"
            : "Recovery";

  // Needle tip point
  const angle = Math.PI - progress * Math.PI; // 180° → 0°
  const nx = CX + RADIUS * Math.cos(angle);
  const ny = CY - RADIUS * Math.sin(angle);

  // Arc path helper
  const arcPath = (r: number, start: number, end: number) => {
    const sx = CX + r * Math.cos(start);
    const sy = CY - r * Math.sin(start);
    const ex = CX + r * Math.cos(end);
    const ey = CY - r * Math.sin(end);
    return `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`;
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={100} viewBox="0 0 180 100">
        {/* Track */}
        <path
          d={arcPath(RADIUS, Math.PI, 0)}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={12}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={arcPath(RADIUS, Math.PI, 0)}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s" }}
        />
        {/* Needle */}
        <line
          x1={CX}
          y1={CY}
          x2={nx}
          y2={ny}
          stroke="hsl(var(--foreground))"
          strokeWidth={2}
          strokeLinecap="round"
          style={{ transition: "x2 0.8s ease, y2 0.8s ease" }}
        />
        <circle cx={CX} cy={CY} r={4} fill="hsl(var(--foreground))" />
        {/* Labels */}
        <text
          x={14}
          y={98}
          fontSize={10}
          fill="hsl(var(--muted-foreground))"
          textAnchor="middle"
        >
          0
        </text>
        <text
          x={90}
          y={16}
          fontSize={10}
          fill="hsl(var(--muted-foreground))"
          textAnchor="middle"
        >
          50
        </text>
        <text
          x={166}
          y={98}
          fontSize={10}
          fill="hsl(var(--muted-foreground))"
          textAnchor="middle"
        >
          100
        </text>
      </svg>
      {/* Score */}
      <div className="text-center -mt-2">
        <p
          className="text-4xl font-extrabold font-mono tabular-nums"
          style={{ color }}
        >
          {Math.round(clamped)}
        </p>
        <p
          className="text-xs font-semibold mt-0.5"
          style={{ color: bandTextColor }}
        >
          {band}
        </p>
        <div className="inline-flex items-center justify-center gap-1">
          <p className="text-xs text-muted-foreground">Performance Index</p>
          <UITooltip content={PI_EXPLAINER}>
            <button
              type="button"
              aria-label="About Performance Index"
              className="p-4 -m-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Info className="size-3" aria-hidden="true" />
            </button>
          </UITooltip>
        </div>
      </div>
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
      <div className="h-1.5 rounded-full overflow-hidden bg-muted">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* getPlainLanguageSummary moved to `@/lib/performanceSummary`
   so the copy contract can be tested in isolation + reused
   anywhere PI is surfaced (Home hero, future deep-link cards). */

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

export default function PerformanceTab() {
  const { weeks, currentWeek, loading } = usePerformanceWeeks(12);
  const [showTechnical, setShowTechnical] = useState(false);

  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-card">
        <p className="text-sm text-muted-foreground">Loading performance…</p>
      </div>
    );
  }

  if (!weeks.length || !currentWeek) {
    return (
      <div className="p-4 rounded-2xl bg-card">
        <h3 className="text-sm font-semibold text-foreground">Performance</h3>
        <p className="text-sm text-muted-foreground mt-1">
          No performance weeks yet. Log workouts/runs and your weekly index will
          appear here.
        </p>
      </div>
    );
  }

  const prev = weeks.length >= 2 ? weeks[weeks.length - 2] : null;
  const delta = prev
    ? Math.round(currentWeek.performanceIndex - prev.performanceIndex)
    : null;
  const b = currentWeek.breakdown;
  const m = currentWeek.multipliers;

  const pi = Math.round(currentWeek.performanceIndex);
  /* Canonical read (2026-08-09 fix). This was `currentWeek.labels?.loadBand`
     — a field NO writer emits — so it resolved undefined on every doc and
     the summary's old catch-all told every user "Low training load", even
     at overreach. `resolveLoadBand` is total and shared with the Home hero
     + PI chart so the three surfaces cannot disagree again. */
  const loadBand = resolveLoadBand(currentWeek);
  const deloadRecommended = resolveDeloadRecommended(currentWeek);
  // Share Home's override: the score is real, but "Peak / on track" is
  // the wrong verdict when that same week recommends backing off.
  const backingOff =
    getVerbState(loadBand, deloadRecommended) === "backing-off";
  // Cold-start gate: until the baseline is established the load band and
  // the "vs baseline" framing aren't meaningful (the baseline is derived
  // from prior weeks), so the confident verdict, band and delta are all
  // suppressed.
  /* Shared predicate (performanceDocFields). This was `weeks.length < 4`
     under a comment claiming it mirrored the Home hero's lifetimeWeeks<4
     gate — it didn't, and the two surfaces split on the
     lapsed-and-returning athlete: high lifetime depth, almost nothing in
     the recent window. Home said confident, Analytics said establishing,
     about the same week. */
  const establishing = isEstablishingBaseline({
    docsAvailable: weeks.length,
    lifetimeWeeks: currentWeek.signals?.lifetimeWeeks,
  });
  const { headline, body } = getPlainLanguageSummary(
    pi,
    loadBand,
    establishing ? null : delta,
    establishing,
    deloadRecommended
  );

  const summaryColor = bandPalette(pi, establishing, backingOff).text;

  const insightBullets = currentWeek.insight?.bullets;
  const planAdj = (
    currentWeek as { planAdjustments?: { lift: string[]; run: string[] } }
  ).planAdjustments;

  return (
    <div className="space-y-4">
      {/* Deload banner */}
      {/* Was `flags?.deloadRecommended` — never written, so this banner
          had never rendered for any user. */}
      {deloadRecommended && (
        <div
          className="p-4 rounded-2xl flex items-start gap-3"
          style={{ background: THEME.warning + "14" }}
        >
          {/* Icon + heading on the -strong step, tint from the identity —
              the treatment DeloadBanner (program) already carries. The
              identity as 14px text measured ~3.1:1 on the light tint. */}
          <Flame
            className="size-5 shrink-0 mt-0.5"
            style={{ color: "hsl(var(--warning-strong))" }}
          />
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: "hsl(var(--warning-strong))" }}
            >
              Consider a deload week
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your training load has been high with signs of reduced recovery. A
              lighter week can help you come back stronger.
            </p>
          </div>
        </div>
      )}

      {/* Hero — the gauge is the single number-of-record (number + band +
          Info tooltip live inside PIGauge); the plain-language verdict and
          delta sit beneath it. Promoted out of the old "technical details"
          fold so the progress check is the first thing on the tab. The
          duplicate "{pi} /100" line is gone — the gauge owns the number. */}
      <div className="p-4 rounded-2xl border border-border/50 bg-card">
        <PIGauge
          score={currentWeek.performanceIndex}
          establishing={establishing}
          backingOff={backingOff}
        />
        <div className="mt-3 text-center space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <h3 className="text-base font-bold" style={{ color: summaryColor }}>
              {headline}
            </h3>
            {/* A ZERO delta is not a gain. It rendered as a green "+0 pts",
                which reads as progress when the week actually held level —
                and green is the app's success register everywhere else. An
                unchanged week says nothing rather than saying nothing
                positively; the headline already carries the verdict. */}
            {delta !== null && delta !== 0 && !establishing && (
              // Text on the -strong steps, tint from the identity — the
              // same pair PerformanceHeroCard's delta chip uses (DS2).
              // Supersedes the DS1b "stays inline" note: the concern was a
              // CLASS swap shifting the hue; the -strong VAR steps keep the
              // hue and add the AA lightness the identities lack at 12px
              // (success 2.36:1, coral 3.20:1 on the light card).
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  color:
                    delta >= 0
                      ? "hsl(var(--success-strong))"
                      : "hsl(var(--running-strong))",
                  background: `${delta >= 0 ? THEME.success : THEME.running}18`,
                }}
              >
                {delta >= 0 ? "+" : ""}
                {delta} pts
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {body}
          </p>
        </div>
      </div>

      {/* Rev1 — Weekly Review row. Below the locked Hist6 hero, same
          eligibility as the Home entry (hidden until the reviewed week
          has content — no dead row for brand-new users). */}
      <WeeklyReviewRow />

      {/* Trend — the canonical PI area chart, promoted out of the fold.
          Deduped: the old inline 8-week LineChart is removed; this richer
          chart (zone reference lines, band-coloured dots, tap telemetry)
          is the single trend surface. */}
      {weeks.length >= 2 && <PerformanceIndexChart weeks={weeks} />}

      {/* Weekly insight bullets */}
      {insightBullets && insightBullets.length > 0 && (
        <div className="p-4 rounded-2xl bg-card space-y-2">
          <SectionLabel as="h3">Weekly Insights</SectionLabel>
          <ul className="space-y-1.5">
            {insightBullets.map((bullet, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed"
              >
                <span
                  className="size-1 rounded-full mt-1.5 shrink-0"
                  style={{ background: THEME.brand }}
                />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Technical details toggle */}
      <button
        type="button"
        onClick={() => setShowTechnical((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
          "hover:text-foreground transition-colors w-full justify-center py-2"
        )}
      >
        {showTechnical ? "Hide details" : "Show details"}
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform duration-200",
            showTechnical && "rotate-180"
          )}
        />
      </button>

      {/* Collapsible technical section */}
      <AnimatePresence initial={false}>
        {showTechnical && (
          <motion.div
            key="technical"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-4">
              {/* Breakdown bars */}
              <div className="p-4 rounded-2xl bg-card space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Breakdown
                </h3>
                <ScoreBar
                  label="Lift Load"
                  value={b.liftLoadScore}
                  color={THEME.lifting}
                  textColor="hsl(var(--lifting-strong))"
                />
                <ScoreBar
                  label="Run Load"
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

              {/* Load band + adjustments */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Load Band"
                  /* Was `labels?.loadBand || "—"`, so this card rendered a
                     literal em-dash for every user. Same canonical read. */
                  value={
                    establishing ? "Establishing" : loadBandLabel(loadBand)
                  }
                  /* A word, not a number — see StatCard's `valueKind`.
                     At the numeral treatment "Establishing" ran off the
                     card and rendered as "Establishin". */
                  valueKind="text"
                  unit=""
                  accentColor={THEME.brand}
                />
                <StatCard
                  label="Avg PI (12w)"
                  value={String(
                    Math.round(
                      weeks.reduce((s, w) => s + w.performanceIndex, 0) /
                        weeks.length
                    )
                  )}
                  unit="/100"
                  accentColor={THEME.brand}
                />
              </div>

              <div className="p-4 rounded-2xl bg-card">
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  This Week Adjustments
                </h3>
                {/*
                  Every figure here is a RATIO AGAINST BASELINE
                  (`liftProgression = safeRatio(thisWeekTonnage,
                  baselineTonnage)`), so while the baseline is still
                  forming they divide by a number that does not mean
                  anything yet. That is how the card came to read
                  "Lifting progression: +324%" — arithmetically correct,
                  a 4.24x ratio against a one-session baseline, and
                  nonsense as a statement about the user's training.

                  Same root cause as the gauge's "Peak" above: a figure
                  derived from an unestablished baseline presented as a
                  finding. Suppressed rather than clamped, because a
                  capped number is still a claim.
                */}
                {establishing ? (
                  <p className="text-sm text-muted-foreground">
                    Week-on-week adjustments start once your baseline settles —
                    there is nothing meaningful to compare against yet.
                  </p>
                ) : (
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>
                      Lifting progression:{" "}
                      <span className="text-foreground font-medium">
                        {pctSigned(m.liftProgression - 1)}
                      </span>
                    </li>
                    <li>
                      Run volume:{" "}
                      <span className="text-foreground font-medium">
                        {pctSigned(m.runVolume - 1)}
                      </span>
                    </li>
                    <li>
                      Run pace adjustment:{" "}
                      <span className="text-foreground font-medium">
                        {pctSigned(m.runPaceAdjustmentPct)}
                      </span>
                    </li>
                  </ul>
                )}
              </div>

              {/* Plan adjustments from engine */}
              {planAdj &&
                (planAdj.lift.length > 0 || planAdj.run.length > 0) && (
                  <div className="space-y-3">
                    {planAdj.lift.length > 0 && (
                      <div className="p-4 rounded-2xl bg-lifting/8">
                        <div className="flex items-center gap-2 mb-2">
                          <Dumbbell className="size-4 text-lifting" />
                          <h3 className="text-sm font-semibold text-lifting-strong">
                            Lifting Suggestions
                          </h3>
                        </div>
                        <ul className="space-y-1">
                          {planAdj.lift.map((s, i) => (
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
                    {planAdj.run.length > 0 && (
                      <div className="p-4 rounded-2xl bg-running/8">
                        <div className="flex items-center gap-2 mb-2">
                          <Footprints className="size-4 text-running" />
                          <h3 className="text-sm font-semibold text-running-strong">
                            Running Suggestions
                          </h3>
                        </div>
                        <ul className="space-y-1">
                          {planAdj.run.map((s, i) => (
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
                  </div>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

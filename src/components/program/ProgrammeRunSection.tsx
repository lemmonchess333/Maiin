/**
 * PR-4: Programme Run tab — operational hero, configuration as
 * footer.
 *
 * Pre-PR-4 the mode picker (Freeform / Structured / Race Prep
 * chips) was the hero. For freeform users the tab was near-empty
 * — just a settings card. For race_prep users the genuinely
 * useful content (race progress, compressed banner, this-week's
 * runs) was buried below a configuration affordance the user
 * touches once a month.
 *
 * PR-4 inverts the hierarchy:
 *   - Hero per runMode:
 *     - freeform → "Start a run" CTA + recent-run summary
 *       (useRunningStats(30))
 *     - structured → next startable run promoted to a Start
 *       card + this week's runs list
 *     - race_prep with goal → race elapsed banner / compressed
 *       banner / race progress card / next startable Start /
 *       this-week's-runs
 *     - race_prep without goal → "Race prep not set up yet"
 *       setup CTA (the existing block is the correct hero for
 *       this state)
 *   - Footer "Running mode: {mode}" + a right-aligned
 *     [Change plan ›] tappable affordance that opens the
 *     ConfigurePlanModal at the Running step. Same callback
 *     PR-0d's chips used — atomic rebuild via the configurePlan
 *     Cloud Function. No direct `updateProfile({ runMode })`.
 *
 * What stays from PR-0d / PR-1:
 *   - Mode changes ALWAYS route through ConfigurePlanModal at
 *     CONFIGURE_PLAN_RUNNING_STEP. Never a single-field
 *     updateProfile.
 *   - DayActionSheet preserves manual-complete / skip-run /
 *     skip-lift / template swap.
 *   - Race-elapsed + compressed-plan banners + race progress
 *     card content unchanged — only reordered to hero position.
 *
 * Removed: the chip-row mode picker (lines 107-149 pre-PR-4)
 * and the early `runsTarget <= 0 return null` gate. The section
 * now owns its own zero-state for freeform (Start a run + empty
 * recent-runs copy) and for structured/race_prep-with-no-runs
 * ("Configure your runs" CTA). The parent Program.tsx's parallel
 * "No runs in your plan yet" fallback is removed in the same
 * diff to avoid double-rendering.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Footprints, Check, Settings2, Play, ChevronRight } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { THEME } from "@/lib/theme";
import { DAY_LABELS } from "@/lib/scheduleUtils";
import {
  getScheduledRunStatus,
  isScheduledRunEditable,
  isScheduledRunReconciliation,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRacePhaseLabel } from "@/features/program/runScheduler";
import { useRunningStats } from "@/hooks/useRunningStats";
import { haptic } from "@/lib/haptic";
import { CONFIGURE_PLAN_RUNNING_STEP } from "./ConfigurePlanModal";
import DayActionSheet from "./DayActionSheet";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState, ScheduledRunDay } from "@/features/program/programTypes";

interface ProgrammeRunSectionProps {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Weekly run-day target. 0 for freeform users with no run plan;
   *  non-zero for structured/race_prep. Used to gate the "Configure
   *  your runs" CTA on non-freeform modes; freeform always shows
   *  the hero regardless. */
  runsTarget: number;
  overrideRunDay: (idOrDayIndex: string | number, templateId: string) => void;
  completeRunDay: (idOrDayIndex: string | number) => Promise<void>;
  skipRunDay: (idOrDayIndex: string | number) => Promise<void>;
  skipWorkoutDay: (dayIndex: number) => Promise<void>;
  /** PR-0d: every run-mode change routes through this callback —
   *  opens ConfigurePlanModal at the Running step, which then runs
   *  planBuilder + the configurePlan Cloud Function atomically.
   *  Never replaced by a direct `updateProfile({ runMode })`. */
  onOpenConfigurePlan?: (initialStep?: number) => void;
}

function paceLabel(paceSec: number): string {
  if (!paceSec || paceSec <= 0) return "—";
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function durationLabel(durationSec: number): string {
  const m = Math.floor(durationSec / 60);
  const s = Math.round(durationSec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${String(mm).padStart(2, "0")}m`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function distanceLabel(distanceM: number): string {
  if (!distanceM || distanceM <= 0) return "—";
  return `${(distanceM / 1000).toFixed(1)} km`;
}

export default function ProgrammeRunSection({
  profile,
  programState,
  runsTarget,
  overrideRunDay,
  completeRunDay,
  skipRunDay,
  skipWorkoutDay,
  onOpenConfigurePlan,
}: ProgrammeRunSectionProps) {
  const navigate = useNavigate();
  // PR-1: which row is opening DayActionSheet.
  const [manageDate, setManageDate] = useState<string | null>(null);
  // PR-4: recent-run context for the freeform hero. 30-day window
  // is bounded by the hook's `where('completedAt', '>=', ...)`
  // clause; returns a `loading` flag the hero shell consumes for
  // non-blocking paint.
  const { runs, weeklyData, loading: runsLoading } = useRunningStats(30);

  const currentMode = profile.runMode ?? "freeform";
  const raceGoal = programState?.runPlan?.raceGoal;
  const raceCompressed = !!programState?.runPlan?.compressed;
  // Memoised: `programState?.runDays ?? []` produces a fresh array
  // reference on every render when the field is undefined, which
  // would invalidate the downstream useMemo deps.
  const runDays = useMemo(() => programState?.runDays ?? [], [programState?.runDays]);

  // Race-elapsed is a cheap render-time derivation; not memoised
  // because the comparison against "now" is impure and useMemo
  // would be flagged. Sub-microsecond cost; ran every render is
  // fine. Uses `new Date()` (constructor, not Date.now()) to
  // match the existing codebase pattern accepted by the
  // react-hooks/purity rule.
  const raceElapsedTarget = raceGoal ? new Date(raceGoal.targetDate) : null;
  const raceElapsed = !!(
    raceElapsedTarget &&
    !Number.isNaN(raceElapsedTarget.getTime()) &&
    raceElapsedTarget.getTime() < new Date().getTime()
  );

  // PR-4: surface the first non-terminal runDay as a promoted
  // "Next planned run" Start card on structured + race_prep. The
  // same `/run?template=…&scheduledRunId=…` URL pattern Home's
  // RunCTACard and trainingResolver.startUrl emit.
  const nextStartable: ScheduledRunDay | null = useMemo(() => {
    if (currentMode === "freeform") return null;
    return (
      runDays.find((rd) => isScheduledRunStartable(getScheduledRunStatus(rd))) ??
      null
    );
  }, [currentMode, runDays]);

  const nextStartableTemplate = useMemo(() => {
    if (!nextStartable) return null;
    const tmplId = nextStartable.userOverride || nextStartable.templateId;
    return RUN_TEMPLATES.find((t) => t.id === tmplId) ?? null;
  }, [nextStartable]);

  const nextStartUrl = useMemo(() => {
    if (!nextStartable) return null;
    const params: string[] = [];
    if (nextStartableTemplate) params.push("template=" + nextStartableTemplate.id);
    if (nextStartable.id) params.push("scheduledRunId=" + encodeURIComponent(nextStartable.id));
    return "/run" + (params.length ? "?" + params.join("&") : "");
  }, [nextStartable, nextStartableTemplate]);

  const allRunsDone =
    currentMode !== "freeform" &&
    runDays.length > 0 &&
    !nextStartable;

  // Freeform hero data — last run from the recent-30-day window
  // + this week's bucket.
  const lastRun = runs[0] ?? null;
  const thisWeek = weeklyData[weeklyData.length - 1] ?? null;

  const modeLabel =
    currentMode === "race_prep" ? "Race prep" : currentMode === "structured" ? "Structured" : "Freeform";

  return (
    <section
      aria-label="Run training"
      className="rounded-2xl p-4 space-y-4"
      style={{
        background: `${THEME.running}08`,
        border: `1px solid ${THEME.running}25`,
      }}
    >
      <header className="flex items-center gap-2">
        <Footprints className="w-4 h-4" style={{ color: THEME.running }} />
        <h2 className="text-sm font-semibold text-foreground">Run training</h2>
      </header>

      {/* ── Hero: freeform ──────────────────────────────────────────
          Start CTA + last-run + this-week summary lines. Empty
          state when the user has no recent runs. */}
      {currentMode === "freeform" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              haptic();
              navigate("/run");
            }}
            className="w-full rounded-xl p-4 text-left flex items-center gap-3"
            style={{
              background: `linear-gradient(135deg, ${THEME.running}18, ${THEME.running}08)`,
              border: `1px solid ${THEME.running}30`,
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${THEME.running}22` }}
            >
              <Footprints className="w-5 h-5" style={{ color: THEME.running }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-0.5" style={{ color: THEME.running }}>
                Start a run
              </p>
              <p className="text-sm font-bold text-foreground">Pick your pace today</p>
              <p className="text-micro text-muted-foreground">Easy, tempo, intervals or just go</p>
            </div>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm shrink-0"
              style={{
                background: `linear-gradient(135deg, ${THEME.running}, ${THEME.runningLight})`,
                color: "white",
              }}
            >
              <Play className="w-3 h-3" fill="white" />
              Go
            </div>
          </button>

          {/* Recent-run context. Hero shell paints immediately;
              these two lines fade in once useRunningStats resolves.
              No spinner is shown over the Start CTA above. */}
          {runsLoading ? (
            <div className="space-y-1.5">
              <div className="h-3.5 rounded bg-muted/60 animate-pulse" style={{ width: "70%" }} />
              <div className="h-3.5 rounded bg-muted/60 animate-pulse" style={{ width: "55%" }} />
            </div>
          ) : runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Track your first run to see weekly distance and pace trends here.
            </p>
          ) : (
            <div className="space-y-1 text-xs font-mono tabular-nums">
              {lastRun && (
                <p className="text-muted-foreground">
                  <span className="text-foreground">Last run</span>
                  {" · "}
                  {distanceLabel(lastRun.distance)}
                  {" · "}
                  {durationLabel(lastRun.duration)}
                  {lastRun.avgPace > 0 && (
                    <>
                      {" · "}
                      {paceLabel(lastRun.avgPace)}
                    </>
                  )}
                  {" · "}
                  {formatDistanceToNowStrict(lastRun.completedAt, { addSuffix: true })}
                </p>
              )}
              {thisWeek && (
                <p className="text-muted-foreground">
                  <span className="text-foreground">This week</span>
                  {" · "}
                  {thisWeek.totalDistance.toFixed(1)} km
                  {" · "}
                  {thisWeek.runCount} run{thisWeek.runCount === 1 ? "" : "s"}
                  {thisWeek.avgPace > 0 && (
                    <>
                      {" · "}
                      {paceLabel(thisWeek.avgPace)} avg
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Hero: non-freeform with 0 runs (malformed plan) ─────── */}
      {currentMode !== "freeform" && runsTarget === 0 && !raceGoal && (
        <div className="p-3 rounded-xl bg-card border border-border/50 space-y-2 text-center">
          <Footprints className="w-6 h-6 mx-auto mb-1" style={{ color: THEME.running }} />
          <p className="text-sm font-medium">Configure your runs</p>
          <p className="text-xs text-muted-foreground">
            You&apos;re on {modeLabel.toLowerCase()} mode but no run days are scheduled. Open Configure plan to add them.
          </p>
          <button
            type="button"
            onClick={() => onOpenConfigurePlan?.(CONFIGURE_PLAN_RUNNING_STEP)}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Configure plan
          </button>
        </div>
      )}

      {/* ── Hero: race_prep without goal (setup CTA) ────────────── */}
      {currentMode === "race_prep" && !raceGoal && (
        <div className="p-3 rounded-xl bg-card space-y-2">
          <p className="text-sm font-medium text-foreground">Race prep not set up yet</p>
          <p className="text-xs text-muted-foreground">
            Pick a distance and target date to generate your periodised plan.
          </p>
          <button
            type="button"
            onClick={() => onOpenConfigurePlan?.(CONFIGURE_PLAN_RUNNING_STEP)}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Set race goal
          </button>
        </div>
      )}

      {/* ── Hero: race_prep elapsed banner (promoted) ───────────── */}
      {currentMode === "race_prep" && raceGoal && raceElapsed && (
        <div
          className="p-3 rounded-xl text-xs"
          style={{
            background: "hsl(var(--muted) / 0.5)",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--foreground))",
          }}
        >
          <p className="font-semibold mb-0.5">Race day has passed</p>
          <p style={{ color: "hsl(var(--muted-foreground))" }}>
            {raceGoal.distance.toUpperCase()} on {raceGoal.targetDate}. Open Configure plan to set a new
            race or switch to structured running.
          </p>
        </div>
      )}

      {/* ── Hero: race_prep compressed banner (promoted) ────────── */}
      {currentMode === "race_prep" && raceGoal && !raceElapsed && raceCompressed && (
        <div
          className="p-3 rounded-xl text-xs"
          style={{
            background: `${THEME.warning ?? "#D9884E"}12`,
            border: `1px solid ${THEME.warning ?? "#D9884E"}40`,
            color: "hsl(var(--foreground))",
          }}
        >
          <p className="font-semibold mb-0.5">Plan is compressed</p>
          <p style={{ color: "hsl(var(--muted-foreground))" }}>
            Your target date is sooner than the ideal build for this distance, so we&apos;ve trimmed
            interval work and shortened the long-run progression to keep the plan safe.
          </p>
        </div>
      )}

      {/* ── Hero: race_prep progress card (promoted) ────────────── */}
      {currentMode === "race_prep" && raceGoal && !raceElapsed && (
        <div className="p-3 rounded-xl bg-card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Race</span>
            <span className="text-sm font-medium text-foreground">
              {raceGoal.distance.toUpperCase()} &mdash; {raceGoal.targetDate}
            </span>
          </div>
          {programState?.runPlan?.totalWeeks && programState.runPlan.currentWeek != null && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Week</span>
                <span className="text-sm font-medium text-foreground">
                  {programState.runPlan.currentWeek + 1} / {programState.runPlan.totalWeeks}
                  {" · "}
                  {getRacePhaseLabel(programState.runPlan.currentWeek, programState.runPlan.totalWeeks)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width:
                      ((programState.runPlan.currentWeek + 1) / programState.runPlan.totalWeeks) * 100 + "%",
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Next planned run (structured + race_prep with goal) ──
          Same URL pattern as RunCTACard / trainingResolver.startUrl.
          Skipped when every runDay in the week is already terminal
          (we render a "done this week" affirmation instead). */}
      {currentMode !== "freeform" && nextStartable && nextStartUrl && (
        <button
          type="button"
          onClick={() => {
            haptic();
            navigate(nextStartUrl);
          }}
          className="w-full rounded-xl p-3 text-left flex items-center gap-3"
          style={{
            background: `${THEME.running}10`,
            border: `1px solid ${THEME.running}30`,
          }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${THEME.running}22` }}
          >
            <Footprints className="w-4 h-4" style={{ color: THEME.running }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold mb-0.5" style={{ color: THEME.running }}>
              Next · {DAY_LABELS[nextStartable.dayIndex]}
            </p>
            <p className="text-sm font-bold text-foreground truncate">
              {nextStartableTemplate?.name ?? "Run"}
            </p>
            {nextStartableTemplate?.description && (
              <p className="text-micro text-muted-foreground truncate">
                {nextStartableTemplate.description}
              </p>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm shrink-0"
            style={{
              background: `linear-gradient(135deg, ${THEME.running}, ${THEME.runningLight})`,
              color: "white",
            }}
          >
            <Play className="w-3 h-3" fill="white" />
            Start
          </div>
        </button>
      )}

      {currentMode !== "freeform" && allRunsDone && (
        <div
          className="p-3 rounded-xl text-center text-xs flex items-center justify-center gap-1.5"
          style={{
            background: `${THEME.success}10`,
            border: `1px solid ${THEME.success}30`,
            color: THEME.success,
          }}
        >
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">All runs done this week</span>
        </div>
      )}

      {/* ── This week's runs (per-day list with template select +
            Manage) — structured + race_prep with runDays. */}
      {currentMode !== "freeform" && runDays.length > 0 && (
        <div className="p-3 rounded-xl bg-card space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">This week&apos;s runs</p>
          {runDays.map((rd) => {
            const status = getScheduledRunStatus(rd);

            if (isScheduledRunReconciliation(status)) {
              return (
                <div key={rd.id ?? rd.dayIndex} className="flex items-center gap-3 py-1">
                  <span className="text-xs font-medium text-foreground w-8">
                    {DAY_LABELS[rd.dayIndex]}
                  </span>
                  <p className="flex-1 text-xs text-muted-foreground italic">
                    Race completed separately. Review this in History.
                  </p>
                </div>
              );
            }

            const editable = isScheduledRunEditable(status);
            return (
              <div key={rd.id ?? rd.dayIndex} className="flex items-center gap-3 py-1">
                <span className="text-xs font-medium text-foreground w-8">
                  {DAY_LABELS[rd.dayIndex]}
                </span>
                <select
                  value={rd.userOverride || rd.templateId}
                  onChange={(e) => overrideRunDay(rd.id ?? rd.dayIndex, e.target.value)}
                  disabled={!editable}
                  aria-label={
                    editable
                      ? `Run template for ${DAY_LABELS[rd.dayIndex]}`
                      : `${status} — template locked`
                  }
                  className="flex-1 bg-muted rounded-lg px-2 py-1.5 text-xs border border-border/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {RUN_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.type})
                    </option>
                  ))}
                </select>
                {rd.completed && <Check className="w-4 h-4 text-green-500 shrink-0" />}
                {rd.date && (
                  <button
                    type="button"
                    onClick={() => setManageDate(rd.date ?? null)}
                    aria-label={`Manage ${DAY_LABELS[rd.dayIndex]} run`}
                    className="p-1.5 -m-1 rounded-md text-muted-foreground active:scale-95"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer: "Running mode: X" + [Change plan ›] ──────────
          Single affordance for switching modes. Same callback
          PR-0d's chips used — opens ConfigurePlanModal at the
          Running step. The atomic rebuild path: planBuilder +
          configurePlan CF. Never a direct updateProfile({runMode}).
          Visually separate from the status label so the chevron
          + colour read as "tap me to enter plan reconfiguration",
          not as a status bar. */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <span className="text-xs text-muted-foreground">
          Running mode: <span className="text-foreground font-medium">{modeLabel}</span>
        </span>
        <button
          type="button"
          onClick={() => onOpenConfigurePlan?.(CONFIGURE_PLAN_RUNNING_STEP)}
          className="inline-flex items-center gap-0.5 text-xs font-semibold px-1 -m-1 rounded-md active:scale-95"
          style={{ color: THEME.running }}
        >
          Change plan
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* PR-1: per-day action sheet. */}
      <DayActionSheet
        open={manageDate !== null}
        onClose={() => setManageDate(null)}
        dateKey={manageDate}
        profile={profile}
        programState={programState}
        overrideRunDay={overrideRunDay}
        completeRunDay={completeRunDay}
        skipRunDay={skipRunDay}
        skipWorkoutDay={skipWorkoutDay}
      />
    </section>
  );
}


/**
 * PR-4 + PR-B: Programme Run tab — operational hero + inline mode
 * picker, configuration wizard as escape hatch.
 *
 * PR-4 inverted the hierarchy so the operational content (Start
 * CTA, race progress, this-week's-runs) sits in hero position
 * and configuration moved to the footer. PR-B then restored the
 * three-segment mode chip row (Freeform / Structured / Race Prep)
 * — but wired safely to a composing handler that runs
 * `updateProfile` AND `refreshRunSchedule` atomically (PR-0d's
 * direct-write bug is not reintroduced). The chip row sits
 * directly under the section header and above per-mode hero
 * content. The footer "Change plan ›" link still opens the full
 * 6-step ConfigurePlanModal as a re-run escape hatch.
 *
 * Mode-change semantics by target:
 *
 *   freeform   → updateProfile({ runMode }) + refreshRunSchedule
 *                (early-returns internally, idempotent)
 *   structured → updateProfile({ runMode, runTargetWriteFields })
 *                with default target=3 when current target is 0
 *                + refreshRunSchedule which regenerates runDays
 *                via scheduleStructuredWeekV2
 *   race_prep  → DEFERRED: chip tap reveals the inline race-goal
 *                form (PR-B3). Writes happen on form save via
 *                handleSaveRaceGoal — same composing pattern.
 *
 * raceGoal preservation on mode exit: silent preserve (Phase A R1
 * audit confirmed every read of `profile.raceGoal` / `runPlan.raceGoal`
 * is gated by `runMode === "race_prep"`, so a preserved goal cannot
 * leak into another mode's UI). On race_prep → structured → race_prep
 * the form prefills from the preserved goal.
 *
 * What stays from PR-0d / PR-1 / PR-4:
 *   - DayActionSheet preserves manual-complete / skip-run /
 *     skip-lift / template swap.
 *   - Race-elapsed + compressed-plan banners + race progress
 *     card + this-week's-runs per-day list — unchanged.
 *   - Footer "Change plan ›" still opens ConfigurePlanModal at
 *     the Running step (escape hatch, not the only path).
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Footprints, Check, Settings2, Play, ChevronRight, Flag } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useAuth } from "@/lib/auth";
import { DAY_LABELS, getWeeklyRunTarget, runTargetWriteFields } from "@/lib/scheduleUtils";
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

type RunMode = "freeform" | "structured" | "race_prep";
type RaceDistance = "5k" | "10k" | "half" | "marathon";

interface RefreshRunScheduleOverrides {
  weekSchedule?: UserProfile["weekSchedule"];
  weeklyRunDaysTarget?: number;
}

interface ProgrammeRunSectionProps {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Weekly run-day target. 0 for freeform users with no run plan;
   *  non-zero for structured/race_prep. Surfaces the "Configure
   *  your runs" CTA when a non-freeform mode is selected but the
   *  target is 0 (malformed plan). Freeform users see the hero
   *  regardless. */
  runsTarget: number;
  overrideRunDay: (idOrDayIndex: string | number, templateId: string) => void;
  completeRunDay: (idOrDayIndex: string | number) => Promise<void>;
  skipRunDay: (idOrDayIndex: string | number) => Promise<void>;
  skipWorkoutDay: (dayIndex: number) => Promise<void>;
  /** PR-B: inline mode-change handler dispatches writes directly.
   *  refreshRunSchedule is the second half of the composing pattern
   *  — its overrides arg lets us pass the user's confirmed
   *  weekSchedule + target instead of reading from a stale auth
   *  closure (PR-0b-ii). */
  refreshRunSchedule: (overrides?: RefreshRunScheduleOverrides) => Promise<void>;
  /** PR-0d → PR-4: opens ConfigurePlanModal at the Running step.
   *  Now an escape hatch for full plan rebuilds, not the only path
   *  to a mode change. The inline chip row + race-goal form (PR-B)
   *  handle the common cases. */
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
  refreshRunSchedule,
  onOpenConfigurePlan,
}: ProgrammeRunSectionProps) {
  const navigate = useNavigate();
  const { updateProfile } = useAuth();
  // PR-1: which row is opening DayActionSheet.
  const [manageDate, setManageDate] = useState<string | null>(null);
  // PR-4: recent-run context for the freeform hero. 30-day window
  // is bounded by the hook's `where('completedAt', '>=', ...)`
  // clause; returns a `loading` flag the hero shell consumes for
  // non-blocking paint.
  const { runs, weeklyData, loading: runsLoading } = useRunningStats(30);
  // PR-B: chip + race-form state.
  //   modeChangePending — double-tap guard while updateProfile +
  //     refreshRunSchedule are in flight.
  //   modeError — non-blocking inline error string surfaced under
  //     the chip row when a composing handler fails.
  //   showRaceForm — race_prep chip was tapped from a non-race_prep
  //     mode (or "Edit race" was tapped from race_prep + goal). The
  //     form is the only path that writes for race_prep.
  //   raceDistance / raceTargetDate / savingRaceGoal — form state,
  //     prefilled from profile.raceGoal (R1 GATED → safe to preserve
  //     across mode exits and rehydrate on form open).
  const [modeChangePending, setModeChangePending] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  // Auto-open the form when the user is in race_prep but missing
  // a goal (the malformed state PR-0d's stub used to handle). For
  // any other entry path the user taps the Race Prep chip first.
  const [showRaceForm, setShowRaceForm] = useState<boolean>(
    () => (profile.runMode ?? "freeform") === "race_prep" && !programState?.runPlan?.raceGoal,
  );
  const [raceDistance, setRaceDistance] = useState<RaceDistance>(
    (profile.raceGoal?.distance as RaceDistance) ?? "10k",
  );
  const [raceTargetDate, setRaceTargetDate] = useState<string>(profile.raceGoal?.targetDate ?? "");
  const [savingRaceGoal, setSavingRaceGoal] = useState(false);

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

  // PR-B1: composing handler — the single safe path for inline
  // mode changes. Sequences updateProfile (mode + mode-specific
  // fields) and refreshRunSchedule (runDays/runPlan regeneration).
  // Pre-PR-0d the chip wrote runMode alone; PR-0d removed the
  // chip because of that bug; PR-B restores the chip with the
  // correct composition.
  //
  //   freeform   → updateProfile + refreshRunSchedule (idempotent
  //                for freeform since refreshRunSchedule
  //                early-returns at useProgram.ts:964)
  //   structured → updateProfile with mode + target (default 3
  //                when target is 0) + refreshRunSchedule
  //   race_prep  → DEFERRED (no write here); reveal form. Form
  //                save calls handleSaveRaceGoal with the same
  //                composing pattern.
  async function handleModeChange(newMode: RunMode): Promise<void> {
    if (modeChangePending) return;
    setModeError(null);

    // Race-prep is form-mediated. Tapping the chip reveals the
    // form regardless of whether the user already has a goal —
    // if they do, the form prefills, so "Edit race" is free.
    if (newMode === "race_prep") {
      setShowRaceForm(true);
      return;
    }

    // Tapping the active chip is a no-op (but clears any open
    // race-form / errors from a previous attempt).
    if (newMode === currentMode) {
      setShowRaceForm(false);
      return;
    }

    setModeChangePending(true);
    try {
      if (newMode === "freeform") {
        await updateProfile({ runMode: "freeform" });
        try {
          await refreshRunSchedule({ weekSchedule: profile.weekSchedule });
        } catch (e) {
          logger.warn("[handleModeChange] freeform refresh failed once, retrying", e);
          try {
            await refreshRunSchedule({ weekSchedule: profile.weekSchedule });
          } catch (e2) {
            logger.error("[handleModeChange] freeform refresh failed twice", e2);
            setModeError("Mode changed, but the run schedule didn't refresh. Try Change plan if it stays stuck.");
          }
        }
      } else {
        // structured
        const current = getWeeklyRunTarget(profile);
        const target = current < 1 ? 3 : current;
        await updateProfile({
          runMode: "structured",
          ...runTargetWriteFields(target),
        });
        try {
          await refreshRunSchedule({
            weekSchedule: profile.weekSchedule,
            weeklyRunDaysTarget: target,
          });
        } catch (e) {
          logger.warn("[handleModeChange] structured refresh failed once, retrying", e);
          try {
            await refreshRunSchedule({
              weekSchedule: profile.weekSchedule,
              weeklyRunDaysTarget: target,
            });
          } catch (e2) {
            logger.error("[handleModeChange] structured refresh failed twice", e2);
            setModeError("Mode changed, but the run schedule didn't refresh. Try Change plan if it stays stuck.");
          }
        }
      }
      setShowRaceForm(false);
    } catch (e) {
      // updateProfile threw — runMode unchanged, no need to roll back.
      logger.error("[handleModeChange] updateProfile failed", e);
      setModeError("Couldn't change mode. Check your connection and try again.");
    } finally {
      setModeChangePending(false);
    }
  }

  // PR-B3: race-goal form save handler. Recovered from PR-0d-removed
  // `handleSaveRaceGoal`. Same composing pattern: updateProfile +
  // refreshRunSchedule. Validation: future date, distance picked.
  async function handleSaveRaceGoal(): Promise<void> {
    if (!raceTargetDate) {
      toast.error("Please select a target date", { id: "race-goal" });
      return;
    }
    const target = new Date(raceTargetDate);
    const now = new Date();
    if (target.getTime() < now.getTime()) {
      toast.error("Target date is in the past", { id: "race-goal" });
      return;
    }
    const weeksAway = Math.round((target.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksAway < 3) {
      toast.error("Target date must be at least 3 weeks away", { id: "race-goal" });
      return;
    }
    setSavingRaceGoal(true);
    setModeError(null);
    try {
      await updateProfile({
        runMode: "race_prep",
        raceGoal: { distance: raceDistance, targetDate: raceTargetDate },
      });
      const target3 = getWeeklyRunTarget(profile) || 3;
      try {
        await refreshRunSchedule({
          weekSchedule: profile.weekSchedule,
          weeklyRunDaysTarget: target3,
        });
      } catch (e) {
        logger.warn("[handleSaveRaceGoal] refresh failed once, retrying", e);
        try {
          await refreshRunSchedule({
            weekSchedule: profile.weekSchedule,
            weeklyRunDaysTarget: target3,
          });
        } catch (e2) {
          logger.error("[handleSaveRaceGoal] refresh failed twice", e2);
          setModeError("Race goal saved, but the plan didn't regenerate. Try Change plan if it stays stuck.");
        }
      }
      toast.success("Race plan created!", { id: "race-goal" });
      setShowRaceForm(false);
    } catch (e) {
      logger.error("[handleSaveRaceGoal] updateProfile failed", e);
      toast.error("Failed to save race goal", { id: "race-goal" });
    } finally {
      setSavingRaceGoal(false);
    }
  }

  // Chip-selected state: while showRaceForm is open from a
  // non-race_prep mode the user has visually picked race_prep but
  // the write is pending the form. Reflect that selection on the
  // chip so the affordance doesn't snap back to the previous mode.
  const selectedMode: RunMode = showRaceForm ? "race_prep" : currentMode;

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

      {/* PR-B2: three-segment mode chip row. Restored from pre-PR-0d
          but wired to the composing handler — chip taps trigger
          updateProfile + refreshRunSchedule atomically, OR for
          race_prep reveal the inline form (the only mode that
          blocks on input). The PR-0d "direct updateProfile({ runMode })"
          bug is NOT reintroduced — see handleModeChange above. */}
      <div className="space-y-2">
        <p
          className="text-xs uppercase tracking-wider"
          style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}
        >
          Run mode
        </p>
        <div className="flex gap-2">
          {(["freeform", "structured", "race_prep"] as const).map((mode) => {
            const isSelected = selectedMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => handleModeChange(mode)}
                disabled={modeChangePending}
                aria-pressed={isSelected}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.97]",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                  modeChangePending && !isSelected && "opacity-50 cursor-not-allowed",
                )}
              >
                {mode === "race_prep" ? "Race Prep" : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedMode === "freeform"
            ? "Pick any run type when you start"
            : selectedMode === "structured"
              ? "Auto-assigns run templates to your run days"
              : "Follows a race training plan"}
        </p>
        {modeError && (
          <p className="text-xs" style={{ color: THEME.running }} role="alert">
            {modeError}
          </p>
        )}
      </div>

      {/* PR-B3: inline race-goal form. Replaces the "Race prep not
          set up yet" stub PR-0d left. Shown when the user has tapped
          the Race Prep chip and either has no goal OR is explicitly
          re-editing. Form save calls handleSaveRaceGoal which
          composes updateProfile + refreshRunSchedule (same pattern
          as handleModeChange). Validation lives inline (no modal). */}
      {showRaceForm && (
        <div className="p-3 rounded-xl bg-card space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Flag className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-foreground">
              {profile.raceGoal ? "Edit race goal" : "Set your race goal"}
            </span>
          </div>
          <fieldset>
            <legend className="text-xs text-muted-foreground uppercase tracking-wider">Distance</legend>
            <div className="flex gap-1.5 mt-1">
              {(["5k", "10k", "half", "marathon"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRaceDistance(d)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                    raceDistance === d
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {d === "half" ? "Half" : d === "marathon" ? "Full" : d.toUpperCase()}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label
              htmlFor="programme-race-target-date"
              className="text-xs text-muted-foreground uppercase tracking-wider"
            >
              Target Date
            </label>
            <input
              id="programme-race-target-date"
              type="date"
              value={raceTargetDate}
              onChange={(e) => setRaceTargetDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowRaceForm(false)}
              className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveRaceGoal}
              disabled={savingRaceGoal || !raceTargetDate}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {savingRaceGoal ? "Creating plan..." : profile.raceGoal ? "Save race goal" : "Create race plan"}
            </button>
          </div>
        </div>
      )}

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

      {/* PR-B4: the "Race prep not set up yet → Set race goal" stub
          PR-0d added is replaced by the PR-B3 inline form above —
          it auto-opens when currentMode is race_prep but raceGoal
          is missing, and is also reachable from the Race Prep chip
          tap or the "Edit race" button on the progress card. */}

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
      {currentMode === "race_prep" && raceGoal && !raceElapsed && !showRaceForm && (
        <div className="p-3 rounded-xl bg-card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Race</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {raceGoal.distance.toUpperCase()} &mdash; {raceGoal.targetDate}
              </span>
              <button
                type="button"
                onClick={() => setShowRaceForm(true)}
                className="text-xs font-medium px-1 -m-1 rounded-md active:scale-95"
                style={{ color: THEME.running }}
                aria-label="Edit race goal"
              >
                Edit
              </button>
            </div>
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


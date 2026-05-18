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

import { useState, useMemo, useEffect } from "react";
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
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRacePhaseLabel } from "@/features/program/runScheduler";
import { useRunningStats } from "@/hooks/useRunningStats";
import { haptic } from "@/lib/haptic";
import { CONFIGURE_PLAN_RUNNING_STEP } from "./ConfigurePlanModal";
import DayActionSheet from "./DayActionSheet";
import { localDateString, localWeekKey, addLocalDays, parseLocalDate } from "@/lib/dateHelpers";
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
  /** PR-C: atomic writer to exit the recovery phase early. Clears
   *  `runPlan.phase` + `runPlan.recoveryEndDate` AND flips
   *  `profile.runMode` to "structured" in a coordinated pair of
   *  writes. The post-race card's "Skip recovery early" link calls
   *  this when the user wants to bail out of the soft window. */
  skipRecoveryEarly: () => Promise<void>;
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
  skipRecoveryEarly,
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
  // Run7 Q9 — visual-intent state. The chip + description update
  // immediately on tap so the user sees their intent reflected before
  // the profile write completes. Cleared automatically when
  // currentMode catches up (success) or in handleModeChange's catch
  // block (failure → revert to last-saved).
  const [intentMode, setIntentMode] = useState<RunMode | null>(null);
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
  // Clear visual-intent override once the profile catches up. Keeps
  // the chip in sync with last-saved state without needing the
  // handler success path to reset intent manually.
  useEffect(() => {
    if (intentMode && intentMode === currentMode) {
      setIntentMode(null);
    }
  }, [intentMode, currentMode]);
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

  // PR-C: post-race card state derivation. Driven by:
  //   - the race-day runDay status (planned / completed_* / race_no_show)
  //   - runPlan.phase ("recovery" or undefined)
  //   - today vs runPlan.recoveryEndDate (in-recovery / ended-grace / past-grace)
  //
  // Variants:
  //   inRecovery       → "Recovering — N days left" + Skip-recovery link
  //   recoveryEnded    → "Recovery complete. What's next?" + Set next race / Switch to structured
  //   noShow           → "We marked this as no-show. Log it now if you ran." + Log race now / Set next race / Switch to structured
  //
  // Outside these three: fall back to the legacy "Race day has passed"
  // banner (covers e.g. an old elapsed race where recovery already
  // ran its course and the +7d grace cleared phase).
  const raceDayRunDay = raceGoal
    ? runDays.find((rd) => rd.date === raceGoal.targetDate)
    : null;
  const raceDayStatus = raceDayRunDay ? getScheduledRunStatus(raceDayRunDay) : null;
  const phase = programState?.runPlan?.phase;
  const recoveryEndDate = programState?.runPlan?.recoveryEndDate;
  const todayKeyDerivation = localDateString(new Date());
  const inRecovery = phase === "recovery" && !!recoveryEndDate && todayKeyDerivation < recoveryEndDate;
  const recoveryEnded = phase === "recovery" && !!recoveryEndDate && todayKeyDerivation >= recoveryEndDate;
  const isNoShow = raceDayStatus === "race_no_show";
  const recoveryDaysLeft = useMemo(() => {
    if (!inRecovery || !recoveryEndDate) return 0;
    const end = parseLocalDate(recoveryEndDate);
    const ms = end.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  }, [inRecovery, recoveryEndDate]);

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

  // PR-F: temporal-anchored label for the "Next planned run" card.
  // Pre-PR-F this was just `Next · {DAY_LABELS[dayIndex]}`, which
  // forces the user to compute proximity ("is today Tuesday? then
  // Wed = tomorrow"). Today / Tomorrow / Pending makes the common
  // cases explicit; Pending flags past-planned runDays still
  // sitting startable in the current week (e.g. yesterday's
  // unstarted easy run) so the user doesn't think it's "next".
  const nextStartableLabel = useMemo<string>(() => {
    if (!nextStartable) return "";
    if (!nextStartable.date) return DAY_LABELS[nextStartable.dayIndex];
    const today = new Date();
    const todayKey = localDateString(today);
    const tomorrowKey = localDateString(addLocalDays(today, 1));
    if (nextStartable.date === todayKey) return "Today";
    if (nextStartable.date === tomorrowKey) return "Tomorrow";
    if (nextStartable.date < todayKey) return "Pending";
    return DAY_LABELS[nextStartable.dayIndex];
  }, [nextStartable]);

  // Freeform hero data — last run from the recent-30-day window
  // + this week's bucket.
  //
  // PR-F: "This week" must match the actual current calendar
  // week, not "the most recent week with any runs." Previously
  // `weeklyData[weeklyData.length - 1]` returned whichever week
  // last had a run logged — so for users who hadn't run in 10
  // days, it labelled last week's data as "This week." Filter by
  // explicit weekKey match instead.
  const lastRun = runs[0] ?? null;
  const thisWeekKey = localWeekKey(new Date());
  const thisWeek = weeklyData.find((w) => w.week === thisWeekKey) ?? null;

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
      setIntentMode(null);
      return;
    }

    // Run7 Q9 — set visual intent BEFORE the await so the chip +
    // description reflect the user's choice during the in-flight
    // write. The catch block reverts it on failure.
    setIntentMode(newMode);
    setModeChangePending(true);
    try {
      if (newMode === "freeform") {
        // throwOnError so the catch below actually fires on a failed
        // profile write — without it, updateProfile swallows the error,
        // surfaces a generic toast from auth.tsx, and execution falls
        // through to refreshRunSchedule which then writes runDays based
        // on the OLD profile.runMode (state divergence). See Run7 Q9
        // pin in the followups plan.
        await updateProfile({ runMode: "freeform" }, { throwOnError: true });
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
        await updateProfile(
          {
            runMode: "structured",
            ...runTargetWriteFields(target),
          },
          { throwOnError: true },
        );
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
      // updateProfile threw (throwOnError) — profile.runMode is
      // unchanged. Clear the visual-intent override so the chip +
      // description revert to last-saved state per Run7 Q9. Surface
      // the failure inline; the generic auth.tsx toast is suppressed
      // by throwOnError.
      logger.error("[handleModeChange] updateProfile failed", e);
      setIntentMode(null);
      setModeError("Couldn't change mode. Check your connection and try again.");
    } finally {
      setModeChangePending(false);
    }
  }

  // PR-C: skip-recovery-early handler. Calls the dedicated
  // useProgram writer (`skipRecoveryEarly`) which atomically
  // clears `runPlan.phase` + `runPlan.recoveryEndDate` AND flips
  // `runMode` to "structured" so the user immediately gets their
  // normal training shape back. Race is past, recovery is done by
  // user's choice — the cleanest next direction is structured
  // training, which the user can then change via the chip row.
  async function handleSkipRecoveryEarly(): Promise<void> {
    try {
      await skipRecoveryEarly();
    } catch (e) {
      logger.error("[handleSkipRecoveryEarly] failed", e);
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
      await updateProfile(
        {
          runMode: "race_prep",
          raceGoal: { distance: raceDistance, targetDate: raceTargetDate },
        },
        // throwOnError so the catch below fires on a failed write and
        // we surface a single specific toast instead of the generic
        // auth.tsx one. Also short-circuits refreshRunSchedule below
        // — without throwing, a failed runMode write would still let
        // the plan regen run against the OLD runMode. See Run7 Q9.
        { throwOnError: true },
      );
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

  // Chip-selected state — Run7 Q9 visual-intent layering:
  //   1. showRaceForm: race_prep wins (form open from a non-race_prep
  //      mode visually counts as race_prep selection).
  //   2. intentMode: in-flight optimistic state for freeform / structured
  //      — updates immediately on chip tap before the profile write
  //      resolves. Reverts on save failure (handler catch block).
  //   3. currentMode: last-saved profile.runMode.
  const selectedMode: RunMode = showRaceForm
    ? "race_prep"
    : (intentMode ?? currentMode);

  return (
    /* Run7 Q1: outer "Run training" coral container dropped — sections
       separated by vertical spacing alone. Run sub-tab is the contextual
       anchor; no need for a second container chrome around it. */
    <section aria-label="Run training" className="space-y-4">
      {/* Run7 Q6: section label as 10px uppercase a11y h2, RunningNavIcon
          inline left, coral icon + muted-foreground label. */}
      <header className="flex items-center gap-1.5">
        <Footprints
          aria-hidden="true"
          className="w-3.5 h-3.5"
          style={{ color: THEME.running }}
        />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Run training
        </h2>
      </header>

      {/* Run7 Q9: three-pill mode chips. radiogroup/radio roles (was
          aria-pressed), active = coral solid (was brand purple), inactive
          = bg-muted. Visual intent updates immediately via intentMode;
          writes still happen on chip tap (freeform/structured) or via
          the form (race_prep). Reduced-motion users get no scale/transition. */}
      <div className="space-y-2">
        <div role="radiogroup" aria-label="Run mode" className="flex gap-2">
          {(["freeform", "structured", "race_prep"] as const).map((mode) => {
            const isSelected = selectedMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleModeChange(mode)}
                disabled={modeChangePending}
                className={cn(
                  "flex-1 min-h-[44px] px-3 rounded-lg text-xs font-medium",
                  "motion-safe:transition-colors motion-safe:active:scale-[0.97]",
                  isSelected ? "text-white" : "bg-muted text-muted-foreground",
                  modeChangePending && !isSelected && "opacity-40 cursor-not-allowed",
                )}
                style={isSelected ? { backgroundColor: THEME.running } : undefined}
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
        {/* PR-F: reuse this slot for an in-flight "Updating your
            plan…" message. modeChangePending fires from chip tap
            until updateProfile + refreshRunSchedule both resolve.
            Same slot later renders modeError on failure. Three
            states: pending → error → silent. */}
        {modeChangePending ? (
          <p className="text-xs text-muted-foreground">Updating your plan…</p>
        ) : modeError ? (
          <p className="text-xs" style={{ color: THEME.running }} role="alert">
            {modeError}
          </p>
        ) : null}
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

      {/* ── PR-C: Post-race card. State-driven variants:
            inRecovery     → Recovering N days left + Skip-early link
            recoveryEnded  → Recovery complete. What's next? + Set next race / Switch to structured
            noShow         → We marked this as no-show + Log race now / Set next race / Switch to structured
            Legacy elapsed → Race day has passed (fallback for old elapsed
                             races whose recovery already cleared) */}
      {currentMode === "race_prep" && raceGoal && inRecovery && (
        <div
          className="p-3 rounded-xl text-xs"
          style={{
            background: `${THEME.running}10`,
            border: `1px solid ${THEME.running}30`,
            color: "hsl(var(--foreground))",
          }}
        >
          <p className="font-semibold mb-0.5">
            Recovering &mdash; {recoveryDaysLeft} day{recoveryDaysLeft === 1 ? "" : "s"} left
          </p>
          <p style={{ color: "hsl(var(--muted-foreground))" }}>
            Easy runs this week. Templates auto-set to easy_30 until recovery ends.
          </p>
          <button
            type="button"
            onClick={handleSkipRecoveryEarly}
            className="inline-flex items-center gap-0.5 mt-1 text-xs font-semibold active:scale-95"
            style={{ color: THEME.running }}
          >
            Skip recovery early &rsaquo;
          </button>
        </div>
      )}

      {currentMode === "race_prep" && raceGoal && recoveryEnded && (
        <div
          className="p-3 rounded-xl text-xs"
          style={{
            background: `${THEME.running}10`,
            border: `1px solid ${THEME.running}30`,
            color: "hsl(var(--foreground))",
          }}
        >
          <p className="font-semibold mb-0.5">Recovery complete</p>
          <p style={{ color: "hsl(var(--muted-foreground))" }}>What&apos;s next?</p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setShowRaceForm(true)}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              Set next race
            </button>
            <button
              type="button"
              onClick={handleSkipRecoveryEarly}
              className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-medium"
            >
              Switch to structured
            </button>
          </div>
        </div>
      )}

      {currentMode === "race_prep" && raceGoal && isNoShow && (
        <div
          className="p-3 rounded-xl text-xs"
          style={{
            background: "hsl(var(--muted) / 0.5)",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--foreground))",
          }}
        >
          <p className="font-semibold mb-0.5">
            {raceGoal.distance.toUpperCase()} &mdash; {raceGoal.targetDate}
          </p>
          <p style={{ color: "hsl(var(--muted-foreground))" }}>
            We marked this as no-show after 3 days with no log. Log it now if you actually ran.
          </p>
          <div className="flex flex-col gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                if (raceDayRunDay?.id) {
                  haptic();
                  navigate(`/run?scheduledRunId=${encodeURIComponent(raceDayRunDay.id)}`);
                }
              }}
              className="w-full py-2 rounded-lg text-xs font-bold shadow-sm"
              style={{
                background: `linear-gradient(135deg, ${THEME.running}, ${THEME.runningLight})`,
                color: "white",
              }}
            >
              Log race now
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRaceForm(true)}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
              >
                Set next race
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("structured")}
                className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-medium"
              >
                Switch to structured
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legacy elapsed fallback — race date passed, no recovery
          state, no no-show. e.g. a long-ago race where recovery
          already cleared past +7d grace. Keeps the original muted
          banner so users aren't suddenly looking at a startable
          race-prep tab for a race that finished months ago. */}
      {currentMode === "race_prep" && raceGoal && raceElapsed && !inRecovery && !recoveryEnded && !isNoShow && (
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
            {raceGoal.distance.toUpperCase()} on {raceGoal.targetDate}. Switch to structured or set a new race goal via the chip row.
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
              Next · {nextStartableLabel}
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

      {/* Run7 Q2 + Q6: footer is a single muted-gray text-link.
          "Running mode: X" prefix is dropped (the active chip already
          conveys mode). Coral colour is reserved for sport-discipline
          accents — navigation is not one. */}
      <div className="flex justify-end pt-2 border-t border-border/30">
        <button
          type="button"
          onClick={() => onOpenConfigurePlan?.(CONFIGURE_PLAN_RUNNING_STEP)}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-95 px-1 -m-1 rounded-md"
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


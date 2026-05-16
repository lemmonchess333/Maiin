/**
 * Shared date-aware training resolver · PR-0c · spec v7.
 *
 * Home, DayPeekCard, WeekStrip, and Programme TodayTabContent all
 * answer the same question — "what's training for this calendar
 * date?" — but pre-PR-0c each one derived it inline from raw
 * `schedule` / `runDays` / `dayIndex` / `completed`. Those inline
 * derivations had five concrete bugs and disagreed with each other:
 *
 *   1. `runDays.find(r => r.dayIndex === dow)` matches a strip-
 *      future Monday to this-Monday's runDay (date-inheritance bug).
 *   2. `workouts.find(d => !d.completed)` returns the next-incomplete
 *      lift, not today's scheduled one.
 *   3. `weeklyRunDaysTarget ?? weeklyRunsTarget ?? 2` synthesised a
 *      run plan for freeform users (phantom-runs bug). The correct
 *      default — already in scheduleUtils.getWeeklyRunTarget — is 0.
 *   4. `!r.completed` treats skipped runs as startable
 *      (PR-0b-iii fixed the helper; this PR fixes the consumers).
 *   5. Home and Programme Today disagreed on race_no_show /
 *      race_completed_unlinked / legacy-completed docs.
 *
 * This module is the single source of truth: one resolver for one
 * date, returning a fully-resolved view that includes
 * status-aware startability and a guarded date/weekKey-aware
 * runDay match.
 *
 * Resolution priority for runDay:
 *   1. Exact date match (rd.date === dateKey)
 *   2. Current-week weekKey match (rd.weekKey === targetWeekKey
 *      AND rd.dayIndex === targetDow)
 *   3. Legacy guarded fallback (rd.dayIndex === targetDow) — ONLY
 *      when rd lacks both date+weekKey AND the target date is
 *      inside the current generated week. The guard is what
 *      prevents a strip-future Monday from inheriting this
 *      Monday's status.
 *
 * Pure module — types from programTypes, runtime imports only from
 * already-pure helpers (scheduledRunStatus, scheduleUtils,
 * dateHelpers, workoutTemplates). Safe to consume from any UI
 * surface without cycles.
 */

import type {
  ProgramState,
  ScheduledRunDay,
  ScheduledRunStatus,
  WorkoutDay,
} from "@/features/program/programTypes";
import type { UserProfile } from "@/lib/auth";
import type { ScheduleDay, DayType } from "@/lib/scheduleUtils";
import {
  liftIndexForDayOfWeek,
  generateSchedule,
  getWeeklyRunTarget,
} from "@/lib/scheduleUtils";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
  addLocalDays,
} from "@/lib/dateHelpers";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import {
  getScheduledRunStatus,
  isScheduledRunStartable,
  isScheduledRunTerminal,
  isScheduledRunReconciliation,
  isScheduledRunCompleted,
} from "@/lib/scheduledRunStatus";

/** Lift-slot status projected from `workout.completed` / `workout.skipped`.
 *  `none` covers "today isn't a lift+both slot" AND "today is a lift
 *  slot but the index points past the end of workouts[]" (legacy
 *  plan drift). Either way the UI shouldn't render a lift card. */
export type LiftSlotStatus = "none" | "planned" | "completed" | "skipped";

export interface ResolvedLift {
  /** Index into `programState.workouts[]`, or null when today isn't a
   *  lift/both slot or the schedule has drifted past the workouts
   *  array length. */
  index: number | null;
  workout: WorkoutDay | null;
  status: LiftSlotStatus;
  isTerminal: boolean;
  isStartable: boolean;
}

export interface ResolvedRun {
  runDay: ScheduledRunDay | null;
  template: RunTemplate | null;
  /** `"none"` only when there's no matching runDay (no plan, freeform
   *  user, or guarded-fallback gate fired). When a runDay matches,
   *  this is the result of `getScheduledRunStatus` — so a missing-
   *  status legacy doc still gets a sensible projection. */
  status: ScheduledRunStatus | "none";
  isTerminal: boolean;
  isStartable: boolean;
  isReconciliation: boolean;
  isCompleted: boolean;
  /** Populated only when `isStartable`. Includes `?template=` and
   *  `?scheduledRunId=` when the matched runDay has them. */
  startUrl: string | null;
}

export interface ResolvedTrainingDay {
  dateKey: string;
  dayIndex: number;
  scheduleType: DayType;
  isBothDay: boolean;
  lift: ResolvedLift;
  run: ResolvedRun;
}

/**
 * Pick the right `ScheduledRunDay` for a calendar date. Date/weekKey-
 * aware, with a legacy fallback gated by the current generated
 * week so a future strip Monday never matches this-Monday's runDay.
 *
 * Inputs:
 *   - `dateKey` — local "YYYY-MM-DD" of the target date.
 *   - `runDays` — `programState.runDays` (or undefined).
 *   - `currentWeekKey` — the `localWeekKey` of today; the anchor
 *     that gates the legacy fallback. Callers should pass
 *     `localWeekKey(new Date())` once and reuse for every day in
 *     a window so a 7-day strip doesn't leak this-week status
 *     into next week.
 */
export function resolveRunDayForDate(
  dateKey: string,
  runDays: ScheduledRunDay[] | undefined,
  currentWeekKey: string,
): ScheduledRunDay | null {
  if (!runDays || runDays.length === 0) return null;
  const targetDate = parseLocalDate(dateKey);
  const targetWeekKey = localWeekKey(targetDate);
  const targetDow = targetDate.getDay();

  // Priority 1 — exact calendar-date match. Always correct for V2
  // docs (post-PR-0b-i migration sets `date` on every runDay).
  const exact = runDays.find((rd) => rd.date === dateKey);
  if (exact) return exact;

  // Priority 2 — same-week weekKey + dayIndex. Catches V2-shaped
  // docs that have `weekKey` but no `date` (mid-migration).
  const byWeekKey = runDays.find(
    (rd) => rd.weekKey === targetWeekKey && rd.dayIndex === targetDow,
  );
  if (byWeekKey) return byWeekKey;

  // Priority 3 — legacy guarded fallback. Only when the runDay
  // genuinely has no date/weekKey AND the target date falls
  // inside the current generated week. Anything outside this
  // window returns null rather than borrowing this-week's status.
  if (targetWeekKey !== currentWeekKey) return null;
  const legacy = runDays.find(
    (rd) => !rd.date && !rd.weekKey && rd.dayIndex === targetDow,
  );
  return legacy ?? null;
}

/**
 * Resolve a full training-day view for a calendar date — schedule
 * type, lift slot (with index into programState.workouts[]), run
 * slot (with status helpers + a `startUrl` when startable). Pure;
 * no React, no hooks.
 *
 *   - `currentWeekKey` is passed explicitly so a `resolveTrainingWindow`
 *     caller can anchor every day in the window to today's week
 *     (the gate the legacy-fallback bug needs).
 *   - When `profile.weekSchedule` is missing/invalid, the resolver
 *     synthesises one via `generateSchedule(weeklyWorkoutsTarget,
 *     getWeeklyRunTarget(profile))`. Crucially `getWeeklyRunTarget`
 *     returns 0 for unset users — the phantom-runs default of 2
 *     that Home.tsx had is gone.
 */
export function resolveTrainingDayForDate(args: {
  dateKey: string;
  profile: UserProfile | null;
  programState: ProgramState | null;
  currentWeekKey: string;
}): ResolvedTrainingDay {
  const { dateKey, profile, programState, currentWeekKey } = args;
  const dayIndex = parseLocalDate(dateKey).getDay();

  const schedule: ScheduleDay[] =
    profile?.weekSchedule && profile.weekSchedule.length === 7
      ? profile.weekSchedule
      : generateSchedule(
          profile?.weeklyWorkoutsTarget ?? 3,
          getWeeklyRunTarget(profile),
        );
  const scheduleType: DayType =
    schedule.find((s) => s.day === dayIndex)?.type ?? "rest";
  const isBothDay = scheduleType === "both";

  // ── Lift resolution ──────────────────────────────────────────────
  const liftIndex =
    scheduleType === "lift" || scheduleType === "both"
      ? liftIndexForDayOfWeek(schedule, dayIndex)
      : -1;
  const workout =
    liftIndex >= 0 && programState?.workouts?.[liftIndex]
      ? programState.workouts[liftIndex]
      : null;
  let liftStatus: LiftSlotStatus = "none";
  if (workout) {
    if (workout.completed) liftStatus = "completed";
    else if (workout.skipped) liftStatus = "skipped";
    else liftStatus = "planned";
  }
  const lift: ResolvedLift = {
    index: liftIndex >= 0 ? liftIndex : null,
    workout,
    status: liftStatus,
    isTerminal: liftStatus === "completed" || liftStatus === "skipped",
    isStartable: liftStatus === "planned",
  };

  // ── Run resolution ───────────────────────────────────────────────
  const runDay = resolveRunDayForDate(
    dateKey,
    programState?.runDays,
    currentWeekKey,
  );
  let run: ResolvedRun;
  if (!runDay) {
    run = {
      runDay: null,
      template: null,
      status: "none",
      isTerminal: false,
      isStartable: false,
      isReconciliation: false,
      isCompleted: false,
      startUrl: null,
    };
  } else {
    const status = getScheduledRunStatus(runDay);
    const template =
      RUN_TEMPLATES.find(
        (t) => t.id === (runDay.userOverride || runDay.templateId),
      ) ?? null;
    const startable = isScheduledRunStartable(status);
    const params: string[] = [];
    if (template) params.push("template=" + template.id);
    if (runDay.id) params.push("scheduledRunId=" + encodeURIComponent(runDay.id));
    run = {
      runDay,
      template,
      status,
      isTerminal: isScheduledRunTerminal(status),
      isStartable: startable,
      isReconciliation: isScheduledRunReconciliation(status),
      isCompleted: isScheduledRunCompleted(status),
      startUrl: startable
        ? "/run" + (params.length ? "?" + params.join("&") : "")
        : null,
    };
  }

  return { dateKey, dayIndex, scheduleType, isBothDay, lift, run };
}

/**
 * Resolve a window of consecutive training days starting at
 * `startDate`. Used by the WeekStrip to render its rolling 7-day
 * forward view.
 *
 * `currentWeekKey` is captured once from `startDate` and shared by
 * every resolved day in the window. This is the gate that prevents
 * the legacy-fallback path from leaking this-week status into a
 * future strip date.
 */
export function resolveTrainingWindow(args: {
  startDate: Date;
  days: number;
  profile: UserProfile | null;
  programState: ProgramState | null;
}): ResolvedTrainingDay[] {
  const currentWeekKey = localWeekKey(args.startDate);
  const out: ResolvedTrainingDay[] = [];
  for (let i = 0; i < args.days; i++) {
    const d = addLocalDays(args.startDate, i);
    const dateKey = localDateString(d);
    out.push(
      resolveTrainingDayForDate({
        dateKey,
        profile: args.profile,
        programState: args.programState,
        currentWeekKey,
      }),
    );
  }
  return out;
}

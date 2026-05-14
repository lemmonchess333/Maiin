/**
 * Shape-repair migrations for ProgramState + UserProfile · P0-A · spec v7.
 *
 * CRITICAL: these helpers REPAIR SHAPE — they never regenerate plans.
 * Full plan regeneration is reserved for user-initiated Configure Plan
 * (via `planBuilder()`). Lazy migration on read must preserve every
 * existing field; only ADD missing fields with sensible defaults.
 *
 * Why this matters: an existing TestFlight user has a programState
 * with `runDays` lacking `id`, `date`, `weekKey`, `status`. If we ran
 * `planBuilder()` to "migrate" them, we would regenerate `workouts`
 * and `runDays` from scratch — destroying any customizations
 * (exercise swaps, weight progressions, completed-but-not-yet-synced
 * sessions) the user had made between onboarding and the migration.
 *
 * Migration scope (P0-A):
 *   - `migrateProgramState(state, profile, today)` — adds missing
 *     id/date/weekKey/status to existing runDays in place. Idempotent.
 *   - `backfillWeekScheduleIfMissing(profile)` — when
 *     `profile.weekSchedule` is absent or stale, derives a 7-day
 *     structure from existing `weeklyWorkoutsTarget` +
 *     `weeklyRunDaysTarget` via `generateSchedule()`. Returns a patch
 *     object (or null if no work needed) — caller persists it.
 *
 * Out of scope (handled in later phases):
 *   - Generating `workouts` (existing onboarding flow already does)
 *   - Generating `runDays` from scratch (planBuilder in P0-C)
 *   - Eager Cloud Function migration (lazy on read is the v1 strategy)
 */

import type { ProgramState, ScheduledRunDay, ScheduledRunStatus } from "./programTypes";
import { CURRENT_PROGRAM_SCHEMA_VERSION, CURRENT_WEEKSCHEDULE_VERSION } from "./programTypes";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  generateScheduledRunId,
  localDateString,
  localWeekKey,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";

/**
 * Minimal profile shape needed for backfill. Avoids importing the
 * full UserProfile type — keeps this module decoupled from auth.tsx.
 */
interface ProfileLike {
  weekSchedule?: { day: number; type: "lift" | "run" | "both" | "rest" }[];
  weekScheduleVersion?: number;
  weeklyWorkoutsTarget?: number;
  weeklyRunDaysTarget?: number;
  weeklyRunsTarget?: number;
}

/* ─── ScheduledRunDay shape repair ──────────────────────────────── */

/**
 * Bring a legacy `ScheduledRunDay` up to v2 shape without changing
 * its semantics. Adds:
 *   - `id` — stable scheduledRunId derived from weekKey + dayIndex + templateId
 *   - `date` — derived from weekStart + dayIndex (best-effort)
 *   - `weekKey` — derived from week-start date
 *   - `status` — derived from legacy `completed` boolean
 *
 * Idempotent: if all v2 fields are already present, returns the
 * input unchanged (referentially or as a structural no-op).
 */
function migrateScheduledRunDay(
  rd: ScheduledRunDay,
  weekStartDate: Date,
): ScheduledRunDay {
  // Already at v2 — no work
  if (rd.id && rd.date && rd.weekKey && rd.status) {
    return rd;
  }

  const weekKey = rd.weekKey ?? localWeekKey(weekStartDate);
  const date =
    rd.date ?? localDateString(addLocalDays(weekStartDate, rd.dayIndex));
  const id = rd.id ?? generateScheduledRunId({ dayIndex: rd.dayIndex, templateId: rd.templateId }, weekKey);
  // Derive status from legacy `completed`. We use `completed_exact` as
  // the migration default because we can't distinguish exact-match
  // from modified completions post-hoc. The status only matters going
  // forward; existing completed runs don't need reconciliation.
  const status: ScheduledRunStatus =
    rd.status ?? (rd.completed ? "completed_exact" : "planned");

  return {
    ...rd,
    id,
    date,
    weekKey,
    status,
  };
}

/**
 * Repair a ProgramState's shape to current schema version without
 * regenerating any plan content. Safe to call on every read.
 *
 * @param state - existing program state (possibly legacy)
 * @param weekStart - local-date "YYYY-MM-DD" representing the
 *   Sunday of the week this state's runDays belong to. Used to
 *   derive each `runDays[i].date` from its `dayIndex`. If the
 *   caller doesn't know the week start, pass today and accept
 *   that dates will be approximate (the user will see a stale
 *   week but no data is lost; planBuilder will produce correct
 *   dates on the next plan rebuild).
 */
export function migrateProgramState(
  state: ProgramState,
  weekStart: string = localDateString(),
): ProgramState {
  // Already at current version — no work
  if (state.programSchemaVersion === CURRENT_PROGRAM_SCHEMA_VERSION) {
    return state;
  }

  const weekStartDate = parseLocalDate(weekStart);
  const migratedRunDays = (state.runDays ?? []).map((rd) =>
    migrateScheduledRunDay(rd, weekStartDate),
  );

  return {
    ...state,
    runDays: migratedRunDays,
    programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
  };
}

/* ─── weekSchedule backfill ─────────────────────────────────────── */

/**
 * If `profile.weekSchedule` is missing or its schema version is
 * stale, derive a fresh 7-day schedule from the user's existing
 * targets (`weeklyWorkoutsTarget` for lifts, `weeklyRunDaysTarget`
 * for runs). Returns a patch object the caller should persist via
 * `updateProfile`, or `null` if no work is needed.
 *
 * This is shape-repair only — it does NOT call `planBuilder()` and
 * does NOT regenerate `programState.runDays`. The user keeps every
 * existing scheduled run; we just give Home/Programme a concrete
 * weekly structure to render against.
 */
export function backfillWeekScheduleIfMissing(
  profile: ProfileLike,
): Partial<ProfileLike> | null {
  // Already at current version with a valid 7-entry schedule — no work
  if (
    profile.weekScheduleVersion === CURRENT_WEEKSCHEDULE_VERSION &&
    profile.weekSchedule &&
    profile.weekSchedule.length === 7
  ) {
    return null;
  }

  // Resolve the run-day target via the existing two-field convention
  // (matches scheduleUtils.getWeeklyRunTarget logic).
  const liftDays = profile.weeklyWorkoutsTarget ?? 3;
  const runDays =
    profile.weeklyRunDaysTarget ?? profile.weeklyRunsTarget ?? 0;

  const weekSchedule = generateSchedule(liftDays, runDays);

  return {
    weekSchedule,
    weekScheduleVersion: CURRENT_WEEKSCHEDULE_VERSION,
  };
}

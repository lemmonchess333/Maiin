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
import { generateSchedule, isValidWeekSchedule } from "@/lib/scheduleUtils";
import {
  generateScheduledRunId,
  localDateString,
  localWeekKey,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { isScheduledRunCompleted } from "@/lib/scheduledRunStatus";

// PR-0b-iii: COMPLETED_STATUSES + isScheduledRunCompleted moved to
// `src/lib/scheduledRunStatus.ts` so every consumer shares one
// source of truth. The semantics here are unchanged.

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
 * Bring a legacy `ScheduledRunDay` up to v2 shape AND repair
 * semantic inconsistencies in place. Two stages:
 *
 * **Shape repair (adds missing fields):**
 *   - `id` — stable scheduledRunId from weekKey + dayIndex + templateId
 *   - `date` — derived from weekStart + dayIndex (best-effort)
 *   - `weekKey` — derived from week-start date
 *   - `status` — derived from legacy `completed` boolean
 *
 * **Semantic repair (aligns `completed` ↔ `status`):**
 *   - `status` is authoritative. `completed` is rederived from it
 *     post-shape-repair so an inconsistent legacy doc (e.g.
 *     `completed: false` + `status: "completed_exact"`) ends up
 *     with `completed: true`.
 *   - The terminal-completed set is `completed_exact` /
 *     `completed_modified` / `completed_late`. `skipped`,
 *     `race_no_show`, and `race_completed_unlinked` all map to
 *     `completed: false` (race_completed_unlinked is "pending link",
 *     not done).
 *
 * **Idempotency:** if the input is already shape-complete AND
 * semantically consistent, the input reference is returned
 * unchanged. The caller's deep-equality persist guard then sees
 * no diff and skips a Firestore write.
 */
function migrateScheduledRunDay(
  rd: ScheduledRunDay,
  weekStartDate: Date,
): ScheduledRunDay {
  // ── Shape repair (fill missing fields) ──
  const weekKey = rd.weekKey ?? localWeekKey(weekStartDate);
  const date = rd.date ?? localDateString(addLocalDays(weekStartDate, rd.dayIndex));
  const id =
    rd.id ?? generateScheduledRunId({ dayIndex: rd.dayIndex, templateId: rd.templateId }, weekKey);

  // ── Status repair ──
  // Default: planned. Promote to completed_exact when legacy
  // `completed: true` but no status — that's the only signal we
  // have for "this happened". `completed_exact` is the safe
  // default (rather than completed_modified) because we can't
  // know post-hoc whether the user did the planned template;
  // pinning to exact preserves the on-plan rate at migration.
  const status: ScheduledRunStatus =
    rd.status ?? (rd.completed ? "completed_exact" : "planned");

  // ── Semantic repair: completed ↔ status alignment ──
  // status wins. After this step the two fields can't disagree.
  const completed = isScheduledRunCompleted(status);

  // ── Idempotency short-circuit ──
  // If we'd produce exactly what we received, return the input
  // reference unchanged. Lets `migrateProgramState` skip cloning
  // the runDays array entirely when every entry is already clean.
  if (
    rd.id === id &&
    rd.date === date &&
    rd.weekKey === weekKey &&
    rd.status === status &&
    rd.completed === completed
  ) {
    return rd;
  }

  return { ...rd, id, date, weekKey, status, completed };
}

/**
 * Repair a ProgramState's shape to current schema version without
 * regenerating any plan content. Safe to call on every read.
 *
 * **Shape-aware, not version-aware.** A doc with the current
 * schema version but V1-shaped runDays (e.g. missing `id`) STILL
 * triggers per-runDay repair. The version field alone is no
 * longer a sufficient "this is clean" signal — `useProgram.ts`'s
 * V1 writers can mark a doc as current-schema while writing
 * V1-shape runDays. Defending against that drift is exactly why
 * this helper exists.
 *
 * **Idempotent + zero-cost on clean input.** When every runDay
 * passes `migrateScheduledRunDay`'s identity short-circuit AND
 * the schema version is already current, the input state
 * reference is returned unchanged. The caller's deep-equality
 * persist guard then skips the Firestore write.
 *
 * **Never regenerates `workouts`, `weekHistory`, `runPlan`, or
 * any other field outside `runDays` + `programSchemaVersion`.**
 * Customisations the user made (exercise swaps, weight
 * progressions, recent completions) survive untouched.
 *
 * @param state - existing program state (possibly legacy or
 *   internally inconsistent)
 * @param weekStart - local-date "YYYY-MM-DD" representing any
 *   date in the week this state's runDays belong to. Defensively
 *   normalised to that week's Sunday — callers can pass today
 *   and the helper will resolve the right week. Defaults to
 *   `localWeekKey()` (this week's Sunday).
 */
export function migrateProgramState(
  state: ProgramState,
  weekStart: string = localWeekKey(),
): ProgramState {
  // Defensive normalisation: callers may pass today's date
  // (mid-week). We always want the Sunday on or before so derived
  // run-day dates land in the user's current calendar week. Pre-
  // PR-0b-i the default was `localDateString()` which produced
  // mid-week weekKey values for any user opening the app on a
  // non-Sunday.
  const normalizedWeekStart = localWeekKey(parseLocalDate(weekStart));
  const weekStartDate = parseLocalDate(normalizedWeekStart);

  const runDays = state.runDays ?? [];
  const migratedRunDays = runDays.map((rd) =>
    migrateScheduledRunDay(rd, weekStartDate),
  );

  // Reference-equality check on every runDay — true only when
  // every entry hit `migrateScheduledRunDay`'s idempotent
  // short-circuit. Combined with the version check below, this is
  // how we keep the returned reference === input when nothing
  // needs repair.
  const runDaysChanged = migratedRunDays.some((rd, i) => rd !== runDays[i]);
  const versionChanged = state.programSchemaVersion !== CURRENT_PROGRAM_SCHEMA_VERSION;

  if (!runDaysChanged && !versionChanged) {
    return state;
  }

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
  // Already at current version with a structurally valid schedule
  // — no work. `isValidWeekSchedule` is stricter than
  // `length === 7`: it also requires days 0..6 each present once
  // and types within the enum, so a 7-entry array with duplicate
  // days or a stale "long" type still triggers a regeneration.
  if (
    profile.weekScheduleVersion === CURRENT_WEEKSCHEDULE_VERSION &&
    isValidWeekSchedule(profile.weekSchedule)
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

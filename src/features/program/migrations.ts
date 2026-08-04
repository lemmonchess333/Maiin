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

import type {
  LegacyScheduledRunStatus,
  ProgramExercise,
  ProgramState,
  ScheduledRunDay,
  ScheduledRunStatus,
  WorkoutDay,
} from "./programTypes";
import {
  CURRENT_PROGRAM_SCHEMA_VERSION,
  CURRENT_WEEKSCHEDULE_VERSION,
  generateInstanceId,
} from "./programTypes";
import { primaryJudgementForExercise } from "./volumeModel";
import { exerciseDisplayName } from "./variationBank";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import { generateSchedule, isValidWeekSchedule } from "@/lib/scheduleUtils";
import {
  generateScheduledRunId,
  localDateString,
  localWeekKey,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { isScheduledRunCompleted } from "@/lib/scheduledRunStatus";
import { repUnitForExerciseId } from "./repUnits";

/**
 * A MAIN lift's minimum set anchor — mirrors volumeModel's
 * RECONCILE_MAIN_FLOOR, which states the reasoning: the progression anchor
 * needs enough exposures to progress on, and 3 is the lowest main-set
 * prescription anywhere in the corpus.
 */
const MAIN_SET_ANCHOR_FLOOR = 3;

/**
 * One-time coverage backfill (schema v3, 2026-08-04).
 *
 * The generator gained pinned lateral-raise and calf slots earlier today, but
 * an EXISTING plan takes planBuilder's preserve branch and never receives
 * generator improvements — so the operator's live week-11 programme carries
 * zero direct side-delt and zero direct calf work, and would have carried it
 * forever. The weekly volume card was changed to SAY so rather than hide it,
 * which is the right default; this is the repair the owner then asked for.
 *
 * Version-gated, and that gating is the whole design. It runs exactly once
 * per document, so it fixes plans built before the slots existed WITHOUT
 * becoming a pass that re-adds an exercise every time someone deletes it. A
 * user who removes their calf raises after this migration keeps them removed
 * — which is precisely the objection that made a silent, always-on backfill
 * the wrong answer.
 *
 * Coverage is judged with `primaryJudgementForExercise`, the same attribution
 * the volume card uses, so the backfill and the card can never disagree about
 * whether a group is trained. Slots are APPENDED (never inserted), because
 * accessory state carry is positional — `carryExistingAccessories` matches on
 * (dayIndex, exIndex, category), so inserting mid-day would shift every later
 * slot onto the wrong lift.
 */
function backfillMissingCoverage(workouts: WorkoutDay[]): WorkoutDay[] {
  const trained = (muscle: string): boolean =>
    workouts.some((d) =>
      d.exercises.some(
        (ex) => (ex.sets ?? 0) > 0 && primaryJudgementForExercise(ex) === muscle
      )
    );

  const named = (
    exerciseId: string,
    sets: number,
    reps: number,
    weight: number
  ): ProgramExercise => ({
    name: exerciseDisplayName(exerciseId),
    exerciseId,
    instanceId: generateInstanceId(),
    movementCategory: inferMovementCategory(
      exerciseDisplayName(exerciseId),
      exerciseId
    ),
    sets,
    reps,
    baseReps: reps,
    baseSets: sets,
    weight,
    progressionType: "double",
    lastSuccessfulWeight: weight,
    lastAttemptedWeight: weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    isAccessory: true,
  });

  // Which days can host what: calves belong on a day that already trains
  // legs, side delts on a day that already presses overhead. Falling back to
  // "any day" would put a calf raise on a pull day, which is worse than the
  // gap it repairs.
  const legDays: number[] = [];
  const pressDays: number[] = [];
  workouts.forEach((d, i) => {
    const cats = d.exercises.map((e) => e.movementCategory);
    if (cats.includes("knee_dominant") || cats.includes("hip_dominant")) {
      legDays.push(i);
    }
    if (cats.includes("vertical_push")) pressDays.push(i);
  });

  const additions = new Map<number, ProgramExercise[]>();
  const add = (dayIdx: number, ex: ProgramExercise) => {
    const list = additions.get(dayIdx) ?? [];
    list.push(ex);
    additions.set(dayIdx, list);
  };

  if (!trained("Calves") && legDays.length > 0) {
    // Standing first (gastrocnemius), seated on a second leg day if the week
    // has one — the same standing/seated split the builders author.
    add(legDays[0], named("standing-calf-raise", 3, 12, 40));
    if (legDays.length > 1) {
      add(legDays[1], named("seated-calf-raise", 3, 15, 30));
    }
  }

  if (!trained("SideDelts") && pressDays.length > 0) {
    add(pressDays[0], named("lateral-raise", 3, 12, 8));
  }

  if (additions.size === 0) return workouts;

  return workouts.map((day, i) => {
    const extra = additions.get(i);
    return extra ? { ...day, exercises: [...day.exercises, ...extra] } : day;
  });
}

/**
 * Repair the permanent decay left by the pre-2026-07-28 deload.
 *
 * The old `applyDeload` cut `sets: max(2, sets - 1)` AND `weight: weight *
 * 0.85` on every 4th week, wrote the result straight to stored state, and had
 * nothing to restore either from — no `baseSets` anchor, no
 * `preDeloadWeight` stash. So each mesocycle permanently shrank the plan on
 * both axes, and the damage compounded.
 *
 * Replayed over a week-11 user it reproduces the operator's screenshots
 * exactly: Barbell Row 4x60kg -> (wk4) 3x50kg -> (wk8) 2x42.5kg, and Cable
 * Crunch 3x15kg -> 2x12.5kg -> 2x10kg. Reps are untouched by that recipe,
 * which is why 8 and 15 survived. The user never changed what they put on the
 * bar — "Last: 60 kg x 12" — only the app's number decayed underneath them.
 *
 * `fa19724a` fixed the engine forward-only. Worse, its lazy anchor
 * (`ex.baseSets ?? ex.sets`) then CAPTURED the already-decayed value as the
 * permanent anchor, so `applyWeeklyVolumeShape` now re-pins the shrunken
 * number every week. Without this pass the damage is not merely unrepaired,
 * it is cemented.
 *
 * The repair is deliberately conservative and idempotent:
 *
 *   LOAD — restored to `lastSuccessfulWeight`, which is the honest handle:
 *     `applyProgression` writes it from the weight the user ACTUALLY lifted,
 *     and `applyDeload` spreads `...ex` so it was never cut. `Math.max` means
 *     this can only ever raise a load, never lower one, and re-running is a
 *     no-op. If a user genuinely trains lighter now, their successes have
 *     already moved `lastSuccessfulWeight` down with them, so nothing is
 *     forced back up.
 *
 *   SETS — only MAINS, and only up to the main floor. The true original set
 *     count is NOT recoverable from programState (nothing stored it before
 *     the anchor existed), so this does not pretend to restore it: it lifts
 *     mains off the deload floor of 2 to the codebase's own stated minimum of
 *     3 and stamps that as `baseSets` so the lazy fallback can never
 *     re-capture a decayed value. Accessories legitimately sit at 2, so they
 *     keep whatever anchor they have. A full return to the generator's
 *     prescription needs a regenerate, which is the user's call.
 */
function repairDeloadDecay(ex: ProgramExercise): ProgramExercise {
  const anchor = ex.baseSets ?? ex.sets;
  const isMain = ex.isAccessory !== true;
  const repairedAnchor = isMain
    ? Math.max(anchor, MAIN_SET_ANCHOR_FLOOR)
    : anchor;
  const repairedWeight = Math.max(ex.weight ?? 0, ex.lastSuccessfulWeight ?? 0);

  const anchorMoved = repairedAnchor !== anchor;
  const weightMoved = repairedWeight !== (ex.weight ?? 0);
  const anchorMissing = ex.baseSets === undefined;
  if (!anchorMoved && !weightMoved && !anchorMissing) return ex;

  return {
    ...ex,
    weight: repairedWeight,
    baseSets: repairedAnchor,
    // Raise the CURRENT week too when the anchor moved, so the repair is
    // visible now rather than after the next rollover recomputes from it.
    sets: anchorMoved ? Math.max(ex.sets, repairedAnchor) : ex.sets,
  };
}

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
  weekStartDate: Date
): ScheduledRunDay {
  // ── Shape repair (fill missing fields) ──
  const weekKey = rd.weekKey ?? localWeekKey(weekStartDate);
  const date =
    rd.date ?? localDateString(addLocalDays(weekStartDate, rd.dayIndex));
  const id =
    rd.id ??
    generateScheduledRunId(
      { dayIndex: rd.dayIndex, templateId: rd.templateId },
      weekKey
    );

  // ── Status repair ──
  // Default: planned. Promote to completed_exact when legacy
  // `completed: true` but no status — that's the only signal we
  // have for "this happened". `completed_exact` is the safe
  // default (rather than completed_modified) because we can't
  // know post-hoc whether the user did the planned template;
  // pinning to exact preserves the on-plan rate at migration.
  // PR-J Q8 P102: type accepts both unions — the migration writes
  // either a fresh "planned" or the legacy "completed_exact"
  // depending on the pre-status `completed` boolean.
  const status: ScheduledRunStatus | LegacyScheduledRunStatus =
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
 * **Never regenerates programme content.** It repairs run-day shape and adds
 * a missing duration unit to known timed-hold exercises; every authored set,
 * load, history entry and customisation otherwise survives untouched.
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
  weekStart: string = localWeekKey()
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
    migrateScheduledRunDay(rd, weekStartDate)
  );

  // Reference-equality check on every runDay — true only when
  // every entry hit `migrateScheduledRunDay`'s idempotent
  // short-circuit. Combined with the version check below, this is
  // how we keep the returned reference === input when nothing
  // needs repair.
  const runDaysChanged = migratedRunDays.some((rd, i) => rd !== runDays[i]);
  let workoutsChanged = false;
  const migratedWorkouts = state.workouts.map((day) => {
    let dayChanged = false;
    const exercises = day.exercises.map((exercise) => {
      let next = exercise;

      if (next.repUnit === undefined) {
        const repUnit = repUnitForExerciseId(next.exerciseId);
        if (repUnit) next = { ...next, repUnit };
      }

      next = repairDeloadDecay(next);

      if (next !== exercise) {
        workoutsChanged = true;
        dayChanged = true;
      }
      return next;
    });
    return dayChanged ? { ...day, exercises } : day;
  });
  const versionChanged =
    state.programSchemaVersion !== CURRENT_PROGRAM_SCHEMA_VERSION;

  // Coverage backfill — v3, one-shot. Gated on the version rather than on
  // "is the group missing", so it repairs plans predating the slots without
  // ever fighting a user who deletes them later.
  const backfilled = versionChanged
    ? backfillMissingCoverage(migratedWorkouts)
    : migratedWorkouts;
  const coverageChanged = backfilled !== migratedWorkouts;

  // D1: seed the lift-week anchor to the CURRENT week, never to the epoch.
  //
  // Every document written before D1 lacks `liftWeekKey`, and the rollover
  // treats "anchor older than this week" as stale. If absent read as
  // infinitely stale, the first app-open after this ships would roll a
  // returning user forward by the full iteration cap — twelve weeks, three
  // deloads, three mesocycle rotations — as an artefact of the migration
  // rather than anything they did. Seeding to today means the anchor starts
  // correct and the very next real calendar week is the first rollover.
  //
  // Deliberately does NOT re-seed an anchor that already exists: that would
  // silently cancel a genuine multi-week absence.
  const liftWeekKeyChanged = state.liftWeekKey === undefined;

  if (
    !runDaysChanged &&
    !workoutsChanged &&
    !coverageChanged &&
    !versionChanged &&
    !liftWeekKeyChanged
  ) {
    return state;
  }

  return {
    ...state,
    runDays: migratedRunDays,
    ...(workoutsChanged || coverageChanged ? { workouts: backfilled } : {}),
    ...(liftWeekKeyChanged ? { liftWeekKey: normalizedWeekStart } : {}),
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
  profile: ProfileLike
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
  const runDays = profile.weeklyRunDaysTarget ?? profile.weeklyRunsTarget ?? 0;

  const weekSchedule = generateSchedule(liftDays, runDays);

  return {
    weekSchedule,
    weekScheduleVersion: CURRENT_WEEKSCHEDULE_VERSION,
  };
}

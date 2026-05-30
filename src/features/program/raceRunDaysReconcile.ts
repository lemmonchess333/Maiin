/**
 * Race-prep runDays read-time reconciliation (RunWk1 follow-up).
 *
 * PURE + ADDITIVE. This module is unwired by design — it ships the tested
 * logic first; the load-effect wiring is a separate, emulator-gated change
 * (the race-prep state machine in `useProgram`'s load effect is the
 * lock-flagged "workflow-class, verify with the emulator" surface, and a
 * prior load-effect attempt — Run9 3a-iii — was reverted for racing the
 * existing auto-rollover effect).
 *
 * ── The bug this targets ─────────────────────────────────────────────
 * The scheduler is correct: `generateRacePlanV2` only ever places a race
 * template (`*_race`) in the FINAL week. But a `programState` doc written
 * by an older/buggy build can carry `runDays` that DISAGREE with their own
 * `runPlan.currentWeek` — e.g. race-week days (with past dates) stored
 * while `currentWeek` reads 0. The cockpit then renders a nonsensical
 * "Marathon Race · Start run" in Base week 1. Nothing on the read path
 * cross-checks `runDays` against the current week, and the shape migration
 * deliberately never regenerates scheduler-owned content.
 *
 * Race-prep `runDays` are 100% scheduler-derived (unlike `workouts`, which
 * hold user customisation), so regenerating them from the canonical
 * `raceGoal` + today is SAFE and loses nothing the user authored.
 *
 * ── What "stale" means here ──────────────────────────────────────────
 * For an active race plan, the stored `runDays` are stale when EITHER:
 *   (a) ANCHOR DRIFT — `runDays[0].weekKey !== thisWeekKey` (the days were
 *       generated for a different week and never rolled forward), OR
 *   (b) PHASE/TEMPLATE MISMATCH — the stored week contains a race-template
 *       day but the fresh today-anchored generation for the same week does
 *       NOT (i.e. the race leaked into a non-race week) — or vice-versa.
 *
 * `(a)` is the common cause; `(b)` is the belt-and-braces catch for a doc
 * whose `weekKey` happens to look current but whose content is wrong.
 *
 * The reconciliation does NOT touch completion: terminal status +
 * manualCompletions are carried across the regen by the caller via
 * `regenerateRacePlan`'s existing `prior`/carry machinery (the claim-map
 * matches saved runs by date+bucket, so organic completions survive
 * automatically). This module only DECIDES staleness + recomputes the
 * honest week index; the caller performs the carry-aware regen.
 */

import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  generateRacePlanV2,
  getRaceMinWeeks,
} from "@/features/program/runScheduler";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";

type RaceDistance = "5k" | "10k" | "half" | "marathon";

/** True when this runDay resolves to a race-type template. Mirrors the
 *  canonical id-agnostic gate (`type === "race"`), never `templateId ===
 *  "race"` (real ids are `5k_race` … `marathon_race`). */
function isRaceRunDay(rd: ScheduledRunDay): boolean {
  const id = rd.userOverride || rd.templateId;
  return RUN_TEMPLATES.find((t) => t.id === id)?.type === "race";
}

export interface RaceRunDaysStaleArgs {
  /** Stored `programState.runDays`. */
  runDays: ScheduledRunDay[] | undefined;
  /** Canonical race goal (from `profile.raceGoal` / `runPlan.raceGoal`). */
  raceGoal: { distance: string; targetDate: string } | null | undefined;
  /** User weekly schedule — drives the fresh generation comparison. */
  weekSchedule: ScheduleDay[];
  /** Runs-per-week target. */
  weeklyRunDays: number;
  /** Local "YYYY-MM-DD" for today (injected for determinism). */
  todayKey: string;
}

/**
 * Decide whether an active race plan's stored `runDays` are stale and need
 * regenerating for the current week. Pure — no Firestore, no `new Date()`.
 *
 * Returns false (not stale) when there's no race goal, no runDays, or the
 * stored week already matches a fresh today-anchored generation.
 */
export function areRaceRunDaysStale(args: RaceRunDaysStaleArgs): boolean {
  const { runDays, raceGoal, weekSchedule, weeklyRunDays, todayKey } = args;
  if (!raceGoal) return false;
  if (!runDays || runDays.length === 0) return false;

  const thisWeekKey = localWeekKey(parseLocalDate(todayKey));

  // (a) Anchor drift — the cheap, common signal. runDays were generated
  // for a week other than the current one and never rolled forward.
  const storedWeekKey = runDays[0]?.weekKey;
  if (storedWeekKey && storedWeekKey !== thisWeekKey) return true;

  // (b) Phase/template mismatch — generate THIS week fresh and compare the
  // race-template presence. If the stored week and the fresh week disagree
  // on whether this is a race week, the stored content drifted (the
  // "race in base week 1" signature).
  const fresh = generateRacePlanV2({
    weekSchedule,
    raceGoal: {
      distance: raceGoal.distance as RaceDistance,
      targetDate: raceGoal.targetDate,
    },
    weeklyRunDays,
    currentDate: todayKey,
    weekStart: thisWeekKey,
  });
  const freshWeek = fresh.weeks[0] ?? [];
  const storedHasRace = runDays.some(isRaceRunDay);
  const freshHasRace = freshWeek.some(isRaceRunDay);
  return storedHasRace !== freshHasRace;
}

/** The honest 0-based week index for a race plan today: how many whole
 *  weeks have elapsed since the plan would have started, clamped to
 *  `[0, totalWeeks - 1]`. Replaces a stale stored `currentWeek` that
 *  drifted out of sync with `runDays`.
 *
 *  Derivation: `currentWeek = totalWeeks - weeksRemaining`, where
 *  `weeksRemaining = ceil((raceDate - today) / 7d)` — the same arithmetic
 *  `generateRacePlanV2` uses for `totalWeeks`, so the phase the cockpit
 *  shows matches the week the scheduler actually generated. */
export function honestRaceWeekIndex(args: {
  raceGoal: { distance: string; targetDate: string };
  todayKey: string;
}): { currentWeek: number; totalWeeks: number } {
  const { raceGoal, todayKey } = args;
  const fresh = generateRacePlanV2({
    // weekSchedule/weeklyRunDays don't affect totalWeeks; pass minimal.
    weekSchedule: [],
    raceGoal: {
      distance: raceGoal.distance as RaceDistance,
      targetDate: raceGoal.targetDate,
    },
    weeklyRunDays: 3,
    currentDate: todayKey,
    weekStart: localWeekKey(parseLocalDate(todayKey)),
  });
  const totalWeeks = fresh.totalWeeks;

  const target = parseLocalDate(raceGoal.targetDate);
  const today = parseLocalDate(todayKey);
  const weeksRemaining = Math.max(
    0,
    Math.ceil((target.getTime() - today.getTime()) / (7 * 86_400_000))
  );
  const currentWeek = Math.max(
    0,
    Math.min(totalWeeks - 1, totalWeeks - weeksRemaining)
  );
  return { currentWeek, totalWeeks };
}

/**
 * Convenience: does this plan still have a usable build (race in the
 * future)? When the race date is in the past, reconciliation should NOT
 * regenerate a "current week" — the elapsed-race / no-show / recovery
 * machinery owns that case. The caller gates on this so reconciliation
 * only fires for live, future-dated plans.
 */
export function raceIsInFuture(
  raceGoal: { targetDate: string } | null | undefined,
  todayKey: string
): boolean {
  if (!raceGoal) return false;
  try {
    return raceGoal.targetDate > todayKey; // YYYY-MM-DD lexicographic == chronological
  } catch {
    return false;
  }
}

/** Re-export the minimum-build helper so callers/tests can reason about
 *  whether a reconciled plan is compressed. Thin pass-through. */
export function raceMinWeeks(distance: string): number {
  return getRaceMinWeeks(distance as RaceDistance);
}

/**
 * Evidence-triggered recovery — the deload trigger that reads performance
 * instead of the calendar (14b).
 *
 * ── The gap ──────────────────────────────────────────────────────────────
 *
 * Tropos's only automatic deload trigger is `week % 4 === 0`, and Schoenfeld
 * p.200 is blunt about that cadence: "**no studies to date have attempted to
 * quantify** the extent of reductions in either volume or intensity (or both).
 * A 3:1 ratio is generally a good starting point." A starting point, not a
 * detector. A lifter who hits their ceiling in week 2 trains through it for
 * two more weeks; one who is fine in week 4 gets a light week they did not
 * need.
 *
 * ── Why the threshold is biased toward firing ────────────────────────────
 *
 * This is the design decision that makes the rest of the module make sense,
 * and it is the opposite of "be confident before acting":
 *
 *   - Schoenfeld p.200 (Ogasawara): a **3-week break** at the midpoint of a
 *     15-week programme "did not interfere with muscular adaptations", and
 *     repeated 3-off/6-on cycles matched continuous training over 6 months.
 *   - RP Ch3 P213: "Taking a deload too early now and again is **less
 *     detrimental** to overall progress than delaying deloads."
 *
 * So the cost of a false positive is approximately zero and the cost of a
 * miss is overtraining. A two-session streak is therefore enough; nothing here
 * waits for statistical comfort.
 *
 * ── The signal, and why it is not a re-derivation ────────────────────────
 *
 * RP Ch3 P154: "If you've **under-performed two sessions in a row**, you have
 * likely hit your MRV" — a drop in reps at a given effort versus last week,
 * even adjusted for load. Zatsiorsky p.75 states the same test concretely:
 * "If an athlete can do 5 reps of squats with 220 kg on Monday, and then a
 * week later can only do 2 reps, something is not right."
 *
 * Note what that is NOT. `plateauCount` / `consecutiveFailures` already track
 * missing the PRESCRIBED target, and `resolveAdjustment` already acts on it.
 * This tracks **regression against the lifter's own previous session at equal
 * or greater load** — a different fact. You can hit every target and still be
 * regressing (the targets moved down); you can miss a target on a load you
 * have never lifted before and be perfectly fresh. Reading the same fact twice
 * under two names is the failure CLAUDE.md puts first, so the predicate below
 * is deliberately expressed against the previous ACTUAL, never the target.
 *
 * ── The escalation ladder is muscle-local first ──────────────────────────
 *
 * RP Ch3 P209-212: the response to hitting MRV in one muscle is a recovery
 * session for THAT muscle (Ch3 P202: halve sets and reps, hold the load), and
 * only when more than half the muscle groups need one does it become a
 * whole-body deload. That ordering follows from Zatsiorsky p.81 independently:
 * "fatigue effects from different types of muscular work are **specific** …
 * an athlete who is too tired to repeat the same exercise in an acceptable
 * manner may still be able to perform another exercise to satisfaction." A
 * global light week for one fatigued muscle throws away the other nine
 * muscles' training.
 *
 * The recovery session holds LOAD and cuts volume, which is the two-factor
 * taper (Zatsiorsky p.13). The one-factor alternative — cut sessions, keep the
 * load — implements the supercompensation model the same book rejects on p.10
 * as "too simple to be correct". `applyDeload` already gets this right for the
 * whole-body case; this keeps the same direction at muscle scope.
 *
 * ── Re-entry, and what is deliberately NOT built here ────────────────────
 *
 * The set cut restores itself: `applyWeeklyVolumeShape` re-derives sets from
 * `baseSets` every non-deload week, and restores reps from `preDeloadReps`
 * with a max()-wins rule. So a recovery session stashes reps the same way the
 * deload does and lasts exactly one week, the way `applyFatigue`'s shave does.
 * No new restore machinery, and no chance of the cut compounding — which is
 * the D4 hazard this arc already paid for once.
 *
 * But full restore re-exposes the muscle to the load that fatigued it, so
 * without damping the feature oscillates: full → half → full → half. RP Ch3
 * P203's answer is to resume at the **midpoint of MEV↔MRV**, and that is NOT
 * implemented here, for a stated reason rather than an oversight: `advanceWeek`
 * has no `primaryGoal`, so it cannot reach `volumeLandmark` at all, and landing
 * a MUSCLE on a weekly set target means distributing across its exercises while
 * their secondary contributions move too. Both are real work.
 *
 * The damping that ships instead is a one-week refractory period — a muscle
 * that just had a recovery session is not eligible for another one while it
 * re-enters. That is this module's own device, not the source's, and it is
 * named as such so nobody cites RP for it. It stops the oscillation; it does
 * not implement P203.
 */

import { primaryCanonicalForExercise } from "./volumeModel";
import type { CanonicalMuscle } from "./muscleTaxonomy";
import type {
  PerformanceRecord,
  ProgramExercise,
  WorkoutDay,
} from "./programTypes";

/**
 * Consecutive sessions RP Ch3 P154 requires before calling MRV. Two, and the
 * bias-toward-firing argument above is why it is not three.
 */
export const UNDERPERFORM_STREAK_FOR_MRV = 2;

/**
 * Share of the week's trained muscles that must need a recovery session before
 * the response escalates from muscle-local to whole-body.
 *
 * RP Ch3 P209-212 says "more than half", and that is the whole of the source —
 * there is no second number to calibrate against, so this is the fraction
 * itself rather than a tuned constant standing in for one.
 */
export const WHOLE_BODY_ESCALATION_SHARE = 0.5;

/**
 * Did this session regress against the one before it?
 *
 * Fewer reps only means fatigue once two other explanations are ruled out, and
 * both rule-outs are load-bearing:
 *
 * **A heavier bar.** Fewer reps at more weight is the normal shape of a
 * successful progression step. Counting it would fire recovery sessions at
 * exactly the lifters who are progressing fastest — so the load must be the
 * same or LIGHTER for the drop to say anything.
 *
 * **A lighter prescription.** A deload week is the case that matters here, and
 * it hits both recipes: the post-novice recipe holds load and cuts the rep
 * TARGET by two, so a compliant lifter records fewer reps at the same weight —
 * which is a regression on the first test and is not fatigue at all, it is the
 * app's own instruction. Requiring the target to have held or risen excludes
 * it, and excludes the same shape whenever a represcribe lowers reps.
 *
 * What is left is the thing RP Ch3 P154 and Zatsiorsky p.75 both describe: the
 * same work asked for, and less of it delivered.
 */
function regressedAgainst(
  current: PerformanceRecord,
  previous: PerformanceRecord
): boolean {
  return (
    current.weight <= previous.weight &&
    current.repsTarget >= previous.repsTarget &&
    current.repsCompleted < previous.repsCompleted
  );
}

/**
 * How many of the most recent sessions regressed, consecutively.
 *
 * Walks backwards from the newest record and stops at the first session that
 * held or improved. `performanceHistory` is append-ordered and capped at
 * `PERFORMANCE_HISTORY_CAP`, so the newest entry is last.
 */
export function underperformingStreak(
  history: readonly PerformanceRecord[] | undefined
): number {
  if (!history || history.length < 2) return 0;
  let streak = 0;
  for (let i = history.length - 1; i >= 1; i--) {
    if (!regressedAgainst(history[i], history[i - 1])) break;
    streak += 1;
  }
  return streak;
}

/** Has this lift hit the two-session MRV signal? */
export function liftAtMrv(ex: ProgramExercise): boolean {
  return (
    underperformingStreak(ex.performanceHistory) >= UNDERPERFORM_STREAK_FOR_MRV
  );
}

/**
 * Canonical muscles whose work shows the MRV signal, and every muscle the week
 * trains — the escalation rule needs both, and computing them in one pass
 * keeps the denominator honest (a muscle with no work this week is neither
 * fatigued nor a vote against escalating).
 *
 * Attribution is by PRIMARY muscle only. A lift's secondary muscles are worked
 * at half involvement and their regression, if real, will show on their own
 * primary lifts; crediting a bench press's triceps regression to the triceps
 * would fire recovery sessions for muscles whose own work is fine.
 */
export function musclesAtMrv(workouts: readonly WorkoutDay[]): {
  atMrv: CanonicalMuscle[];
  trained: CanonicalMuscle[];
} {
  const atMrv = new Set<CanonicalMuscle>();
  const trained = new Set<CanonicalMuscle>();
  for (const day of workouts) {
    if (day.skipped) continue;
    for (const ex of day.exercises) {
      const muscle = primaryCanonicalForExercise(ex);
      if (!muscle) continue;
      trained.add(muscle);
      if (liftAtMrv(ex)) atMrv.add(muscle);
    }
  }
  return { atMrv: [...atMrv], trained: [...trained] };
}

/**
 * RP Ch3 P209-212: more than half the trained muscle groups needing a recovery
 * session is what turns a set of local responses into a whole-body deload.
 *
 * Strictly greater than half — exactly half is not "more than half", and at
 * the escalation boundary the muscle-local response is the one that keeps the
 * other muscles training.
 */
export function escalatesToWholeBody(
  atMrv: readonly CanonicalMuscle[],
  trained: readonly CanonicalMuscle[]
): boolean {
  if (trained.length === 0) return false;
  return atMrv.length > trained.length * WHOLE_BODY_ESCALATION_SHARE;
}

/**
 * RP Ch3 P202's recovery session, applied to the lifts whose primary muscle is
 * in `muscles`: halve sets and reps, hold the load.
 *
 * Halving is the source's own instruction rather than a tuned reduction, and
 * the load is held because cutting it is the one-factor taper Zatsiorsky p.10
 * rejects. Sets floor at 1 and reps at 1 — a "recovery session" that removes
 * the exercise entirely is a different intervention, and the point is to keep
 * the movement in the week.
 *
 * Pure; returns a new array with untouched days shared by reference.
 */
export function applyRecoverySession(
  workouts: readonly WorkoutDay[],
  muscles: readonly CanonicalMuscle[]
): WorkoutDay[] {
  if (muscles.length === 0) return [...workouts];
  const target = new Set(muscles);
  return workouts.map((day) => {
    if (day.skipped) return day;
    let touched = false;
    const exercises = day.exercises.map((ex) => {
      const muscle = primaryCanonicalForExercise(ex);
      if (!muscle || !target.has(muscle)) return ex;
      touched = true;
      return {
        ...ex,
        // Anchor + stash exactly as `prepareForDeload` does, so
        // `applyWeeklyVolumeShape` restores both next week through the path
        // that already exists. Without the reps stash the halving would decay
        // the prescription every time a recovery session fires — the same
        // compounding hazard backlog #5 fixed for sets and #8 for reps.
        baseSets: ex.baseSets ?? ex.sets,
        preDeloadReps: ex.reps,
        sets: Math.max(1, Math.floor((ex.baseSets ?? ex.sets) / 2)),
        reps: Math.max(1, Math.floor(ex.reps / 2)),
      };
    });
    return touched ? { ...day, exercises } : day;
  });
}

/**
 * The muscles that should get a recovery session this week: those showing the
 * MRV signal, minus any still re-entering from last week's.
 *
 * The subtraction is the refractory period described in the module note. It is
 * needed because the cut self-restores in full, so a muscle at its ceiling
 * would re-trigger on the very next read and oscillate.
 */
export function recoveryTargets(
  atMrv: readonly CanonicalMuscle[],
  recoveringLastWeek: readonly CanonicalMuscle[] | undefined
): CanonicalMuscle[] {
  if (!recoveringLastWeek?.length) return [...atMrv];
  const refractory = new Set(recoveringLastWeek);
  return atMrv.filter((m) => !refractory.has(m));
}

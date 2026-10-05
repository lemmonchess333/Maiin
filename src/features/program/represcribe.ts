/**
 * Block represcription (Blk2) — pure.
 *
 * A training block OWNS the lift prescription for its duration. This is the
 * whole mechanism: given the stored week and a training focus, re-derive
 * what each slot asks for. It never calls a builder, and that is the point
 * rather than an optimisation.
 *
 * Blk1 rejected block-owns-programme on the grounds that it "fights the
 * adaptive engine". It was right about the risk and inverted about the
 * mechanism. The shipped alternative — writing `primaryGoal` and letting
 * `buildPlan` sort it out — is measurably a no-op: the preserve branch
 * gates on the day count and never looks at the goal, so
 * a hypertrophy→strength change moves 0 of 18 slots and a strength user
 * keeps deadlifting at 10-14 reps. The only path that DOES reach a builder
 * (`regenerateProgram`, or a lift-days change) resets
 * `weekNumber`, `weekHistory` and `currentPhase`, and drops per-exercise
 * history wherever the positional carry misses. Cosmetic or destructive,
 * with nothing in between.
 *
 * So this maps over the stored workouts and writes six fields. Everything
 * that carries adaptive or durable state is structurally out of reach:
 * `weekNumber`, `currentPhase`, `weekHistory`, `fatigueScore`,
 * `deloadSnapshot`, `sets`/`baseSets`, `performanceHistory`,
 * `lastPerformance`, `lastSuccessfulWeight`, `preDeloadWeight`,
 * `exerciseId`, `instanceId`, `movementCategory`, `isAccessory`, the split
 * and the day count. No history-death mode is reachable from here, because
 * every one of them requires re-picking a movement.
 *
 * Inverted by applying it again with the focus the user had before the
 * block, which is why a block stores one scalar (`goalBefore`) and NOT a
 * per-slot snapshot. A snapshot would have to rewind loads that eight weeks
 * of progression legitimately earned, and would go stale the moment a slot
 * was added, removed or swapped mid-block.
 */

import {
  assignDayRoles,
  prescribedRepCeiling,
  undulationDeltaFor,
  repFloorFor,
  repRangeMaxFor,
} from "./programEngine";
import { usesUndulation } from "./experienceModel";
import { roleReps, roleRepsFor } from "./roleTable";
import { getRaceFloorWeeks } from "./runPlanTiming";
import type {
  ActiveTrainingBlock,
  BlockPace,
  Experience,
  PrimaryGoal,
  ProgramExercise,
  WorkoutDay,
} from "./programTypes";

/**
 * Working load for a new rep target, via the Epley 1RM identity
 * (`1RM = w × (1 + reps/30)`): hold the implied 1RM, solve for the weight.
 *
 * This exists to close the one genuine conflict between a block and the
 * progression engine. `applyProgression` scores a session complete only
 * when `actualReps >= exercise.reps`, so raising a main from 5 to 12 at
 * unchanged load fails every session → `consecutiveFailures >= 3` →
 * `plateauCount++`, and a represcribe does it to every main at once. A
 * stalled main is one the plan swaps for a variation when it is next
 * rebuilt (`applyExperienceAwarePlateauPicks`), which zeroes its history:
 * the failure Blk1 predicted. Moving the load with the target keeps the
 * session completable on day one.
 *
 * Epley rather than a flat multiplier because the error compounds over the
 * range the five focus profiles actually span: 5→12 needs ×0.83, not the
 * ×0.92 that fits 5→8.
 *
 * Never increases a load. Climbing is `applyProgression`'s job and it has
 * per-lift resolution, RPE holds and microplate steps; a block guessing
 * upward would hand someone a weight they have not earned. So a move to
 * FEWER reps holds the current load, which is simply an easier session.
 */
export function scaleLoadForReps(
  weight: number,
  fromReps: number,
  toReps: number
): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(fromReps) || !Number.isFinite(toReps)) return weight;
  if (toReps <= fromReps) return weight;
  const ratio = (1 + fromReps / 30) / (1 + toReps / 30);
  return Math.round((weight * ratio) / 2.5) * 2.5;
}

/**
 * Re-derive a week's prescription for `goal`, preserving everything else.
 *
 * Each lift's reps come from its role in the table generation uses
 * (`roleTable.ts`, Lift4 (5)). `experience` reads the table's beginner
 * column and drives undulation exactly as generation does — a beginner
 * gets the flat table, everyone else gets the heavy/pump shift. Passing
 * the wrong one here would silently flatten the week.
 */
export function represcribeWorkouts(
  workouts: readonly WorkoutDay[],
  goal: PrimaryGoal,
  experience: Experience | undefined
): WorkoutDay[] {
  // Undulation is applied per DAY INDEX, so the roles have to be computed
  // over the whole week before any slot is touched.
  const roles = assignDayRoles(workouts.length);
  const undulates = usesUndulation(experience);

  return workouts.map((day, dayIndex) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      // A 30-45s plank is not a 12-rep set, and the table authors no
      // seconds target. `prescribedRepCeiling` already returns Infinity for
      // these; the honest handling is to leave them entirely alone.
      if (ex.repUnit === "seconds") return { ...ex };

      // An unflagged slot's compound counts as a MAIN (`exerciseRole`),
      // matching `generateProgram`'s own convention for legacy slots.
      // Treating it as an accessory instead would make the whole transform a
      // silent no-op on any plan authored before `isAccessory` was persisted.
      const row = roleRepsFor(goal, ex, experience);
      const span = row.top === undefined ? 0 : row.top - row.bottom;
      // Per-exercise, not per-day: the pump +2 exempts hip-dominant mains
      // (high-rep heavy hinge — see undulationDeltaFor).
      const delta = undulates ? undulationDeltaFor(ex, roles[dayIndex]) : 0;

      const reps = Math.min(
        prescribedRepCeiling(ex),
        Math.max(repFloorFor(ex), row.bottom + delta)
      );
      const rangeMax = repRangeMaxFor(ex, reps, span);

      const out: ProgramExercise = {
        ...ex,
        reps,
        // `applyProgression` resets the climbing target back to `baseReps`
        // after a load step, so leaving it on the old focus's number would
        // walk the user back to the retired prescription one step later.
        baseReps: reps,
        // A range climbs; a fixed target steps whenever every set reaches it.
        progressionType: row.top === undefined ? "linear" : "double",
        weight: scaleLoadForReps(ex.weight, ex.baseReps ?? ex.reps, reps),
        // Failure counters accumulated against a rep target that no longer
        // exists are not evidence of anything.
        consecutiveFailures: 0,
        plateauCount: 0,
      };
      // Omitted rather than zeroed when the table authors no span — a
      // `repRangeMax` of 0 would read as a ceiling below the target.
      if (rangeMax !== undefined) out.repRangeMax = rangeMax;
      else delete out.repRangeMax;
      // A lowered lift's way back is a weight for the old target, and its
      // line names that target (Lift4); neither holds for the new one.
      delete out.lowered;
      return out;
    }),
  }));
}

/**
 * A lift an equipment or injury swap brings into a plan the person already
 * has takes its own role's numbers (Lift4 (5)): the reps, range and
 * progression its role gives on that day, its load moved to those reps, and
 * no more sets than its role's (the plan's time fit may have left fewer).
 * A glute bridge in a deadlift's place climbs an isolation's range, not the
 * deadlift's. Slots the swap left alone keep everything.
 */
export function represcribeSwapped(
  before: readonly WorkoutDay[],
  after: readonly WorkoutDay[],
  goal: PrimaryGoal,
  experience: Experience | undefined
): WorkoutDay[] {
  const fresh = represcribeWorkouts(after, goal, experience);
  return after.map((day, d) => ({
    ...day,
    exercises: day.exercises.map((ex, e) => {
      if (before[d]?.exercises[e]?.exerciseId === ex.exerciseId) return ex;
      if (ex.repUnit === "seconds") return ex;
      const sets = Math.min(ex.sets, roleRepsFor(goal, ex, experience).sets);
      return {
        ...fresh[d].exercises[e],
        sets,
        ...(ex.baseSets !== undefined ? { baseSets: sets } : {}),
      };
    }),
  }));
}

/**
 * Whether a lift block should be offered right now, given the run plan.
 *
 * Refused inside a race taper or race week: a "Get stronger" block raises
 * lift stimulus at exactly the point the run plan is shedding it, and the
 * user cannot see that conflict from the lift tab. The window is
 * `getRaceFloorWeeks(distance)` — taper weeks plus the race week, which is
 * already the scheduler's own definition, so this can't drift from it.
 *
 * Post-race RECOVERY is deliberately NOT refused. Running volume is down
 * and the athlete has room; that is a good moment to pick a lifting focus
 * up, not a moment to be locked out of one.
 */
export function blockOfferBlockedByRace(input: {
  runMode?: string;
  raceDistance?: "5k" | "10k" | "half" | "marathon";
  raceTargetDate?: string;
  today: string;
}): boolean {
  const { runMode, raceDistance, raceTargetDate, today } = input;
  if (runMode !== "race_prep" || !raceDistance || !raceTargetDate) return false;
  const days = Math.round(
    (localMidnight(raceTargetDate) - localMidnight(today)) / 86_400_000
  );
  if (Number.isNaN(days) || days < 0) return false; // race passed → recovery
  return days <= getRaceFloorWeeks(raceDistance) * 7;
}

function localMidnight(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

/**
 * Whether the block's pace should put the SHORT session in front.
 *
 * This is the other half of what "lighter" and "easing back in" promise,
 * and it shipped missing: the pace was stored, the copy said "shorter
 * sessions", and nothing anywhere read it — so the words described
 * behaviour the app did not have. Copy that overstates is worse than a
 * feature that is absent, and the create sheet's whole claim to honesty
 * rests on the consequence line being literally true.
 *
 * A PROMOTION, never a lock. The pre-session chooser still lists every
 * variant and the full session is still one tap; the block only changes
 * which one is offered first. Forcing it would take a choice away from
 * someone who feels good today, and the pace is a statement about the
 * next few weeks rather than about this morning.
 */
export function blockPrefersShorterSessions(
  block: Pick<ActiveTrainingBlock, "pace"> | undefined
): boolean {
  return !!block && block.pace !== "full";
}

/** "6–10", or "5" for a fixed target: the main lifts' reps a focus
 *  prescribes at a level (`roleTable.ts`). */
export function focusRepSummary(
  goal: PrimaryGoal,
  experience: Experience | undefined
): string {
  const r = roleReps(goal, "main", experience, false);
  return r.top === undefined ? `${r.bottom}` : `${r.bottom}–${r.top}`;
}

/** The table's rows a block can move: each role, and Build muscle's
 *  12–20 isolations. */
const TABLE_ROWS = [
  ["main", false],
  ["compound", false],
  ["isolation", false],
  ["isolation", true],
] as const;

/**
 * Whether moving from one focus to another raises any lift's rep target:
 * a main lift's, another compound's or an isolation's. That is when
 * `scaleLoadForReps` brings its weight down; a move to fewer reps holds it.
 */
function targetsRise(
  from: PrimaryGoal,
  to: PrimaryGoal,
  experience: Experience | undefined
): boolean {
  return TABLE_ROWS.some(
    ([role, highRep]) =>
      roleReps(to, role, experience, highRep).bottom >
      roleReps(from, role, experience, highRep).bottom
  );
}

/** Whether two focuses prescribe any lift differently. Get stronger and
 *  Support my running share every row of the table. */
function targetsChange(
  from: PrimaryGoal,
  to: PrimaryGoal,
  experience: Experience | undefined
): boolean {
  return TABLE_ROWS.some(([role, highRep]) => {
    const a = roleReps(from, role, experience, highRep);
    const b = roleReps(to, role, experience, highRep);
    return a.bottom !== b.bottom || a.top !== b.top;
  });
}

/**
 * The sentence shown directly above "Start block", stating the exact change
 * BEFORE the write happens.
 *
 * This is the load-bearing copy of the whole feature, which is why it is a
 * pure function with tests rather than JSX. GsPb1's "never a silent
 * programme rewrite" survives Blk2 intact, and this is what carries it: the
 * user is told what will change to their sessions while they can still not
 * do it. That is a stricter reading than the post-save offer it replaces,
 * which asked AFTER the block was already saved.
 *
 * It must never overstate. A same-focus block genuinely changes nothing
 * about the prescription, and saying so plainly is what makes the habit
 * paces honest — "showing up is the whole goal" has to be literally true.
 */
export function blockConsequence(input: {
  focus: PrimaryGoal;
  currentFocus: PrimaryGoal;
  pace: BlockPace;
  durationWeeks: number;
  focusLabel: (goal: PrimaryGoal) => string;
  /** The lifter's level: the table's beginner column differs. */
  experience: Experience | undefined;
}): string {
  const { focus, currentFocus, pace, durationWeeks, focusLabel, experience } =
    input;
  const weeks = `${durationWeeks} weeks`;
  const trimmed = "starting from the short session";
  const hold = "Your weights hold steady for the first two weeks.";

  if (focus !== currentFocus) {
    // Get stronger and Support my running share every target, so a block
    // between them re-aims nothing, and the copy must not claim it does.
    const changes = targetsChange(currentFocus, focus, experience);
    const lead =
      `Your main lifts ${changes ? "move to" : "stay at"} sets of ` +
      `${focusRepSummary(focus, experience)} for ${weeks}` +
      (pace === "full" ? "." : `, ${trimmed}.`);
    // The load only moves when a rep target goes UP — `scaleLoadForReps`
    // holds the weight for a move to FEWER reps, deliberately, because
    // climbing is the progression engine's job. The old copy claimed
    // "the weights come down a little" for every change — including
    // Build muscle → Get stronger, the first two entries in the picker and
    // the likeliest change anyone makes, which lowers every target.
    const loadDrops = targetsRise(currentFocus, focus, experience);
    const aiming = changes ? " — only what you're aiming for changes." : ".";
    const tail =
      pace === "easing"
        ? ` ${hold}`
        : // "Same exercises, same days" is only true at pace `full`. Once
          // the short session is promoted, the trim drops accessories and
          // cuts sets — so the lead would promote a trim and the tail deny
          // one, in the same sentence pair.
          pace !== "full"
          ? loadDrops
            ? " The weights come down a little to match the new target," +
              " then climb again."
            : ` Your weights stay where they are${aiming}`
          : loadDrops
            ? " Same exercises, same days — the weights come down a little to" +
              " match the new target, then climb again."
            : ` Same exercises, same days, same weights${aiming}`;
    return lead + tail;
  }

  // Same focus: the prescription is untouched, so the block's whole value is
  // the window and the pace. Naming the focus keeps it concrete.
  const kept = focusLabel(currentFocus).toLowerCase();
  if (pace === "full") {
    // "gives 8 weeks of stay fit a shape" read as a sentence with a verb
    // phrase wedged into it; the focus goes at the end, as the thing kept.
    return `Nothing about your sessions changes — the block just gives the next ${weeks} a shape and a finish line, with the same ${kept} focus.`;
  }
  if (pace === "lighter") {
    return `Same prescription for ${weeks}, ${trimmed} each time — the full one is always a tap away.`;
  }
  return `Same prescription, ${trimmed} each time. ${hold}`;
}

/**
 * What ending a block does, said before it happens, as `blockConsequence`
 * says what starting one does (Lift4: "ending one says plainly what
 * happens").
 *
 * The release hands the week back to the focus held before the block: that
 * focus's rep targets, from the weights lifted now, eased where the target
 * goes up (`scaleLoadForReps`). The weights are never wound back to where
 * they stood before the block. A block that hands back its own focus, or
 * one that never owned the prescription, changes nothing about the week.
 */
export function blockReleaseLine(input: {
  block: Pick<ActiveTrainingBlock, "focus" | "goalBefore" | "pace" | "owned">;
  focusLabel: (goal: PrimaryGoal) => string;
  /** The lifter's level: the table's beginner column differs. */
  experience: Experience | undefined;
}): string {
  const { block, focusLabel, experience } = input;
  const fullFirst =
    block.pace === "full" ? "" : " Start offers the full session first again.";
  if (
    !block.owned ||
    !targetsChange(block.focus, block.goalBefore, experience)
  ) {
    return `Your sessions stay as they are.${fullFirst}`;
  }
  const lead = `Your main lifts go back to sets of ${focusRepSummary(block.goalBefore, experience)} (${focusLabel(block.goalBefore)})`;
  const loadDrops = targetsRise(block.focus, block.goalBefore, experience);
  return (
    (loadDrops
      ? `${lead}. The weights come down a little to match, then climb again.`
      : `${lead}, at the weights you lift now.`) + fullFirst
  );
}

/**
 * Weeks of plateau-RESPONSE amnesty a block opens with when it changes the
 * focus or eases the pace.
 *
 * Three, because `resolveAdjustment` needs two consecutive stalled weeks to
 * escalate past a volume cut, and the third covers the bodyweight residue
 * `scaleLoadForReps` cannot reach: a pull-up has no load to shed, so its
 * target walks down one rep per two misses instead.
 */
export const BLOCK_AMNESTY_WEEKS = 3;

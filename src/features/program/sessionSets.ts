import { isSetEligibleForProgression } from "./sessionSetPolicy";

/**
 * What a finished session's sets say about one exercise (Lift4: all working
 * sets count).
 *
 * The plan holds one weight per exercise, and follows the weight lifted for
 * most of the working sets, the heavier on a tie: a top set before the
 * back-offs, or a lighter last set, is logged as lifted and does not move
 * the plan. The sets at that weight are the evidence, the planned number at
 * most and the best of them first, so a set done beyond the plan can't
 * block a step.
 *
 * Working sets are the completed ones that may drive progression
 * (`isSetEligibleForProgression`): not warm-ups, and not drop sets, whose
 * lighter load is the technique. A row left undone is a set not done.
 */

export interface SessionSet {
  weight: number;
  reps: number;
  rpe?: number;
}

export interface SessionRead {
  /** The weight the plan follows. */
  weight: number;
  /** The sets at that weight that count, best first. */
  counted: SessionSet[];
}

/** Weights within this of each other are the same weight. */
const SAME_WEIGHT_KG = 0.01;

export function sameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) <= SAME_WEIGHT_KG;
}

/** The weight most of these sets were lifted at, the heavier on a tie;
 *  `null` for no sets. */
export function followedWeight(
  sets: readonly { weight: number }[]
): number | null {
  const groups: { weight: number; count: number }[] = [];
  for (const set of sets) {
    const group = groups.find((g) => sameWeight(g.weight, set.weight));
    if (group) group.count++;
    else groups.push({ weight: set.weight, count: 1 });
  }
  if (groups.length === 0) return null;
  return groups.reduce((best, g) =>
    g.count > best.count || (g.count === best.count && g.weight > best.weight)
      ? g
      : best
  ).weight;
}

/** `null` when the session holds no working set: no evidence either way. */
export function readSessionSets(
  sets: readonly {
    completed: boolean;
    type?: string;
    weight: number;
    reps: number;
    rpe?: number;
  }[],
  planned: number
): SessionRead | null {
  const working = sets.filter(
    (set) => set.completed && isSetEligibleForProgression(set.type ?? "working")
  );
  const weight = followedWeight(working);
  if (weight === null) return null;
  const counted = working
    .filter((set) => sameWeight(set.weight, weight))
    .map(({ weight, reps, rpe }) =>
      rpe === undefined ? { weight, reps } : { weight, reps, rpe }
    )
    .sort((a, b) => b.reps - a.reps)
    .slice(0, planned > 0 ? planned : undefined);
  return { weight, counted };
}

/**
 * What the session earned (Lift4 (6)-(8)):
 *
 * - `step`: at least two sets done (one, on a one-set plan), every one at
 *   the target. The engine then climbs or steps from the weight followed.
 * - `miss`: at the weight the plan asked for, the reps add up to fewer than
 *   the target on every set done. On a 3 × 8 target, 8, 7, 6 (21 of 24) is
 *   a miss and 9, 8, 7 is not. A target climbed past the top of its range,
 *   because the next weight is too big a step (`loadSteps.ts`), is judged
 *   at that top: reps past it are a climb, not a bar.
 * - `hold`: anything else. The plan follows the weight lifted and moves
 *   nothing else; a different weight from the plan's is never a miss, as
 *   the plan simply follows it.
 *
 * A bodyweight lift's weight is added load, which the plan does not follow,
 * so it steps only at the added load asked for or more.
 */
export type SessionOutcome = "step" | "miss" | "hold";

export function sessionOutcome(
  read: SessionRead,
  prescription: {
    weight: number;
    reps: number;
    sets: number;
    baseReps?: number;
    repRangeMax?: number;
  },
  isBodyweight: boolean
): SessionOutcome {
  const { counted, weight } = read;
  const target = prescription.reps;
  const top = prescription.repRangeMax ?? prescription.baseReps ?? target;
  const needed = Math.min(2, Math.max(1, prescription.sets));
  const atPlan = sameWeight(weight, prescription.weight);
  if (
    counted.length >= needed &&
    counted.every((set) => set.reps >= target) &&
    (!isBodyweight || weight >= prescription.weight - SAME_WEIGHT_KG)
  )
    return "step";
  const total = counted.reduce((sum, set) => sum + set.reps, 0);
  if (atPlan && total < Math.min(target, top) * counted.length) return "miss";
  return "hold";
}

/** The reps a session's record shows: the average set at the weight
 *  followed, rounded down, so a session that met its target on every set
 *  never records under it. */
export function recordedReps(read: SessionRead): number {
  if (read.counted.length === 0) return 0;
  const total = read.counted.reduce((sum, set) => sum + set.reps, 0);
  return Math.floor(total / read.counted.length);
}

/** The highest effort logged on a counted set, if any was. */
export function hardestEffort(read: SessionRead): number | undefined {
  const efforts = read.counted
    .map((set) => set.rpe)
    .filter((rpe): rpe is number => typeof rpe === "number");
  return efforts.length ? Math.max(...efforts) : undefined;
}

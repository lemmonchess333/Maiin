import { followedWeight, sameWeight } from "./sessionSets";

/**
 * Where each set row of a new session starts (Lift4): from what that set did
 * last time, so a top set, its back-offs and a lighter last set stay as
 * lifted. A set lifted at the weight the plan followed starts from the plan
 * instead, since that is where the plan's climb or step lands. Warm-ups keep
 * their ramp, and a row with no set last time starts from the plan.
 *
 * `last` is last time's counted sets in order (`lastSetsByExercise`), the
 * sets Train's "Last:" line lists. A plan with no weight yet (an
 * uncalibrated lift, or a bodyweight one) takes each set's weight from last
 * time, and a set with none from last time's first, as it always has.
 */
export function startingSetRows<
  T extends { type?: string; weight: number; reps: number },
>(
  rows: readonly T[],
  plan: { weight: number; reps: number },
  last: readonly { weight: number; reps: number }[] | undefined
): T[] {
  if (!last?.length) return [...rows];
  const followed = followedWeight(last);
  let ordinal = 0;
  return rows.map((row) => {
    if (row.type === "warmup") return row;
    const own = last[ordinal++];
    if (plan.weight === 0) {
      const prior = own ?? last[0];
      return { ...row, weight: prior.weight, reps: row.reps || prior.reps };
    }
    const prior = own;
    if (!prior) return row;
    if (followed !== null && sameWeight(prior.weight, followed)) return row;
    return { ...row, weight: prior.weight, reps: prior.reps };
  });
}

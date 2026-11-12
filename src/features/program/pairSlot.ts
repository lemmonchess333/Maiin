import type { ProgramExercise } from "./programTypes";

/**
 * Whether the lift at `index` is done in a superset with the one after it
 * (Lift22): it names that lift's slot (`supersetWith`), and the two still
 * stand together. Kept apart from the rules that write pairs
 * (`planSupersets.ts`) so the session clock reads it without them.
 */
export function pairedWithNext(
  exercises: ReadonlyArray<
    Pick<ProgramExercise, "instanceId" | "supersetWith">
  >,
  index: number
): boolean {
  const partner = exercises[index]?.supersetWith;
  return !!partner && exercises[index + 1]?.instanceId === partner;
}

/** A day's lifts as Train lists them: each alone, or a pair the plan wrote
 *  together, in the day's order. */
export function pairRuns<
  T extends Pick<ProgramExercise, "instanceId" | "supersetWith">,
>(exercises: readonly T[]): Array<Array<{ ex: T; i: number }>> {
  const runs: Array<Array<{ ex: T; i: number }>> = [];
  for (let i = 0; i < exercises.length; i++) {
    if (pairedWithNext(exercises, i)) {
      runs.push([
        { ex: exercises[i], i },
        { ex: exercises[i + 1], i: i + 1 },
      ]);
      i++;
    } else runs.push([{ ex: exercises[i], i }]);
  }
  return runs;
}

/**
 * A day's lifts with each pair standing together, as the plan wrote it: a
 * lift moved away from its partner breaks the pair (`pairedWithNext`), and
 * the session clock prices the two apart. The week's re-fit judges a day in
 * this order (`refitOutgrownSessions`), so the person's order is not read
 * as weights that grew (training deep dive, D11). Copies the list; the
 * lifts are the same objects.
 */
export function withPairsTogether<
  T extends Pick<ProgramExercise, "instanceId" | "supersetWith">,
>(exercises: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const ex of exercises)
    if (ex.instanceId !== undefined) byId.set(ex.instanceId, ex);
  const leads = new Set<string>();
  for (const ex of exercises) {
    const partner = ex.supersetWith;
    if (partner !== undefined && partner !== ex.instanceId && byId.has(partner))
      leads.add(partner);
  }
  const out: T[] = [];
  const placed = new Set<T>();
  for (const ex of exercises) {
    if (placed.has(ex)) continue;
    // A partner waits for the lift that names it.
    if (ex.instanceId !== undefined && leads.has(ex.instanceId)) {
      const lead = exercises.find(
        (o) => o.supersetWith === ex.instanceId && o !== ex
      );
      if (lead !== undefined && !placed.has(lead)) continue;
    }
    out.push(ex);
    placed.add(ex);
    const partner =
      ex.supersetWith !== undefined ? byId.get(ex.supersetWith) : undefined;
    if (partner !== undefined && partner !== ex && !placed.has(partner)) {
      out.push(partner);
      placed.add(partner);
    }
  }
  return out;
}

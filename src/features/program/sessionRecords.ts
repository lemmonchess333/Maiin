import { validateSet } from "@/lib/setValidation";
import {
  checkSetPR,
  exerciseBest,
  getRepBucket,
  recordSetBest,
  nextVolumeBest,
  type PRMap,
  type SetPR,
  type RepBucket,
  type VolumeBestMap,
} from "@/lib/prTracking";
import { isSetEligibleForStrengthPr } from "./sessionSetPolicy";

/** Rebuild from history plus the current logs, so edits can lower a false PR. */
export function sessionRecords(
  baseline: PRMap,
  volumeBaseline: VolumeBestMap,
  counts: Record<string, number>,
  exercises: readonly { name: string; repUnit?: "reps" | "seconds" }[],
  logs: readonly (readonly {
    weight: number;
    reps: number;
    completed: boolean;
    type: string;
    /** A weight the person said yes to past the jump check (Lift16). */
    confirmedWeight?: number;
  }[])[],
  date: string
) {
  // Sets can be completed out of row order. Replay the same evolving best
  // the live logger validates against, allowing a later row to establish
  // the legitimate step that an earlier row followed. Never let a rejected
  // set validate itself, or use an undone/warm-up set as that step.
  const candidates = exercises.flatMap((exercise, exIdx) =>
    (logs[exIdx] ?? []).flatMap((set, setIdx) =>
      set.completed && isSetEligibleForStrengthPr(set.type, exercise.repUnit)
        ? [{ exercise, set, key: `${exIdx}:${setIdx}` }]
        : []
    )
  );
  const accepted = new Set<string>();
  let validationMap = baseline;
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (const { exercise, set, key } of candidates) {
      if (accepted.has(key)) continue;
      const best = validationMap[exercise.name]?.[getRepBucket(set.reps)];
      const validation = validateSet({
        reps: set.reps,
        weight: set.weight,
        isBodyweight: set.weight === 0 && !best,
        currentBestForBucket: best?.weight,
      });
      // A jump the person said yes to counts; an unconfirmed outlier does not.
      if (
        !validation.ok ||
        (validation.warn && set.confirmedWeight !== set.weight)
      )
        continue;
      accepted.add(key);
      advanced = true;
      validationMap = recordSetBest(validationMap, exercise.name, {
        weight: set.weight,
        reps: set.reps,
        date,
      });
    }
  }

  let map = baseline;
  const results = new Map<string, SetPR>();
  const fired = new Map<string, RepBucket[]>();
  const volumes = exercises.map((ex, exIdx) => {
    const sets: { weightKg: number; reps: number }[] = [];
    for (const [setIdx, set] of (logs[exIdx] ?? []).entries()) {
      if (!accepted.has(`${exIdx}:${setIdx}`)) continue;
      sets.push({ weightKg: set.weight, reps: set.reps });
      const result = checkSetPR(ex.name, set.weight, set.reps, map, counts, 3);
      if (result)
        results.set(`${ex.name}:${result.bucket}`, {
          ...result,
          setKey: `${exIdx}:${setIdx}`,
          bestBeforeSession: exerciseBest(baseline, ex.name),
        });
      map = recordSetBest(map, ex.name, {
        weight: set.weight,
        reps: set.reps,
        date,
      });
    }
    return { name: ex.name, repUnit: ex.repUnit, sets };
  });
  for (const [key, result] of results) {
    if (result.kind !== "best") continue;
    const name = key.slice(0, key.lastIndexOf(":"));
    fired.set(name, [...(fired.get(name) ?? []), result.bucket]);
  }
  return {
    map,
    results,
    fired,
    volumeBest: nextVolumeBest(volumeBaseline, volumes, date),
  };
}

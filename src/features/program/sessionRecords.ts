import { validateSet } from "@/lib/setValidation";
import {
  checkSetPR,
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
  }[])[],
  date: string
) {
  let map = baseline;
  const results = new Map<string, SetPR>();
  const fired = new Map<string, RepBucket[]>();
  const volumes = exercises.map((ex, exIdx) => {
    const sets: { weightKg: number; reps: number }[] = [];
    for (const [setIdx, set] of (logs[exIdx] ?? []).entries()) {
      if (!set.completed || !isSetEligibleForStrengthPr(set.type, ex.repUnit))
        continue;
      const best = baseline[ex.name]?.[getRepBucket(set.reps)];
      const validation = validateSet({
        reps: set.reps,
        weight: set.weight,
        isBodyweight: set.weight === 0 && !best,
        currentBestForBucket: best?.weight,
      });
      if (!validation.ok || validation.warn) continue;
      sets.push({ weightKg: set.weight, reps: set.reps });
      const result = checkSetPR(ex.name, set.weight, set.reps, map, counts, 3);
      if (result)
        results.set(`${ex.name}:${result.bucket}`, {
          ...result,
          setKey: `${exIdx}:${setIdx}`,
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

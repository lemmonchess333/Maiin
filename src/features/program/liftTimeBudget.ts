import {
  estimateSessionMinutes,
  ACCESSORY_MIN_SETS,
  COMPOUND_MIN_SETS,
  type ExpressPlan,
} from "./expressSession";
import type { WorkoutDay } from "./programTypes";

export function isLiftTimeBudget(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 30 &&
    value <= 120
  );
}

/** A reversible execution copy priced with the same estimate shown to the
 * lifter. The original anchor, identities, loads, rests and history survive. */
export function buildTimeBudgetSession(
  day: WorkoutDay,
  budget: number
): ExpressPlan {
  let items = day.exercises.map((ex, src) => ({ ex: { ...ex }, src }));
  const trim: ExpressPlan["trim"] = { droppedExercises: [], reducedSets: [] };
  const over = () =>
    estimateSessionMinutes(items.map((item) => item.ex)) > budget;
  if (isLiftTimeBudget(budget)) {
    for (let i = items.length - 1; i >= 1 && over(); i--) {
      const item = items[i];
      if (item.ex.isAccessory !== true) continue;
      const from = item.ex.sets;
      while (item.ex.sets > ACCESSORY_MIN_SETS && over()) item.ex.sets--;
      if (over()) {
        trim.droppedExercises.unshift(item.ex.name);
        items = items.filter((_, index) => index !== i);
      } else if (from !== item.ex.sets)
        trim.reducedSets.push({ name: item.ex.name, from, to: item.ex.sets });
    }
    for (let i = items.length - 1; i >= 1 && over(); i--) {
      const ex = items[i].ex;
      if (ex.isAccessory === true) continue;
      const from = ex.sets;
      while (ex.sets > COMPOUND_MIN_SETS && over()) ex.sets--;
      if (from !== ex.sets)
        trim.reducedSets.push({ name: ex.name, from, to: ex.sets });
    }
  }
  return {
    variant: "time_budget",
    exercises: items.map((i) => i.ex),
    sourceIndexes: items.map((i) => i.src),
    estimatedMinutes: estimateSessionMinutes(items.map((i) => i.ex)),
    trim,
  };
}

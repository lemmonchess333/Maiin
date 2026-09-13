import type {
  ManualCompletion,
  RunPlan,
  ScheduledRunDay,
} from "./programTypes";
import { getScheduledRunStatus } from "@/lib/scheduledRunStatus";

/** Availability and tuning edits do not start a new block for the same race. */
export function continuingRacePlan(
  existing: RunPlan | null | undefined,
  goal: { distance: string; targetDate: string }
): RunPlan | undefined {
  return existing?.mode === "race_prep" &&
    existing.raceGoal?.distance === goal.distance &&
    existing.raceGoal.targetDate === goal.targetDate
    ? existing
    : undefined;
}

export function continuedBlockWeeks(
  remainingWeeks: number,
  plan: RunPlan | undefined
): number {
  return typeof plan?.totalWeeks === "number" &&
    Number.isFinite(plan.totalWeeks)
    ? Math.max(remainingWeeks, plan.totalWeeks)
    : remainingWeeks;
}

/** Keep the actual sessions the runner has already resolved or explicitly
 * changed. A moved session reserves its original slot as well as its date,
 * so rebuilding cannot quietly add its old slot back as extra training. */
export function preserveEditedRunDays(
  previous: readonly ScheduledRunDay[],
  generated: readonly ScheduledRunDay[],
  manualCompletions: Record<string, ManualCompletion> | undefined,
  today: string
): ScheduledRunDay[] {
  const retained = previous.filter(
    (run) =>
      getScheduledRunStatus(run) !== "planned" ||
      run.userOverride ||
      run.movedFromDate ||
      (run.id && manualCompletions?.[run.id]) ||
      (run.date && run.date < today)
  );
  const reserved = new Set(
    retained.flatMap((run) => [run.date, run.movedFromDate]).filter(Boolean)
  );
  return [
    ...generated.filter((run) => !reserved.has(run.date)),
    ...retained,
  ].sort(
    (a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "") || a.dayIndex - b.dayIndex
  );
}

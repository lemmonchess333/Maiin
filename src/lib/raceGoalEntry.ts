import { raceDistanceLabel } from "@/lib/runProgrammeViewModel";

/**
 * A distance goal is a race the person has entered, or the distance run
 * on their own (Run9 STATUS 2026-11-01). The plan is the same either way;
 * what changes is what its last day is called.
 */
export type RaceGoalEntry = "race" | "own";

type GoalLike = { distance: string; entry?: RaceGoalEntry | null } | null;

/** The answer a goal holds. A goal set before the question was asked
 *  reads as a race, which is what everyone had then. */
export function raceGoalEntry(goal: GoalLike | undefined): RaceGoalEntry {
  return goal?.entry === "own" ? "own" : "race";
}

/** The distance as a sentence says it: "10K", "half marathon". */
function distanceInSentence(distance: string): string {
  const label = raceDistanceLabel(distance);
  return /^\d/.test(label) ? label : label.toLowerCase();
}

/** The last day's name: "Race day", or for a goal run alone the distance
 *  itself ("Your 10K"). */
export function goalDayName(goal: GoalLike | undefined): string {
  if (!goal || raceGoalEntry(goal) === "race") return "Race day";
  return `Your ${distanceInSentence(goal.distance)}`;
}

/** The question asked in the days after it: "Did you race?", or "Ran your
 *  10K?". */
export function goalDayQuestion(goal: GoalLike | undefined): string {
  if (!goal || raceGoalEntry(goal) === "race") return "Did you race?";
  return `Ran your ${distanceInSentence(goal.distance)}?`;
}

/** The answers setup and the run-plan editor offer, in this order, neither
 *  chosen until the person picks one. */
export const RACE_GOAL_ENTRY_OPTIONS: readonly {
  value: RaceGoalEntry;
  label: string;
}[] = [
  { value: "race", label: "A race I've entered" },
  { value: "own", label: "On my own" },
];

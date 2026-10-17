/**
 * Why each lift is in a session, under "Why this session" (owner,
 * 2026-10-16: the sheet said why the session and nothing about "the actual
 * exercises"). Written from what the plan stores and the catalogue says,
 * nothing else:
 *
 *  - the lift's role (`exerciseRole`): a main lift, which the day is built
 *    around and the volume balancer never trims; another compound; or an
 *    isolation, one joint moving;
 *  - the muscles the catalogue lists for it, the first and up to two of
 *    the rest;
 *  - for an isolation, the main lift that works the same muscle only in
 *    part, when the catalogue lists that muscle among the main lift's
 *    others;
 *  - the lift an equipment or injury swap put it in place of
 *    (`swappedFrom`, Lift4 (11)), which records the lift and not which of
 *    the two it was.
 *
 * No reps, sets or weights: the row above the sheet already shows them.
 */
import { getExerciseById } from "@/lib/exercises";
import {
  exerciseRole,
  type ExerciseRole,
} from "@/features/program/exerciseRole";
import type { ProgramExercise } from "@/features/program/programTypes";

export type LiftReasonExercise = Pick<
  ProgramExercise,
  "exerciseId" | "name" | "isAccessory" | "swappedFrom"
>;

export interface LiftReason {
  name: string;
  role: ExerciseRole;
  /** The role as the sheet names it. */
  label: string;
  /** What it does in this session; empty for a lift the catalogue does
   *  not know and no swap explains. */
  reason: string;
}

export const ROLE_LABEL: Record<ExerciseRole, string> = {
  main: "Main lift",
  compound: "Supporting lift",
  isolation: "Isolation",
};

/** The catalogue's muscle names as a sentence says them. Null for a name
 *  that is not a muscle. */
const SAID: Record<string, string | null> = {
  Pectorals: "chest",
  Deltoids: "shoulders",
  "Full Back": "back",
  "Full Body": "whole body",
  Cardio: null,
};

function said(muscle: string): string | null {
  return muscle in SAID ? SAID[muscle] : muscle.toLowerCase();
}

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function primaryOf(exerciseId: string): string | null {
  const muscle = getExerciseById(exerciseId)?.muscleGroup;
  return muscle ? said(muscle) : null;
}

function othersOf(exerciseId: string): string[] {
  return (getExerciseById(exerciseId)?.secondaryMuscles ?? [])
    .map(said)
    .filter((m): m is string => m !== null);
}

/** "Trains your lats, with your rhomboids and rear delts." */
function trains(exerciseId: string): string | null {
  const primary = primaryOf(exerciseId);
  if (!primary) return null;
  const others = othersOf(exerciseId)
    .filter((m) => m !== primary)
    .slice(0, 2);
  return others.length > 0
    ? `Trains your ${primary}, with your ${list(others)}.`
    : `Trains your ${primary}.`;
}

/** The isolation's sentence: the muscle directly, and the main lift that
 *  reaches it only in part when there is one. */
function isolates(
  exerciseId: string,
  mains: readonly LiftReasonExercise[]
): string | null {
  const primary = primaryOf(exerciseId);
  if (!primary) return null;
  const partly = mains.find((main) =>
    othersOf(main.exerciseId).includes(primary)
  );
  return partly
    ? `Trains your ${primary} directly, which the ${partly.name} works only in part.`
    : `Trains your ${primary} directly.`;
}

function swapped(exercise: LiftReasonExercise): string | null {
  const from = exercise.swappedFrom
    ? getExerciseById(exercise.swappedFrom.exerciseId)?.name
    : undefined;
  return from
    ? `In place of the ${from}, which your equipment or an injury rules out.`
    : null;
}

const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six"];

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

export function liftExerciseReasons(
  exercises: readonly LiftReasonExercise[]
): LiftReason[] {
  const roles = exercises.map((ex) => exerciseRole(ex));
  const mains = exercises.filter((_, i) => roles[i] === "main");
  return exercises.map((exercise, i) => {
    const role = roles[i];
    const sentences: (string | null)[] =
      role === "main"
        ? [
            mains.length > 1
              ? `One of the ${countWord(mains.length)} lifts this session is built around.`
              : "The lift this session is built around.",
            trains(exercise.exerciseId),
          ]
        : role === "compound"
          ? [trains(exercise.exerciseId)]
          : [isolates(exercise.exerciseId, mains)];
    sentences.push(swapped(exercise));
    return {
      name: exercise.name,
      role,
      label: ROLE_LABEL[role],
      reason: sentences.filter((s): s is string => s !== null).join(" "),
    };
  });
}

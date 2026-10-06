import {
  loweringOf,
  type ProgramExercise,
} from "@/features/program/programTypes";

/**
 * The one line a lift shows on the next session after the plan lowered it
 * itself (Lift4 (3)): "Down from 100 kg: two sessions under 5 reps". A drop
 * the person didn't make would read as a bug without it; anything the sets
 * explain says nothing. It shows until that session is finished, and not
 * once the lift is back where it came down from, as when the old weight is
 * typed back in.
 */
export default function LoweredLine({
  exercise,
  className,
}: {
  exercise: Pick<
    ProgramExercise,
    "exerciseId" | "lowered" | "weight" | "reps" | "repUnit"
  >;
  className?: string;
}) {
  const lowered = loweringOf(exercise);
  if (!lowered || lowered.shown) return null;
  const now = lowered.unit === "kg" ? exercise.weight : exercise.reps;
  if (now >= lowered.from) return null;
  const timed = exercise.repUnit === "seconds";
  const n = (value: number) => (
    <span className="font-mono tabular-nums">{value}</span>
  );
  const fromUnit =
    lowered.unit === "kg" ? " kg" : lowered.unit === "s" ? "s" : " reps";
  const targetUnit = timed ? "s" : lowered.unit === "kg" ? " reps" : "";
  return (
    <p className={className}>
      Down from {n(lowered.from)}
      {fromUnit}: two sessions under {n(lowered.target)}
      {targetUnit}
    </p>
  );
}

import { liftUnitLabel, loadIn } from "@/lib/liftLoad";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import {
  stretchOf,
  type ProgramExercise,
} from "@/features/program/programTypes";
import { sameWeight } from "@/features/program/sessionSets";

/**
 * The one line a lift shows on the next session after its target first
 * climbed past its range (Pgm7 A3): "Up to 19 reps on 10 kg: 12.5 kg is a
 * big jump". The next weight is too big a step for the plan to take on its
 * own (Lift4 (6)), so the reps climb instead, and a target past the range
 * the row shows can't be explained by last time's sets. It shows until that
 * session is finished, and not once the plan is on a heavier weight, as
 * when the heavier one is picked up. An easier session's lighter weight
 * still shows it: the line names the plan's own.
 */
export default function StretchedLine({
  exercise,
  className,
}: {
  exercise: Pick<
    ProgramExercise,
    "exerciseId" | "stretched" | "weight" | "repUnit"
  >;
  className?: string;
}) {
  const liftUnit = useLiftUnit();
  const stretched = stretchOf(exercise);
  if (!stretched) return null;
  const heavier =
    exercise.weight > stretched.weight &&
    !sameWeight(exercise.weight, stretched.weight);
  if (heavier) return null;
  const n = (value: number) => (
    <span className="font-mono tabular-nums">{value}</span>
  );
  const unit = exercise.repUnit === "seconds" ? "s" : " reps";
  const label = liftUnitLabel(liftUnit);
  return (
    <p className={className}>
      Up to {n(stretched.ceiling)}
      {unit} on {n(loadIn(stretched.weight, liftUnit))} {label}:{" "}
      {n(loadIn(stretched.next, liftUnit))} {label} is a big jump
    </p>
  );
}

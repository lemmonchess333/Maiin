import { Fragment } from "react";
import { Info } from "lucide-react";
import { getExerciseById } from "@/lib/exercises";
import { groupLastSets, type LastSet } from "@/features/program/lastSets";
import { formatRepTarget } from "@/features/program/repTarget";
import type { ProgramExercise } from "@/features/program/programTypes";
import ExerciseThumb from "./ExerciseThumb";
import LoweredLine from "./LoweredLine";
import StretchedLine from "./StretchedLine";
import { liftUnitLabel } from "@/lib/liftLoad";
import { kitLoadIn } from "@/features/program/loadSteps";
import { useLiftUnit } from "@/hooks/useLiftUnit";

/**
 * One exercise on Train's day list: its picture, its name, the
 * prescription, and the last time it was done (DS3).
 *
 * Both of the list's renderings, the tappable rows and the drag-to-reorder
 * rows, draw through this one component. They used to carry a copy each,
 * and the copies drifted: one said "BW x 12" for a bodyweight lift's last
 * set and the other printed the engine's stored load as if it had been
 * lifted ("Last: 35 kg x 12" under a chin-up, a load a swap had handed it).
 *
 * A bodyweight lift is asked about first, in the prescription and in the
 * last sets alike: its weight is the load added to it, which the plan
 * follows (Pgm8 L6), so it reads "+10 kg", and a set with none reads "BW".
 */
export default function ExerciseRowSummary({
  exercise,
  lastSets,
  showNotes = false,
  thumbSize = "md",
  showThumb = true,
}: {
  exercise: Pick<
    ProgramExercise,
    | "exerciseId"
    | "name"
    | "sets"
    | "reps"
    | "baseReps"
    | "repRangeMax"
    | "progressionType"
    | "repUnit"
    | "weight"
    | "notes"
    | "lowered"
    | "stretched"
  >;
  /** Every set of the last session with this exercise that the plan reads
   *  (`lastSetsByExercise`), so a held or raised weight explains itself. */
  lastSets?: readonly LastSet[];
  /** The day's note on the exercise, under the rest. The reorder rows
   *  leave it out to stay one height while they are dragged. */
  showNotes?: boolean;
  thumbSize?: "sm" | "md";
  /** Off where the row draws the picture itself, as a button of its own:
   *  Train's drawing opens the exercise's form guide, and a button cannot
   *  sit inside the row's own. */
  showThumb?: boolean;
}) {
  const liftUnit = useLiftUnit();
  const isBW = getExerciseById(exercise.exerciseId)?.equipment === "Bodyweight";
  return (
    /* The drawing gives its room to the name once the row is under 10em
       (larger text on the phone), where beside it the name read "P…"
       and the sets ran one word to a line. */
    <div className="@container flex min-w-0 flex-1 items-center gap-3">
      {showThumb && (
        <ExerciseThumb
          exerciseId={exercise.exerciseId}
          size={thumbSize}
          className="@max-[10em]:hidden"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-foreground truncate">
          {exercise.name}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">{exercise.sets}</span> sets ×{" "}
          <span className="font-mono tabular-nums">
            {formatRepTarget(exercise)}
          </span>{" "}
          {exercise.repUnit === "seconds" ? "" : "reps"}
          {exercise.weight > 0 ? (
            <>
              {" · "}
              <span className="font-mono tabular-nums">
                {isBW ? "+" : ""}
                {kitLoadIn(exercise.weight, liftUnit, exercise.exerciseId)}
              </span>
              {` ${liftUnitLabel(liftUnit)}`}
            </>
          ) : null}
        </p>
        {lastSets && lastSets.length > 0 && (
          <p className="text-xs mt-0.5 text-muted-foreground">
            Last:{" "}
            <LastSetsLine
              sets={lastSets}
              timed={exercise.repUnit === "seconds"}
              bodyweight={isBW}
              exerciseId={exercise.exerciseId}
            />
          </p>
        )}
        <LoweredLine
          exercise={exercise}
          className="text-xs mt-0.5 text-muted-foreground"
        />
        <StretchedLine
          exercise={exercise}
          className="text-xs mt-0.5 text-muted-foreground"
        />
        {showNotes && exercise.notes && (
          <p className="text-xs mt-1 text-muted-foreground flex items-start gap-1">
            <Info className="size-3 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{exercise.notes}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** "60 kg × 12, 12, 10"; "100 kg × 5 · 90 kg × 5, 5" where the weight
 *  changed; "BW × 12, 10" for a bodyweight lift, and "+10 kg × 8, 8" for
 *  one with load added; "45s, 40s" for a hold. */
function LastSetsLine({
  sets,
  timed,
  bodyweight,
  exerciseId,
}: {
  sets: readonly LastSet[];
  timed: boolean;
  bodyweight: boolean;
  exerciseId: string | undefined;
}) {
  const liftUnit = useLiftUnit();
  const reps = sets.map((set) => set.reps);
  if (timed) return <Numbers values={reps} unit="s" />;
  return groupLastSets(sets).map((group, index) => (
    <Fragment key={index}>
      {index > 0 ? " · " : null}
      {group.weightKg > 0 ? (
        <>
          <span className="font-mono tabular-nums">
            {bodyweight ? "+" : ""}
            {kitLoadIn(group.weightKg, liftUnit, exerciseId)}
          </span>{" "}
          {liftUnitLabel(liftUnit)}
        </>
      ) : bodyweight ? (
        "BW"
      ) : (
        "—"
      )}{" "}
      × <Numbers values={group.reps} />
    </Fragment>
  ));
}

function Numbers({
  values,
  unit = "",
}: {
  values: readonly number[];
  unit?: string;
}) {
  return values.map((value, index) => (
    <Fragment key={index}>
      {index > 0 ? ", " : null}
      <span className="font-mono tabular-nums">{value}</span>
      {unit}
    </Fragment>
  ));
}

import ExerciseThumb from "@/components/program/ExerciseThumb";
import InlineNumerals from "@/components/ui/InlineNumerals";
import SectionLabel from "@/components/ui/SectionLabel";
import { liftDayNameIn } from "@/lib/liftDayLabel";
import type { WorkoutDay } from "@/features/program/programTypes";

/**
 * The plan's first lift: its name as Train names it, how many exercises it
 * holds, and the first three with their pictures.
 *
 * Setup's last step shows it as the session to start with, and the setup
 * step shows it as the answer changes (FV3): equipment and experience
 * change the exercises inside the days, so switching kit is seen here
 * rather than only in a collapsed week.
 */
export default function FirstLiftPreview({
  workouts,
  meta,
}: {
  workouts: readonly WorkoutDay[];
  /** After the exercise count: "Build muscle" on the last step. */
  meta?: string;
}) {
  const first = workouts[0];
  if (!first) return null;
  const count = first.exercises.length;
  return (
    <section
      className="rounded-2xl bg-card card-shadow p-5 space-y-3"
      aria-label="First lift preview"
    >
      <SectionLabel className="text-lifting-strong">
        Your first lift
      </SectionLabel>
      <h2 className="text-xl font-bold">
        {liftDayNameIn(
          workouts.map((w) => w.dayName),
          0,
          first.dayName
        )}
      </h2>
      <p className="text-sm text-muted-foreground">
        <InlineNumerals>
          {meta ? `${count} exercises · ${meta}` : `${count} exercises`}
        </InlineNumerals>
      </p>
      <ul className="space-y-2">
        {first.exercises.slice(0, 3).map((exercise) => (
          <li
            key={exercise.instanceId ?? exercise.name}
            className="flex items-center gap-3"
          >
            <ExerciseThumb exerciseId={exercise.exerciseId} size="sm" />
            <span className="text-sm font-medium">{exercise.name}</span>
          </li>
        ))}
        {count > 3 && (
          <li className="text-sm text-muted-foreground pl-[3.25rem]">
            <InlineNumerals>{`and ${count - 3} more`}</InlineNumerals>
          </li>
        )}
      </ul>
    </section>
  );
}

import { useState } from "react";
import { Dumbbell, Footprints, Minus } from "lucide-react";
import Button from "@/components/ui/Button";
import InlineNumerals from "@/components/ui/InlineNumerals";
import {
  DAY_LABELS,
  liftIndexForDayOfWeek,
  type ScheduleDay,
} from "@/lib/scheduleUtils";
import { liftDayNameIn, liftWeekDayNames } from "@/lib/liftDayLabel";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import type {
  WorkoutDay,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { runMinutesLine } from "@/lib/runDose";
import { formatRepTarget } from "@/features/program/repTarget";
import { parseLocalDate, weekPosition } from "@/lib/dateHelpers";
import { cn } from "@/lib/utils";

export default function WeekPreview({
  schedule,
  workouts = [],
  runDays = [],
  draft = false,
  freeRunning = false,
  easyPaceSPerKm = null,
}: {
  schedule: ScheduleDay[];
  workouts?: WorkoutDay[];
  runDays?: ScheduledRunDay[];
  draft?: boolean;
  freeRunning?: boolean;
  /** A confirmed easy pace, for a long run's minutes (Run21 (5)). */
  easyPaceSPerKm?: number | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  // `schedule` arrives in getDay() order (Sunday first). The week the
  // user is shown starts where every other week in the app starts
  // (`WEEK_STARTS_ON`) — Home's strip flipped to Monday and this preview
  // was left reading Sun … Sat beside it. Order, never renumber: `day`
  // stays the getDay() index the split indexer and the run days key on.
  const orderedDays = [...schedule].sort(
    (a, b) => weekPosition(a.day) - weekPosition(b.day)
  );
  const detail = schedule.find((day) => day.day === selected);
  const lifts = schedule.filter(
    (day) => day.type === "lift" || day.type === "both"
  ).length;
  const runs = schedule.filter(
    (day) => day.type === "run" || day.type === "both"
  ).length;
  // A free-running-only week has open days, not seven prescribed rest days.
  const openWeek =
    freeRunning && lifts === 0 && runs === 0 && workouts.length === 0;
  const workoutIndex = detail
    ? liftIndexForDayOfWeek(schedule, detail.day)
    : -1;
  const workout = detail ? workouts[workoutIndex] : undefined;
  const run =
    detail &&
    runDays.find(
      (day) => day.date && parseLocalDate(day.date).getDay() === detail.day
    );
  const runTemplate =
    run &&
    RUN_TEMPLATES.find(
      (template) => template.id === (run.userOverride || run.templateId)
    );
  // The name says a long run's distance ("Long 6K"); its minutes are the
  // runner's own, when a confirmed pace gives them.
  const runMinutes = runTemplate
    ? runMinutesLine(runTemplate, easyPaceSPerKm)
    : null;
  /* The lifts the week holds, in the order they come (FV3): what the days
     and minutes just chosen built, named as Train will name them. */
  const liftNames =
    !openWeek && lifts > 0 && workouts.length > 0
      ? liftWeekDayNames(workouts.map((w) => w.dayName)).join(", ")
      : null;
  return (
    <section
      className="rounded-2xl bg-card card-shadow p-4 space-y-3"
      aria-label={draft ? "Draft week" : "Your week shape"}
    >
      <div>
        <h2 className="text-base font-semibold">
          {draft ? "Draft week" : "Your week shape"}
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {openWeek ? (
            "Free running"
          ) : (
            <>
              <span className="font-mono tabular-nums">{lifts}</span> lifts
              {runs > 0 && (
                <>
                  {" "}
                  · <span className="font-mono tabular-nums">{runs}</span> runs
                </>
              )}
              {freeRunning && " · free running"}
            </>
          )}
        </p>
        {liftNames && (
          <p className="text-sm text-muted-foreground">{liftNames}</p>
        )}
      </div>
      <div className="flex gap-0.5 -mx-2 overflow-x-auto">
        {orderedDays.map(({ day, type }) => (
          <Button
            key={day}
            variant="ghost"
            aria-pressed={selected === day}
            aria-label={`${DAY_LABELS[day]}: ${openWeek ? "open day" : type === "both" ? "lift and run" : type}`}
            onClick={() => setSelected(selected === day ? null : day)}
            className={cn(
              "min-w-11 min-h-16 flex-1 px-0 flex-col gap-1 text-caption",
              selected === day && "bg-muted ring-1 ring-primary"
            )}
          >
            <span>{DAY_LABELS[day]}</span>
            <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
              {(type === "lift" || type === "both") && (
                <Dumbbell className="size-4 text-lifting-strong" />
              )}
              {(type === "run" || type === "both") && (
                <Footprints className="size-4 text-running-strong" />
              )}
              {type === "rest" && (
                <Minus className="size-4 text-muted-foreground" />
              )}
            </span>
          </Button>
        ))}
      </div>
      <div className="space-y-3" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          {detail
            ? `${DAY_LABELS[detail.day]} · ${openWeek ? "Run when it suits you." : detail.type === "both" ? "Lift and run share this day." : detail.type === "lift" ? "Lifts follow your split in order." : detail.type === "run" ? "A planned running slot." : "No planned session."}`
            : lifts > 0
              ? "Tap a day to inspect the sessions. Lifts follow your split in order."
              : "Tap a day to inspect your week."}
        </p>
        {workout && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-lifting-strong">
              {liftDayNameIn(
                workouts.map((w) => w.dayName),
                workoutIndex,
                workout.dayName
              )}
            </h3>
            {/* Each lift's picture gives way under 16em (double text on a
                narrow phone), leaving the name and its sets the row. */}
            <ul className="@container divide-y divide-border">
              {workout.exercises.map((exercise, index) => (
                <li
                  key={exercise.instanceId ?? `${exercise.name}-${index}`}
                  className="flex items-center gap-3 py-2 text-sm"
                >
                  <ExerciseThumb
                    exerciseId={exercise.exerciseId}
                    size="sm"
                    className="@max-[16em]:hidden"
                  />
                  <span className="min-w-0 flex-1">{exercise.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    <InlineNumerals>{`${exercise.sets} × ${formatRepTarget(exercise)}${exercise.repUnit === "seconds" ? "" : " reps"}`}</InlineNumerals>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {runTemplate && (
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-running-strong">
              <InlineNumerals>
                {runMinutes
                  ? `${runTemplate.name} · ${runMinutes}`
                  : runTemplate.name}
              </InlineNumerals>
            </h3>
            <p className="text-sm text-muted-foreground">
              {runTemplate.description}
            </p>
          </div>
        )}
      </div>
      {freeRunning && (
        <p className="text-sm text-muted-foreground">
          Run when it suits you. Tropos won’t schedule your runs.
        </p>
      )}
    </section>
  );
}

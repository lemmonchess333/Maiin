import type { ReactNode } from "react";
import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";
import type { LiftFigure } from "@/lib/liftFigures";
import { formatClock } from "@/utils/formatters";

/**
 * The session as three figures under its name (DS4): the time, the sets
 * that count done of planned, and the work, kg lifted (reps for a
 * bodyweight session), as Hevy puts Duration, Volume and Sets under its
 * bar. Each is a number over the word that says what it counts, the
 * finish screen's three figures arriving as the session goes: the work is
 * the finish screen's own sum (`sessionWork`). They are the screen's
 * largest text while no rest is running, 25 px over the exercise's 20.
 *
 * Only this updates each second, leaving the set editor untouched.
 */
export default function WorkoutProgress({
  startedAt,
  completed,
  total,
  work,
}: {
  startedAt: number;
  completed: number;
  total: number;
  work: LiftFigure;
}) {
  const elapsed = useElapsedSeconds(startedAt);
  return (
    /* Three across on a phone, each a third of the row at least, and a
       figure that does not fit goes to the next line rather than being
       cut. Under 17em of row (larger text sizes) each word sits beside its
       figure: stacked, the three took half a 320 px phone at double text. */
    <div className="@container">
      <dl className="flex flex-wrap gap-x-2 gap-y-1.5 @max-[17em]:gap-x-4 @max-[17em]:gap-y-1">
        <Figure label="time">{formatClock(elapsed)}</Figure>
        <Figure label="sets">
          <span aria-hidden="true">
            {completed}/{total}
          </span>
          <span className="sr-only">
            {completed} of {total}
          </span>
        </Figure>
        <Figure label={work.unit}>{work.format(work.to)}</Figure>
      </dl>
    </div>
  );
}

/** A figure over its word, or beside it on its baseline at larger text
 *  sizes. The word comes first for a screen reader ("time, 0:42"). */
function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 basis-[5.5em] flex-col-reverse @max-[17em]:flex-none @max-[17em]:basis-auto @max-[17em]:flex-row-reverse @max-[17em]:items-baseline @max-[17em]:justify-end @max-[17em]:gap-1.5">
      <dt className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground @max-[17em]:mt-0">
        {label}
      </dt>
      <dd className="whitespace-nowrap text-h2 font-extrabold font-figure leading-none tabular-nums text-foreground">
        {children}
      </dd>
    </div>
  );
}

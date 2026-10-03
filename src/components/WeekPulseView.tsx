import SectionLabel from "@/components/ui/SectionLabel";
import { Dumbbell, Footprints, Flame } from "lucide-react";
import type { WeekPulse } from "@/lib/weeklyReviewViewModel";
import { storedKmLabel } from "@/lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { THEME } from "@/lib/theme";

/**
 * "Your week so far" for a week already read. The run finish screen reads
 * the week itself, once, because its plan row counts the same runs; the
 * workout's finish screen reads it through `WeekPulseCard`.
 *
 * Its own file because the run finish screen loads it lazily: from
 * `WeekPulseCard`'s file it brought the hook's chunk with it, and with that
 * the workout finish screen's files, all preloaded on a run's screen.
 */
export default function WeekPulseView({ pulse }: { pulse: WeekPulse | null }) {
  // Before the early return — a hook cannot sit behind one.
  const unit = useDistanceUnit();
  if (!pulse) return null;

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
      <SectionLabel>Your week so far</SectionLabel>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {pulse.lifts && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Dumbbell className="size-4 text-lifting" aria-hidden="true" />
            <span className="font-mono tabular-nums">
              {pulse.lifts.done}
              {pulse.lifts.planned !== null && ` of ${pulse.lifts.planned}`}
            </span>{" "}
            <span className="font-normal text-muted-foreground">
              {pulse.lifts.done === 1 && pulse.lifts.planned === null
                ? "lift"
                : "lifts"}
            </span>
          </span>
        )}
        {pulse.runs && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Footprints className="size-4 text-running" aria-hidden="true" />
            <span className="font-mono tabular-nums">
              {/* Stored KILOMETRES — a bare `km` here showed a miles
                  reader the metric figure. */}
              {storedKmLabel(pulse.runs.km, unit, true, 1)}
              {pulse.runs.planned !== null &&
                ` · ${pulse.runs.count} of ${pulse.runs.planned}`}
            </span>{" "}
            <span className="font-normal text-muted-foreground">
              {pulse.runs.planned !== null
                ? "runs"
                : pulse.runs.count === 1
                  ? "run"
                  : "runs"}
            </span>
          </span>
        )}
        {pulse.streak !== null && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {/* Streak identity is amber (StreakFlame.tsx) — NOT nutrition
                orange, which is reserved for the food domain. */}
            <Flame
              className="size-4"
              style={{ color: THEME.amber }}
              aria-hidden="true"
            />
            <span className="font-mono tabular-nums">{pulse.streak}</span>{" "}
            <span className="font-normal text-muted-foreground">
              day streak
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

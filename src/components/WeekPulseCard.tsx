import { Dumbbell, Footprints, Flame } from "lucide-react";
import { useWeekPulse } from "@/hooks/useWeekPulse";
import { THEME } from "@/lib/theme";

/**
 * "Your week so far" (Rev1 PR2) — the live mid-week counterpart of the
 * Weekly Review's training section, shown at the two moments of maximum
 * attention: SessionCompleteScreen and RunSummary. Week progress in both
 * sport-coded lanes + streak. Deliberately NO PI claims (the index
 * recomputes async after a save — an instant "+3 PI" would be a guess).
 * Renders nothing while loading or when there's nothing to say.
 */
export default function WeekPulseCard() {
  const pulse = useWeekPulse();
  if (!pulse) return null;

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Your week so far
      </p>
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
              {pulse.runs.km} km
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

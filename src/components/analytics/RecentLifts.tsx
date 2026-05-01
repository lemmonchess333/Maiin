import { Link } from "react-router-dom";
import { Trophy, ChevronRight } from "lucide-react";
import { type Workout } from "@/hooks/useWorkouts";
import { THEME } from "@/lib/theme";
import { formatVolume } from "@/utils/formatters";

interface RecentLiftsProps {
  workouts: Workout[];
  /** How many recent sessions to render. Default 8 — matches Recent Runs. */
  limit?: number;
}

function workoutVolume(w: Workout): number {
  let total = 0;
  w.exercises?.forEach((ex) => {
    ex.sets?.forEach((set) => {
      total += (set.weightKg || 0) * (set.reps || 0);
    });
  });
  return total;
}

function workoutSetCount(w: Workout): number {
  let total = 0;
  w.exercises?.forEach((ex) => {
    total += ex.sets?.length || 0;
  });
  return total;
}

/**
 * Pick the "headline" exercise for a workout — the one with the highest
 * volume contribution. We use this both as the visible workout title
 * (when no other name is set) and as the destination for the card's
 * tap target, since there is no per-workout detail route — the closest
 * drill-in is `/history/exercise/{name}`.
 */
function headlineExercise(w: Workout): string | null {
  if (!w.exercises?.length) return null;
  let bestName: string | null = null;
  let bestVol = -1;
  for (const ex of w.exercises) {
    let vol = 0;
    ex.sets?.forEach((s) => {
      vol += (s.weightKg || 0) * (s.reps || 0);
    });
    if (vol > bestVol) {
      bestVol = vol;
      bestName = ex.exerciseName;
    }
  }
  return bestName;
}

export default function RecentLifts({ workouts, limit = 8 }: RecentLiftsProps) {
  const sorted = [...workouts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">Recent Lifts</p>
      {sorted.map((w) => {
        const vol = workoutVolume(w);
        const sets = workoutSetCount(w);
        const exerciseCount = w.exercises?.length ?? 0;
        const headline = headlineExercise(w);
        const dateLabel = new Date(w.date + "T12:00:00").toLocaleDateString(
          "en-GB",
          { day: "numeric", month: "short" },
        );
        const volFormatted = formatVolume(vol);
        const title = headline ?? "Workout";
        const drillIn = headline
          ? `/history/exercise/${encodeURIComponent(headline)}`
          : "/history";

        return (
          <Link
            key={w.id}
            to={drillIn}
            className="block rounded-xl bg-card p-3 active:scale-[0.98] transition-transform"
            style={{ boxShadow: "var(--ds-shadow-card)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${THEME.lifting}18` }}
              >
                <Trophy className="w-4 h-4" style={{ color: THEME.lifting }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {title}
                  {exerciseCount > 1 && (
                    <span className="text-xs font-medium text-muted-foreground ml-1.5">
                      +{exerciseCount - 1}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
                  {volFormatted.value}
                  {volFormatted.unit && (
                    <span className="ml-0.5">{volFormatted.unit}</span>
                  )}
                  <span className="mx-1.5">·</span>
                  {sets} {sets === 1 ? "set" : "sets"}
                </p>
              </div>
              <div className="text-right shrink-0 flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground">{dateLabel}</p>
                <ChevronRight
                  className="w-4 h-4 text-muted-foreground/60"
                  aria-hidden="true"
                />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

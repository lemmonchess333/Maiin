import { useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, ChevronRight } from "lucide-react";
import { type Workout } from "@/hooks/useWorkouts";
import { THEME } from "@/lib/theme";
import { formatVolume } from "@/utils/formatters";

/** Hard ceiling on the expanded list — beyond this it stops being a list
 *  and starts being a haystack. The analytics + charts above already
 *  serve the "see all my data" job; Recent Lifts is for the most recent
 *  sessions, not lifetime browse. */
const HARD_MAX = 30;
const COLLAPSED = 5;

interface RecentLiftsProps {
  workouts: Workout[];
  /** Active analytics window in days, used to cap the expanded list so
   *  it never exceeds what the page above is summarising. */
  rangeDays: number;
  /** Human-readable label for the range, e.g. "1M". Used in the
   *  expander button copy. */
  rangeLabel?: string;
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

export default function RecentLifts({ workouts, rangeDays, rangeLabel }: RecentLiftsProps) {
  const [expanded, setExpanded] = useState(false);

  // Cap the FULL pool to workouts inside the active analytics window
  // so "Show all" can't surface ancient sessions when the user has
  // 1W selected. Then cap further at HARD_MAX (30) so a 1Y view stays
  // a list, not a haystack.
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);
  const inWindow = workouts.filter((w) => new Date(w.date) >= since);
  const sortedFull = [...inWindow].sort((a, b) => b.date.localeCompare(a.date));
  const sortedAll = sortedFull.slice(0, HARD_MAX);
  const wasCapped = sortedFull.length > HARD_MAX;

  if (sortedAll.length === 0) return null;

  const visibleCount = expanded ? sortedAll.length : Math.min(COLLAPSED, sortedAll.length);
  const visible = sortedAll.slice(0, visibleCount);
  const hiddenCount = sortedAll.length - visibleCount;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">Recent Lifts</p>
      {visible.map((w) => {
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
      {hiddenCount > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground py-2 active:scale-[0.98] transition-all"
          style={{ color: THEME.lifting }}
        >
          {wasCapped
            ? `Show ${HARD_MAX} most recent`
            : `Show all${rangeLabel ? ` in ${rangeLabel}` : ""} (${sortedAll.length})`}
        </button>
      )}
      {expanded && sortedAll.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground py-2 active:scale-[0.98] transition-all"
        >
          Show less
        </button>
      )}
    </div>
  );
}

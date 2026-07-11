import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import {
  weeklyVolumeByMuscle,
  volumeLandmark,
  classifyVolume,
  type VolumeStatus,
} from "@/features/program/volumeModel";
import type { WorkoutDay } from "@/features/program/programTypes";

/**
 * Weekly sets-per-muscle summary (D-LIFT-1, read-only). Surfaces the hard-set
 * tally per muscle for the viewed week against goal-driven landmark bands — the
 * volume view the engine programs but never showed. Hides when there's no
 * attributable resistance volume (e.g. a run-only or all-skipped week).
 */
/* "high" is information, not alarm — above-band volume in a hard week is a
   normal state, and orange (the warning register) stacked across five rows
   read as five warnings. Orange stays reserved for `low` (the actionable
   gap); above-band gets the lifting purple: domain-consistent "plenty of
   volume", zero alarm. */
const STATUS_COLOR: Record<VolumeStatus, string> = {
  low: THEME.warning,
  optimal: THEME.success,
  high: THEME.lifting,
};
const STATUS_LABEL: Record<VolumeStatus, string> = {
  low: "below target",
  optimal: "on target",
  high: "high",
};

export default function WeeklyVolumeCard({
  workouts,
  primaryGoal,
}: {
  workouts: WorkoutDay[];
  primaryGoal?: string;
}) {
  /* Collapsed by default (owner declutter call, 2026-07-11): the full
     per-muscle table is ~9 rows of standing scroll mass on the lift tab.
     The summary line carries the actionable read (how many muscles are
     below target); the table expands in place for the detailed look. */
  const [expanded, setExpanded] = useState(false);
  const volume = weeklyVolumeByMuscle(workouts);
  if (volume.length === 0) return null;
  const landmark = volumeLandmark(primaryGoal);

  const lowCount = volume.filter(
    ({ sets }) => classifyVolume(sets, landmark) === "low"
  ).length;
  const summary =
    lowCount === 0
      ? "all muscles on target"
      : `${lowCount} ${lowCount === 1 ? "muscle" : "muscles"} below target`;

  return (
    <div className="rounded-2xl bg-card p-4 shadow-card space-y-3 mt-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="w-full min-h-[44px] -my-1 flex items-center justify-between gap-3 text-left"
      >
        <div>
          <SectionLabel>Weekly volume</SectionLabel>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span
              style={{
                color: lowCount > 0 ? THEME.warning : undefined,
              }}
            >
              {summary}
            </span>{" "}
            · target{" "}
            <span className="font-mono tabular-nums">
              {landmark.low}–{landmark.high}
            </span>
            /week
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground shrink-0 motion-safe:transition-transform",
            expanded && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="space-y-2">
          {volume.map(({ muscle, sets }) => {
            const status = classifyVolume(sets, landmark);
            // Bar fills relative to the top of the band (high), capped at 100%.
            const pct = Math.min(100, (sets / landmark.high) * 100);
            return (
              <div key={muscle} className="flex items-center gap-3">
                <span className="text-sm text-foreground w-20 shrink-0">
                  {muscle}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: STATUS_COLOR[status],
                    }}
                  />
                </div>
                <span className="text-sm font-mono tabular-nums text-foreground w-7 text-right">
                  {sets}
                </span>
                <span
                  className="text-caption w-20 shrink-0 text-right"
                  style={{ color: STATUS_COLOR[status] }}
                >
                  {STATUS_LABEL[status]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

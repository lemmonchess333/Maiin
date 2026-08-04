import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import {
  weeklyVolumeByJudgementMuscle,
  judgementLandmark,
  classifyVolume,
  JUDGEMENT_MUSCLE_ORDER,
  type JudgementMuscle,
  type VolumeStatus,
} from "@/features/program/volumeModel";
import type { WorkoutDay } from "@/features/program/programTypes";

/**
 * Weekly sets-per-muscle summary (D-LIFT-1, read-only). Surfaces the hard-set
 * tally per JUDGEMENT group for the viewed week, each against its own
 * goal-driven landmark band — the same groups and bands the generator's
 * balancers and reconciler act on, so what this card flags is what the
 * engine actually manages. (The old canonical view judged a lateral raise
 * and a rear-delt flye against one "Shoulders" band — the incoherence the
 * judgement layer exists to end; see volumeModel's taxonomy-split notes.)
 * Hides when there's no attributable resistance volume.
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

/** Display names for the judgement groups. */
const MUSCLE_LABEL: Record<JudgementMuscle, string> = {
  Chest: "Chest",
  FrontDelts: "Front delts",
  SideDelts: "Side delts",
  RearDelts: "Rear delts",
  Lats: "Lats",
  UpperBack: "Upper back",
  LowerBack: "Lower back",
  Biceps: "Biceps",
  Triceps: "Triceps",
  Quads: "Quads",
  Hamstrings: "Hamstrings",
  Glutes: "Glutes",
  Calves: "Calves",
  Abs: "Abs",
};

export default function WeeklyVolumeCard({
  workouts,
  primaryGoal,
}: {
  workouts: WorkoutDay[];
  primaryGoal?: string;
}) {
  /* Collapsed by default (owner declutter call, 2026-07-11): the full
     per-muscle table is standing scroll mass on the lift tab. The summary
     line carries the actionable read (how many muscles are below target);
     the table expands in place for the detailed look. */
  const [expanded, setExpanded] = useState(false);
  const volume = weeklyVolumeByJudgementMuscle(workouts);
  if (volume.length === 0) return null;

  /* Zero-volume groups are the ones that MOST need saying, and they were the
     only ones the card could not say. `weeklyVolumeByJudgementMuscle` returns
     only groups with sets > 0, so a plan containing no direct side-delt or
     calf work rendered twelve rows instead of fourteen and the absence read
     as nothing at all — no row, no warning, no number. That is exactly
     backwards: 4 sets shows as "below target" while 0 sets is invisible.
     (Found 2026-08-04 on the operator's own live plan, which carries zero of
     both because its slots predate the generator gaining them — an existing
     plan takes planBuilder's preserve branch and never receives generator
     improvements.)

     Only groups with a real floor are surfaced at zero: front delts carry
     low = 0 because pressing covers them, so a "0 · on target" row there
     would be noise rather than a finding. */
  const tallied = new Map(volume.map((v) => [v.muscle, v.sets]));
  const rows = JUDGEMENT_MUSCLE_ORDER.map((muscle) => {
    const sets = tallied.get(muscle) ?? 0;
    const landmark = judgementLandmark(primaryGoal, muscle);
    return { muscle, sets, landmark, status: classifyVolume(sets, landmark) };
  }).filter(({ sets, landmark }) => sets > 0 || landmark.low > 0);
  // A group whose band has no floor (front delts: pressing covers it) can
  // never be "below target", so the count stays meaningful per group.
  const lowCount = rows.filter(({ status }) => status === "low").length;
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
            · per-muscle targets
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
          {rows.map(({ muscle, sets, landmark, status }) => {
            // Bar fills relative to the top of the band (high), capped at 100%.
            const pct = Math.min(100, (sets / landmark.high) * 100);
            return (
              <div key={muscle} className="flex items-center gap-3">
                <span className="text-sm text-foreground w-24 shrink-0">
                  {MUSCLE_LABEL[muscle]}
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

/**
 * RaceCockpitCard — the Programme Run cockpit's race-prep identity card.
 *
 * Training-plan primitive (see CLAUDE.md → "Training plan primitives").
 * Replaces the plain RaceHeader one-liner with a proper command-centre
 * header that answers, at a glance: what race, how far away, what
 * week/phase, and how far through the cycle.
 *
 * Renders ONLY when a race goal is active (the race_goal overlay of the
 * locked 2-state model). It carries no mode language — there is no
 * user-facing freeform/structured/race_prep toggle (Run9a).
 *
 * Palette: coral (running) accents only, on a standard card surface. The
 * phase rail reflects the REAL engine phases (Base · Build · Taper ·
 * Race from getPhaseForWeek) — no invented "Peak" segment, so the active
 * highlight always corresponds to a phase the scheduler can emit.
 */

import { ChevronRight, Flag } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dateHelpers";
import PhaseRail from "./PhaseRail";

interface RaceCockpitCardProps {
  /** Readable distance — "Marathon", "Half Marathon", "10K", "5K". */
  distanceLabel: string;
  /** Local "YYYY-MM-DD" target date. */
  targetDate: string;
  daysToRace: number;
  /** Stored 0-based week index (null when the plan has no counters). */
  currentWeek: number | null;
  totalWeeks: number | null;
  /** "Base" | "Build" | "Taper" | "Race" (null when no progress). */
  phaseLabel: string | null;
  inTaper: boolean;
  compressed: boolean;
  onEdit: () => void;
}

export default function RaceCockpitCard({
  distanceLabel,
  targetDate,
  daysToRace,
  currentWeek,
  totalWeeks,
  phaseLabel,
  inTaper,
  compressed,
  onEdit,
}: RaceCockpitCardProps) {
  const hasProgress = currentWeek != null && totalWeeks != null;
  const progress = hasProgress
    ? Math.min(100, Math.max(0, ((currentWeek! + 1) / totalWeeks!) * 100))
    : 0;

  const dateLabel = (() => {
    try {
      return format(parseLocalDate(targetDate), "d MMM yyyy");
    } catch {
      return targetDate;
    }
  })();

  return (
    <section
      aria-label="Race plan"
      className="rounded-2xl bg-card border border-border p-4 space-y-4 card-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-running">
            <Flag className="size-3.5" aria-hidden="true" />
            Race plan
          </div>
          <h3 className="text-2xl font-extrabold tracking-tight text-foreground leading-tight">
            {distanceLabel}
          </h3>
          <p className="text-sm text-muted-foreground">
            {dateLabel}
            {" · "}
            <span className="font-medium text-foreground">
              {daysToRace} {daysToRace === 1 ? "day" : "days"} out
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit race goal"
          className="shrink-0 inline-flex items-center gap-0.5 min-h-[44px] px-2 -my-1 -mr-1 text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97] transition-transform rounded-md"
        >
          Edit
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {hasProgress && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted/60 p-3">
            <SectionLabel tier="section">Week</SectionLabel>
            <p className="text-lg font-semibold tabular-nums font-mono text-foreground">
              {currentWeek! + 1} / {totalWeeks!}
            </p>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <SectionLabel tier="section">Phase</SectionLabel>
            <p className="text-lg font-semibold text-foreground">
              {phaseLabel ?? "—"}
            </p>
          </div>
        </div>
      )}

      {hasProgress && (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all bg-running"
              style={{ width: `${progress}%` }}
            />
          </div>
          <PhaseRail activePhase={phaseLabel} />
        </div>
      )}

      {inTaper && (
        <SectionLabel tier="section" className="text-running">
          Taper week
          {" · "}
          race in {daysToRace} {daysToRace === 1 ? "day" : "days"}
        </SectionLabel>
      )}

      {compressed && (
        <p className="text-xs text-muted-foreground">
          Compressed plan — your target date is sooner than the ideal build for
          this distance, so interval work is trimmed and the long-run
          progression shortened to keep it safe.
        </p>
      )}
    </section>
  );
}

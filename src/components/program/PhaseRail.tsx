/**
 * PhaseRail — the Base · Build · Taper · Race rail.
 *
 * Shared by the post-save race cockpit (RaceCockpitCard, highlights the
 * current week's phase) and the pre-save planner preview (RaceGoalPlanner,
 * highlights week 0). Sharing one component keeps the before-save and
 * after-save surfaces from drifting — the planner is meant to be a faithful
 * preview of the cockpit.
 *
 * The labels mirror the engine's real phases (getPhaseForWeek) — no invented
 * "Peak" segment, so the active highlight always maps to a phase the scheduler
 * can emit. Coral (running) accent only.
 */
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** The engine's real phases (getPhaseForWeek), ordered for the rail. */
export const PHASE_RAIL = ["Base", "Build", "Taper", "Race"] as const;

interface PhaseRailProps {
  /** Phase to highlight ("Base" | "Build" | "Taper" | "Race"), or null for none. */
  activePhase: string | null;
  className?: string;
}

export default function PhaseRail({ activePhase, className }: PhaseRailProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-1 text-[10px] text-muted-foreground",
        className
      )}
      aria-hidden="true"
    >
      {PHASE_RAIL.map((label) => (
        <span
          key={label}
          className={cn(
            "text-center",
            label === activePhase && "font-bold text-foreground"
          )}
          style={label === activePhase ? { color: THEME.running } : undefined}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

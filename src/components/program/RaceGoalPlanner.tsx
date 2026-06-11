/**
 * RaceGoalPlanner — the pre-save preview inside the Programme Settings
 * race-prep editor.
 *
 * Replaces the raw "distance + date" race-prep block with a calm, derived
 * preview: as soon as a date is chosen, it shows weeks-out, a distance-aware
 * timing status, the Base · Build · Taper · Race rail, the weekly structure
 * the engine will build, and post-race recovery — a pre-save preview of the
 * post-save RaceCockpitCard.
 *
 * Presentational only. All numbers come from `getRaceGoalPlannerState`
 * (src/lib/raceGoalPlanner.ts), which reads them from the SAME engine the save
 * commits — this component never computes plan facts itself.
 *
 * Stays inside the unified ProgrammeSettings editor (Pgm4): no wizard, no mode
 * chips (Run9a). Coral (running) accent only, calm copy, no medical warnings or
 * performance promises.
 */
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import SectionLabel from "@/components/ui/SectionLabel";
import type { RaceDistance, RaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import PhaseRail from "./PhaseRail";

const DISTANCE_OPTIONS: { value: RaceDistance; label: string }[] = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half", label: "Half" },
  { value: "marathon", label: "Full" },
];

interface RaceGoalPlannerProps {
  distance: RaceDistance;
  targetDate: string;
  /** Local "YYYY-MM-DD" min for the date input (today). */
  minDate: string;
  state: RaceGoalPlannerState;
  onDistanceChange: (d: RaceDistance) => void;
  onTargetDateChange: (date: string) => void;
}

function outLabel(state: RaceGoalPlannerState): string {
  if (state.daysOut === 0) return "Race day";
  const weeks = `${state.weeksOut} ${state.weeksOut === 1 ? "week" : "weeks"} out`;
  const days = `${state.daysOut} ${state.daysOut === 1 ? "day" : "days"}`;
  return `${weeks} · ${days}`;
}

export default function RaceGoalPlanner({
  distance,
  targetDate,
  minDate,
  state,
  onDistanceChange,
  onTargetDateChange,
}: RaceGoalPlannerProps) {
  const showPreview =
    state.status === "healthy" ||
    state.status === "compressed" ||
    state.status === "below-floor";

  return (
    <div className="mt-3 space-y-3 p-3 rounded-xl bg-card card-shadow">
      {/* Distance */}
      <div>
        <SectionLabel className="mb-1.5">Distance</SectionLabel>
        <SegmentedControl
          ariaLabel="Race distance"
          tone="running"
          options={DISTANCE_OPTIONS}
          value={distance}
          onChange={onDistanceChange}
        />
      </div>

      {/* Target date */}
      <div>
        <label
          htmlFor="ps-race-date"
          className="text-xs uppercase tracking-wider text-muted-foreground"
        >
          Target date
        </label>
        <input
          id="ps-race-date"
          type="date"
          value={targetDate}
          onChange={(e) => onTargetDateChange(e.target.value)}
          min={minDate}
          className="w-full mt-1 px-3 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm [color-scheme:light_dark]"
        />
      </div>

      {/* ── Preview ───────────────────────────────────────────────── */}
      {state.status === "empty" && (
        <p className="text-xs text-muted-foreground">
          {state.statusDescription}
        </p>
      )}

      {state.status === "invalid" && (
        <p className="text-xs text-destructive" role="alert">
          {state.statusDescription}
        </p>
      )}

      {showPreview && (
        <div className="rounded-xl bg-muted/50 p-3 space-y-3">
          {/* Weeks/days out */}
          <div>
            <p className="text-base font-bold tabular-nums font-mono text-foreground">
              {outLabel(state)}
            </p>
            <SectionLabel className="text-running">
              {state.statusTitle}
            </SectionLabel>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {state.statusDescription}
          </p>

          {/* Phase rail — pre-save preview of the cockpit's rail, week 0 active */}
          <PhaseRail activePhase={state.firstWeekPhase} />

          {/* Weekly structure + recovery */}
          <div className="space-y-1 pt-1 border-t border-border/40">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {state.recommendedRunDays}
              </span>{" "}
              run {state.recommendedRunDays === 1 ? "day" : "days"} / week
              {state.doubleDays > 0 && (
                <>
                  {" · "}
                  {state.doubleDays} double{" "}
                  {state.doubleDays === 1 ? "day" : "days"} (a lift and run
                  share a day)
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              After race day:{" "}
              <span className="font-medium text-foreground">
                {state.recoveryWeeks}
              </span>{" "}
              {state.recoveryWeeks === 1 ? "week" : "weeks"} of easy running.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

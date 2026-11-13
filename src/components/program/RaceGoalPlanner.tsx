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
import SectionHeading from "@/components/ui/SectionHeading";
import InlineNumerals from "@/components/ui/InlineNumerals";
import {
  isTrainableRaceEvent,
  type SpaceDef,
} from "@/features/spaces/spaceDefs";
import type { RaceDistance, RaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import {
  goalDayName,
  RACE_GOAL_ENTRY_OPTIONS,
  type RaceGoalEntry,
} from "@/lib/raceGoalEntry";
import PhaseRail from "./PhaseRail";
import UpcomingRacePicker from "./UpcomingRacePicker";

const DISTANCE_OPTIONS: { value: RaceDistance; label: string }[] = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half", label: "Half" },
  { value: "marathon", label: "Full" },
];

interface RaceGoalPlannerProps {
  distance: RaceDistance;
  targetDate: string;
  /** Optional user-entered event name draft (≤60 chars, free-text). */
  eventName: string;
  /** Local "YYYY-MM-DD" min for the date input (today). */
  minDate: string;
  state: RaceGoalPlannerState;
  onDistanceChange: (d: RaceDistance) => void;
  onTargetDateChange: (date: string) => void;
  onEventNameChange: (v: string) => void;
  /** Door 2 (races plan): the same race catalogue the Social directory
   *  reads — soonest first, past dates already filtered out. Empty
   *  array collapses the picker entirely. */
  upcomingRaces: SpaceDef[];
  /** The draft's catalogue binding, "" when the goal is manual. */
  selectedEventSpaceId: string;
  onPickRace: (def: SpaceDef) => void;
  /** A race entered, or the distance run on your own; null until the
   *  person answers (Run9). */
  entry: RaceGoalEntry | null;
  onEntryChange: (next: RaceGoalEntry) => void;
}

function outLabel(
  state: RaceGoalPlannerState,
  goal: { distance: string; entry: RaceGoalEntry | null }
): string {
  if (state.daysOut === 0) return goalDayName(goal);
  const weeks = `${state.weeksOut} ${state.weeksOut === 1 ? "week" : "weeks"} out`;
  const days = `${state.daysOut} ${state.daysOut === 1 ? "day" : "days"}`;
  return `${weeks} · ${days}`;
}

export default function RaceGoalPlanner({
  distance,
  targetDate,
  eventName,
  minDate,
  state,
  onDistanceChange,
  onTargetDateChange,
  onEventNameChange,
  upcomingRaces,
  selectedEventSpaceId,
  onPickRace,
  entry,
  onEntryChange,
}: RaceGoalPlannerProps) {
  const trainingRaces = upcomingRaces.filter(
    (race) => race.event && isTrainableRaceEvent(race.event)
  );
  const showPreview =
    state.status === "healthy" ||
    state.status === "compressed" ||
    state.status === "below-floor";

  return (
    // The race's fields sit on the page like the groups below them, each
    // under its own heading, with no card around them.
    <div className="space-y-4">
      {/* Door 2 — catalogue picker (collapses when nothing upcoming) */}
      {trainingRaces.length > 0 && (
        <UpcomingRacePicker
          key={`${distance}:${selectedEventSpaceId}`}
          races={trainingRaces}
          distance={distance}
          selectedId={selectedEventSpaceId}
          selectedDate={targetDate}
          minDate={minDate}
          onPick={onPickRace}
        />
      )}

      {/* Distance */}
      <div className="space-y-2">
        <SectionHeading size="compact">Distance</SectionHeading>
        <SegmentedControl
          ariaLabel="Race distance"
          tone="running"
          options={DISTANCE_OPTIONS}
          value={distance}
          onChange={onDistanceChange}
        />
      </div>

      {/* A race entered, or the distance on your own. Neither is chosen
          for a new goal; the plan is the same, what its last day is
          called is not. */}
      <div className="space-y-2">
        <SectionHeading size="compact">Race or on your own</SectionHeading>
        <SegmentedControl<RaceGoalEntry | "">
          ariaLabel="Race or on your own"
          tone="running"
          layout="wrap"
          options={RACE_GOAL_ENTRY_OPTIONS.map((o) => ({ ...o }))}
          value={entry ?? ""}
          onChange={(next) => {
            if (next !== "") onEntryChange(next);
          }}
        />
        {entry === null && (
          <p className="text-xs text-muted-foreground">
            Choose one to save your plan.
          </p>
        )}
      </div>

      {/* Race name (optional). No example in the field: a race the
          person had not entered read as one already filled in. A goal
          run on your own has no race to name. */}
      {entry !== "own" && (
        <div className="space-y-2">
          <SectionHeading size="compact">
            <label htmlFor="ps-race-event-name">Race name (optional)</label>
          </SectionHeading>
          <input
            id="ps-race-event-name"
            type="text"
            value={eventName}
            onChange={(e) => onEventNameChange(e.target.value)}
            maxLength={60}
            autoComplete="off"
            className="ds-input block min-w-0 appearance-none text-sm"
          />
        </div>
      )}

      {/* Target date */}
      <div className="space-y-2">
        <SectionHeading size="compact">
          <label htmlFor="ps-race-date">Target date</label>
        </SectionHeading>
        <input
          id="ps-race-date"
          type="date"
          value={targetDate}
          onChange={(e) => onTargetDateChange(e.target.value)}
          min={minDate}
          className="ds-input block min-w-0 appearance-none text-sm"
        />
      </div>

      {/* ── Preview ───────────────────────────────────────────────── */}
      {state.status === "empty" && (
        <p className="text-xs text-muted-foreground">
          {state.statusDescription}
        </p>
      )}

      {state.status === "invalid" && (
        <p className="text-xs text-destructive-strong" role="alert">
          {state.statusDescription}
        </p>
      )}

      {showPreview && (
        <div className="rounded-xl bg-muted/50 p-3 space-y-3">
          {/* Weeks/days out */}
          <div>
            <p className="text-base font-bold tabular-nums font-mono text-foreground">
              {outLabel(state, { distance, entry })}
            </p>
            <SectionLabel className="text-running-strong">
              {state.statusTitle}
            </SectionLabel>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {state.statusDescription}
          </p>

          {/* Pgm8 (R14c): a race too soon for a new runner's plan to build
              to, as setup says it. */}
          {state.newRunnerNote && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              <InlineNumerals>{state.newRunnerNote}</InlineNumerals>
            </p>
          )}

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

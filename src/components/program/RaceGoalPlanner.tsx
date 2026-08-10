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
import { useState } from "react";
import { format } from "date-fns";
import { Check, ChevronDown, Flag } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import SectionLabel from "@/components/ui/SectionLabel";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { parseLocalDate } from "@/lib/dateHelpers";
import type { SpaceDef } from "@/features/spaces/spaceDefs";
import type { RaceDistance, RaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import PhaseRail from "./PhaseRail";

const DISTANCE_OPTIONS: { value: RaceDistance; label: string }[] = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half", label: "Half" },
  { value: "marathon", label: "Full" },
];

const DISTANCE_CHIP: Record<string, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "Half",
  marathon: "Full",
};

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
}

/**
 * "Choose an upcoming race" — a collapsed disclosure listing the
 * race-kind catalogue. Picking one prefills distance + date + event
 * name + the eventSpaceId binding through the SAME draft the manual
 * fields edit (one catalogue, two entrances; the write path is
 * identical either way). Manual entry stays for unlisted races.
 */
function UpcomingRacePicker({
  races,
  selectedId,
  onPick,
}: {
  races: SpaceDef[];
  selectedId: string;
  onPick: (def: SpaceDef) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = races.find((r) => r.id === selectedId);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          haptic();
          setOpen((o) => !o);
        }}
        className="w-full min-h-[44px] flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Flag className="size-4 shrink-0 text-running" aria-hidden />
          <span className="text-sm font-medium text-foreground truncate">
            {selected ? selected.name : "Choose an upcoming race"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Upcoming races"
          className="mt-1.5 space-y-1"
        >
          {races.map((race) => {
            const isSelected = race.id === selectedId;
            return (
              <button
                key={race.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  haptic();
                  onPick(race);
                  setOpen(false);
                }}
                className={cn(
                  "w-full min-h-[44px] flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left border transition-colors",
                  isSelected ? "border-transparent" : "border-border/50"
                )}
                style={
                  isSelected ? { background: `${THEME.running}14` } : undefined
                }
              >
                <span className="min-w-0 flex items-center gap-1.5">
                  {isSelected && (
                    <Check
                      className="size-3.5 shrink-0 text-running"
                      aria-hidden
                    />
                  )}
                  <span className="text-sm font-medium text-foreground truncate">
                    {race.name}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-2">
                  <span className="text-caption text-muted-foreground font-mono tabular-nums">
                    {format(parseLocalDate(race.event!.dateKey), "d MMM yyyy")}
                  </span>
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: `${THEME.running}1F`,
                      color: THEME.running,
                    }}
                  >
                    {DISTANCE_CHIP[race.event!.distance]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
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
  eventName,
  minDate,
  state,
  onDistanceChange,
  onTargetDateChange,
  onEventNameChange,
  upcomingRaces,
  selectedEventSpaceId,
  onPickRace,
}: RaceGoalPlannerProps) {
  const showPreview =
    state.status === "healthy" ||
    state.status === "compressed" ||
    state.status === "below-floor";

  return (
    <div className="mt-3 space-y-3 p-3 rounded-xl bg-card card-shadow">
      {/* Door 2 — catalogue picker (collapses when nothing upcoming) */}
      {upcomingRaces.length > 0 && (
        <UpcomingRacePicker
          races={upcomingRaces}
          selectedId={selectedEventSpaceId}
          onPick={onPickRace}
        />
      )}

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

      {/* Event name (optional) */}
      <div>
        <label
          htmlFor="ps-race-event-name"
          className="text-xs uppercase tracking-wider text-muted-foreground"
        >
          Event name (optional)
        </label>
        <input
          id="ps-race-event-name"
          type="text"
          value={eventName}
          onChange={(e) => onEventNameChange(e.target.value)}
          maxLength={60}
          placeholder="London Marathon 2026"
          autoComplete="off"
          className="block w-full min-w-0 appearance-none mt-1 px-3 py-2.5 min-h-11 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          className="block w-full min-w-0 appearance-none mt-1 px-3 py-2.5 min-h-11 rounded-lg bg-muted border border-border/50 text-foreground text-sm [color-scheme:light_dark] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
            <SectionLabel className="text-running-strong">
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

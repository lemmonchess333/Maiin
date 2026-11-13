import { useState } from "react";
import { Check, ChevronDown, Flag } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonthYear } from "@/utils/formatters";
import EmptyState from "@/components/ui/EmptyState";
import { Collapse } from "@/components/ui/Collapse";
import RaceFilters from "@/features/spaces/RaceFilters";
import { spaceEditorialImage } from "@/lib/editorialImages";
import {
  ALL_RACE_FILTERS,
  filterRaceDefs,
  RACE_DISTANCE_LABELS,
  type RaceBrowseFilters,
} from "@/features/spaces/raceBrowse";
import type { SpaceDef } from "@/features/spaces/spaceDefs";
import { raceEventDates } from "@/features/spaces/raceDates";
import type { RaceDistance } from "@/lib/raceGoalPlanner";

/**
 * "Choose an upcoming race" — a collapsed disclosure listing the
 * race-kind catalogue. Picking one prefills distance + date + event
 * name + the eventSpaceId binding through the SAME draft the manual
 * fields edit (one catalogue, two entrances; the write path is
 * identical either way). Manual entry stays for unlisted races.
 *
 * Two entrances use it: the run-plan editor (`RaceGoalPlanner`) and
 * setup's race step (`Onboarding.tsx`), so a race picked in either is
 * written the same way.
 */
export default function UpcomingRacePicker({
  races,
  distance,
  selectedId,
  selectedDate,
  minDate,
  onPick,
}: {
  races: SpaceDef[];
  distance: RaceDistance;
  selectedId: string;
  selectedDate: string;
  minDate: string;
  onPick: (def: SpaceDef) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = races.find((r) => r.id === selectedId);
  const [filters, setFilters] = useState<RaceBrowseFilters>(() => ({
    country: selected?.event?.countryCode ?? "GB",
    distance,
  }));
  const filteredRaces = filterRaceDefs(races, filters);
  const raceDays = filteredRaces.flatMap((race) =>
    raceEventDates(race.event!)
      .filter((dateKey) => dateKey >= minDate)
      .map((dateKey) => ({ race, dateKey }))
  );

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

      <Collapse open={open}>
        <div className="mt-3 space-y-2">
          {/* No Distance filter: the goal's own Distance sits just below
              and narrows the list already. */}
          <RaceFilters
            value={filters}
            onChange={setFilters}
            trainingOnly
            showDistance={false}
          />
          {raceDays.length === 0 ? (
            <EmptyState
              compact
              icon={Flag}
              accent={THEME.running}
              headline="No matching races"
              sub="Clear the filters or enter your race below."
              action={{
                label: "Clear filters",
                variant: "secondary",
                onClick: () => setFilters(ALL_RACE_FILTERS),
              }}
            />
          ) : (
            <div
              role="listbox"
              aria-label="Upcoming races"
              className="space-y-1"
            >
              {raceDays.map(({ race, dateKey }) => {
                const isSelected =
                  race.id === selectedId && dateKey === selectedDate;
                return (
                  <button
                    key={`${race.id}:${dateKey}`}
                    type="button"
                    role="option"
                    aria-label={`${race.name} ${formatDayMonthYear(parseLocalDate(dateKey))} ${RACE_DISTANCE_LABELS[race.event!.distance]}`}
                    aria-selected={isSelected}
                    onClick={() => {
                      haptic();
                      onPick(
                        raceEventDates(race.event!).length === 1
                          ? race
                          : {
                              ...race,
                              event: {
                                ...race.event!,
                                dateKey,
                                dateKeys: [dateKey],
                              },
                            }
                      );
                      setOpen(false);
                    }}
                    className={cn(
                      "race-pick-row relative w-full min-h-[72px] overflow-hidden flex flex-col justify-center items-start gap-1 rounded-xl bg-card px-3 py-2.5 text-left border transition-colors",
                      isSelected ? "border-running" : "border-border/50"
                    )}
                  >
                    {/* The race's real place (Soc16), as Runna's race
                        list shows it: its cover on the right, fading into
                        the card under the words. */}
                    <RacePlacePhoto spaceId={race.id} />
                    <span className="relative flex items-center gap-1.5 text-caption font-semibold text-running-strong">
                      {isSelected && (
                        <Check className="size-3.5 shrink-0" aria-hidden />
                      )}
                      <span className="font-mono tabular-nums">
                        {formatDayMonthYear(parseLocalDate(dateKey))}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={cn(
                          /\d/.test(
                            RACE_DISTANCE_LABELS[race.event!.distance]
                          ) && "font-mono tabular-nums"
                        )}
                      >
                        {RACE_DISTANCE_LABELS[race.event!.distance]}
                      </span>
                    </span>
                    <span className="relative max-w-[62%] text-sm font-semibold text-foreground">
                      {race.name}{" "}
                      <span aria-hidden="true">{race.event!.countryFlag}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}

/**
 * A race's cover in its row of the picker: the right of the card, fading
 * into it under the words. Decorative, since the row's name says which
 * race it is. A race with no cover keeps the plain card.
 */
function RacePlacePhoto({ spaceId }: { spaceId: string }) {
  const photo = spaceEditorialImage(spaceId);
  if (!photo) return null;
  return (
    <>
      <img
        src={photo}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        draggable={false}
        className="race-pick-photo absolute inset-y-0 right-0 h-full w-[64%] object-cover"
      />
      <span aria-hidden="true" className="race-pick-fade absolute inset-0" />
    </>
  );
}

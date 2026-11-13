import { useMemo } from "react";
import UpcomingRacePicker from "@/components/program/UpcomingRacePicker";
import {
  upcomingResolvedRaceDefs,
  useRaceEventOverrides,
} from "@/features/spaces/raceEventOverrides";
import { isTrainableRaceEvent } from "@/features/spaces/spaceDefs";
import type { RaceDistance } from "@/lib/raceGoalPlanner";

/** A race chosen from the list: what setup saves on the race goal. */
export interface PickedRace {
  /** The race Space's id, saved as `raceGoal.eventSpaceId`. */
  id: string;
  name: string;
  distance: RaceDistance;
  /** The edition chosen, "YYYY-MM-DD". */
  dateKey: string;
}

/**
 * Setup's list of upcoming races, each on a card with its place: the run-plan
 * editor's list (`UpcomingRacePicker`), on the same resolved dates, so a race
 * chosen here is saved exactly as one chosen there. Its own chunk, fetched once
 * someone says they have entered a race, so the questions before it do not
 * carry the race catalogue; it hands setup the race's id, name, distance and
 * day, and setup imports nothing from the catalogue.
 */
export default function SetupRacePicker({
  distance,
  selectedId,
  selectedDate,
  minDate,
  onPick,
}: {
  distance: RaceDistance;
  selectedId: string;
  selectedDate: string;
  minDate: string;
  onPick: (race: PickedRace) => void;
}) {
  const overrides = useRaceEventOverrides();
  const races = useMemo(
    () =>
      upcomingResolvedRaceDefs(overrides, minDate).filter(
        (race) => race.event && isTrainableRaceEvent(race.event)
      ),
    [overrides, minDate]
  );
  if (races.length === 0) return null;
  return (
    <UpcomingRacePicker
      key={`${distance}:${selectedId}`}
      races={races}
      distance={distance}
      selectedId={selectedId}
      selectedDate={selectedDate}
      minDate={minDate}
      onPick={(def) => {
        if (!def.event || !isTrainableRaceEvent(def.event)) return;
        onPick({
          id: def.id,
          name: def.name,
          distance: def.event.distance,
          dateKey: def.event.dateKey,
        });
      }}
    />
  );
}

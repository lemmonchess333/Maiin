import { useId } from "react";
import { RACE_COUNTRIES, raceSpaceDefs } from "./spaceDefs";
import { RACE_DISTANCE_LABELS, type RaceBrowseFilters } from "./raceBrowse";

const catalogue = raceSpaceDefs();

/** Shared, keyboard-native browse controls. They never edit a training goal. */
export default function RaceFilters({
  value,
  onChange,
}: {
  value: RaceBrowseFilters;
  onChange: (next: RaceBrowseFilters) => void;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="min-w-0">
        <label
          htmlFor={`${id}-country`}
          className="text-xs text-muted-foreground"
        >
          Country
        </label>
        <select
          id={`${id}-country`}
          className="ds-input mt-1 w-full min-h-11 px-3 py-2.5 text-sm"
          value={value.country}
          onChange={(e) =>
            onChange({
              ...value,
              country: e.target.value as RaceBrowseFilters["country"],
            })
          }
        >
          <option value="all">All countries</option>
          {Object.entries(RACE_COUNTRIES)
            .filter(([code]) =>
              catalogue.some((r) => r.event?.countryCode === code)
            )
            .map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
        </select>
      </div>
      <div className="min-w-0">
        <label
          htmlFor={`${id}-distance`}
          className="text-xs text-muted-foreground"
        >
          Distance
        </label>
        <select
          id={`${id}-distance`}
          className="ds-input mt-1 w-full min-h-11 px-3 py-2.5 text-sm"
          value={value.distance}
          onChange={(e) =>
            onChange({
              ...value,
              distance: e.target.value as RaceBrowseFilters["distance"],
            })
          }
        >
          <option value="all">All distances</option>
          {Object.entries(RACE_DISTANCE_LABELS)
            .filter(
              ([distance]) =>
                value.distance === distance ||
                catalogue.some((r) => r.event?.distance === distance)
            )
            .map(([distance, label]) => (
              <option key={distance} value={distance}>
                {label}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

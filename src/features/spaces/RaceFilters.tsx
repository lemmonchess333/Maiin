import { useId } from "react";
import Select from "@/components/ui/Select";
import { RACE_COUNTRIES, raceSpaceDefs } from "./spaceDefs";
import { RACE_DISTANCE_LABELS, type RaceBrowseFilters } from "./raceBrowse";

const catalogue = raceSpaceDefs();

/** Shared, keyboard-native browse controls. They never edit a training goal.
 *
 *  `showDistance={false}` leaves the Distance filter out, for a picker that
 *  sits under a distance of its own (the run plan's race goal), where the
 *  two read as one question asked twice. The filter then keeps whatever
 *  distance the caller started it on.
 *
 *  The two selects stack under 20em of row (a 320px phone, or larger text),
 *  where side by side "United Kingdom" was cut to "United King". */
export default function RaceFilters({
  value,
  onChange,
  trainingOnly = false,
  showDistance = true,
}: {
  value: RaceBrowseFilters;
  onChange: (next: RaceBrowseFilters) => void;
  trainingOnly?: boolean;
  showDistance?: boolean;
}) {
  const id = useId();
  return (
    <div className="@container">
      <div
        className={
          showDistance
            ? "grid grid-cols-2 gap-3 @max-[20em]:grid-cols-1"
            : "grid grid-cols-1 gap-3"
        }
      >
        <div className="min-w-0">
          <label
            htmlFor={`${id}-country`}
            className="text-xs text-muted-foreground"
          >
            Country
          </label>
          <Select
            id={`${id}-country`}
            className="mt-1"
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
          </Select>
        </div>
        {showDistance && (
          <div className="min-w-0">
            <label
              htmlFor={`${id}-distance`}
              className="text-xs text-muted-foreground"
            >
              Distance
            </label>
            <Select
              id={`${id}-distance`}
              className="mt-1"
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
                .filter(([distance]) => !trainingOnly || distance !== "ultra")
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
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

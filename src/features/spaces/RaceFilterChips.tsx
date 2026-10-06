import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import {
  RACE_COUNTRIES,
  raceSpaceDefs,
  type RaceCountryCode,
  type RaceEventDistance,
} from "./spaceDefs";
import type { RaceBrowseFilters } from "./raceBrowse";

const catalogue = raceSpaceDefs();

/** What a distance chip says. Shorter than the race card's own chip
 *  ("Half marathon"), because a row of them shares one line. */
const DISTANCE_CHIPS: Record<RaceEventDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "Half",
  marathon: "Marathon",
  ultra: "Ultra",
};

/** The country chip's own short names, where the full one is long. */
const SHORT_COUNTRY: Partial<Record<RaceCountryCode, string>> = {
  GB: "UK",
  US: "US",
};

/** A country's flag from its two letters (regional indicator symbols). */
function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .replace(/[A-Z]/g, (c) =>
      String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)
    );
}

const chip = (selected: boolean) =>
  cn(
    "inline-flex shrink-0 items-center gap-1.5 min-h-11 rounded-full px-4 text-sm font-semibold text-foreground transition-colors active:scale-[0.97]",
    selected
      ? "bg-primary/10 border border-primary/40"
      : "bg-muted border border-transparent"
  );

/**
 * The race finder's filters on the Together tab, as one row of chips: the
 * country opens a sheet, the distances pick in place.
 * They replaced two form dropdowns there. The race goal planner keeps
 * `RaceFilters`, its selects, because it is a settings form.
 */
export default function RaceFilterChips({
  value,
  onChange,
}: {
  value: RaceBrowseFilters;
  onChange: (next: RaceBrowseFilters) => void;
}) {
  const [countryOpen, setCountryOpen] = useState(false);
  const countries = (
    Object.entries(RACE_COUNTRIES) as [RaceCountryCode, string][]
  ).filter(([code]) => catalogue.some((r) => r.event?.countryCode === code));
  const distances = (
    Object.entries(DISTANCE_CHIPS) as [RaceEventDistance, string][]
  ).filter(
    ([distance]) =>
      value.distance === distance ||
      catalogue.some((r) => r.event?.distance === distance)
  );
  const countryName =
    value.country === "all" ? "All countries" : RACE_COUNTRIES[value.country];
  const countryChip =
    value.country === "all"
      ? "All countries"
      : `${countryFlag(value.country)} ${SHORT_COUNTRY[value.country] ?? countryName}`;

  return (
    <>
      <div
        data-no-page-swipe
        className="-mx-[16px] flex gap-2 overflow-x-auto px-[16px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Country: ${countryName}`}
          onClick={() => {
            haptic("light");
            setCountryOpen(true);
          }}
          className={chip(false)}
        >
          {countryChip}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </button>
        <div role="radiogroup" aria-label="Distance" className="flex gap-2">
          {([["all", "All"], ...distances] as [string, string][]).map(
            ([distance, label]) => (
              <button
                key={distance}
                type="button"
                role="radio"
                aria-checked={value.distance === distance}
                onClick={() => {
                  haptic("light");
                  onChange({
                    ...value,
                    distance: distance as RaceBrowseFilters["distance"],
                  });
                }}
                className={chip(value.distance === distance)}
              >
                {label}
              </button>
            )
          )}
        </div>
      </div>

      <BottomSheet
        open={countryOpen}
        onOpenChange={setCountryOpen}
        title="Country"
      >
        <div
          className="px-5 pb-6 pt-2 space-y-2"
          role="radiogroup"
          aria-label="Country"
        >
          {([["all", "All countries"], ...countries] as [string, string][]).map(
            ([code, label]) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={value.country === code}
                onClick={() => {
                  setCountryOpen(false);
                  onChange({
                    ...value,
                    country: code as RaceBrowseFilters["country"],
                  });
                }}
                className={cn(
                  "w-full min-h-[44px] p-3 rounded-xl text-left text-sm font-semibold text-foreground transition-colors active:scale-[0.97]",
                  value.country === code
                    ? "bg-primary/10 border border-primary/40"
                    : "bg-muted border border-transparent"
                )}
              >
                {code !== "all" && (
                  <span aria-hidden="true">{countryFlag(code)} </span>
                )}
                {label}
              </button>
            )
          )}
        </div>
      </BottomSheet>
    </>
  );
}

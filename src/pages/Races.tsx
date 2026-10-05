import { useSearchParams } from "react-router-dom";
import { Bookmark, ChevronLeft, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import PageShell from "@/components/ui/PageShell";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { THEME } from "@/lib/theme";
import {
  directoryResolvedRaceDefs,
  useRaceEventOverrides,
} from "@/features/spaces/raceEventOverrides";
import {
  findRaces,
  raceFinderMonths,
  readRaceFinderFilters,
} from "@/features/spaces/raceFinder";
import { useSavedRaces } from "@/features/spaces/useSavedRaces";
import RaceFilterChips from "@/features/spaces/RaceFilterChips";
import RaceFinderCard from "@/features/spaces/RaceFinderCard";

export default function Races() {
  const [params, setParams] = useSearchParams();
  const filters = readRaceFinderFilters(params);
  const today = localDateString();
  const overrides = useRaceEventOverrides();
  const races = directoryResolvedRaceDefs(overrides, today);
  const saved = useSavedRaces();
  const results = findRaces(races, filters, saved.ids, today);
  const months = raceFinderMonths(races, today);
  if (
    filters.month !== "all" &&
    filters.month !== "tba" &&
    !months.includes(filters.month)
  )
    months.push(filters.month);
  months.sort();
  const filtered =
    !!filters.query ||
    filters.month !== "all" ||
    filters.country !== "all" ||
    filters.distance !== "all";
  const savedView = filters.view === "saved";

  function update(values: Record<string, string>) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(values)) {
          if (!value || value === "all") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );
  }
  const clearFilters = () =>
    update({ q: "", month: "all", country: "all", distance: "all" });

  return (
    <PageShell
      title="Find a race"
      subtitle="Find your next start line. Save a few possibilities."
      banner={
        <Link
          to="/social?tab=together"
          className="inline-flex items-center gap-1 min-h-11 rounded-lg text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeft className="size-5" aria-hidden />
          Social
        </Link>
      }
      controls={
        <SegmentedControl
          ariaLabel="Race collection"
          tone="running"
          options={[
            { value: "all", label: "All races" },
            { value: "saved", label: "Saved" },
          ]}
          value={filters.view}
          onChange={(view) =>
            update({
              view,
              q: "",
              country: "all",
              distance: "all",
              month: "all",
            })
          }
        />
      }
    >
      <section aria-label="Find races" className="space-y-3">
        <div className="relative">
          <Search
            className="absolute left-3 top-3.5 size-5 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            aria-label="Search races by name or city"
            placeholder="Search race or city"
            maxLength={100}
            value={filters.query}
            onChange={(event) => update({ q: event.target.value })}
            className="ds-input w-full min-h-12 pl-10 pr-12"
          />
          {filters.query && (
            <div className="absolute right-1 top-0.5">
              <IconButton
                aria-label="Clear search"
                icon={<X />}
                onClick={() => update({ q: "" })}
              />
            </div>
          )}
        </div>
        <RaceFilterChips
          value={filters}
          onChange={(value) =>
            update({ country: value.country, distance: value.distance })
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 text-sm font-medium text-foreground">
            Month
            <select
              className="ds-input mt-1 w-full min-h-11"
              value={filters.month}
              onChange={(event) => update({ month: event.target.value })}
            >
              <option value="all">Any month</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {format(parseLocalDate(`${month}-01`), "MMM yyyy")}
                </option>
              ))}
              <option value="tba">Date TBA</option>
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium text-foreground">
            Sort by
            <select
              className="ds-input mt-1 w-full min-h-11"
              value={filters.sort}
              onChange={(event) => update({ sort: event.target.value })}
            >
              <option value="date">Soonest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            {savedView && !saved.ready ? (
              saved.error ? (
                "Saved races unavailable"
              ) : (
                "Loading saved races…"
              )
            ) : (
              <>
                <span className="font-mono tabular-nums">{results.length}</span>{" "}
                {results.length === 1 ? "race" : "races"}
                {savedView ? " saved" : ""}
              </>
            )}
          </p>
          {filtered && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </section>
      {savedView && (
        <p className="text-sm text-muted-foreground">
          Only you can see your saved races.
        </p>
      )}
      {!saved.isOnline && (
        <p role="status" className="text-sm text-muted-foreground">
          You’re offline. Connect to change your saved races.
        </p>
      )}
      {saved.error && (
        <ErrorState
          title="Couldn't load saved races"
          description="You can still browse all races. Try again to view or change your saves."
          retry={{ onClick: saved.retry, size: "md" }}
        />
      )}
      {savedView && !saved.ready ? (
        !saved.error && (
          <div
            aria-label="Loading saved races"
            className="h-64 rounded-2xl bg-muted motion-safe:animate-pulse"
          />
        )
      ) : results.length ? (
        <ul
          aria-label={savedView ? "Saved races" : "Races"}
          className="space-y-4"
        >
          {results.map((race) => (
            <RaceFinderCard
              key={race.id}
              race={race}
              today={today}
              saved={saved}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={savedView && !filtered ? Bookmark : Search}
          accent={THEME.running}
          headline={
            savedView && !filtered
              ? "Your next race starts here"
              : "No matching races"
          }
          sub={
            savedView && !filtered
              ? "Tap the bookmark on a race to keep it here."
              : "Try another search, country, distance or month."
          }
          action={
            savedView && !filtered
              ? {
                  label: "Browse races",
                  variant: "sport-tinted",
                  onClick: () => update({ view: "all" }),
                }
              : {
                  label: "Clear filters",
                  variant: "secondary",
                  onClick: clearFilters,
                }
          }
        />
      )}
    </PageShell>
  );
}

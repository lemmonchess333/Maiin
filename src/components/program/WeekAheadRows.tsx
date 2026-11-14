import InlineNumerals from "@/components/ui/InlineNumerals";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonth } from "@/utils/formatters";
import type { WeekHolds } from "@/features/program/raceWeeksAhead";

/** A week's line: the race, else its long run and quality sessions, else
 *  what kind of running it holds. */
function weekLine(holds: WeekHolds): string {
  if (holds.race) return holds.race.name;
  const named = [holds.long, ...holds.quality].flatMap((run) =>
    run ? [run.name] : []
  );
  if (named.length > 0) return named.join(" · ");
  if (holds.runWalk) return holds.runWalk.name;
  return holds.runCount > 0 ? "Easy runs" : "No runs planned";
}

/**
 * The weeks ahead, a row a week: the week's Monday, "Lighter week" on a
 * week that steps back, then its long run and its sessions by the names
 * Train gives them. A race plan's (`RaceWeeksAhead`) and a plan with no
 * race date's (`RollingWeeksAhead`) draw the same rows.
 */
export default function WeekAheadRows({
  weeks,
}: {
  weeks: ReadonlyArray<{ weekKey: string; lighter: boolean; holds: WeekHolds }>;
}) {
  return (
    <ol aria-label="The weeks ahead" className="mt-2 divide-y divide-border">
      {weeks.map((week) => (
        <li key={week.weekKey} className="py-2">
          <p className="text-xs text-muted-foreground">
            <InlineNumerals>
              {`Week of ${formatDayMonth(parseLocalDate(week.weekKey))}${
                week.lighter ? " · Lighter week" : ""
              }`}
            </InlineNumerals>
          </p>
          <p className="text-sm text-foreground">
            <InlineNumerals>{weekLine(week.holds)}</InlineNumerals>
          </p>
        </li>
      ))}
    </ol>
  );
}

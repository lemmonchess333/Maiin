/**
 * The weeks ahead (R23, locked in Pgm8): a race plan's coming
 * weeks, on its card on Train's Run tab. A closed disclosure, as "Why this
 * run" is, with one row a week from next week to race week: the week's
 * Monday, then its long run and its quality sessions, named as Train names
 * them (`raceWeeksAhead`). No days and no easy runs; race week shows the
 * race. Nothing here names base, build or peak (E3a; Run9f), and a free
 * runner, with no plan, never sees it (Run9).
 *
 * Worked out when it is opened, not on every visit to Train: each week is
 * the rollover's own build of it, which takes a moment on a long plan.
 */
import { useMemo, useState } from "react";
import PurposeDisclosure from "@/components/ui/PurposeDisclosure";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import type { UserProfile } from "@/lib/auth";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonth } from "@/utils/formatters";
import type { LayoffClass } from "@/features/program/layoffDetection";
import type { ProgramState } from "@/features/program/programTypes";
import {
  hasRaceWeeksAhead,
  raceWeeksAhead,
  type WeekHolds,
} from "@/features/program/raceWeeksAhead";

interface RaceWeeksAheadProps {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Today's layoff reading, the one the rollover builds next week with. */
  recentLayoff: LayoffClass;
  /** Local "YYYY-MM-DD". */
  today: string;
}

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

function WeeksAheadList({
  profile,
  programState,
  recentLayoff,
  today,
}: RaceWeeksAheadProps) {
  const weeks = useMemo(
    () => raceWeeksAhead({ profile, programState, recentLayoff, today }),
    [profile, programState, recentLayoff, today]
  );
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

export default function RaceWeeksAhead(props: RaceWeeksAheadProps) {
  const [open, setOpen] = useState(false);
  if (!hasRaceWeeksAhead(props.profile, props.programState, props.today))
    return null;
  return (
    <PurposeDisclosure label="The weeks ahead" onToggle={setOpen}>
      <p>
        The plan as it stands today. Each week is set when it starts, from what
        you&apos;ve run.
      </p>
      {open && (
        <SectionErrorBoundary sectionName="race-weeks-ahead">
          <WeeksAheadList {...props} />
        </SectionErrorBoundary>
      )}
    </PurposeDisclosure>
  );
}

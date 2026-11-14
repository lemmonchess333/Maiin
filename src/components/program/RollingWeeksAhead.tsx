/**
 * The weeks ahead of a plan with no race date (Run24 (3), deep dive D7),
 * on its card on Train's Run tab, drawn as a race plan's are
 * (`RaceWeeksAhead`, R23): a closed disclosure with a row a week, the
 * week's Monday, "Lighter week" on the one in four that steps back, then
 * its long run and its sessions, time trials included, by the names Train
 * gives them. The plan has no last week, so the rows stop after
 * `ROLLING_WEEKS_SHOWN` and one line says where the long run holds, read
 * from the weeks the plan builds (`rollingWeeksAhead`). No phase is named.
 *
 * Worked out when it is opened, as the race plan's is.
 */
import { useMemo, useState } from "react";
import PurposeDisclosure from "@/components/ui/PurposeDisclosure";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import type { UserProfile } from "@/lib/auth";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { resolveDistanceUnit } from "@/lib/distanceUnits";
import { longRunDistanceLabel } from "@/lib/runLabels";
import { formatDayMonth } from "@/utils/formatters";
import type { DatedRun, LayoffClass } from "@/features/program/layoffDetection";
import type { ProgramState } from "@/features/program/programTypes";
import {
  hasRollingWeeksAhead,
  rollingWeeksAhead,
  ROLLING_WEEKS_SHOWN,
  type RollingOutline,
} from "@/features/program/rollingWeeksAhead";
import WeekAheadRows from "./WeekAheadRows";

interface RollingWeeksAheadProps {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Today's layoff reading, the one the rollover builds next week with. */
  recentLayoff: LayoffClass;
  /** The recent runs read with it. */
  recentRuns?: readonly DatedRun[] | null;
  /** Local "YYYY-MM-DD". */
  today: string;
}

/** Where the long run holds, in a line, or null when the weeks show no
 *  long run to say it of. */
function longRunHoldLine(
  outline: RollingOutline,
  today: string,
  unit: ReturnType<typeof resolveDistanceUnit>
): string | null {
  const { hold, weeks } = outline;
  if (!hold)
    return weeks.some((week) => week.longKm !== null)
      ? "The long run keeps climbing past these weeks."
      : null;
  const distance = longRunDistanceLabel(hold.km, unit);
  if (hold.from <= localWeekKey(parseLocalDate(today)))
    return `The long run holds at ${distance}, with a lighter week every fourth.`;
  return `The long run climbs to ${distance} by the week of ${formatDayMonth(
    parseLocalDate(hold.from)
  )}, then holds there, with a lighter week every fourth.`;
}

function WeeksAheadList({
  profile,
  programState,
  recentLayoff,
  recentRuns,
  today,
}: RollingWeeksAheadProps) {
  const outline = useMemo(
    () =>
      rollingWeeksAhead({
        profile,
        programState,
        recentLayoff,
        recentRuns,
        today,
      }),
    [profile, programState, recentLayoff, recentRuns, today]
  );
  const holdLine = longRunHoldLine(
    outline,
    today,
    resolveDistanceUnit(profile.preferredDistanceUnit)
  );
  return (
    <>
      <WeekAheadRows weeks={outline.weeks} />
      {holdLine && (
        <p className="pt-2 border-t border-border">
          <InlineNumerals>{holdLine}</InlineNumerals>
        </p>
      )}
    </>
  );
}

export default function RollingWeeksAhead(props: RollingWeeksAheadProps) {
  const [open, setOpen] = useState(false);
  if (!hasRollingWeeksAhead(props.profile, props.programState)) return null;
  return (
    <PurposeDisclosure label="The weeks ahead" onToggle={setOpen}>
      <p>
        <InlineNumerals>{`The next ${ROLLING_WEEKS_SHOWN} weeks as the plan stands today. Each week is set when it starts, from what you’ve run.`}</InlineNumerals>
      </p>
      {open && (
        <SectionErrorBoundary sectionName="rolling-weeks-ahead">
          <WeeksAheadList {...props} />
        </SectionErrorBoundary>
      )}
    </PurposeDisclosure>
  );
}

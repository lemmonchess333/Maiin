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
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import type { UserProfile } from "@/lib/auth";
import type { DatedRun, LayoffClass } from "@/features/program/layoffDetection";
import type { ProgramState } from "@/features/program/programTypes";
import {
  hasRaceWeeksAhead,
  raceWeeksAhead,
} from "@/features/program/raceWeeksAhead";
import WeekAheadRows from "./WeekAheadRows";

interface RaceWeeksAheadProps {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Today's layoff reading, the one the rollover builds next week with. */
  recentLayoff: LayoffClass;
  /** The recent runs read with it, whose pace a running starting point's
   *  climb is sized at. */
  recentRuns?: readonly DatedRun[] | null;
  /** Local "YYYY-MM-DD". */
  today: string;
}

function WeeksAheadList({
  profile,
  programState,
  recentLayoff,
  recentRuns,
  today,
}: RaceWeeksAheadProps) {
  const weeks = useMemo(
    () =>
      raceWeeksAhead({
        profile,
        programState,
        recentLayoff,
        recentRuns,
        today,
      }),
    [profile, programState, recentLayoff, recentRuns, today]
  );
  return <WeekAheadRows weeks={weeks} />;
}

export default function RaceWeeksAhead(props: RaceWeeksAheadProps) {
  const [open, setOpen] = useState(false);
  if (!hasRaceWeeksAhead(props.profile, props.programState, props.today))
    return null;
  return (
    <PurposeDisclosure label="The weeks ahead" onToggle={setOpen}>
      <p>
        The plan as it stands today. Each week is set when it starts, from what
        you’ve run.
      </p>
      {open && (
        <SectionErrorBoundary sectionName="race-weeks-ahead">
          <WeeksAheadList {...props} />
        </SectionErrorBoundary>
      )}
    </PurposeDisclosure>
  );
}

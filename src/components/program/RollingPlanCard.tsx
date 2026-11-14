import { Card } from "@/components/ui/Card";
import type { UserProfile } from "@/lib/auth";
import type { DatedRun, LayoffClass } from "@/features/program/layoffDetection";
import type { ProgramState } from "@/features/program/programTypes";
import {
  ROLLING_GOAL_LINES,
  ROLLING_GOAL_NAMES,
  type RollingGoal,
} from "@/features/program/rollingPlan";
import RollingWeeksAhead from "./RollingWeeksAhead";

/**
 * A plan with no race date on Train's Run tab (Run24 (3), deep dive D7),
 * where a race plan has its card and the starter goal its own: the goal,
 * what its weeks hold in a line, and the weeks ahead
 * (`RollingWeeksAhead`). The page header gives its week ("Build to 10K ·
 * Week 3"), and the tab's footer "Edit run plan" is the way into it, so the
 * card carries neither.
 */
export default function RollingPlanCard({
  goal,
  profile,
  programState,
  recentLayoff,
  recentRuns,
  today,
}: {
  goal: RollingGoal;
  profile: UserProfile;
  programState: ProgramState | null;
  recentLayoff: LayoffClass;
  recentRuns?: readonly DatedRun[] | null;
  /** Local "YYYY-MM-DD". */
  today: string;
}) {
  return (
    <Card as="section" aria-label="Run plan" className="space-y-1 rounded-xl">
      <p className="text-sm font-bold text-running-strong">Plan, no race</p>
      <h3 className="text-base font-bold text-foreground">
        {ROLLING_GOAL_NAMES[goal]}
      </h3>
      <p className="text-sm text-muted-foreground">
        {ROLLING_GOAL_LINES[goal]}
      </p>
      <RollingWeeksAhead
        profile={profile}
        programState={programState}
        recentLayoff={recentLayoff}
        recentRuns={recentRuns}
        today={today}
      />
    </Card>
  );
}

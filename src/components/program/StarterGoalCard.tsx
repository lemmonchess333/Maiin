import { Card } from "@/components/ui/Card";
import {
  STARTER_GOAL_NAME,
  type StarterProgress,
} from "@/features/program/starterProgress";

/**
 * Run9's starter goal on Train: where the goal stands, in weeks rather
 * than a date, since a week not done repeats and the end moves. No phase
 * words, no compressed or Realign notes and no easier week: repeating a
 * week is the easing. One plain line when the week repeats last week's,
 * and one when this week is done.
 */
export default function StarterGoalCard({
  progress,
}: {
  progress: StarterProgress;
}) {
  const weekDone = progress.runsThisWeek >= progress.runsForTheWeek;
  return (
    <Card className="space-y-1">
      <p className="text-sm font-bold text-running-strong">
        {STARTER_GOAL_NAME}
      </p>
      <p className="text-base font-bold text-foreground">
        {progress.weekLabel} · {progress.toGoLabel}
      </p>
      {weekDone ? (
        <p className="text-sm text-muted-foreground">
          {progress.reached
            ? "You've done it."
            : "This week is done. The next one starts on Monday."}
        </p>
      ) : progress.repeated ? (
        <p className="text-sm text-muted-foreground">
          This week again: {progress.runsForTheWeek} runs move you on.
        </p>
      ) : null}
    </Card>
  );
}

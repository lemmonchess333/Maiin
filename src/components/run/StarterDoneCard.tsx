import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { haptic } from "@/lib/haptic";
import { STARTER_GOAL_NAME } from "@/features/program/starterProgress";

/**
 * Run9's reopening (call 6): the starter goal reached. A plain Done, and the
 * next goal offered once ("Train for a 5K: at a race or on your own"), with
 * no plan made by itself. The same card on Home and Train, one dismissal for
 * both, per account on this device and per goal (keyed by the day it
 * began), so a later goal gets its own. Taking the offer dismisses it too.
 * The caller decides the goal is reached (`starterGoalReached`).
 */
export default function StarterDoneCard({
  startedOn,
  navigate,
}: {
  /** The goal's start day, which keys the dismissal. */
  startedOn: string;
  navigate: (path: string) => void;
}) {
  const { dismissed, dismiss } = useDismissOnce(
    `tropos-starter-done-${startedOn}`
  );
  if (dismissed) return null;
  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-bold text-running-strong">Done</p>
        <p className="text-base font-bold text-foreground">
          {STARTER_GOAL_NAME}
        </p>
        <p className="text-sm text-muted-foreground">
          Next, if you like: train for a 5K, at a race or on your own.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="sport"
          className="flex-auto"
          onClick={() => {
            haptic();
            dismiss();
            navigate("/settings/run-plan");
          }}
        >
          Train for a 5K
        </Button>
        <Button
          variant="secondary"
          className="flex-auto"
          onClick={() => {
            haptic();
            dismiss();
          }}
        >
          Not now
        </Button>
      </div>
    </Card>
  );
}

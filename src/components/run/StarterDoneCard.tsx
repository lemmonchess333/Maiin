import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { haptic } from "@/lib/haptic";
import {
  STARTER_GOAL_NAME,
  starterDoneKey,
} from "@/features/program/starterProgress";

/**
 * Run9's reopening (call 6): the starter goal reached. A plain Done, and the
 * next goal offered once ("Train for a 5K: at a race or on your own"), with
 * no plan made by itself. The same card on Home and Train, one dismissal for
 * both, per account on this device and per goal (keyed by the day it
 * began), so a later goal gets its own. Taking the offer dismisses it too.
 * The caller decides the goal is reached (`starterGoalReached`). A caller
 * that needs to know whether it is showing (Train, which holds back its
 * race prompt meanwhile) passes the answer it holds for the same key.
 */
export default function StarterDoneCard({
  startedOn,
  navigate,
  answer,
}: {
  /** The goal's start day, which keys the dismissal. */
  startedOn: string;
  navigate: (path: string) => void;
  /** The caller's `useDismissOnce(starterDoneKey(startedOn))`, when it
   *  needs it too; left out, the card holds its own. */
  answer?: { dismissed: boolean; dismiss: () => void };
}) {
  const own = useDismissOnce(starterDoneKey(startedOn));
  const { dismissed, dismiss } = answer ?? own;
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
            navigate("/settings/run-plan?goal=5k");
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

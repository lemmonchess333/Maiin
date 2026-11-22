import { useId } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { haptic } from "@/lib/haptic";
import {
  STARTER_GOAL_NAME,
  starterDoneKey,
} from "@/features/program/starterProgress";
import {
  ROLLING_GOAL_LINES,
  ROLLING_GOAL_NAMES,
} from "@/features/program/rollingPlan";

/**
 * What comes after the starter goal, each a tap into Run plan with it
 * chosen, as the recovery banner's Choose a plan opens it (Run24 (3), deep
 * dive D7): two plans with no race date, which keep going and are free on
 * every account, and the 5K Run9 call 6 offered, at a race or on the
 * runner's own date.
 */
const NEXT_GOALS: ReadonlyArray<{ name: string; line: string; path: string }> =
  [
    {
      name: ROLLING_GOAL_NAMES.build_5k,
      line: ROLLING_GOAL_LINES.build_5k,
      path: "/settings/run-plan?goal=build_5k",
    },
    {
      name: ROLLING_GOAL_NAMES.keep_fit,
      line: ROLLING_GOAL_LINES.keep_fit,
      path: "/settings/run-plan?goal=keep_fit",
    },
    {
      name: "Train for a 5K",
      line: "At a race or on your own, on a date you pick.",
      path: "/settings/run-plan?goal=5k",
    },
  ];

/** One next goal: its name, what it holds, and a chevron, a row a goal
 *  as a list of places to go is drawn. The name is the row's name; the
 *  line describes it. */
function NextGoalRow({
  name,
  line,
  onSelect,
}: {
  name: string;
  line: string;
  onSelect: () => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-line`}
      className="w-full min-h-14 flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3.5 py-2.5 text-left active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="min-w-0">
        <span
          id={`${id}-name`}
          className="block text-sm font-semibold text-foreground"
        >
          {name}
        </span>
        <span id={`${id}-line`} className="block text-xs text-muted-foreground">
          {line}
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </button>
  );
}

/**
 * Run9's reopening (call 6): the starter goal reached. A plain Done, and
 * what comes next offered once, with no plan made by itself: Build to 5K
 * or Keep fit, plans with no race date (Run24 (3)), or a 5K at a race or on
 * your own. Each opens Run plan with it chosen, to save. The same card on
 * Home and Train, one dismissal for both, per account on this device and
 * per goal (keyed by the day it began), so a later goal gets its own.
 * Taking an offer dismisses it too. The caller decides the goal is reached
 * (`starterGoalReached`). A caller that needs to know whether it is
 * showing (Train, which holds back its race prompt meanwhile) passes the
 * answer it holds for the same key.
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
    <Card className="space-y-3 rounded-xl">
      <div>
        <p className="text-sm font-bold text-running-strong">Done</p>
        <p className="text-base font-bold text-foreground">
          {STARTER_GOAL_NAME}
        </p>
        <p className="text-sm text-muted-foreground">
          Next, if you like: a plan with no race date, or a 5K.
        </p>
      </div>
      <div role="group" aria-label="What’s next" className="space-y-2">
        {NEXT_GOALS.map((goal) => (
          <NextGoalRow
            key={goal.path}
            name={goal.name}
            line={goal.line}
            onSelect={() => {
              haptic();
              dismiss();
              navigate(goal.path);
            }}
          />
        ))}
      </div>
      <Button
        variant="ghost"
        fullWidth
        className="text-muted-foreground"
        onClick={() => {
          haptic();
          dismiss();
        }}
      >
        Not now
      </Button>
    </Card>
  );
}

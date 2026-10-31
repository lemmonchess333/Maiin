import { ArrowRight, CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import MetaLine from "@/components/ui/MetaLine";
import type { PlanFeel } from "@/lib/momentumCheckin";

export interface WeekResetOutcome {
  kind: "run" | "layout";
  status: "applied" | "queued";
  text: string;
}

interface Props {
  feel?: PlanFeel;
  range: string;
  liftDays: number;
  plannedRuns: number;
  /** The person's run plan: a race plan (whose difficulty and volume Pgm6
   *  sets), another plan, or none, which hides every run action. */
  runPlan: "race" | "plan" | "none";
  /** Where this week's Express session opens, or null with no lift ahead. */
  expressTarget: string | null;
  canMoveRun: boolean;
  canEditLayout: boolean;
  moveReason?: string;
  layoutReason?: string;
  outcome: WeekResetOutcome | null;
  onMoveRun: () => void;
  onEditLayout: () => void;
  onGoToday: () => void;
  onReviewWeek: () => void;
  onOpen: (path: string) => void;
}

/** The handoff from a private review to a real, user-confirmed plan choice. */
export default function WeekResetCard({
  feel,
  range,
  liftDays,
  plannedRuns,
  runPlan,
  expressTarget,
  canMoveRun,
  canEditLayout,
  moveReason,
  layoutReason,
  outcome,
  onMoveRun,
  onEditLayout,
  onGoToday,
  onReviewWeek,
  onOpen,
}: Props) {
  if (outcome) {
    return (
      <Card as="section" size="compact" aria-label="Week reset result">
        <div className="flex items-start gap-3">
          {outcome.status === "queued" ? (
            <Clock3
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2
              className="mt-0.5 size-5 shrink-0 text-lifting-strong"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-bold text-foreground">
              {outcome.status === "queued"
                ? "Review your queued change"
                : "Your week is ready"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {outcome.status === "queued"
                ? "Your move was queued to sync. Review the latest week before relying on the new date."
                : outcome.text}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Button
            fullWidth
            onClick={onGoToday}
            rightIcon={<ArrowRight className="size-4" />}
          >
            Go to Today
          </Button>
          <Button fullWidth variant="ghost" onClick={onReviewWeek}>
            Review this week
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card as="section" size="compact" aria-label="Make this week fit">
      <div className="flex items-start gap-3">
        <CalendarDays
          className="mt-0.5 size-5 shrink-0 text-lifting-strong"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">
            Make this week fit
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {feel === "a_bit_much"
              ? "You said last week felt like a bit much."
              : feel === "too_light"
                ? "You said last week felt too light."
                : "Review the week ahead."}{" "}
            {range} · Choose what needs to change. Nothing changes until you
            review and confirm it.
          </p>
        </div>
      </div>
      <MetaLine
        className="mt-3"
        items={[
          `${liftDays} lift days`,
          ...(runPlan === "none" ? [] : [`${plannedRuns} planned runs`]),
        ]}
      />
      {/* The dose before the layout (XB1 call 2): a heavy week takes a
          shorter lift or a lighter run plan, then a moved run; a light one
          takes the race plan's difficulty and volume. The usual layout is
          the last resort, a row of its own. */}
      <div className="mt-4 space-y-2">
        {feel !== "too_light" && expressTarget && (
          <Option onClick={() => onOpen(expressTarget)}>
            Use this week&apos;s Express session
          </Option>
        )}
        {feel === "a_bit_much" && runPlan !== "none" && (
          <Option onClick={() => onOpen("/settings/run-plan")}>
            Make the run plan lighter
          </Option>
        )}
        {feel === "too_light" && runPlan === "race" && (
          <Option onClick={() => onOpen("/settings/run-plan")}>
            Make the run plan harder
          </Option>
        )}
        {feel !== "too_light" && runPlan !== "none" && (
          <>
            <Option disabled={!canMoveRun} onClick={onMoveRun}>
              Move a run this week
            </Option>
            {!canMoveRun && moveReason && (
              <p className="text-xs text-muted-foreground">{moveReason}</p>
            )}
          </>
        )}
        <Button
          fullWidth
          variant="ghost"
          disabled={!canEditLayout}
          onClick={onEditLayout}
        >
          Change usual weekly layout
        </Button>
        {!canEditLayout && layoutReason && (
          <p className="text-xs text-muted-foreground">{layoutReason}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Your usual layout repeats in future weeks; changing the number of lift
          days may rebuild your programme.
        </p>
        <Button fullWidth variant="ghost" onClick={onGoToday}>
          Keep this week
        </Button>
      </div>
    </Card>
  );
}

function Option({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      fullWidth
      variant="secondary"
      disabled={disabled}
      onClick={onClick}
      className="justify-between"
      rightIcon={<ArrowRight className="size-4" />}
    >
      {children}
    </Button>
  );
}

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
  canMoveRun: boolean;
  canEditLayout: boolean;
  moveReason?: string;
  layoutReason?: string;
  outcome: WeekResetOutcome | null;
  onMoveRun: () => void;
  onEditLayout: () => void;
  onGoToday: () => void;
  onReviewWeek: () => void;
}

/** The handoff from a private review to a real, user-confirmed plan choice. */
export default function WeekResetCard({
  feel,
  range,
  liftDays,
  plannedRuns,
  canMoveRun,
  canEditLayout,
  moveReason,
  layoutReason,
  outcome,
  onMoveRun,
  onEditLayout,
  onGoToday,
  onReviewWeek,
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
        items={[`${liftDays} lift days`, `${plannedRuns} planned runs`]}
      />
      <div className="mt-4 space-y-2">
        <Button
          fullWidth
          variant="secondary"
          disabled={!canMoveRun}
          onClick={onMoveRun}
          className="justify-between"
          rightIcon={<ArrowRight className="size-4" />}
        >
          Move a run this week
        </Button>
        {!canMoveRun && moveReason && (
          <p className="text-xs text-muted-foreground">{moveReason}</p>
        )}
        <Button
          fullWidth
          variant="secondary"
          disabled={!canEditLayout}
          onClick={onEditLayout}
          className="justify-between"
          rightIcon={<ArrowRight className="size-4" />}
        >
          Change usual weekly layout
        </Button>
        {!canEditLayout && layoutReason && (
          <p className="text-xs text-muted-foreground">{layoutReason}</p>
        )}
        <p className="text-xs text-muted-foreground">
          A run move affects one date this week. Your usual layout repeats in
          future weeks; changing the number of lift days may rebuild your
          programme.
        </p>
        <Button fullWidth variant="ghost" onClick={onGoToday}>
          Keep this week · Go to Today
        </Button>
      </div>
    </Card>
  );
}

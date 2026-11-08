import InlineNumerals from "@/components/ui/InlineNumerals";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WeekPhaseRowProps {
  weekNumber: number;
  label?: string;
  /** What follows the week on the line: " · 6 days/week". */
  suffix?: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
}

/* A chevron 24pt on the line, its hit area 44pt from the pseudo-element
   around it (the DeloadBanner's close does the same), so it does not make
   the line taller than its text. */
const CHEVRON =
  "relative -my-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/**
 * Train's week, as the header's line under the title (DS4, §14m rules 17
 * and 18): "Week 1 · General fitness · 6 days/week". It was a row of its
 * own between the Lift/Run switch and the day circles, 44pt plus a gap,
 * a second heading over the circles. The chevrons to earlier weeks stay
 * on the line, beside the week they move, and only once there is an
 * earlier week to see.
 */
export default function WeekPhaseRow({
  weekNumber,
  label,
  suffix,
  onPrevWeek,
  onNextWeek,
  canGoPrev,
  canGoNext,
}: WeekPhaseRowProps) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-top">
      {canGoPrev && (
        <button
          type="button"
          aria-label="Previous week"
          onClick={onPrevWeek}
          className={CHEVRON}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
      )}
      <span className="min-w-0">
        {/* The label is its own element: InlineNumerals is a fragment, so
            beside the suffix it would join one run of text, and the week's
            label ("Week 21 of 53 · Build") would no longer be findable on
            its own, by a journey or anything else that reads it. */}
        <span>
          <InlineNumerals>{label ?? `Week ${weekNumber}`}</InlineNumerals>
        </span>
        {suffix && <InlineNumerals>{suffix}</InlineNumerals>}
      </span>
      {canGoNext && (
        <button
          type="button"
          aria-label="Next week"
          onClick={onNextWeek}
          className={CHEVRON}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

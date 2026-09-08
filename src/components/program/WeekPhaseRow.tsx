import InlineNumerals from "@/components/ui/InlineNumerals";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

interface WeekPhaseRowProps {
  weekNumber: number;
  label?: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
}

export default function WeekPhaseRow({
  weekNumber,
  label,
  onPrevWeek,
  onNextWeek,
  canGoPrev,
  canGoNext,
}: WeekPhaseRowProps) {
  const showChevrons = canGoPrev || canGoNext;

  return (
    <div className="flex min-h-11 items-center justify-center gap-3 py-1">
      {showChevrons &&
        (canGoPrev ? (
          <IconButton
            icon={<ChevronLeft className="size-[15px] text-muted-foreground" />}
            aria-label="Previous week"
            onClick={onPrevWeek}
          />
        ) : (
          <div className="size-11" aria-hidden="true" />
        ))}

      <span className="text-sm font-semibold text-foreground text-center">
        <InlineNumerals>{label ?? `Week ${weekNumber}`}</InlineNumerals>
      </span>

      {showChevrons &&
        (canGoNext ? (
          <IconButton
            icon={
              <ChevronRight className="size-[15px] text-muted-foreground" />
            }
            aria-label="Next week"
            onClick={onNextWeek}
          />
        ) : (
          <div className="size-11" aria-hidden="true" />
        ))}
    </div>
  );
}

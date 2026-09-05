import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

interface WeekPhaseRowProps {
  weekNumber: number;
  phaseName?: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
}

export default function WeekPhaseRow({
  weekNumber,
  phaseName,
  onPrevWeek,
  onNextWeek,
  canGoPrev,
  canGoNext,
}: WeekPhaseRowProps) {
  const showChevrons = canGoPrev || canGoNext;

  return (
    <div
      className="flex items-center justify-center gap-3 py-1"
      style={{ height: 36 }}
    >
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

      <span className="text-sm font-semibold text-foreground">
        Week {weekNumber}
      </span>

      {phaseName && (
        <span
          className="text-caption font-bold uppercase text-lifting-strong bg-lifting/10"
          style={{
            padding: "3px 8px",
            borderRadius: 6,
            letterSpacing: "0.04em",
          }}
        >
          {phaseName}
        </span>
      )}

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

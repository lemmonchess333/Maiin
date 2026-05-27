import { ChevronLeft, ChevronRight } from "lucide-react";

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
          <button
            type="button"
            onClick={onPrevWeek}
            className="p-1 active:scale-95 transition-transform"
            aria-label="Previous week"
          >
            <ChevronLeft className="size-[15px] text-muted-foreground" />
          </button>
        ) : (
          <div className="w-[23px]" />
        ))}

      <span className="text-sm font-semibold text-foreground">
        Week {weekNumber}
      </span>

      {phaseName && (
        <span
          className="text-[10px] font-bold uppercase"
          style={{
            color: "#7C6BF0",
            backgroundColor: "rgba(124,107,240,0.1)",
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
          <button
            type="button"
            onClick={onNextWeek}
            className="p-1 active:scale-95 transition-transform"
            aria-label="Next week"
          >
            <ChevronRight className="size-[15px] text-muted-foreground" />
          </button>
        ) : (
          <div className="w-[23px]" />
        ))}
    </div>
  );
}

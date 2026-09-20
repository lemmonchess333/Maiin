import { memo, useRef } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { haptic } from "@/lib/haptic";

interface FoodDateBarProps {
  selectedDate: string;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPick: (nextDate: string) => void;
  /** Food6a-3: disable navigation past the 90-day tap-back / future bounds. */
  canGoBack?: boolean;
  canGoForward?: boolean;
  /** Native picker bounds (YYYY-MM-DD); also gates the controlled value. */
  minDate?: string;
  maxDate?: string;
}

/**
 * The Food page's date switcher: one compact cluster — previous, the
 * day, next — that sits in the page header's action slot beside the
 * title.
 *
 * It was a pinned full-width bar on its own row beneath the
 * title, chevrons at the far edges with a 12px label between them:
 * two header rows and 90px spent before the day's number, on the
 * empty-day screen every new user sees. Owner call from the Food
 * options page: one row. The chevrons sit against the label so the
 * three read as one control, and the cluster scrolls with the page
 * the way History's does.
 *
 * Still self-contained (the W1e extraction): the hidden native date
 * input keeps the picker in one place.
 */
function FoodDateBar({
  selectedDate,
  isToday,
  onPrev,
  onNext,
  onPick,
  canGoBack = true,
  canGoForward = true,
  minDate,
  maxDate,
}: FoodDateBarProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="inline-flex items-center rounded-full bg-card card-shadow">
      <button
        type="button"
        onClick={() => {
          haptic();
          onPrev();
        }}
        disabled={!canGoBack}
        aria-label="Previous day"
        /* 44×44 hit area; the icon stays 16px so the cluster reads as
           one pill rather than three buttons. */
        className="size-11 flex items-center justify-center rounded-full hover:bg-muted active:scale-[0.95] transition-all disabled:opacity-40 disabled:active:scale-100"
      >
        <ChevronLeft aria-hidden="true" className="size-4 text-foreground" />
      </button>
      <button
        type="button"
        onClick={() => dateInputRef.current?.showPicker?.()}
        aria-label="Select date"
        className="flex items-center justify-center gap-1.5 min-h-11 px-1 active:scale-[0.97] transition-transform"
      >
        <CalendarDays
          aria-hidden="true"
          className="size-3.5 text-muted-foreground"
        />
        {/* Semibold at text-sm: it is a control's label now, not a
            caption. "EEE d MMM" — day before month, the app's one date
            treatment — short enough to share the row with the title. */}
        <p className="text-sm font-semibold text-foreground whitespace-nowrap">
          {isToday
            ? "Today"
            : format(new Date(selectedDate + "T12:00:00"), "EEE d MMM")}
        </p>
      </button>
      <input
        ref={dateInputRef}
        type="date"
        value={selectedDate}
        min={minDate}
        max={maxDate}
        aria-label="Select date"
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="sr-only"
      />
      <button
        type="button"
        onClick={() => {
          haptic();
          onNext();
        }}
        disabled={!canGoForward}
        aria-label="Next day"
        className="size-11 flex items-center justify-center rounded-full hover:bg-muted active:scale-[0.95] transition-all disabled:opacity-40 disabled:active:scale-100"
      >
        <ChevronRight aria-hidden="true" className="size-4 text-foreground" />
      </button>
    </div>
  );
}

export default memo(FoodDateBar);

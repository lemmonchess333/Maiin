import { memo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatShortWeekdayDayMonth } from "@/utils/formatters";
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
 * The Food page's date switcher: previous, the day, next. Since Food11
 * (call 1) it IS the page's header row: Food draws no large title above
 * its wheel (DESIGN_GUIDE §14m rule 2), so this takes the title's place
 * and the targets gear closes the row. No pill behind it, which was one
 * more box on a page that had twelve, and the date sits beside "Today"
 * now that there is room for it.
 *
 * Before that it shared the row with the "Food" title, as a pill.
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
  /* The short weekday form, day before month: the app's one date
     treatment. */
  const shortDate = formatShortWeekdayDayMonth(
    new Date(selectedDate + "T12:00:00")
  );

  return (
    /* The negative margin sets the chevron's glyph on the page gutter:
       its 44px hit area would otherwise indent the row. In px, like the
       gutter it answers: a rem margin doubled at 2x text and put the
       chevron past the screen's edge. */
    <div className="-ml-[12px] inline-flex items-center">
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
        className="size-[44px] flex items-center justify-center rounded-full hover:bg-muted active:scale-[0.95] transition-all disabled:opacity-40 disabled:active:scale-100"
      >
        <ChevronLeft
          aria-hidden="true"
          className="size-5 text-muted-foreground"
        />
      </button>
      <button
        type="button"
        onClick={() => dateInputRef.current?.showPicker?.()}
        /* The name carries what the button shows, then what it does. */
        aria-label={`${isToday ? "Today, " : ""}${shortDate}. Select date`}
        className="flex min-h-[44px] items-center px-0.5 active:scale-[0.97] transition-transform"
      >
        {/* The row's own line of text: "Today" at the body size and bold,
            the date beside it and quieter. On another day the date is the
            line. They wrap as two lines before either is cut, at large
            text. */}
        <span className="flex flex-wrap items-baseline gap-x-1.5 text-left">
          {isToday && (
            <span className="text-base font-bold text-foreground whitespace-nowrap">
              Today
            </span>
          )}
          <span
            className={
              isToday
                ? "text-sm font-medium text-muted-foreground whitespace-nowrap"
                : "text-base font-bold text-foreground whitespace-nowrap"
            }
          >
            {shortDate}
          </span>
        </span>
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
        className="size-[44px] flex items-center justify-center rounded-full hover:bg-muted active:scale-[0.95] transition-all disabled:opacity-40 disabled:active:scale-100"
      >
        <ChevronRight
          aria-hidden="true"
          className="size-5 text-muted-foreground"
        />
      </button>
    </div>
  );
}

export default memo(FoodDateBar);

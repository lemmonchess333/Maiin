import { memo, useRef } from "react";
import { motion, type Variants } from "framer-motion";
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
  /** Parent stagger variant so the bar participates in the page animation. */
  itemVariant?: Variants;
}

/**
 * Sticky date-switcher bar at the top of the Food page.
 *
 * Extracted from `Food.tsx` as part of the W1e component-extraction
 * pass — was ~45 lines of inline JSX mixing motion, haptic, and a
 * hidden `<input type="date">` picker. Keeping it self-contained
 * makes the Food page's top hierarchy easier to reason about and
 * gives the date picker a single home instead of being tangled with
 * the header + hero-card render.
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
  itemVariant,
}: FoodDateBarProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  return (
    <motion.div
      variants={itemVariant}
      className="sticky z-30 bg-background flex items-center justify-between rounded-xl py-2 px-3"
      style={{ top: "var(--safe-top)" }}
    >
      <button
        onClick={() => { haptic(); onPrev(); }}
        disabled={!canGoBack}
        aria-label="Previous day"
        /* min 44×44 hit area per iOS HIG / WCAG. Pre-F1 was p-2
           (~36px) — the icon stays 16px so the visual weight is
           unchanged, only the tappable region grows. */
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-muted active:scale-[0.95] transition-all disabled:opacity-40 disabled:active:scale-100"
      >
        <ChevronLeft aria-hidden="true" className="w-4 h-4 text-foreground" />
      </button>
      <button
        onClick={() => dateInputRef.current?.showPicker?.()}
        aria-label="Select date"
        className="text-center flex items-center gap-2"
      >
        <CalendarDays aria-hidden="true" className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-foreground">
          {isToday ? "Today" : format(new Date(selectedDate + "T12:00:00"), "EEE, MMMM d")}
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
        onClick={() => { haptic(); onNext(); }}
        disabled={!canGoForward}
        aria-label="Next day"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-muted active:scale-[0.95] transition-all disabled:opacity-40 disabled:active:scale-100"
      >
        <ChevronRight aria-hidden="true" className="w-4 h-4 text-foreground" />
      </button>
    </motion.div>
  );
}

export default memo(FoodDateBar);

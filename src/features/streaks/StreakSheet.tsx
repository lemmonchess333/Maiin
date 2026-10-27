import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { IconButton } from "@/components/ui/IconButton";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { cn } from "@/lib/utils";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { STREAK_WINDOW_DAYS, useStreaks } from "./useStreaks";
import {
  coveredDayLine,
  earliestStreakMonth,
  monthOf,
  streakMonth,
  type StreakDayState,
} from "./streakCalendar";

/** Monday first, as the app's weeks are (`WEEK_STARTS_ON`). */
const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

/** A day's circle: the logged days filled in the flame's purple, a
 *  covered day ringed in it, the rest plain. */
const DAY_CLASSES: Record<StreakDayState, string> = {
  logged: "bg-primary/25 text-foreground",
  covered: "border-2 border-primary text-foreground",
  none: "text-muted-foreground",
  ahead: "text-muted-foreground",
};

/**
 * The streak's days (Mob1 call 4), opened from Home's flame: a month of
 * logged and covered days, one line of reassurance when a day was
 * covered, and the way to the badges. Streak1's register holds: no
 * freezes, shields or tokens, and nothing about a streak at risk. The
 * month goes back as far as the streak reads (`STREAK_WINDOW_DAYS`).
 */
export default function StreakSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { currentStreak, activeDates, bridgedDates } = useStreaks();
  const todayKey = useLocalDateKey();
  const current = monthOf(todayKey);
  const earliest = earliestStreakMonth(todayKey, STREAK_WINDOW_DAYS);
  /** Months back from this one. */
  const [back, setBack] = useState(0);
  const maxBack =
    (current.getFullYear() - earliest.getFullYear()) * 12 +
    (current.getMonth() - earliest.getMonth());
  const shownBack = Math.min(back, maxBack);
  const month = streakMonth(
    new Date(current.getFullYear(), current.getMonth() - shownBack, 1),
    activeDates,
    bridgedDates,
    todayKey
  );
  const reassurance = coveredDayLine(bridgedDates, currentStreak, todayKey);
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setBack(0);
        onOpenChange(next);
      }}
      title={`${currentStreak}-day streak`}
    >
      <div className="overflow-y-auto px-4 pt-3 pb-4 space-y-4">
        {reassurance && (
          <p className="text-sm text-foreground">{reassurance}</p>
        )}

        {/* A container for the days: under 13em of it (double text on a
            narrow phone) a day's number steps down a size, so two digits
            keep clear of the next day's in a seventh of the width. */}
        <section
          aria-labelledby="streak-month"
          className="@container space-y-3"
        >
          {/* The month's name holds the row; at large text, where the two
              arrows (sized in rem) would squeeze it below its longest
              word, they wrap under it. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3
              id="streak-month"
              className="min-w-[min(100%,7em)] flex-1 text-base font-bold"
              aria-live="polite"
            >
              {month.title}
            </h3>
            <div className="ml-auto flex gap-1">
              <IconButton
                aria-label="Previous month"
                variant="ghost"
                icon={<ChevronLeft className="size-5" />}
                disabled={shownBack >= maxBack}
                onClick={() => setBack(shownBack + 1)}
              />
              <IconButton
                aria-label="Next month"
                variant="ghost"
                icon={<ChevronRight className="size-5" />}
                disabled={shownBack === 0}
                onClick={() => setBack(shownBack - 1)}
              />
            </div>
          </div>
          <div
            className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground"
            aria-hidden="true"
          >
            {WEEKDAY_INITIALS.map((initial, i) => (
              <span key={i}>{initial}</span>
            ))}
          </div>
          <ol
            aria-label={month.title}
            className="grid grid-cols-7 gap-1 list-none p-0 m-0"
          >
            {month.days.map((day, i) => (
              <li
                key={day.key}
                className="flex justify-center min-w-0"
                style={
                  i === 0 && month.leadingBlanks > 0
                    ? { gridColumnStart: month.leadingBlanks + 1 }
                    : undefined
                }
              >
                <span
                  className={cn(
                    "flex aspect-square w-full max-w-10 items-center justify-center rounded-full text-sm @max-[13em]:text-xs font-semibold font-mono tabular-nums",
                    DAY_CLASSES[day.state],
                    day.isToday && "underline underline-offset-4"
                  )}
                >
                  <span aria-hidden="true">{day.date}</span>
                  <span className="sr-only">{day.label}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-full bg-primary/25"
            />
            Logged
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-full border-2 border-primary"
            />
            Covered
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          A workout, a run or a meal logged keeps the streak going. One rest day
          in any seven is covered.
        </p>

        <Link
          to="/history?tab=badges"
          onClick={() => onOpenChange(false)}
          className={buttonClasses({ variant: "secondary", fullWidth: true })}
        >
          See your badges
        </Link>
      </div>
    </BottomSheet>
  );
}

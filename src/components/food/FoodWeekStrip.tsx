import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dateHelpers";
import type { FoodWeekDay } from "@/lib/foodWeek";
import { cn } from "@/lib/utils";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";
import { formatDayMonthLong, formatWeekdayDayMonth } from "@/utils/formatters";

/* The wheel's grey groove (CalorieRing's COLOR_TRACK): one grey for "not
   yet" on the wheel, the macro bars and these. */
const GROOVE = "hsl(var(--muted-foreground) / 0.2)";

/**
 * What the day's bar says, in words. The bar carries the reading on
 * screen; this is the same reading for VoiceOver, with the date the
 * strip no longer prints.
 */
function eatingLabel(day: FoodWeekDay): string {
  if (day.isFuture || !day.isSelectable) return "";
  if (day.beforeJoined) return ", before you joined";
  if (day.eaten <= 0) return ", nothing logged";
  const eaten = formatCalories(day.eaten);
  if (day.target === null) return `, ${eaten} ${CALORIE_UNIT}`;
  const target = formatCalories(day.target);
  const over = day.eaten - day.target;
  return over > 0
    ? `, ${eaten} of ${target} ${CALORIE_UNIT}, ${formatCalories(over)} over`
    : `, ${eaten} of ${target} ${CALORIE_UNIT}`;
}

/**
 * The Food page's week: Monday to Sunday, as Home's strip is, with each
 * day a short bar of the calories logged against that day's target, in
 * the food orange. Tapping a day opens it in the diary below, as the date
 * arrows do.
 *
 * Bars, under the wheel (Food11 call 4). A ring a day with the date
 * inside it is seven more circles over the page's one circle and 80px
 * of the first screen. A bar is the macro bars' and Home's week strip's
 * own shape, the strip is 44px tall, and it sits under the wheel it
 * summarises. The strip prints no date: the header row says the day in
 * view, and each day's name carries its own.
 *
 * The strip runs edge to edge (the page's 16px gutters given back), so a
 * day is 45px wide on a 320px phone where inside the gutters it was 41.
 *
 * Today is the bold letter, as on the iOS week row. The day in view has
 * an outline round its bar.
 *
 * A day that has not come yet, or that the diary cannot open, is a faded
 * groove: at full strength an empty bar says nothing was logged, which is
 * true only of a day that has been. Going over the target lays a darker
 * length over the bar from its start, as the macro bars do.
 *
 * The fill is `--nutrition-strong`: the food orange in dark, and the
 * deeper orange in light, 4.99 to 1 against the page where the food
 * orange is 2.35 to 1. The bars print no number, so the drawing has to
 * be readable by itself (WCAG 1.4.11 asks 3 to 1).
 */
export default function FoodWeekStrip({
  days,
  onSelect,
}: {
  days: readonly FoodWeekDay[];
  onSelect: (dayKey: string) => void;
}) {
  if (days.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={`Week of ${formatDayMonthLong(parseLocalDate(days[0].key))}`}
      /* Seven equal columns, out to the screen's edges. The margin is in
         px, as the gutter it gives back is. */
      className="-mx-[16px] grid grid-cols-7"
    >
      {days.map((day) => {
        const date = parseLocalDate(day.key);
        /* A day before the account began reads as a day to come does: a
           faded groove (Food10 (3)). */
        const drawn = day.isSelectable && !day.beforeJoined;
        const fill = drawn ? Math.min(Math.max(day.progress ?? 0, 0), 1) : 0;
        const over = drawn ? Math.min(Math.max(day.over, 0), 1) : 0;
        return (
          <button
            type="button"
            key={day.key}
            disabled={!day.isSelectable}
            onClick={() => onSelect(day.key)}
            /* A 7-way selector, as on Home: `aria-pressed` carries the
               selection, so the label does not repeat it. */
            aria-pressed={day.isSelected}
            aria-current={day.isToday ? "date" : undefined}
            aria-label={
              // en-GB day-before-month, the app's one date treatment.
              formatWeekdayDayMonth(date) +
              eatingLabel(day) +
              (day.isToday ? " (today)" : "")
            }
            className="flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-[7px] transition-transform enabled:active:scale-[0.95]"
          >
            <span
              className={cn(
                "text-xs",
                day.isToday
                  ? "font-bold text-foreground"
                  : "font-semibold text-muted-foreground"
              )}
            >
              {format(date, "EEEEE")}
            </span>
            <span
              data-week-bar=""
              data-selected={day.isSelected || undefined}
              data-drawn={drawn || undefined}
              className={cn(
                "relative block h-[8px] w-[30px] overflow-hidden rounded-full",
                !drawn && "opacity-45",
                day.isSelected &&
                  "ring-[1.5px] ring-foreground ring-offset-2 ring-offset-background"
              )}
              style={{ background: GROOVE }}
            >
              <span
                data-week-fill=""
                className="absolute inset-y-0 left-0 rounded-full bg-nutrition-strong"
                style={{ width: `${fill * 100}%` }}
              />
              {over > 0 && (
                <span
                  data-week-over=""
                  className="absolute inset-y-0 left-0 rounded-full bg-nutrition-strong"
                  style={{
                    width: `${over * 100}%`,
                    /* The macro bars' overshoot: the same colour, darker,
                       so it works on either theme's fill. */
                    filter: "brightness(0.65) saturate(1.2)",
                  }}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

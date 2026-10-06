import { format } from "date-fns";
import ProgressRing from "@/components/ui/ProgressRing";
import { parseLocalDate } from "@/lib/dateHelpers";
import type { FoodWeekDay } from "@/lib/foodWeek";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";

/* The ring's geometry. The circle is Home's week-strip size, and the
   stroke leaves the date inside it room to read at text-sm. */
const SIZE = 40;
const STROKE = 3;

/**
 * What the day's ring says, in words. The ring and the number carry the
 * reading on screen; this is the same reading for VoiceOver.
 */
function eatingLabel(day: FoodWeekDay): string {
  if (day.isFuture || !day.isSelectable) return "";
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
 * The Food page's week (owner call, 2026-09-28): Monday to Sunday, as
 * Home's strip is, with each day a ring of the calories eaten against
 * that day's target, in the food orange. Tapping a day opens it in the
 * diary below, as the date arrows do.
 *
 * It borrows Home's strip's frame on purpose: the same row, the same
 * one-letter days, the same selection ring, so the two weeks read as one
 * control in two places. The one departure is today. Home marks it with
 * a purple ring, and here the ring is the day's eating, so today is the
 * bold letter alone, as on the iOS week row.
 *
 * A day that has not come yet, or that the diary cannot open, is the bare
 * date: no track, because an empty track would say nothing was eaten.
 * Going over the target draws a second lap in the deeper orange, as the
 * calorie ring above it does.
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
      aria-label={`Week of ${format(parseLocalDate(days[0].key), "d MMMM")}`}
      /* Seven equal columns, as on Home's strip: fixed 44px buttons
         pushed Sunday off a 320px phone once the text was larger. */
      className="grid grid-cols-7 items-center justify-items-center"
    >
      {days.map((day) => {
        const date = parseLocalDate(day.key);
        const drawn = day.isSelectable;
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
              format(date, "EEEE d MMMM") +
              eatingLabel(day) +
              (day.isToday ? " (today)" : "")
            }
            className="flex flex-col items-center justify-center gap-1.5 w-full min-w-0 min-h-[44px] transition-transform enabled:active:scale-[0.95]"
          >
            <span
              className={cn(
                "text-xs",
                day.isToday
                  ? "font-bold text-foreground"
                  : "font-medium text-muted-foreground"
              )}
            >
              {format(date, "EEEEE")}
            </span>
            <div
              data-selected={day.isSelected || undefined}
              className={cn(
                "relative rounded-full",
                day.isSelected &&
                  "ring-2 ring-foreground ring-offset-2 ring-offset-background"
              )}
            >
              <ProgressRing
                value={drawn ? (day.progress ?? 0) : 0}
                size={SIZE}
                stroke={STROKE}
                color={THEME.semantic.nutrition}
                trackColor={drawn ? undefined : "transparent"}
              >
                {/* Day numbers are numeric displays: Archivo, tabular. */}
                <span
                  className={cn(
                    "text-sm font-semibold font-mono tabular-nums",
                    drawn ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {date.getDate()}
                </span>
              </ProgressRing>
              {drawn && day.over > 0 && (
                <ProgressRing
                  value={day.over}
                  size={SIZE}
                  stroke={STROKE}
                  color={THEME.calorieRing.deep}
                  trackColor="transparent"
                  className="absolute inset-0"
                />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

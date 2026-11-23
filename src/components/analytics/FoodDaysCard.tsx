import SectionHeading from "@/components/ui/SectionHeading";
import type { FoodDaysReading } from "@/lib/foodDays";
import { CALORIE_TARGET_BAND } from "@/lib/foodDays";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";

interface Row {
  label: string;
  value: string;
  /** Words after the figure: "of 25 days", "kcal". */
  suffix: string;
}

/**
 * How the days went, on the Food page (DS3): days on the calorie target,
 * days protein was met, the weekend against the week, and protein per
 * kilogram of body weight.
 *
 * Counted by day, each against the target it had that day (`foodDays`):
 * an average close to target can hide a week of undereating and a
 * weekend of the opposite, and the day count cannot. Today is left out
 * because it is not over. A row that has nothing to count is left out
 * rather than shown as 0 of 0.
 *
 * A section on the page with ruled rows, not a card: nothing in it is
 * tapped.
 */
export default function FoodDaysCard({
  reading,
  proteinPerKg,
}: {
  reading: FoodDaysReading;
  /** Average protein a day over the trend weight, or null (no weigh-ins,
   *  or the weight is hidden and this would reveal it). */
  proteinPerKg: number | null;
}) {
  const rows: Row[] = [];
  const { calories, protein } = reading;
  if (calories.judged > 0) {
    rows.push({
      label: "Calories on target",
      value: String(calories.onTarget),
      suffix: `of ${calories.judged} ${calories.judged === 1 ? "day" : "days"}`,
    });
  }
  if (protein.judged > 0) {
    rows.push({
      label: "Protein target met",
      value: String(protein.met),
      suffix: `of ${protein.judged} ${protein.judged === 1 ? "day" : "days"}`,
    });
  }
  if (reading.weekendCalories !== null && reading.weekdayCalories !== null) {
    rows.push(
      {
        label: "Weekend days",
        value: formatCalories(reading.weekendCalories),
        suffix: CALORIE_UNIT,
      },
      {
        label: "Weekdays",
        value: formatCalories(reading.weekdayCalories),
        suffix: CALORIE_UNIT,
      }
    );
  }
  if (proteinPerKg !== null) {
    rows.push({
      label: "Protein",
      value: proteinPerKg.toFixed(1),
      suffix: "g per kg of body weight",
    });
  }
  if (rows.length === 0) return null;

  return (
    <section aria-label="How the days went" className="space-y-1 pt-4">
      <div>
        <SectionHeading size="compact">How the days went</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Before today. On target is within{" "}
          {Math.round(CALORIE_TARGET_BAND * 100)}% of calories.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex min-h-12 flex-wrap items-baseline justify-between gap-x-3 py-3"
          >
            <span className="text-sm text-foreground">{row.label}</span>
            <span className="text-right text-sm text-muted-foreground">
              <span className="text-base font-bold font-mono tabular-nums text-foreground">
                {row.value}
              </span>{" "}
              {row.suffix}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

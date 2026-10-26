import SectionLabel from "@/components/ui/SectionLabel";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";

/**
 * The daily calorie target setup works out, with its macros and what it is
 * for. Setup's numbers step shows it as the numbers are entered (FV3), so
 * a goal weight or pace visibly moves it, and the last step shows it again
 * with the rest of the plan.
 */
export default function DailyTarget({
  calories,
  protein,
  carbs,
  fat,
  note,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** What the target does: holds the weight, or a weekly pace. */
  note: string;
}) {
  return (
    <section
      className="rounded-2xl bg-card card-shadow p-5 space-y-2"
      aria-label="Your daily target"
    >
      <SectionLabel className="text-nutrition-strong">
        Your daily target
      </SectionLabel>
      <p className="text-3xl font-mono tabular-nums font-extrabold">
        {formatCalories(calories)}{" "}
        <span className="text-base font-sans font-semibold text-muted-foreground">
          {CALORIE_UNIT}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">
        <span className="font-mono tabular-nums">{protein} g</span> protein ·{" "}
        <span className="font-mono tabular-nums">{carbs} g</span> carbs ·{" "}
        <span className="font-mono tabular-nums">{fat} g</span> fat
      </p>
      <p className="text-sm text-muted-foreground">{note}</p>
    </section>
  );
}

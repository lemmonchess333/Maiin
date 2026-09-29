import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FoodDaysCard from "../FoodDaysCard";
import type { FoodDaysReading } from "@/lib/foodDays";
import { formatCalories } from "@/utils/formatNutrition";

/**
 * How the days went (DS3): days counted against each day's own target,
 * the weekend against the week, protein per kilogram. A row with nothing
 * to count is left out, never "0 of 0".
 */

const READING: FoodDaysReading = {
  calories: { onTarget: 17, judged: 25 },
  protein: { met: 12, judged: 25 },
  weekendCalories: 2650,
  weekdayCalories: 2080,
};

const rowText = (label: string) =>
  screen.getByText(label).closest("li")?.textContent;

describe("FoodDaysCard", () => {
  it("counts the days on target, and protein met", () => {
    render(<FoodDaysCard reading={READING} proteinPerKg={1.97} />);
    expect(rowText("Calories on target")).toBe(
      "Calories on target17 of 25 days"
    );
    expect(rowText("Protein target met")).toBe(
      "Protein target met12 of 25 days"
    );
  });

  it("sets the weekend beside the week, in the page's own figures", () => {
    render(<FoodDaysCard reading={READING} proteinPerKg={null} />);
    // Row text is raw textContent, so it carries the runtime's grouping
    // as the formatter wrote it (fr-FR's U+202F included).
    expect(rowText("Weekend days")).toBe(
      `Weekend days${formatCalories(2650)} kcal`
    );
    expect(rowText("Weekdays")).toBe(`Weekdays${formatCalories(2080)} kcal`);
  });

  it("gives protein per kilogram, when there is a weight to divide by", () => {
    const { unmount } = render(
      <FoodDaysCard reading={READING} proteinPerKg={1.97} />
    );
    expect(rowText("Protein")).toBe("Protein2.0 g per kg of body weight");
    unmount();
    render(<FoodDaysCard reading={READING} proteinPerKg={null} />);
    expect(screen.queryByText("Protein")).toBeNull();
  });

  it("leaves out what it cannot count, and itself when that is everything", () => {
    const bare: FoodDaysReading = {
      calories: { onTarget: 0, judged: 0 },
      protein: { met: 0, judged: 0 },
      weekendCalories: null,
      weekdayCalories: null,
    };
    const { container } = render(
      <FoodDaysCard reading={bare} proteinPerKg={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

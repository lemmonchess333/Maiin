import { describe, expect, it } from "vitest";
import {
  usualMeal,
  usualMealHeading,
  usualMealPortion,
  USUAL_MIN_LOGS,
} from "../usualMeal";
import type { Meal } from "@/hooks/useMeals";
const oats = (
  id: string,
  date: string,
  portion = "1 serving",
  calories = 420
): Meal => ({
  id,
  date,
  foodName: "Oats",
  meal: "breakfast",
  confidence: "manual",
  createdAt: null,
  totalCalories: calories,
  totalProtein: 20,
  totalCarbs: 50,
  totalFat: 15,
  items: [
    {
      name: "Oats",
      portionSize: portion,
      calories,
      protein: 20,
      carbs: 50,
      fat: 15,
    },
  ],
});
describe("usual meals", () => {
  it("uses the last logged portion with its matching macros", () => {
    const usual = usualMeal(
      [
        oats("a", "2026-09-03"),
        oats("b", "2026-09-04"),
        oats("c", "2026-09-05", "80 g", 500),
      ],
      "breakfast",
      "2026-09-06"
    );
    expect(usual?.portionSize).toBe("80 g");
    expect(usual?.cal).toBe(500);
  });
  it("hides after this slot is logged and returns after Undo", () => {
    const history = oats("a", "2026-09-05");
    const today = oats("b", "2026-09-06");
    expect(usualMeal([history, today], "breakfast", today.date)).toBeNull();
    expect(
      usualMeal(
        [history, { ...today, deletedAt: true }],
        "breakfast",
        today.date
      )?.name
    ).toBe("Oats");
    expect(usualMeal([history], "lunch", today.date)).toBeNull();
  });
  it("has no synthetic usual for a new account", () => {
    expect(usualMeal([], "breakfast", "2026-09-06")).toBeNull();
  });
  it("preserves every item in a multi-food meal", () => {
    const meal = oats("a", "2026-09-05");
    meal.items.push({
      ...meal.items[0],
      name: "Berries",
      portionSize: "100 g",
    });
    expect(usualMeal([meal], "breakfast", "2026-09-06")?.bundle?.items).toEqual(
      meal.items
    );
  });
});

/* "Your usual" is a claim about frequency. It used to be made from a single
   earlier log — any one past dinner became "Your usual at dinner" — and a
   multi-food meal printed "· 1 meal" beside its kcal, a fixed filler that
   read like a count of the logs behind the claim. */
describe("the usual row says what the history supports", () => {
  const dinner = (
    id: string,
    date: string,
    foodName = "Chicken and rice"
  ): Meal => ({
    ...oats(id, date),
    foodName,
    meal: "dinner",
    items: [
      {
        name: foodName,
        portionSize: "1 plate",
        calories: 600,
        protein: 45,
        carbs: 60,
        fat: 15,
      },
    ],
  });

  it("counts the earlier logs of the chosen meal in this slot", () => {
    const history = [
      dinner("a", "2026-09-03"),
      dinner("b", "2026-09-04"),
      dinner("c", "2026-09-05", "Pasta"),
    ];
    const usual = usualMeal(history, "dinner", "2026-09-06");
    expect(usual?.name).toBe("Chicken and rice");
    expect(usual?.timesLogged).toBe(2);
  });

  it("calls a meal logged once the last time, not the usual", () => {
    const usual = usualMeal(
      [dinner("a", "2026-09-05")],
      "dinner",
      "2026-09-06"
    );
    expect(usual?.timesLogged).toBe(1);
    expect(usualMealHeading(usual!, "dinner")).toBe("Last time at dinner");
  });

  it("calls a meal the usual once it has repeated", () => {
    const usual = usualMeal(
      [dinner("a", "2026-09-04"), dinner("b", "2026-09-05")],
      "dinner",
      "2026-09-06"
    );
    expect(USUAL_MIN_LOGS).toBe(2);
    expect(usualMealHeading(usual!, "dinner")).toBe("Your usual at dinner");
  });

  it("with every candidate logged once, offers the most recent as the last time", () => {
    const usual = usualMeal(
      [dinner("a", "2026-09-04", "Pasta"), dinner("b", "2026-09-05")],
      "dinner",
      "2026-09-06"
    );
    expect(usual?.name).toBe("Chicken and rice");
    expect(usualMealHeading(usual!, "dinner")).toBe("Last time at dinner");
  });

  it("phrases every slot as English", () => {
    const usual = usualMeal(
      [dinner("a", "2026-09-04"), dinner("b", "2026-09-05")],
      "dinner",
      "2026-09-06"
    )!;
    expect(usualMealHeading(usual, "breakfast")).toBe(
      "Your usual at breakfast"
    );
    expect(usualMealHeading(usual, "lunch")).toBe("Your usual at lunch");
    expect(usualMealHeading(usual, "snacks")).toBe("Your usual at snack time");
  });

  it("shows a single food's portion, and none for a multi-food meal", () => {
    const single = usualMeal(
      [oats("a", "2026-09-05", "80 g")],
      "breakfast",
      "2026-09-06"
    )!;
    expect(usualMealPortion(single)).toBe("80 g");

    const plate = oats("b", "2026-09-05");
    plate.items.push({
      ...plate.items[0],
      name: "Berries",
      portionSize: "100 g",
    });
    const bundle = usualMeal([plate], "breakfast", "2026-09-06")!;
    // The Change-portion sheet still multiplies "1 meal"; the row drops it.
    expect(bundle.portionSize).toBe("1 meal");
    expect(usualMealPortion(bundle)).toBeNull();
  });
});

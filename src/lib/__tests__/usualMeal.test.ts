import { describe, expect, it } from "vitest";
import {
  usualMeal,
  usualMealHeading,
  usualMealPortion,
  USUAL_MIN_DAYS,
  USUAL_MIN_SHARE,
  USUAL_WINDOW_DAYS,
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
const breakfast = (id: string, date: string, foodName: string): Meal => ({
  ...oats(id, date),
  foodName,
  items: [{ ...oats(id, date).items[0], name: foodName }],
});
/** Three mornings of oats before 6 Sep: the smallest history that is a usual. */
const threeMornings = () => [
  oats("a", "2026-09-03"),
  oats("b", "2026-09-04"),
  oats("c", "2026-09-05"),
];

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
    const history = threeMornings();
    const today = oats("d", "2026-09-06");
    expect(usualMeal([...history, today], "breakfast", today.date)).toBeNull();
    expect(
      usualMeal(
        [...history, { ...today, deletedAt: true }],
        "breakfast",
        today.date
      )?.name
    ).toBe("Oats");
    expect(usualMeal(history, "lunch", today.date)).toBeNull();
  });
  it("has no synthetic usual for a new account", () => {
    expect(usualMeal([], "breakfast", "2026-09-06")).toBeNull();
  });
  it("preserves every item in a multi-food meal", () => {
    const history = threeMornings().map((meal) => {
      meal.items.push({
        ...meal.items[0],
        name: "Berries",
        portionSize: "100 g",
      });
      return meal;
    });
    expect(
      usualMeal(history, "breakfast", "2026-09-06")?.bundle?.items
    ).toEqual(history[2].items);
  });
});

/* "Your usual" sits above the composer, and on a 390x844 phone it is what
   pushes the composer under the tab bar — so a wrong guess costs the page's
   main input. It used to be made from ONE earlier log. It now needs a habit:
   three days in the last fourteen, and at least half the days that slot was
   logged. */
describe("a usual is a habit, not a repeat", () => {
  it("pins the bar", () => {
    expect(USUAL_WINDOW_DAYS).toBe(14);
    expect(USUAL_MIN_DAYS).toBe(3);
    expect(USUAL_MIN_SHARE).toBe(0.5);
  });

  it("needs three days — two mornings of oats are not a usual yet", () => {
    const [, b, c] = threeMornings();
    expect(usualMeal([b, c], "breakfast", "2026-09-06")).toBeNull();
    expect(usualMeal(threeMornings(), "breakfast", "2026-09-06")?.name).toBe(
      "Oats"
    );
  });

  it("counts days, not entries — a second bowl on the same morning adds nothing", () => {
    const [, b, c] = threeMornings();
    const seconds = oats("b2", "2026-09-04");
    expect(usualMeal([b, seconds, c], "breakfast", "2026-09-06")).toBeNull();
  });

  it("needs at least half of the days the slot was logged", () => {
    const varied = [
      ...threeMornings(),
      breakfast("e1", "2026-08-28", "Eggs"),
      breakfast("e2", "2026-08-29", "Eggs"),
      breakfast("t1", "2026-08-30", "Toast"),
      breakfast("t2", "2026-08-31", "Toast"),
    ];
    // Oats on 3 of 7 breakfast days: the most common, and still not usual.
    expect(usualMeal(varied, "breakfast", "2026-09-06")).toBeNull();
    // 3 of 6 is half — enough.
    expect(usualMeal(varied.slice(0, 6), "breakfast", "2026-09-06")?.name).toBe(
      "Oats"
    );
  });

  it("looks back exactly fourteen days", () => {
    const [, b, c] = threeMornings();
    // 6 Sep minus 14 days is 23 Aug: the first date inside the window.
    expect(
      usualMeal([oats("x", "2026-08-23"), b, c], "breakfast", "2026-09-06")
        ?.name
    ).toBe("Oats");
    expect(
      usualMeal([oats("x", "2026-08-22"), b, c], "breakfast", "2026-09-06")
    ).toBeNull();
  });

  it("follows a change of habit: a tie goes to the more recent meal", () => {
    const switched = [
      breakfast("o1", "2026-08-24", "Oats"),
      breakfast("o2", "2026-08-25", "Oats"),
      breakfast("o3", "2026-08-26", "Oats"),
      breakfast("e1", "2026-09-03", "Eggs"),
      breakfast("e2", "2026-09-04", "Eggs"),
      breakfast("e3", "2026-09-05", "Eggs"),
    ];
    expect(usualMeal(switched, "breakfast", "2026-09-06")?.name).toBe("Eggs");
  });
});

describe("the usual row's copy", () => {
  it("phrases every slot as English", () => {
    expect(usualMealHeading("breakfast")).toBe("Your usual at breakfast");
    expect(usualMealHeading("lunch")).toBe("Your usual at lunch");
    expect(usualMealHeading("dinner")).toBe("Your usual at dinner");
    // Not "at snacks": the slot key is not copy.
    expect(usualMealHeading("snacks")).toBe("Your usual at snack time");
  });

  it("shows a single food's portion, and none for a multi-food meal", () => {
    const [a, b] = threeMornings();
    const single = usualMeal(
      [a, b, oats("c", "2026-09-05", "80 g")],
      "breakfast",
      "2026-09-06"
    )!;
    expect(usualMealPortion(single)).toBe("80 g");

    const plates = threeMornings().map((meal) => {
      meal.items.push({
        ...meal.items[0],
        name: "Berries",
        portionSize: "100 g",
      });
      return meal;
    });
    const bundle = usualMeal(plates, "breakfast", "2026-09-06")!;
    // A "1 meal" filler read like a count beside the kcal. The
    // Change-portion sheet still multiplies it, where it is the unit.
    expect(bundle.portionSize).toBe("1 meal");
    expect(usualMealPortion(bundle)).toBeNull();
  });
});

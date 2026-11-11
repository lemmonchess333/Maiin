import { describe, expect, it } from "vitest";
import { portionLeftText, type DayBudget } from "../portionLeft";
import { group } from "@/test/localeGrouping";

const day = (o: Partial<DayBudget> = {}): DayBudget => ({
  calories: 800,
  protein: 60,
  calorieTarget: 2400,
  proteinTarget: 150,
  ...o,
});

describe("portionLeftText", () => {
  it("says what is left of calories and protein after the portion", () => {
    expect(portionLeftText(day(), { calories: 360, protein: 28 }, "left")).toBe(
      `${group(1240)} kcal and 62g protein left after this`
    );
  });

  it("drops protein once the portion meets it", () => {
    expect(
      portionLeftText(
        day({ protein: 140 }),
        { calories: 300, protein: 20 },
        "left"
      )
    ).toBe(`${group(1300)} kcal left after this`);
  });

  it("says by how much a portion takes the day over", () => {
    expect(
      portionLeftText(
        day({ calories: 2300 }),
        { calories: 220, protein: 10 },
        "left"
      )
    ).toBe("120 kcal over and 80g protein left after this");
    expect(
      portionLeftText(
        day({ calories: 2300, protein: 150 }),
        { calories: 220, protein: 10 },
        "left"
      )
    ).toBe("120 kcal over after this");
  });

  it("counts what is logged in the hero's logged view", () => {
    expect(
      portionLeftText(day(), { calories: 360, protein: 28 }, "eaten")
    ).toBe(`${group(1160)} kcal and 88g protein logged with this`);
  });

  it("says nothing without a calorie target to count against", () => {
    expect(
      portionLeftText(
        day({ calorieTarget: 0 }),
        { calories: 360, protein: 28 },
        "left"
      )
    ).toBeNull();
  });
});

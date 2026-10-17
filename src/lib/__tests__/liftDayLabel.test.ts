import { describe, it, expect } from "vitest";
import { generateProgram } from "@/features/program/programEngine";
import {
  dayFocusLabel,
  generatedDayType,
  liftDayLine,
  liftDayNameIn,
  liftDayTitle,
  liftWeekDayNames,
} from "../liftDayLabel";

/**
 * What a lift day is called on screen (Lift19). The names below come from
 * the generator itself, so a day it starts naming differently fails here
 * rather than showing its stored name on a phone.
 */
const CTX = { bodyweightKg: 80, experience: "beginner" as const };
const GOALS = ["hypertrophy", "strength", "general", "fat_loss"] as const;
const storedWeek = (days: number, goal: (typeof GOALS)[number] = "general") =>
  generateProgram(days, undefined, goal, CTX).workouts.map((w) => w.dayName);

describe("the stored names stay the engine's keys", () => {
  it("the generator still names its days as the plans already saved do", () => {
    /* The engine finds a saved day by this name when it rebuilds a plan
       (`alignExistingTo`), so the screen's names are a lookup on top of
       these, never a rename of them. */
    expect(storedWeek(6)).toEqual([
      "Push — Chest Focus",
      "Pull — Lat Focus",
      "Legs — Squat Focus",
      "Push — Shoulder Focus",
      "Pull — Row Focus",
      "Legs — Deadlift Focus",
    ]);
  });

  it.each(GOALS)(
    "every day the generator names has a name on screen (%s)",
    (goal) => {
      for (const days of [1, 2, 3, 4, 5, 6]) {
        for (const name of storedWeek(days, goal)) {
          expect(generatedDayType(name), name).not.toBeNull();
        }
      }
    }
  );
});

describe("a week's days as the screen names them", () => {
  it.each([
    [1, ["Full Body"]],
    [2, ["Full Body A", "Full Body B"]],
    [3, ["Full Body A", "Full Body B", "Full Body C"]],
    [4, ["Upper A", "Lower A", "Upper B", "Lower B"]],
    [5, ["Push", "Pull", "Legs", "Upper", "Lower"]],
    [6, ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"]],
  ])("%i days a week", (days, names) => {
    expect(liftWeekDayNames(storedWeek(days))).toEqual(names);
  });

  it("letters a type only where the week repeats it", () => {
    // The 5-day week holds each type once, so no day reads "A" with no B.
    for (const name of liftWeekDayNames(storedWeek(5))) {
      expect(name).not.toMatch(/ [A-C]$/);
    }
  });

  it("tells every day of a week apart", () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const names = liftWeekDayNames(storedWeek(days));
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("fits the selector's cells", () => {
    /* A cell is one line at 12px: six across 393px leaves about 61px,
       roughly 9 characters. Full Body only comes in weeks of three days or
       fewer, whose cells are twice as wide. */
    for (const days of [4, 5, 6]) {
      for (const name of liftWeekDayNames(storedWeek(days))) {
        expect(name.length).toBeLessThanOrEqual(9);
      }
    }
    for (const days of [1, 2, 3]) {
      for (const name of liftWeekDayNames(storedWeek(days))) {
        expect(name.length).toBeLessThanOrEqual(11);
      }
    }
  });

  it("keeps a day the person built under its own name", () => {
    expect(
      liftWeekDayNames(["Push — Chest Focus", "Arms — Pump", "Leg Day"])
    ).toEqual(["Push", "Arms · Pump", "Leg Day"]);
  });
});

describe("liftDayNameIn — one day in its week", () => {
  const week = storedWeek(6);

  it("names the day at its place", () => {
    expect(liftDayNameIn(week, 1, "Pull — Lat Focus")).toBe("Pull A");
    expect(liftDayNameIn(week, 4, "Pull — Row Focus")).toBe("Pull B");
  });

  it("names a day the week does not hold there by its type", () => {
    expect(liftDayNameIn(week, 0, "Pull — Row Focus")).toBe("Pull");
    expect(liftDayNameIn([], -1, "Legs — Squat Focus")).toBe("Legs");
  });

  it("leaves a routine's own name as it is", () => {
    expect(liftDayNameIn(["Upper A"], 0, "Upper A")).toBe("Upper A");
  });
});

describe("without the week", () => {
  it("a generated day is its type", () => {
    expect(liftDayLine("Pull — Lat Focus")).toBe("Pull");
    expect(liftDayTitle("Full Body — Squat Focus")).toEqual({
      category: null,
      title: "Full Body",
    });
    expect(dayFocusLabel("Push — Shoulder Focus")).toBe("Push");
  });
});

describe("a day the person named", () => {
  it("splits on a SPACED dash, so a hyphenated category survives", () => {
    expect(dayFocusLabel("Upper-Lower — Squat Focus")).toBe("Squat");
    expect(liftDayTitle("Upper-Lower — Squat Focus")).toEqual({
      category: "Upper-Lower",
      title: "Squat focus",
    });
  });

  it("keeps a name that carries no separator", () => {
    expect(dayFocusLabel("Upper A")).toBe("Upper A");
    expect(dayFocusLabel("  Leg Day  ")).toBe("Leg Day");
    expect(liftDayTitle("Upper A")).toEqual({
      category: null,
      title: "Upper A",
    });
    expect(liftDayLine("Upper-Lower day")).toBe("Upper-Lower day");
  });

  it("keeps the whole name rather than returning nothing", () => {
    expect(dayFocusLabel("Push — Focus")).toBe("Push — Focus");
    expect(dayFocusLabel("")).toBe("");
    expect(liftDayTitle("Push — ")).toEqual({
      category: null,
      title: "Push —",
    });
    expect(liftDayTitle("")).toEqual({ category: null, title: "" });
  });

  it("divides at the first separator and keeps the rest as typed", () => {
    expect(liftDayTitle("Push — Pull — Legs")).toEqual({
      category: "Push",
      title: "Pull — Legs",
    });
    expect(liftDayLine("Mon - Upper - Heavy")).toBe("Mon · Upper - Heavy");
  });
});

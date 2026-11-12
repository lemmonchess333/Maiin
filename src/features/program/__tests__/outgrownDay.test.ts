import { describe, expect, it } from "vitest";
import { hasOutgrown, OUTGROWN_SHARE, outgrownDayKey } from "../outgrownDay";

describe("hasOutgrown", () => {
  it("says so only past a quarter over the length", () => {
    expect(OUTGROWN_SHARE).toBe(1.25);
    expect(hasOutgrown(56, 45)).toBe(false);
    expect(hasOutgrown(57, 45)).toBe(true);
    expect(hasOutgrown(95, 45)).toBe(true);
    expect(hasOutgrown(75, 60)).toBe(false);
  });

  it("never for a plan fitted to no length", () => {
    expect(hasOutgrown(200, undefined)).toBe(false);
    expect(hasOutgrown(200, null)).toBe(false);
    expect(hasOutgrown(200, 0)).toBe(false);
    expect(hasOutgrown(200, Number.NaN)).toBe(false);
  });
});

describe("outgrownDayKey", () => {
  const day = {
    dayName: "Pull A",
    exercises: [
      { instanceId: "a", exerciseId: "deadlift" },
      { exerciseId: "barbell-row" },
    ],
  };

  it("is the length, the name and the lifts in order", () => {
    expect(outgrownDayKey(day, 45)).toBe("45|Pull A|a,barbell-row");
  });

  it("changes when the day or the length does", () => {
    const kept = outgrownDayKey(day, 45);
    expect(outgrownDayKey(day, 60)).not.toBe(kept);
    expect(
      outgrownDayKey(
        { ...day, exercises: [...day.exercises, { exerciseId: "db-curl" }] },
        45
      )
    ).not.toBe(kept);
    expect(
      outgrownDayKey({ ...day, exercises: [...day.exercises].reverse() }, 45)
    ).not.toBe(kept);
  });
});

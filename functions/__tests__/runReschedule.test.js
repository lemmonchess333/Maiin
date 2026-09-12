import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { dateForDay, computeRunMove } = require("../lib/runReschedule");

describe("run moves during the Monday-week migration", () => {
  it.each([
    ["2026-09-06", ["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"]],
    ["2026-09-07", ["2026-09-13", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"]],
  ])("maps every weekday in the week beginning %s", (weekKey, dates) => {
    for (let day = 0; day < 7; day++) {
      expect(dateForDay(weekKey, day)).toBe(dates[day]);
    }
  });

  it("moves a Monday-week run to Sunday and back without moving its origin", () => {
    const source = {
      id: "run-to-keep", weekKey: "2026-09-07", date: "2026-09-08",
      dayIndex: 2, templateId: "easy_30", type: "easy", status: "planned",
    };
    const moved = computeRunMove(source, 0, []);
    expect(moved).toEqual({
      date: "2026-09-13", dayIndex: 0, movedFromDate: "2026-09-08",
      movedToDate: "2026-09-13", clashesWithLift: false,
    });
    expect(computeRunMove({ ...source, ...moved }, 2, [])).toEqual({
      date: "2026-09-08", dayIndex: 2, movedFromDate: undefined,
      movedToDate: undefined, clashesWithLift: false,
    });
    expect(source.date).toBe("2026-09-08");
  });
});

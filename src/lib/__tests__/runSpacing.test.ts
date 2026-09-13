import { describe, expect, it } from "vitest";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import { adjacentDemandingRuns, isDemandingScheduledRun } from "../runSpacing";
import { resolveRunMoveOptions } from "../runReschedule";

const run = (
  id: string,
  date: string,
  dayIndex: number,
  extra: Partial<ScheduledRunDay> = {}
): ScheduledRunDay => ({
  id,
  date,
  dayIndex,
  weekKey: "2026-09-07",
  type: "tempo",
  templateId: "tempo_20",
  status: "planned",
  ...extra,
});
const schedule = Array.from({ length: 7 }, (_, day) => ({
  day,
  type: "run" as const,
}));

describe("calendar-date run spacing", () => {
  it("Saturday is beside Sunday, while Monday six days earlier is not", () => {
    const sunday = run("sunday", "2026-09-13", 0);
    const saturday = run("saturday", "2026-09-12", 6);
    const monday = run("monday", "2026-09-07", 1);
    expect(
      adjacentDemandingRuns(sunday, [monday, saturday, sunday]).map((r) => r.id)
    ).toEqual(["saturday"]);
  });
  it("keeps the previous Sunday as context for the following Monday", () => {
    const monday = run("monday", "2026-09-14", 1, { weekKey: "2026-09-14" });
    expect(
      adjacentDemandingRuns(monday, [run("sunday", "2026-09-13", 0)]).map(
        (r) => r.date
      )
    ).toEqual(["2026-09-13"]);
  });
  it("ignores skipped sessions and an explicit easier template", () => {
    const source = run("a", "2026-09-12", 6);
    expect(
      adjacentDemandingRuns(source, [
        run("b", "2026-09-13", 0, { status: "skipped" }),
      ])
    ).toEqual([]);
    expect(
      adjacentDemandingRuns(source, [
        run("b", "2026-09-13", 0, { userOverride: "easy_30" }),
      ])
    ).toEqual([]);
    expect(
      adjacentDemandingRuns({ ...source, userOverride: "easy_30" }, [
        run("b", "2026-09-13", 0),
      ])
    ).toEqual([]);
    expect(
      isDemandingScheduledRun(
        run("race", "2026-09-13", 0, { type: "race", userOverride: "easy_30" })
      )
    ).toBe(true);
  });
  it("move choices flag the actual neighbouring date and ignore another week's occupancy", () => {
    const source = run("source", "2026-09-09", 3);
    const options = resolveRunMoveOptions({
      source,
      runDays: [
        source,
        run("sunday", "2026-09-13", 0),
        run("old-saturday", "2026-09-05", 6, { weekKey: "2026-08-31" }),
      ],
      weekSchedule: schedule,
      todayKey: "2026-09-07",
    });
    expect(options.find((o) => o.dayIndex === 6)).toMatchObject({
      available: true,
      date: "2026-09-12",
      warning: "beside_hard",
    });
    expect(options.find((o) => o.dayIndex === 1)?.warning).toBeUndefined();
  });
  it("uses calendar days across a daylight-saving boundary", () => {
    const source = run("monday", "2026-10-26", 1, { weekKey: "2026-10-26" });
    expect(
      adjacentDemandingRuns(source, [run("sunday", "2026-10-25", 0)]).map(
        (r) => r.date
      )
    ).toEqual(["2026-10-25"]);
  });
});

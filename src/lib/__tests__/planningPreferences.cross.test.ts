import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  isRunningBaseline,
  type RunningBaseline,
} from "@/features/program/runningBaseline";
import { isLiftTimeBudget } from "@/features/program/liftTimeBudget";
import { isNonRaceGoal } from "../nonRaceGoal";
const require = createRequire(import.meta.url);
const { sanitizeProfileData } =
  require("../../../functions/profileSanitizer.js") as {
    sanitizeProfileData: (
      input: Record<string, unknown>
    ) => Record<string, unknown>;
  };
const baseline: RunningBaseline = {
  version: 1,
  experience: "regular",
  weeklyMinutes: 180,
  longestRunMinutes: 60,
  confirmedAt: "2026-09-13",
  source: "recorded",
};

describe("planning preference sanitation at the deployed boundary", () => {
  it("retains all three preferences and explicit clears", () => {
    const input = {
      runningBaseline: baseline,
      liftTimeBudgetMinutes: 45,
      nonRaceGoal: { kind: "runs", target: 3 },
    };
    expect(sanitizeProfileData(input)).toEqual(input);
    expect(
      sanitizeProfileData({
        runningBaseline: null,
        liftTimeBudgetMinutes: null,
        nonRaceGoal: null,
      })
    ).toEqual({
      runningBaseline: null,
      liftTimeBudgetMinutes: null,
      nonRaceGoal: null,
    });
    expect(
      sanitizeProfileData({
        runningBaseline: { ...baseline, privateExtra: "omit" },
      }).runningBaseline
    ).toEqual(baseline);
  });
  it("pins client and server report validation, including contradictory and malformed evidence", () => {
    const values: unknown[] = [
      undefined,
      {},
      [],
      baseline,
      { ...baseline, version: 2 },
      { ...baseline, experience: "expert" },
      { ...baseline, source: "inferred" },
    ];
    for (const key of ["weeklyMinutes", "longestRunMinutes"]) {
      for (const value of [
        -1,
        0,
        9,
        10,
        30,
        60,
        180,
        300,
        301,
        1200,
        1201,
        NaN,
        Infinity,
        1.5,
        "90",
        null,
      ])
        values.push({ ...baseline, [key]: value });
    }
    for (const confirmedAt of [
      "2026-02-30",
      "0000-01-01",
      "0099-01-01",
      "0100-01-01",
      "0999-01-01",
      "1000-01-01",
      "2024-02-29",
      "2026-02-29",
      "2026-13-01",
      "bad",
      "",
    ])
      values.push({ ...baseline, confirmedAt });
    for (const value of values)
      expect(
        sanitizeProfileData({ runningBaseline: value }).runningBaseline !==
          undefined
      ).toBe(isRunningBaseline(value));
  });
  it("pins time budgets and weekly goals", () => {
    for (const value of [
      undefined,
      29,
      30,
      45,
      120,
      121,
      NaN,
      Infinity,
      "45",
      30.5,
    ])
      expect(
        sanitizeProfileData({ liftTimeBudgetMinutes: value })
          .liftTimeBudgetMinutes !== undefined
      ).toBe(isLiftTimeBudget(value));
    for (const kind of ["runs", "minutes", "race"]) {
      for (const target of [
        -1,
        0,
        1,
        7,
        8,
        9,
        10,
        1200,
        1201,
        NaN,
        Infinity,
        1.5,
      ]) {
        const value = { kind, target };
        expect(
          sanitizeProfileData({ nonRaceGoal: value }).nonRaceGoal !== undefined
        ).toBe(isNonRaceGoal(value));
      }
    }
  });
});

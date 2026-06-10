/**
 * functions/lib/challengeDefs.js — server-owned rolling challenge definitions.
 *
 * Pins the rollover behaviour the scheduled rolloverChallenges function relies
 * on: deterministic, UTC-anchored, time-windowed IDs that change at the week /
 * month / season boundary. (A static seed-once would expire within a period —
 * the bug this whole change exists to avoid.)
 */
import { describe, it, expect } from "vitest";
import { buildCurrentChallenges } from "../lib/challengeDefs";

// 2026-06-01 is a Monday (UTC); June is in the Summer season window.
const MON_JUN_1 = new Date(Date.UTC(2026, 5, 1, 12, 0, 0));

describe("buildCurrentChallenges", () => {
  it("returns the six canonical challenges with prefixed, dated IDs", () => {
    const defs = buildCurrentChallenges(MON_JUN_1);
    const ids = defs.map((d) => d.id).sort();
    expect(ids).toEqual([
      "fastest-5k-2026-06-01",
      "global-monthly-2026-06-01", // SOCIAL S4 global hybrid challenge
      "group-goal-2026-06-01",
      "monthly-2026-06-01",
      "seasonal-2026-06-01",
      "weekly-2026-06-01",
    ]);
  });

  it("global monthly challenge is a hybrid_score, monthly-windowed challenge", () => {
    const defs = buildCurrentChallenges(MON_JUN_1);
    const global = defs.find((d) => d.id.startsWith("global-monthly-"));
    expect(global).toBeTruthy();
    expect(global.metric).toBe("hybrid_score");
    expect(global.type).toBe("monthly");
    expect(global.name).toBe("June Hybrid Hero");
    // Monthly window: June 1 → July 1.
    expect(global.id).toBe("global-monthly-2026-06-01");
    expect(global.endDate.getTime()).toBeGreaterThan(
      global.startDate.getTime()
    );
    // Tiers are ascending non-negative numbers (the progress-bar target).
    expect(global.tiers.bronze).toBeLessThan(global.tiers.silver);
    expect(global.tiers.silver).toBeLessThan(global.tiers.gold);
  });

  it("rolls the global monthly hybrid ID at the month boundary", () => {
    const jul = buildCurrentChallenges(new Date(Date.UTC(2026, 6, 15, 12)));
    expect(jul.find((d) => d.id.startsWith("global-monthly-")).id).toBe(
      "global-monthly-2026-07-01"
    );
  });

  it("anchors the weekly window to the Monday on or before `now`", () => {
    // Thursday 2026-06-04 → same week, Monday start 2026-06-01.
    const thu = buildCurrentChallenges(new Date(Date.UTC(2026, 5, 4, 9)));
    expect(thu.find((d) => d.id.startsWith("weekly-")).id).toBe(
      "weekly-2026-06-01"
    );
    // Sunday 2026-06-07 → still maps back to Monday 2026-06-01 (day===0 branch).
    const sun = buildCurrentChallenges(new Date(Date.UTC(2026, 5, 7, 23)));
    expect(sun.find((d) => d.id.startsWith("weekly-")).id).toBe(
      "weekly-2026-06-01"
    );
  });

  it("rolls the weekly ID at the week boundary but not the monthly ID", () => {
    const wk1 = buildCurrentChallenges(MON_JUN_1);
    const wk2 = buildCurrentChallenges(new Date(Date.UTC(2026, 5, 8, 12))); // next Mon
    const weekly1 = wk1.find((d) => d.id.startsWith("weekly-")).id;
    const weekly2 = wk2.find((d) => d.id.startsWith("weekly-")).id;
    const monthly1 = wk1.find((d) => d.id.startsWith("monthly-")).id;
    const monthly2 = wk2.find((d) => d.id.startsWith("monthly-")).id;
    expect(weekly1).toBe("weekly-2026-06-01");
    expect(weekly2).toBe("weekly-2026-06-08");
    expect(monthly1).toBe(monthly2); // both 2026-06-01
  });

  it("rolls the monthly IDs at the month boundary", () => {
    const jul = buildCurrentChallenges(new Date(Date.UTC(2026, 6, 15, 12)));
    expect(jul.find((d) => d.id.startsWith("monthly-")).id).toBe(
      "monthly-2026-07-01"
    );
    expect(jul.find((d) => d.id.startsWith("fastest-5k-")).id).toBe(
      "fastest-5k-2026-07-01"
    );
    expect(jul.find((d) => d.id.startsWith("group-goal-")).id).toBe(
      "group-goal-2026-07-01"
    );
  });

  it("selects the season by UTC month", () => {
    const seasonName = (now) =>
      buildCurrentChallenges(now).find((d) => d.id.startsWith("seasonal-"))
        .name;
    expect(seasonName(new Date(Date.UTC(2026, 0, 15)))).toBe("Winter Bulk"); // Jan
    expect(seasonName(new Date(Date.UTC(2026, 3, 15)))).toBe("Spring Reset"); // Apr
    expect(seasonName(new Date(Date.UTC(2026, 6, 15)))).toBe("Summer Shred"); // Jul
    expect(seasonName(new Date(Date.UTC(2026, 9, 15)))).toBe("Autumn Push"); // Oct
  });

  it("keeps the weekly window exactly 7 days and endDate after startDate", () => {
    const defs = buildCurrentChallenges(MON_JUN_1);
    const weekly = defs.find((d) => d.id.startsWith("weekly-"));
    expect(weekly.endDate.getTime() - weekly.startDate.getTime()).toBe(
      7 * 86400000
    );
    for (const d of defs) {
      expect(d.endDate.getTime()).toBeGreaterThan(d.startDate.getTime());
    }
  });

  it("carries the metric-specific fields the UI/sync depend on", () => {
    const defs = buildCurrentChallenges(MON_JUN_1);
    const fastest = defs.find((d) => d.id.startsWith("fastest-5k-"));
    const group = defs.find((d) => d.id.startsWith("group-goal-"));
    expect(fastest.metric).toBe("fastest_effort");
    expect(fastest.targetDistance).toBe(5000);
    expect(group.collectiveTarget).toBe(1000);
  });

  it("is deterministic — no hidden clock dependency", () => {
    const a = buildCurrentChallenges(MON_JUN_1);
    const b = buildCurrentChallenges(MON_JUN_1);
    expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id));
  });
});

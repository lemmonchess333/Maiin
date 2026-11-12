/**
 * A person's own week, counted as the challenges count (lib/weekTally.js).
 * The league reads it. It was the friends board's tally until the board
 * went on 12 November 2026 (Trim1 call 3(a)); the cases for the board's
 * stored copy and its callable went with them.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const board = require("../lib/weekTally");

// Wednesday 21 October 2026, 12:00 UTC.
const NOW = Date.UTC(2026, 9, 21, 12);

const lift = (date, extra = {}) => ({
  date,
  exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 100 }] }],
  totalVolume: 500,
  ...extra,
});
const run = (date, extra = {}) => ({
  date,
  distance: 5000,
  duration: 1500,
  ...extra,
});

describe("the week", () => {
  it("starts on the Monday of a day", () => {
    expect(board.weekKeyOf("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(board.weekKeyOf("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(board.weekKeyOf("2026-10-26")).toBe("2026-10-26");
  });

  it("is the person's own: Monday morning in Auckland is still Sunday in UTC", () => {
    // Sunday 25 Oct 2026, 20:00 UTC = Monday 26 Oct, 09:00 in Auckland.
    const now = Date.UTC(2026, 9, 25, 20);
    expect(board.currentWeek("Pacific/Auckland", now).weekKey).toBe(
      "2026-10-26"
    );
    expect(board.currentWeek(null, now).weekKey).toBe("2026-10-19");
  });

  it("ends at midnight where they are, across a clock change", () => {
    // London's clocks go back on Sunday 25 October 2026, so the week
    // ending Monday 26 October ends at 00:00 GMT, not BST.
    const { weekEndsAt } = board.currentWeek("Europe/London", NOW);
    expect(weekEndsAt.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    const ny = board.currentWeek("America/New_York", NOW).weekEndsAt;
    expect(ny.toISOString()).toBe("2026-10-26T04:00:00.000Z");
  });

  it("falls back to UTC for a timezone Intl does not know", () => {
    expect(board.localMidnightMs("2026-10-26", "Not/AZone")).toBe(
      Date.UTC(2026, 9, 26)
    );
  });
});

describe("tallyWeek", () => {
  it("counts every saved workout and every run the challenges would credit", () => {
    const tally = board.tallyWeek(
      [lift("2026-10-19"), lift("2026-10-20", { totalVolume: undefined })],
      [
        run("2026-10-19"),
        run("2026-10-20", { savedAnyway: true }), // not eligible
        run("2026-10-21", { distance: 30, duration: 20 }), // under the floor
        run("2026-10-21", { distance: 600000, duration: 3600 }), // implausible
      ]
    );
    expect(tally).toEqual({
      sessions: 3,
      lifts: 2,
      runs: 1,
      distanceM: 5000,
      volumeKg: 1000,
    });
  });

  it("a short session counts, as it does in the challenges", () => {
    const tally = board.tallyWeek(
      [lift("2026-10-19", { durationMinutes: 2 })],
      [run("2026-10-19", { distance: 50, duration: 30 })]
    );
    expect(tally.sessions).toBe(2);
  });
});

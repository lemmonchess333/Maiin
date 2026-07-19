import { describe, it, expect } from "vitest";
import {
  canRescheduleRun,
  runOriginDate,
  resolveRunMoveOptions,
  computeRunMove,
} from "../runReschedule";
import type { ScheduledRunDay } from "@/features/program/programTypes";

// Week of Sun 2026-05-17 → Sat 2026-05-23.
const WEEK = "2026-05-17";
function dateFor(dayIndex: number): string {
  const d = new Date(2026, 4, 17 + dayIndex);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function run(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  const dayIndex = overrides.dayIndex ?? 2;
  return {
    id: overrides.id ?? `runday_${dayIndex}`,
    dayIndex,
    date: dateFor(dayIndex),
    weekKey: WEEK,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    ...overrides,
  } as ScheduledRunDay;
}

const ALL_REST = Array.from({ length: 7 }, (_, day) => ({
  day,
  type: "rest" as const,
}));

describe("canRescheduleRun", () => {
  it("allows a planned non-race run", () => {
    expect(canRescheduleRun(run())).toBe(true);
  });
  it("refuses a race slot", () => {
    expect(canRescheduleRun(run({ type: "race", templateId: "5k_race" }))).toBe(
      false
    );
  });
  it("refuses terminal slots (skipped / completed)", () => {
    expect(canRescheduleRun(run({ status: "skipped" }))).toBe(false);
    expect(
      canRescheduleRun(run({ status: "completed_exact", completed: true }))
    ).toBe(false);
  });
});

describe("runOriginDate", () => {
  it("is the current date before any move", () => {
    expect(runOriginDate(run({ dayIndex: 2 }))).toBe(dateFor(2));
  });
  it("is movedFromDate once moved", () => {
    expect(runOriginDate(run({ dayIndex: 4, movedFromDate: dateFor(2) }))).toBe(
      dateFor(2)
    );
  });
});

describe("resolveRunMoveOptions — blocks", () => {
  // Anchor "today" to the run's own day so past days are Sun/Mon.
  const todayKey = dateFor(2); // Tue

  it("blocks the run's own day (same) and past days", () => {
    const opts = resolveRunMoveOptions({
      source: run({ dayIndex: 2 }),
      runDays: [run({ dayIndex: 2 })],
      weekSchedule: ALL_REST,
      todayKey,
    });
    expect(opts[2]).toMatchObject({ available: false, blockReason: "same" });
    expect(opts[0]).toMatchObject({ available: false, blockReason: "past" });
    expect(opts[1]).toMatchObject({ available: false, blockReason: "past" });
    // Future days are open.
    expect(opts[4].available).toBe(true);
  });

  it("blocks a day occupied by another run", () => {
    const source = run({ id: "s", dayIndex: 2 });
    const other = run({ id: "o", dayIndex: 4 });
    const opts = resolveRunMoveOptions({
      source,
      runDays: [source, other],
      weekSchedule: ALL_REST,
      todayKey,
    });
    expect(opts[4]).toMatchObject({
      available: false,
      blockReason: "occupied",
    });
  });

  it("blocks a day holding a race, and every day after the race (post_race)", () => {
    const source = run({ id: "s", dayIndex: 2 });
    const race = run({
      id: "r",
      dayIndex: 5,
      type: "race",
      templateId: "10k_race",
    });
    const opts = resolveRunMoveOptions({
      source,
      runDays: [source, race],
      weekSchedule: ALL_REST,
      todayKey,
    });
    expect(opts[5]).toMatchObject({ available: false, blockReason: "race" });
    expect(opts[6]).toMatchObject({
      available: false,
      blockReason: "post_race",
    });
    // A day before the race is still open.
    expect(opts[3].available).toBe(true);
  });

  it("marks every day malformed when the run has no weekKey", () => {
    const opts = resolveRunMoveOptions({
      source: run({ weekKey: undefined }),
      runDays: [],
      weekSchedule: ALL_REST,
      todayKey,
    });
    expect(opts.every((o) => o.blockReason === "malformed")).toBe(true);
  });
});

describe("resolveRunMoveOptions — warnings", () => {
  const todayKey = dateFor(0);

  it("warns clashes_lift when a HARD run targets a lift day", () => {
    const source = run({ id: "s", dayIndex: 2, type: "tempo" });
    const schedule = ALL_REST.map((d) =>
      d.day === 4 ? { day: 4, type: "lift" as const } : d
    );
    const opts = resolveRunMoveOptions({
      source,
      runDays: [source],
      weekSchedule: schedule,
      todayKey,
    });
    expect(opts[4]).toMatchObject({ available: true, warning: "clashes_lift" });
  });

  it("warns beside_hard when a HARD run lands next to another hard run", () => {
    const source = run({ id: "s", dayIndex: 1, type: "long" });
    const otherHard = run({ id: "o", dayIndex: 5, type: "tempo" });
    const opts = resolveRunMoveOptions({
      source,
      runDays: [source, otherHard],
      weekSchedule: ALL_REST,
      todayKey,
    });
    // Day 4 is adjacent to the hard run on day 5.
    expect(opts[4]).toMatchObject({ available: true, warning: "beside_hard" });
    // Day 3 is not adjacent to any hard run.
    expect(opts[3]).toMatchObject({ available: true });
    expect(opts[3].warning).toBeUndefined();
  });

  it("an EASY run carries no warnings", () => {
    const source = run({ id: "s", dayIndex: 1, type: "easy" });
    const schedule = ALL_REST.map((d) =>
      d.day === 4 ? { day: 4, type: "lift" as const } : d
    );
    const opts = resolveRunMoveOptions({
      source,
      runDays: [source],
      weekSchedule: schedule,
      todayKey,
    });
    expect(opts[4].warning).toBeUndefined();
  });
});

describe("computeRunMove", () => {
  it("moves date + dayIndex and records the origin as movedFromDate", () => {
    const patch = computeRunMove(run({ dayIndex: 2 }), 4, ALL_REST);
    expect(patch).toMatchObject({
      date: dateFor(4),
      dayIndex: 4,
      movedFromDate: dateFor(2),
      movedToDate: dateFor(4),
      clashesWithLift: false,
    });
  });

  it("preserves the ORIGINAL origin across a second move", () => {
    const moved = run({ dayIndex: 4, movedFromDate: dateFor(2) });
    const patch = computeRunMove(moved, 5, ALL_REST);
    expect(patch?.movedFromDate).toBe(dateFor(2)); // not dateFor(4)
    expect(patch?.movedToDate).toBe(dateFor(5));
  });

  it("clears the move markers when snapping back to origin", () => {
    const moved = run({
      dayIndex: 4,
      date: dateFor(4),
      movedFromDate: dateFor(2),
    });
    const patch = computeRunMove(moved, 2, ALL_REST);
    expect(patch?.date).toBe(dateFor(2));
    expect(patch?.dayIndex).toBe(2);
    expect(patch?.movedFromDate).toBeUndefined();
    expect(patch?.movedToDate).toBeUndefined();
  });

  it("recomputes clashesWithLift for a HARD run onto a lift/both day", () => {
    const schedule = ALL_REST.map((d) =>
      d.day === 4 ? { day: 4, type: "both" as const } : d
    );
    expect(
      computeRunMove(run({ type: "tempo" }), 4, schedule)?.clashesWithLift
    ).toBe(true);
    // Easy run never clashes.
    expect(
      computeRunMove(run({ type: "easy" }), 4, schedule)?.clashesWithLift
    ).toBe(false);
  });

  it("returns null when the run has no weekKey", () => {
    expect(computeRunMove(run({ weekKey: undefined }), 4, ALL_REST)).toBeNull();
  });
});

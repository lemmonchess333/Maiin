import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { computeRunMove, runOriginDate } from "@/lib/runReschedule";
import { HARD_RUN_TYPES } from "../programTypes";
import type { ScheduledRunDay } from "../programTypes";

/**
 * Parity guard (RUN-RESCHEDULE-01 / P6): the one-off run move is now
 * double-sited — `src/lib/runReschedule.ts` computes it optimistically on the
 * client, and `functions/lib/runReschedule.js` recomputes it inside the
 * command transaction, which is the copy that decides what gets stored.
 *
 * The failure mode if they drift is quiet: the client paints the run on one
 * day, the server writes another, and the next read snaps it somewhere the
 * user did not put it. Nothing throws.
 *
 * The timezone claim is PROVED here rather than asserted. Both copies do whole
 * day arithmetic on plain YYYY-MM-DD strings — the client parses local, the
 * server parses UTC — so every day of the week is walked, not just one.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/runReschedule") as {
  HARD_RUN_TYPES: readonly string[];
  computeRunMove: (
    source: unknown,
    targetDayIndex: number,
    weekSchedule: unknown
  ) => Record<string, unknown> | null;
  runOriginDate: (source: unknown) => string;
  dateForDay: (weekKey: string, dayIndex: number) => string | null;
};

const WEEK_KEY = "2026-03-01"; // a Sunday

function run(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: "run-1",
    dayIndex: 2,
    date: "2026-03-03",
    weekKey: WEEK_KEY,
    templateId: "tempo_20",
    type: "tempo",
    status: "planned",
    completed: false,
    ...overrides,
  } as ScheduledRunDay;
}

const SCHEDULE = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "both" },
  { day: 4, type: "rest" },
  { day: 5, type: "lift" },
  { day: 6, type: "run" },
];

describe("run move — client vs functions mirror", () => {
  it("HARD_RUN_TYPES agrees as a set", () => {
    expect(new Set(cf.HARD_RUN_TYPES)).toEqual(new Set(HARD_RUN_TYPES));
  });

  it("agrees on every target day of the week", () => {
    for (let day = 0; day <= 6; day++) {
      expect(
        cf.computeRunMove(run(), day, SCHEDULE),
        `target day ${day}`
      ).toEqual(
        computeRunMove(run(), day, SCHEDULE as never) as unknown as Record<
          string,
          unknown
        >
      );
    }
  });

  it("agrees on the snap-back-to-origin case (markers DROPPED)", () => {
    // A run already moved away from Tuesday, moved back to Tuesday.
    const moved = run({
      dayIndex: 5,
      date: "2026-03-06",
      movedFromDate: "2026-03-03",
      movedToDate: "2026-03-06",
    });
    const server = cf.computeRunMove(moved, 2, SCHEDULE);
    const client = computeRunMove(moved, 2, SCHEDULE as never);
    expect(server).toEqual(client as unknown as Record<string, unknown>);
    // The property that matters: no markers, so the caller deletes them.
    expect(server?.movedFromDate).toBeUndefined();
    expect(server?.movedToDate).toBeUndefined();
  });

  it("agrees on the clash flag for every run type", () => {
    for (const type of ["long", "tempo", "intervals", "easy", "recovery"]) {
      for (const day of [1, 2, 3]) {
        const src = run({ type: type as ScheduledRunDay["type"] });
        expect(
          cf.computeRunMove(src, day, SCHEDULE)?.clashesWithLift,
          `${type} → day ${day}`
        ).toBe(computeRunMove(src, day, SCHEDULE as never)?.clashesWithLift);
      }
    }
  });

  it("agrees when the week schedule is empty or missing the day", () => {
    expect(cf.computeRunMove(run(), 4, [])).toEqual(
      computeRunMove(run(), 4, []) as unknown as Record<string, unknown>
    );
  });

  it("agrees that a run with no week anchor cannot move", () => {
    const anchorless = run({ weekKey: undefined });
    expect(cf.computeRunMove(anchorless, 3, SCHEDULE)).toBeNull();
    expect(computeRunMove(anchorless, 3, SCHEDULE as never)).toBeNull();
  });

  it("runOriginDate agrees", () => {
    expect(cf.runOriginDate(run())).toBe(runOriginDate(run()));
    const moved = run({ movedFromDate: "2026-03-02" });
    expect(cf.runOriginDate(moved)).toBe(runOriginDate(moved));
  });

  it("the server rejects an out-of-week day index", () => {
    // Client-side this is unreachable (the UI offers 0-6), but the command
    // validator bounds it and the mirror must not invent a date beyond the
    // week if that bound ever moves.
    expect(cf.dateForDay(WEEK_KEY, 7)).toBeNull();
    expect(cf.dateForDay(WEEK_KEY, -1)).toBeNull();
  });
});

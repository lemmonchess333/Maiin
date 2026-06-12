/**
 * Property guard for generateSchedule — the weekly lift/run layout that drives
 * the program engine AND the nutrition day-type loop. The realization contract:
 * for any feasible (liftDays, runDays) the produced 7-day schedule must EXPOSE
 * exactly that many lift days and run days (a combined "both" day counts for
 * one of each), never silently truncating a session (the P0-B bug). The
 * realistic input range is small, so this verifies it EXHAUSTIVELY rather than
 * by sampling.
 */
import { describe, it, expect } from "vitest";
import { generateSchedule, type ScheduleDay } from "../scheduleUtils";

function counts(schedule: ScheduleDay[]) {
  const c = { lift: 0, run: 0, both: 0, rest: 0 };
  for (const d of schedule) c[d.type] += 1;
  return c;
}

describe("generateSchedule realization (exhaustive)", () => {
  it("always returns 7 days indexed 0..6 across every combo", () => {
    for (let lift = 0; lift <= 12; lift++) {
      for (let run = 0; run <= 12; run++) {
        const s = generateSchedule(lift, run);
        expect(s).toHaveLength(7);
        expect(s.map((d) => d.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      }
    }
  });

  it("exposes EXACTLY the requested lift + run days for every feasible combo (≤7 each)", () => {
    for (let lift = 0; lift <= 7; lift++) {
      for (let run = 0; run <= 7; run++) {
        const c = counts(generateSchedule(lift, run));
        // A "both" day is one lift exposure AND one run exposure.
        expect(c.lift + c.both, `lift exposure for (${lift},${run})`).toBe(
          lift
        );
        expect(c.run + c.both, `run exposure for (${lift},${run})`).toBe(run);
      }
    }
  });

  it("never schedules more than 7 active days, and never exceeds the request", () => {
    for (let lift = 0; lift <= 12; lift++) {
      for (let run = 0; run <= 12; run++) {
        const c = counts(generateSchedule(lift, run));
        const activeDays = c.lift + c.run + c.both;
        expect(activeDays).toBeLessThanOrEqual(7);
        // Capping (degenerate inputs) may reduce exposure, but it can never
        // INVENT a session the user didn't ask for.
        expect(c.lift + c.both).toBeLessThanOrEqual(lift);
        expect(c.run + c.both).toBeLessThanOrEqual(run);
      }
    }
  });

  it("zero active days ⇒ all rest", () => {
    expect(counts(generateSchedule(0, 0))).toEqual({
      lift: 0,
      run: 0,
      both: 0,
      rest: 7,
    });
  });
});

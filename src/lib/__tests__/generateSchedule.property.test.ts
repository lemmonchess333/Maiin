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

/* ─── Separate days, and why this is a training property not a layout one ──
   Wilson's meta-analysis (Schoenfeld p.164) measures concurrent training's
   interference against SEPARATION: same-day lift+run gives ES 0.8, separate
   days 1.05. §3.4 of the v8 evaluation makes "prefer separate days" one of
   four sub-rules, and it is the one Tropos already gets right — the builder
   only ever emits a "both" day when the week genuinely cannot fit.

   That behaviour was UNDEFENDED. The existing exposure tests assert
   `both >= 1` on the overflow cases, which a schedule that doubled up EVERY
   day would also satisfy — and doubling up every day is precisely the
   interference case Wilson quantifies. So the assertions that exist could not
   tell the correct schedule from the worst one.

   Verified before pinning: 0 violations across all 64 combinations. ── */
describe("generateSchedule prefers separate days (Wilson, Schoenfeld p.164)", () => {
  /** The fewest doubled-up days the week can be built with. Each "both" day
   *  absorbs one lift AND one run, so it takes `total - 7` of them to fit, and
   *  neither modality can supply more than it has. */
  const minimumBothDays = (lift: number, run: number) =>
    Math.max(0, Math.min(lift + run - 7, lift, run));

  it("never doubles up a day the week did not need to", () => {
    const excess: string[] = [];
    for (let lift = 0; lift <= 7; lift++) {
      for (let run = 0; run <= 7; run++) {
        const both = counts(generateSchedule(lift, run)).both;
        const need = minimumBothDays(lift, run);
        if (both !== need) {
          excess.push(
            `(${lift} lift, ${run} run): both=${both}, minimum=${need}`
          );
        }
      }
    }
    expect(
      excess,
      `Each unnecessary "both" day costs a hybrid user measured adaptation ` +
        `(ES 0.8 same-day vs 1.05 separate):\n  ${excess.join("\n  ")}`
    ).toEqual([]);
  });

  it("a week that fits in seven days has NO doubled-up day", () => {
    // The common case, stated on its own so a failure reads as what it is
    // rather than as one line of a 64-cell sweep.
    for (let lift = 0; lift <= 7; lift++) {
      for (let run = 0; run + lift <= 7; run++) {
        expect(
          counts(generateSchedule(lift, run)).both,
          `(${lift} lift, ${run} run) fits in a week`
        ).toBe(0);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  BASE_RUNNER,
  HARSH_RUNNER,
  VirtualRunner,
  type RunnerSetup,
  type RunnerVariant,
} from "@/test/sim/runner";

/* The virtual runner against running-evidence §6.1 and §6.4, at an average
   responder (r = 1), on easy running alone. The base model has to land in
   each target's range; the harsh model is the pessimistic end, never above
   it. These are the numbers `RUNNER`'s comment in athleteParameters.ts
   quotes. */

const RECREATIONAL: RunnerSetup = {
  vdot: 42,
  weeklyMinutes: 175,
  runningWeeks: 100,
  responder: 1,
};

/** Every day at `weekly / 7` easy minutes, for `days`. */
function steady(runner: VirtualRunner, weekly: number, days: number) {
  for (let d = 0; d < days; d++) {
    if (weekly > 0) runner.run([{ intensity: "easy", minutes: weekly / 7 }]);
    runner.endDay();
  }
}

/** The change in what the runner can do on the day, as a share. */
function afterBreak(variant: RunnerVariant, days: number): number {
  const runner = new VirtualRunner(RECREATIONAL, 1, variant);
  const before = runner.dayVdot();
  steady(runner, 0, days);
  return runner.dayVdot() / before - 1;
}

function gain(
  setup: RunnerSetup,
  variant: RunnerVariant,
  weekly: number,
  days: number
): number {
  const runner = new VirtualRunner(setup, 1, variant);
  steady(runner, weekly, days);
  return runner.trueVdot() - setup.vdot;
}

describe("the virtual runner, calibrated", () => {
  it("gains §6.1's +1.5–3 VDOT when a recreational 16 weeks adds 90 minutes a week", () => {
    const base = gain(RECREATIONAL, BASE_RUNNER, 265, 112);
    expect(base).toBeGreaterThan(1.5);
    expect(base).toBeLessThan(3);
    expect(gain(RECREATIONAL, HARSH_RUNNER, 265, 112)).toBeLessThan(base);
  });

  it("gains a well-trained runner about 2% of race time (+0.5–2 VDOT at 55)", () => {
    const setup = {
      vdot: 55,
      weeklyMinutes: 300,
      runningWeeks: 300,
      responder: 1,
    };
    const base = gain(setup, BASE_RUNNER, 360, 112);
    expect(base).toBeGreaterThan(0.5);
    expect(base).toBeLessThan(2);
  });

  it("gains a novice §6.1's +1.5–3 VDOT in 12 weeks going from 100 to 150 minutes", () => {
    const setup = {
      vdot: 30,
      weeklyMinutes: 100,
      runningWeeks: 10,
      responder: 1,
    };
    const base = gain(setup, BASE_RUNNER, 150, 84);
    expect(base).toBeGreaterThan(1.5);
    expect(base).toBeLessThan(3);
  });

  it.each([
    [7, -0.02, 0.02],
    [21, -0.06, -0.03],
    [42, -0.1, -0.05],
    [70, -0.15, -0.08],
  ] as const)("loses §6.4's share after %i days off", (days, low, high) => {
    const base = afterBreak(BASE_RUNNER, days);
    expect(base).toBeGreaterThanOrEqual(low);
    expect(base).toBeLessThanOrEqual(high);
  });

  /* A known gap, pinned so a change to it is seen: fitness here follows
     minutes, so a taper that halves easy running loses fitness and nets
     about +0.5%. Smyth & Lawlor 2021 put a strict 3-week taper at about
     +2.6% over a relaxed one (observational), and Hickson found kept
     intensity holds fitness, which this model can't credit. Taper
     comparisons from it understate the taper. */
  it("nets about +0.5% from a 2-week taper at half the easy minutes", () => {
    const runner = new VirtualRunner(
      { ...RECREATIONAL, weeklyMinutes: 265 },
      1,
      BASE_RUNNER
    );
    const before = runner.dayVdot();
    steady(runner, 265 / 2, 14);
    const taper = runner.dayVdot() / before - 1;
    expect(taper).toBeGreaterThan(0);
    expect(taper).toBeLessThan(0.01);
  });
});

import { describe, expect, it } from "vitest";
import {
  intervalRestSeconds,
  plannedIntervalPaceSPerKm,
  withPlannedRest,
} from "../intervalRest";
import { RUN_TEMPLATES } from "../workoutTemplates";

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const km = { workDistance: 1000, restDuration: 90 };

/* Deep dive D15: a 3:56 repeat and a 6:37 one got the same 90 seconds.
   With the runner's interval pace known, the rest is 70% of the repeat's
   own time, in half minutes, and never under a minute. */
describe("an interval session's rest", () => {
  it("is a share of the repeat's own time", () => {
    // 1 km at 4:00 is 240 s: 168 s, so 3 minutes.
    expect(intervalRestSeconds(km, 240)).toBe(180);
    // 1 km at 6:37 is 397 s: 278 s, so 4½ minutes.
    expect(intervalRestSeconds(km, 397)).toBe(270);
  });

  it("gives the slower runner the longer rest", () => {
    expect(intervalRestSeconds(km, 397)).toBeGreaterThan(
      intervalRestSeconds(km, 236)
    );
  });

  it("is never under a minute", () => {
    // 400 m at 3:45 /km is 90 s: 63 s, so a minute.
    expect(
      intervalRestSeconds({ workDistance: 400, restDuration: 60 }, 225)
    ).toBe(60);
    expect(
      intervalRestSeconds({ workDistance: 200, restDuration: 60 }, 200)
    ).toBe(60);
  });

  it("times a timed repeat by its own seconds", () => {
    // Two minutes hard: 84 s, so 1½ minutes.
    expect(
      intervalRestSeconds({ workDuration: 120, restDuration: 60 }, 300)
    ).toBe(90);
  });

  it("is the template's own without a pace", () => {
    expect(intervalRestSeconds(km, null)).toBe(90);
    expect(intervalRestSeconds(km, undefined)).toBe(90);
    expect(intervalRestSeconds(km, 0)).toBe(90);
  });
});

describe("the interval pace a plan uses", () => {
  const confirmed = {
    benchmark: { distanceM: 5000, timeS: 25 * 60 },
    vdot: null,
  };

  it("comes from a confirmed benchmark", () => {
    const pace = plannedIntervalPaceSPerKm(confirmed);
    // A 25-minute 5K runs its repeats faster than its 5:00 /km race pace.
    expect(pace).toBeGreaterThan(240);
    expect(pace).toBeLessThan(300);
  });

  it("is none without a benchmark, or while one waits to be confirmed", () => {
    expect(plannedIntervalPaceSPerKm(null)).toBeNull();
    expect(plannedIntervalPaceSPerKm(undefined)).toBeNull();
    expect(
      plannedIntervalPaceSPerKm({ ...confirmed, pendingConfirmation: true })
    ).toBeNull();
  });
});

describe("a planned session with its rest", () => {
  it("carries the runner's rest, and leaves the template alone", () => {
    const fiveK = template("5x1k");
    const planned = withPlannedRest(fiveK, 397);
    expect(planned.config.intervals?.restDuration).toBe(270);
    expect(planned.config.intervals?.reps).toBe(5);
    expect(fiveK.config.intervals?.restDuration).toBe(90);
  });

  it("is the template itself without a pace, or without intervals", () => {
    expect(withPlannedRest(template("5x1k"), null)).toBe(template("5x1k"));
    expect(withPlannedRest(template("easy_40"), 300)).toBe(template("easy_40"));
  });
});

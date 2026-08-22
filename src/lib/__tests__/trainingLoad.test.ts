/**
 * Training load curve (fitness/fatigue/form) — pins the impulse-response
 * behaviour the card sells: steady training converges fitness toward the
 * daily load, a spike raises fatigue much faster than fitness (form goes
 * negative), rest decays fatigue faster than fitness (form recovers
 * positive), and both disciplines feed one curve. Also pins the
 * effort-weighted-minutes load model and the warmup-history contract.
 */
import { describe, it, expect } from "vitest";
import {
  ACWR_SPIKE_THRESHOLD,
  evaluateLoadGuardrails,
  loadCurve,
  sessionLoad,
  QUALITY_RUN_FACTOR,
  type TrainingSession,
} from "../trainingLoad";

/** N consecutive daily sessions ending at `endKey` (inclusive). */
function dailySessions(
  endKey: string,
  days: number,
  make: (dateKey: string, i: number) => TrainingSession[]
): TrainingSession[] {
  const [y, m, d] = endKey.split("-").map(Number);
  const out: TrainingSession[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i, 12);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    out.push(...make(key, days - 1 - i));
  }
  return out;
}

const END = "2026-07-04";

describe("sessionLoad", () => {
  it("quality runs weigh heavier; lifts and easy runs are plain minutes", () => {
    expect(sessionLoad({ dateKey: END, discipline: "run", minutes: 40 })).toBe(
      40
    );
    expect(
      sessionLoad({
        dateKey: END,
        discipline: "run",
        minutes: 40,
        quality: true,
      })
    ).toBe(40 * QUALITY_RUN_FACTOR);
    expect(
      sessionLoad({
        dateKey: END,
        discipline: "lift",
        minutes: 50,
        quality: true,
      })
    ).toBe(50); // quality flag is a RUN concept
  });
});

describe("loadCurve", () => {
  it("emits exactly the requested window with zero-filled rest days", () => {
    const points = loadCurve(
      [{ dateKey: "2026-07-02", discipline: "run", minutes: 30 }],
      { endDateKey: END, days: 7 }
    );
    expect(points).toHaveLength(7);
    expect(points[0].dateKey).toBe("2026-06-28");
    expect(points[6].dateKey).toBe(END);
    expect(points.find((p) => p.dateKey === "2026-07-02")!.load).toBe(30);
    expect(points.find((p) => p.dateKey === "2026-07-01")!.load).toBe(0);
  });

  it("steady training converges fitness toward the daily load", () => {
    const sessions = dailySessions(END, 180, (dateKey) => [
      { dateKey, discipline: "run", minutes: 40 },
    ]);
    const points = loadCurve(sessions, { endDateKey: END, days: 30 });
    const last = points[points.length - 1];
    expect(last.fitness).toBeGreaterThan(35); // 4+ time constants in
    expect(last.fitness).toBeLessThanOrEqual(40);
    // At steady state fatigue ≈ fitness → form ≈ 0.
    expect(Math.abs(last.form)).toBeLessThan(3);
  });

  it("a hard week spikes fatigue faster than fitness → negative form", () => {
    const base = dailySessions(END, 120, (dateKey, i) =>
      i < 113 ? [{ dateKey, discipline: "run", minutes: 30 }] : []
    );
    // Final 7 days: doubled load.
    const spike = dailySessions(END, 7, (dateKey) => [
      { dateKey, discipline: "run", minutes: 60 },
    ]);
    const points = loadCurve([...base, ...spike], {
      endDateKey: END,
      days: 14,
    });
    const last = points[points.length - 1];
    expect(last.fatigue).toBeGreaterThan(last.fitness);
    expect(last.form).toBeLessThan(0);
  });

  it("rest decays fatigue faster than fitness → form recovers positive", () => {
    // 100 steady days, then 7 days completely off.
    const sessions = dailySessions("2026-06-27", 100, (dateKey) => [
      { dateKey, discipline: "run", minutes: 40 },
    ]);
    const points = loadCurve(sessions, { endDateKey: END, days: 7 });
    const last = points[points.length - 1];
    expect(last.fitness).toBeGreaterThan(last.fatigue);
    expect(last.form).toBeGreaterThan(0);
    // Fitness persists through a week off.
    expect(last.fitness).toBeGreaterThan(25);
  });

  it("runs and lifts compose into one curve with per-discipline day loads", () => {
    const points = loadCurve(
      [
        { dateKey: END, discipline: "run", minutes: 30 },
        { dateKey: END, discipline: "lift", minutes: 45 },
      ],
      { endDateKey: END, days: 1 }
    );
    expect(points).toHaveLength(1);
    expect(points[0].runLoad).toBe(30);
    expect(points[0].liftLoad).toBe(45);
    expect(points[0].load).toBe(75);
  });

  it("warmup history OUTSIDE the window still shapes the state at its edge", () => {
    const history = dailySessions("2026-06-27", 90, (dateKey) => [
      { dateKey, discipline: "lift", minutes: 40 },
    ]);
    const warm = loadCurve(history, { endDateKey: END, days: 7 });
    const cold = loadCurve([], { endDateKey: END, days: 7 });
    expect(warm[0].fitness).toBeGreaterThan(20);
    expect(cold[0].fitness).toBe(0);
  });

  it("ignores sessions after the end day and handles empty input", () => {
    const points = loadCurve(
      [{ dateKey: "2026-07-05", discipline: "run", minutes: 30 }],
      { endDateKey: END, days: 3 }
    );
    expect(points.every((p) => p.load === 0)).toBe(true);
    expect(loadCurve([], { endDateKey: END, days: 3 })).toHaveLength(3);
  });
});

describe("B1 — evaluateLoadGuardrails", () => {
  /** Build LoadPoint[] from a plain daily-load array (only `load` and the
   *  slice arithmetic matter to the guardrails; curve fields are inert). */
  const pointsFrom = (loads: number[]) =>
    loads.map((load, i) => ({
      dateKey: `d${i}`,
      load,
      runLoad: load,
      liftLoad: 0,
      fitness: 0,
      fatigue: 0,
      form: 0,
    }));

  it("steady training reads ~1.0 and stays quiet", () => {
    // 28 days of a normal week shape: 5 training days + 2 rest.
    const week = [60, 60, 0, 60, 45, 0, 75];
    const g = evaluateLoadGuardrails(
      pointsFrom([...week, ...week, ...week, ...week])
    );
    expect(g.acwr).toBeCloseTo(1.0, 1);
    expect(g.advisory).toBeNull();
    // A varied week is not monotonous.
    expect(g.monotony).not.toBeNull();
    expect(g.monotony!).toBeLessThan(2.0);
  });

  it("a genuine ramp fires the spike advisory with the measured excess", () => {
    const g = evaluateLoadGuardrails(
      pointsFrom([...Array(21).fill(30), 60, 60, 55, 0, 65, 60, 60])
    );
    // acute mean ≈ 51.4, chronic mean ≈ 35.4 → ~1.45.
    expect(g.acwr!).toBeGreaterThan(ACWR_SPIKE_THRESHOLD);
    expect(g.advisory?.kind).toBe("ramp_spike");
    expect(g.advisory!.line).toMatch(/more load than your 4-week base/);
    expect(g.advisory!.line).toMatch(/Tropos heuristic/);
  });

  it("a taper's low ratio is deliberately quiet — easing off is the plan", () => {
    const g = evaluateLoadGuardrails(
      pointsFrom([...Array(21).fill(60), 20, 0, 20, 0, 20, 0, 20])
    );
    expect(g.acwr!).toBeLessThan(0.8);
    expect(g.advisory).toBeNull();
  });

  it("cold start: under 28 days or a near-zero base nulls the ratio", () => {
    // ACWR needs the 28-day base; a varied 14-day history reads fully quiet.
    const week = [60, 60, 0, 60, 45, 0, 75];
    const young = evaluateLoadGuardrails(pointsFrom([...week, ...week]));
    expect(young.acwr).toBeNull();
    expect(young.advisory).toBeNull();
    // Monotony, by contrast, needs only ONE real week — a fortnight of
    // seven-identical-day training is worth the variety nudge even
    // before the ratio has a base (Foster's window is the week itself).
    expect(
      evaluateLoadGuardrails(pointsFrom(Array(14).fill(60))).advisory?.kind
    ).toBe("high_monotony");
    // 28 days of near-nothing: chronic base below the floor.
    const quiet = evaluateLoadGuardrails(pointsFrom(Array(28).fill(2)));
    expect(quiet.acwr).toBeNull();
    expect(quiet.advisory).toBeNull();
  });

  it("seven identical training days fire the monotony advisory (capped, not NaN)", () => {
    const g = evaluateLoadGuardrails(pointsFrom(Array(28).fill(60)));
    expect(g.acwr).toBeCloseTo(1.0, 1);
    expect(g.monotony).toBe(9.9);
    expect(g.strain).toBe(Math.round(7 * 60 * 9.9));
    expect(g.advisory?.kind).toBe("high_monotony");
    expect(g.advisory!.line).toMatch(/Tropos heuristic/);
  });

  it("a spike outranks monotony — at most one advisory", () => {
    const g = evaluateLoadGuardrails(
      pointsFrom([...Array(21).fill(25), ...Array(7).fill(60)])
    );
    expect(g.acwr!).toBeGreaterThan(ACWR_SPIKE_THRESHOLD);
    expect(g.monotony).toBe(9.9);
    expect(g.advisory?.kind).toBe("ramp_spike");
  });

  it("a zero-load week nulls monotony and never divides by zero", () => {
    const g = evaluateLoadGuardrails(
      pointsFrom([...Array(21).fill(60), ...Array(7).fill(0)])
    );
    expect(g.monotony).toBeNull();
    expect(g.strain).toBeNull();
  });

  it("advisory copy stays in the honest register", () => {
    for (const loads of [
      [...Array(21).fill(30), ...Array(7).fill(60)],
      Array(28).fill(60),
    ]) {
      const g = evaluateLoadGuardrails(pointsFrom(loads));
      expect(g.advisory).not.toBeNull();
      expect(g.advisory!.line).not.toMatch(
        /injur|risk|danger|safe|guarantee|will /i
      );
    }
  });
});

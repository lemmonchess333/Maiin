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

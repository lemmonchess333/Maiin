/**
 * Run distance and kilometre splits against the truth, on the synthetic
 * bench (`src/test/gpsBench.ts`): five courses, four paces, two models of
 * GPS error at three reported accuracies, and three fix schedules (a fix a
 * second, irregular fixes, and dropouts of 20 to 40 s), three seeds each.
 *
 * It holds the recording as Tropos does it (`troposRecorder`: the
 * velocity filter and the trace step) to the bands below, and pins the
 * position-only filter it replaced (`positionOnlyRecorder`) outside them,
 * so the table means something.
 *
 * SYNTHETIC. The bands hold under the bench's model of GPS error, which
 * is an assumption (see the bench's header): the check that counts is a
 * phone on a measured course beside another app, in
 * docs/qa/pre-launch-backlog.md. Set GPS_BENCH_REPORT to a file path to
 * write the full table there.
 */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { detectBestEfforts, totalDistance } from "@/lib/gps";
import {
  ACCURACIES,
  COURSES,
  NOISE_MODELS,
  STANDING,
  STILL,
  positionOnlyRecorder,
  read,
  record,
  scenarios,
  simulate,
  troposRecorder,
  type NoiseModel,
  type Recorder,
  type Scenario,
  type Simulated,
} from "@/test/gpsBench";

interface Cell {
  course: string;
  noise: NoiseModel;
  accuracy: number;
  /** Mean of (recorded − true) / true over the cell's runs. */
  distance: number;
  /** Mean |recorded − true| split time, seconds. */
  splitMean: number;
  /** 95th percentile of |recorded − true| split time, seconds. */
  splitP95: number;
  /** Mean and 95th percentile of the same as a fraction of the true
   *  kilometre's time. */
  splitMeanFraction: number;
  splitP95Fraction: number;
}

const SEEDS = 3;
const SIMS: { s: Scenario; sim: Simulated }[] = [...scenarios(SEEDS)].map(
  (s) => ({ s, sim: simulate(s) })
);

function bench(make: () => Recorder): Cell[] {
  const by = new Map<
    string,
    { d: number[]; sp: number[]; sf: number[]; s: Scenario }
  >();
  for (const { s, sim } of SIMS) {
    const r = read(sim, make());
    const key = `${s.course.name}|${s.noise}|${s.accuracy}`;
    const cell = by.get(key) ?? { d: [], sp: [], sf: [], s };
    cell.d.push(r.distanceError);
    cell.sp.push(...r.splitErrors.map(Math.abs));
    cell.sf.push(...r.splitFractions.map(Math.abs));
    by.set(key, cell);
  }
  const mean = (a: number[]) =>
    a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const p95 = (a: number[]) => a[Math.floor(a.length * 0.95)] ?? 0;
  return [...by.values()].map(({ d, sp, sf, s }) => {
    sp.sort((a, b) => a - b);
    sf.sort((a, b) => a - b);
    return {
      course: s.course.name,
      noise: s.noise,
      accuracy: s.accuracy,
      distance: d.reduce((a, b) => a + b, 0) / d.length,
      splitMean: mean(sp),
      splitP95: p95(sp),
      splitMeanFraction: mean(sf),
      splitP95Fraction: p95(sf),
    };
  });
}

const NOW = bench(troposRecorder);
const BEFORE = bench(positionOnlyRecorder);

/** The four courses the ±2% target is set for. */
const TARGET = ["straight", "park loop", "city grid", "400 m track"];
const isTarget = (c: Cell) => TARGET.includes(c.course);
/** The error model a filtered fix stream is closest to, at every
 *  accuracy, and the rough one at ±5 m. */
const isCalm = (c: Cell) => c.noise === "smooth" || c.accuracy === 5;
const label = (c: Cell) => `${c.course}, ${c.noise}, ±${c.accuracy} m`;

describe("run distance on the synthetic bench", () => {
  it("is within 2% on a straight, a park loop, a street grid and a track", () => {
    for (const c of NOW.filter((c) => isTarget(c) && isCalm(c)))
      expect(Math.abs(c.distance), label(c)).toBeLessThan(0.02);
  });

  it("reads long, never short, where the fixes wander fast (rough, ±10 and ±16 m)", () => {
    /* No rule that measures positions alone stays inside 2% here: the
       fixes' own wander is distance it cannot tell from running. The
       position-only filter read these straights close by trailing the
       runner, and cut the same courses' corners by up to 16%. Pinned so a
       change in either direction is seen. */
    for (const c of NOW.filter((c) => isTarget(c) && !isCalm(c))) {
      expect(c.distance, label(c)).toBeGreaterThan(0);
      expect(c.distance, label(c)).toBeLessThan(
        c.accuracy === 10 ? 0.04 : 0.065
      );
    }
  });

  it("keeps switchbacks 6 m apart within 7%", () => {
    /* 80 m legs and 180° hairpins: the step rule's 8 m at ±16 m clips the
       hairpins. The position-only filter read them 18% to 48% short. */
    for (const c of NOW.filter((c) => c.course === "switchbacks"))
      expect(Math.abs(c.distance), label(c)).toBeLessThan(0.07);
  });

  it("times each kilometre within 2.5% of the truth on average to ±10 m, 4% at ±16 m", () => {
    /* A kilometre's time is off by the error in where the trace thinks
       each end of it is, so it cannot be tighter than the fixes allow. At
       ±16 m a track's kilometres read 3.4% off on average, and the raw
       fixes, with no smoothing at all, read them 3.1% off: the floor, not
       the filter. "At worst" is the 95th percentile of a cell's
       kilometres. The position-only filter's were off by up to 19% on
       average in a cell, 37% at the 95th percentile. */
    for (const c of NOW.filter((c) => isTarget(c) && isCalm(c))) {
      const wide = c.accuracy === 16;
      expect(c.splitMeanFraction, label(c)).toBeLessThan(wide ? 0.04 : 0.025);
      expect(c.splitP95Fraction, label(c)).toBeLessThan(wide ? 0.09 : 0.06);
    }
  });

  it("the position-only filter it replaced cut grids and tracks short", () => {
    for (const c of BEFORE.filter(
      (c) =>
        (c.course === "city grid" || c.course === "400 m track") &&
        c.accuracy >= 10
    ))
      expect(c.distance, label(c)).toBeLessThan(-0.06);
  });

  it("picks up no more drift standing still than it was measured at", () => {
    /* Two minutes on one spot with auto-pause off (auto-pause, on by
       default, holds the trace and records nothing). Every fix that wanders
       past the step is distance: the position-only filter, smoothing
       harder, picked up 20 to 45 m (smooth) and 40 to 67 m (rough); this
       picks up 18 to 55 m and 38 to 97 m. Pinned so it gets no worse. */
    const limit = { smooth: [25, 45, 70], rough: [50, 85, 120] };
    for (const noise of NOISE_MODELS)
      ACCURACIES.forEach((accuracy, i) => {
        let metres = 0;
        for (let seed = 1; seed <= 10; seed++) {
          const sim = simulate({
            course: STANDING,
            pace: STILL,
            noise,
            accuracy,
            schedule: "1 Hz",
            seed: seed * 31,
          });
          metres += totalDistance(record(sim.fixes, troposRecorder()));
        }
        expect(metres / 10, `${noise}, ±${accuracy} m`).toBeLessThan(
          limit[noise][i]
        );
      });
  });

  it("times a 1K best effort close to the truth, a little fast rather than slow", () => {
    /* A steady 3.5 m/s, so the true 1K is 286 s. The quickest stretch of
       many is picked, so a distance that wanders reads it fast: 5 to 11 s
       under the smooth model, 10 to 25 s under the rough. The
       position-only filter read it 9 to 51 s slow. */
    const trueOneK = 1000 / 3.5;
    for (const noise of NOISE_MODELS)
      for (const accuracy of ACCURACIES) {
        const errors: number[] = [];
        for (const s of scenarios(2, {
          paces: [{ name: "3.5 m/s", speedAt: () => 3.5 }],
          noises: [noise],
          accuracies: [accuracy],
          schedules: ["1 Hz"],
        })) {
          const points = record(simulate(s).fixes, troposRecorder());
          const oneK = detectBestEfforts(points, totalDistance(points)).find(
            (e) => e.label === "1K"
          );
          if (oneK) errors.push(oneK.time - trueOneK);
        }
        const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
        const at = `${noise}, ±${accuracy} m`;
        expect(mean, at).toBeLessThan(2);
        expect(mean, at).toBeGreaterThan(noise === "smooth" ? -15 : -30);
      }
  });

  it("writes the table when asked", () => {
    const path = process.env.GPS_BENCH_REPORT;
    if (!path) return;
    const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
    const rows = [
      "| Course | Error model | Accuracy | Distance before | Distance after | Km split error before, mean / p95 | Km split error after, mean / p95 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    ];
    const split = (c: Cell) =>
      `${c.splitMean.toFixed(1)} s / ${c.splitP95.toFixed(1)} s (${(c.splitMeanFraction * 100).toFixed(1)}% / ${(c.splitP95Fraction * 100).toFixed(1)}%)`;
    for (const course of COURSES)
      for (const noise of NOISE_MODELS)
        for (const accuracy of ACCURACIES) {
          const find = (cells: Cell[]) =>
            cells.find(
              (c) =>
                c.course === course.name &&
                c.noise === noise &&
                c.accuracy === accuracy
            )!;
          const b = find(BEFORE);
          const a = find(NOW);
          rows.push(
            `| ${course.name} | ${noise} | ±${accuracy} m | ${pct(b.distance)} | ${pct(a.distance)} | ${split(b)} | ${split(a)} |`
          );
        }
    writeFileSync(path, rows.join("\n") + "\n");
  });
});

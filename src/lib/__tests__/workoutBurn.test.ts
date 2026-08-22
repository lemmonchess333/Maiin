import { describe, it, expect } from "vitest";
import {
  selectLiftMET,
  estimateLiftBurn,
  estimateRunBurn,
} from "../workoutBurn";

describe("selectLiftMET", () => {
  it("returns 4.5 for zero-tonnage (bodyweight / conditioning)", () => {
    expect(selectLiftMET(0, 30)).toBe(4.5);
  });

  it("returns 4.5 as a guard when duration is zero or negative", () => {
    expect(selectLiftMET(5000, 0)).toBe(4.5);
    expect(selectLiftMET(5000, -10)).toBe(4.5);
  });

  it("returns 3.5 for low density (<80 kg/min)", () => {
    // 3000 kg / 60 min = 50 kg/min
    expect(selectLiftMET(3000, 60)).toBe(3.5);
  });

  it("returns 4.5 for moderate density (80–200 kg/min)", () => {
    // 8000 / 60 = 133 kg/min
    expect(selectLiftMET(8000, 60)).toBe(4.5);
  });

  it("returns 5.5 for high density (≥200 kg/min)", () => {
    // 12000 / 45 = 267 kg/min
    expect(selectLiftMET(12000, 45)).toBe(5.5);
  });

  it("boundary: 80 kg/min lands in moderate bucket (not low)", () => {
    expect(selectLiftMET(4800, 60)).toBe(4.5);
  });

  it("boundary: 200 kg/min lands in high bucket", () => {
    expect(selectLiftMET(12000, 60)).toBe(5.5);
  });
});

describe("estimateLiftBurn", () => {
  it("bodyweight session: 20 min, 0 tonnage, 80 kg, 12 sets → 120 kcal", () => {
    // 20 × 80 × 4.5 / 60 = 120
    expect(
      estimateLiftBurn({
        durationMinutes: 20,
        tonnageKg: 0,
        bodyweightKg: 80,
        completedSetCount: 12,
      })
    ).toBe(120);
  });

  it("heavy 5×5: 45 min, 12000 kg tonnage, 90 kg bodyweight → 371 kcal", () => {
    // density = 12000 / 45 = 267 → MET 5.5
    // 45 × 90 × 5.5 / 60 = 371.25 → 371
    expect(
      estimateLiftBurn({
        durationMinutes: 45,
        tonnageKg: 12000,
        bodyweightKg: 90,
        completedSetCount: 25,
      })
    ).toBe(371);
  });

  it("hypertrophy 4×10: 60 min, 8000 kg, 90 kg → 405 kcal", () => {
    // density = 8000 / 60 = 133 → MET 4.5
    // 60 × 90 × 4.5 / 60 = 405
    expect(
      estimateLiftBurn({
        durationMinutes: 60,
        tonnageKg: 8000,
        bodyweightKg: 90,
        completedSetCount: 40,
      })
    ).toBe(405);
  });

  it("zero duration fallback: effectiveDuration = 15 × 3 = 45, density 3000/45=66.7 → MET 3.5", () => {
    // 45 × 80 × 3.5 / 60 = 210
    expect(
      estimateLiftBurn({
        durationMinutes: 0,
        tonnageKg: 3000,
        bodyweightKg: 80,
        completedSetCount: 15,
      })
    ).toBe(210);
  });

  it("returns 0 when bodyweight is missing or non-positive", () => {
    expect(
      estimateLiftBurn({
        durationMinutes: 30,
        tonnageKg: 5000,
        bodyweightKg: 0,
        completedSetCount: 20,
      })
    ).toBe(0);
  });

  it("returns 0 when both duration and completedSetCount are zero", () => {
    expect(
      estimateLiftBurn({
        durationMinutes: 0,
        tonnageKg: 0,
        bodyweightKg: 80,
        completedSetCount: 0,
      })
    ).toBe(0);
  });
});

describe("estimateRunBurn", () => {
  it("standard 5km run at 80kg → 414 kcal", () => {
    // 5 × 80 × 1.036 = 414.4 → 414
    expect(estimateRunBurn({ distanceKm: 5, bodyweightKg: 80 })).toBe(414);
  });

  it("half-marathon at 70kg → 1532 kcal", () => {
    // 21.1 × 70 × 1.036 = 1530.17 → 1530
    expect(estimateRunBurn({ distanceKm: 21.1, bodyweightKg: 70 })).toBe(1530);
  });

  it("zero distance returns 0", () => {
    expect(estimateRunBurn({ distanceKm: 0, bodyweightKg: 80 })).toBe(0);
  });

  it("zero bodyweight returns 0", () => {
    expect(estimateRunBurn({ distanceKm: 5, bodyweightKg: 0 })).toBe(0);
  });
});

/**
 * The run-burn constant lives in exactly one place.
 *
 * It had lived in three, each with its own tests asserting the same
 * arithmetic: `estimateRunBurn` here, `estimateRunCalories` in `gps.ts`, and
 * a hand-rolled `Math.round(weightKg * distKm * 1.036)` inside
 * `useHomeData`'s calorie tile. Three copies agreeing today is not the same
 * as one copy — a change to the coefficient would have moved two surfaces
 * and left the third, with three green suites.
 *
 * `estimateRunBurn` was also on the symbol-reachability orphan list, which
 * reads as rot until you notice WHY nothing called it: the two live surfaces
 * had each re-derived it. Consolidating took the entry off that list.
 *
 * Asserted on the constant rather than by comparing the functions, because
 * the functions now delegate — an equality test between them would be a
 * tautology, and would still pass with a fourth copy added elsewhere.
 */
describe("one run-burn formula", () => {
  it("1.036 appears exactly once in production src/", async () => {
    const { readFileSync, globSync } = await import("node:fs");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const repoRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../.."
    );

    const sites: string[] = [];
    for (const rel of globSync("src/**/*.{ts,tsx}", { cwd: repoRoot })) {
      if (rel.includes("__tests__") || rel.includes(".test.")) continue;
      const src = readFileSync(resolve(repoRoot, rel), "utf8");
      src.split("\n").forEach((line, i) => {
        if (/(?<![\d.])1\.036(?![\d])/.test(line))
          sites.push(`${rel}:${i + 1}`);
      });
    }
    expect(
      [...new Set(sites.map((s) => s.split(":")[0]))],
      `The run-burn coefficient must have ONE home (workoutBurn.ts). Call ` +
        `estimateRunBurn — or estimateRunCalories for a distance in metres — ` +
        `rather than repeating it. Sites found:\n  ${sites.join("\n  ")}`
    ).toEqual(["src/lib/workoutBurn.ts"]);
  });
});

/**
 * Property-based guard for calculateTDEE — the base of every calorie target.
 *
 * Example tests pin the Mifflin-St Jeor numbers + the specific goal offsets.
 * This fuzzes random bodies and asserts the STRUCTURAL orderings that a sign
 * flip or a swapped offset/multiplier would break — caught universally rather
 * than at a single fixture:
 *   - all outputs are non-negative for realistic inputs
 *   - more activity ⇒ more calories (sedentary ≤ … ≤ very_active)
 *   - heavier ⇒ more calories (BMR is linear in weight)
 *   - cut < recomp < lean bulk for the same body (offsets −500 < 0 < +300)
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import { calculateTDEE, type ActivityLevel, type FitnessGoal } from "../tdee";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACTIVITY_ASC: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];

interface Body {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: "male" | "female";
}
function genBody(rnd: () => number): Body {
  return {
    weightKg: 40 + Math.round(rnd() * 140), // 40–180
    heightCm: 140 + Math.round(rnd() * 70), // 140–210
    age: 18 + Math.round(rnd() * 67), // 18–85
    sex: rnd() < 0.5 ? "male" : "female",
  };
}

describe("calculateTDEE invariants (property-based)", () => {
  it("never emits a negative bmr / tdee / targetCalories / macro for a realistic body", () => {
    const rnd = mulberry32(401);
    for (let i = 0; i < 3000; i++) {
      const b = genBody(rnd);
      const act = ACTIVITY_ASC[Math.floor(rnd() * 5)];
      const goal = (["cut", "recomp", "lean bulk"] as FitnessGoal[])[
        Math.floor(rnd() * 3)
      ];
      const r = calculateTDEE(b.weightKg, b.heightCm, b.age, act, goal, b.sex);
      for (const v of [
        r.bmr,
        r.tdee,
        r.targetCalories,
        r.protein,
        r.carbs,
        r.fat,
      ]) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("calories are non-decreasing as activity rises (same body + goal)", () => {
    const rnd = mulberry32(402);
    for (let i = 0; i < 2000; i++) {
      const b = genBody(rnd);
      const goal = (["cut", "recomp", "lean bulk"] as FitnessGoal[])[
        Math.floor(rnd() * 3)
      ];
      let prev = -Infinity;
      for (const act of ACTIVITY_ASC) {
        const r = calculateTDEE(
          b.weightKg,
          b.heightCm,
          b.age,
          act,
          goal,
          b.sex
        );
        expect(r.targetCalories).toBeGreaterThanOrEqual(prev);
        prev = r.targetCalories;
      }
    }
  });

  it("calories strictly increase with bodyweight (BMR linear in weight)", () => {
    const rnd = mulberry32(403);
    for (let i = 0; i < 2000; i++) {
      const b = genBody(rnd);
      const act = ACTIVITY_ASC[Math.floor(rnd() * 5)];
      const goal: FitnessGoal = "recomp";
      const lighter = calculateTDEE(
        b.weightKg,
        b.heightCm,
        b.age,
        act,
        goal,
        b.sex
      );
      const heavier = calculateTDEE(
        b.weightKg + 10,
        b.heightCm,
        b.age,
        act,
        goal,
        b.sex
      );
      expect(heavier.targetCalories).toBeGreaterThan(lighter.targetCalories);
    }
  });

  it("cut < recomp < lean bulk for the same body (offsets −500 < 0 < +300)", () => {
    const rnd = mulberry32(404);
    for (let i = 0; i < 2000; i++) {
      const b = genBody(rnd);
      const act = ACTIVITY_ASC[Math.floor(rnd() * 5)];
      const cut = calculateTDEE(
        b.weightKg,
        b.heightCm,
        b.age,
        act,
        "cut",
        b.sex
      );
      const recomp = calculateTDEE(
        b.weightKg,
        b.heightCm,
        b.age,
        act,
        "recomp",
        b.sex
      );
      const bulk = calculateTDEE(
        b.weightKg,
        b.heightCm,
        b.age,
        act,
        "lean bulk",
        b.sex
      );
      expect(cut.targetCalories).toBeLessThan(recomp.targetCalories);
      expect(recomp.targetCalories).toBeLessThan(bulk.targetCalories);
      // The gaps reflect the exact offset band.
      expect(recomp.targetCalories - cut.targetCalories).toBe(500);
      expect(bulk.targetCalories - recomp.targetCalories).toBe(300);
    }
  });
});

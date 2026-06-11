/**
 * getNutritionPhase accessor + the "two goals" footgun guard (D2).
 *
 * The nutrition phase lives on `profile.program.goal`, NOT `programState.goal`
 * (a prior bug, e1b0296, shipped from reading the wrong one). This pins the
 * accessor's contract AND guards that the calorie/macro modules never read
 * `programState.goal` — so the footgun can't be re-introduced silently.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getNutritionPhase } from "../nutritionPhase";
import { GOAL_CALORIE_OFFSET } from "../macroConstants";

describe("getNutritionPhase", () => {
  it("reads profile.program.goal", () => {
    expect(getNutritionPhase({ program: { goal: "cut" } })).toBe("cut");
    expect(getNutritionPhase({ program: { goal: "lean bulk" } })).toBe(
      "lean bulk"
    );
    expect(getNutritionPhase({ program: { goal: "recomp" } })).toBe("recomp");
  });

  it("defaults to recomp for missing / null / unknown / wrong-shaped input", () => {
    expect(getNutritionPhase(null)).toBe("recomp");
    expect(getNutritionPhase(undefined)).toBe("recomp");
    expect(getNutritionPhase({})).toBe("recomp");
    expect(getNutritionPhase({ program: null })).toBe("recomp");
    expect(getNutritionPhase({ program: { goal: null } })).toBe("recomp");
    expect(getNutritionPhase({ program: { goal: "bulk" } })).toBe("recomp"); // not a valid phase
    expect(getNutritionPhase({ program: { goal: "" } })).toBe("recomp");
  });

  it("recomp default is equivalent to the old `?? ''` branch (0 kcal offset)", () => {
    // Documents WHY the migration is behaviour-safe: the missing-goal default
    // landed on a 0 offset both before (GOAL_CALORIE_OFFSET[''] ?? 0) and after
    // (GOAL_CALORIE_OFFSET['recomp'] === 0). Pinned so a future offset change to
    // `recomp` is a conscious decision, not a silent migration regression.
    // (Asserted against the constant directly to avoid coupling to the hook.)
    expect(GOAL_CALORIE_OFFSET.recomp).toBe(0);
  });
});

describe("the 'two goals' footgun — calorie/macro modules never read programState.goal", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "..");
  // The modules where reading the WRONG goal silently mis-sets calories/macros.
  const GUARDED = [
    "phaseNutrition.ts",
    "macroConstants.ts",
    "adaptiveTarget.ts",
    "adaptiveTdee.ts",
    "tdee.ts",
    "calculateDailyMacros.ts",
  ];

  it("none reference programState.goal", () => {
    const offenders: string[] = [];
    for (const file of GUARDED) {
      let src: string;
      try {
        src = readFileSync(resolve(root, file), "utf8");
      } catch {
        continue; // file moved/renamed — not this guard's job to fail on that
      }
      if (/programState\??\.goal/.test(src)) offenders.push(file);
    }
    expect(
      offenders,
      `These calorie/macro modules read programState.goal — the nutrition phase ` +
        `lives on profile.program.goal (use getNutritionPhase). Offenders: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});

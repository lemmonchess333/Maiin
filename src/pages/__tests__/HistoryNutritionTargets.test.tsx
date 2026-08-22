/**
 * History's nutrition "target N" reference line tracks the CURRENT plan.
 *
 * It read `profile.macroTargets` — a field Onboarding wrote once and nothing
 * ever updated. `buildGoalWeightPersistPayload` writes `targetCalories` and
 * the three gram fields; it does not write this one, and neither does the
 * weigh-in patch. So a user who onboarded at maintenance and later set a
 * goal weight kept seeing their onboarding-day plan on this page, for good,
 * drifting further with every goal change, weigh-in and adaptive retune.
 *
 * The test is written against the SEAM rather than the page, deliberately.
 * History mounts a large tree (charts, maps, several Firestore hooks) and a
 * full render test of it would be pinning fixtures, not this property. What
 * has to hold is narrow and checkable: the numbers History renders come from
 * `useEffectiveTargets` — the same source Home and Food read — and not from
 * a stored snapshot that no longer moves.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
/** Comments are not code. The fix left an explanatory comment naming the
 *  old field, and matching against raw source would flag it — a false
 *  positive that would push someone to delete the explanation. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const historyRaw = readFileSync(
  resolve(repoRoot, "src/pages/History.tsx"),
  "utf8"
);
const history = stripComments(historyRaw);

describe("History nutrition targets", () => {
  it("does not read the frozen profile.macroTargets snapshot", () => {
    // The specific regression. `macroTargets` remains a declared profile
    // field (pending an allow-list removal that needs a rules deploy), so
    // re-reading it here would compile and look right.
    expect(history).not.toMatch(
      /profile\?\.macroTargets|profile\.macroTargets/
    );
  });

  it("reads the same effective targets Home and Food render", () => {
    expect(history).toMatch(/useEffectiveTargets\(\)/);
    // The four values the StatCards show, all sourced from that hook rather
    // than from four independently-stored numbers.
    expect(history).toMatch(/calories:\s*effectiveTargets\.finalTarget/);
    expect(history).toMatch(/protein:\s*effectiveTargets\.protein/);
    expect(history).toMatch(/carbs:\s*effectiveTargets\.carbs/);
    expect(history).toMatch(/fat:\s*effectiveTargets\.fat/);
  });

  it("still renders a target line for each of the four cards", () => {
    // Guards against "fixing" this by deleting the reference line entirely,
    // which would pass the assertion above and quietly remove the feature.
    for (const key of ["calories", "protein", "carbs", "fat"]) {
      expect(history).toMatch(new RegExp(`macroTargets\\?\\.${key}`));
    }
  });
});

describe("nothing writes the frozen snapshot any more", () => {
  it("Onboarding no longer persists macroTargets", () => {
    // Its only writer. Left in place it would keep minting the stale field
    // for every new user, so the read-side fix alone would be half a fix.
    const onboarding = readFileSync(
      resolve(repoRoot, "src/pages/Onboarding.tsx"),
      "utf8"
    );
    expect(onboarding).not.toMatch(/macroTargets:/);
  });
});

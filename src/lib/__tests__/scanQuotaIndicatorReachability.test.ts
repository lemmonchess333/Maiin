/**
 * The scan-quota caption cannot currently render, and that is a product
 * question rather than a bug.
 *
 * `FoodComposerCard` shows `ScanQuotaIndicator` only when
 *
 *     !scanUsage.isUnlimited && scanUsage.limit > 0 && remaining <= 1
 *
 * and `Food.tsx` feeds it `useScanUsage()` — no argument, so `image_ai`.
 * Inside the hook the limit is derived FROM the same flag:
 *
 *     const isUnlimited = isPro || isInTrial;
 *     const tier = isUnlimited ? "pro" : "free";
 *     const limit = DAILY_AI_LIMITS[tier][action];
 *
 * So `!isUnlimited` forces the free row, and the free row's `image_ai`
 * is 0. The two conjuncts exclude each other: there is no tier at which
 * the caption appears. Enumerated rather than argued — both values of
 * `isUnlimited` are checked below.
 *
 * Why pin it instead of deleting the branch: the exclusion is a
 * consequence of one number in `DAILY_AI_LIMITS`, not of the component.
 * Giving free users any image scans at all makes the caption live
 * immediately — and it would go live UNSEEN, because no capture spec
 * covers either quota state (grep `e2e/` for "Out of scans": nothing).
 * This test is how that arrives as a decision rather than as a surprise.
 *
 * Found while trying to film the exhausted state to verify a touch-target
 * change on it. The change is sound; the surface it improves is one no
 * user currently reaches.
 */
import { describe, it, expect } from "vitest";
import { DAILY_AI_LIMITS } from "@/lib/subscription";

/** The composer's gate, transcribed. */
const captionRenders = (isUnlimited: boolean, action: "image_ai" | "text_ai") =>
  !isUnlimited && DAILY_AI_LIMITS[isUnlimited ? "pro" : "free"][action] > 0;

describe("ScanQuotaIndicator reachability on the Food surface", () => {
  it("is unreachable for image_ai — the action Food.tsx actually uses", () => {
    const reachable = [true, false].filter((u) =>
      captionRenders(u, "image_ai")
    );
    expect(
      reachable,
      "The scan-quota caption can now render, which it could not before. " +
        "Nothing has ever filmed it — no capture spec covers either quota " +
        "state — so before shipping, give it a frame. If this became " +
        "reachable on purpose, that is the moment to look at it."
    ).toEqual([]);
  });

  it("names the number that makes it so", () => {
    /* Anchored on the value rather than the conclusion, so the reason is
       visible when the test above changes. */
    expect(DAILY_AI_LIMITS.free.image_ai).toBe(0);
    expect(DAILY_AI_LIMITS.pro.image_ai).toBeGreaterThan(0);
  });

  it("would be reachable for text_ai, which nothing renders it with", () => {
    /* The paired positive: the gate is satisfiable in principle, so the
       result above is a fact about the limits table and not about a
       condition that could never hold for any input. */
    expect(captionRenders(false, "text_ai")).toBe(true);
    expect(DAILY_AI_LIMITS.free.text_ai).toBeGreaterThan(0);
  });
});

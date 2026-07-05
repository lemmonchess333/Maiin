/**
 * Pro pricing — config contract tests.
 *
 * Pins the source-of-truth invariants the paywall flow depends on:
 *   - Both plan ids ("monthly" and "yearly") exist
 *   - Exactly one plan is marked recommended (DEFAULT_PLAN tracks it)
 *   - The recommended plan carries a topBadge so the marketing card
 *     ribbon renders
 *   - getCheckoutCtaLabel returns the "Start Pro — £X/<period>"
 *     shape both ProModal and Upgrade.tsx rely on
 *   - Yearly billing disclosure says "annually" (App Store
 *     Guideline 3.1.2(c) requires accurate auto-renew copy)
 */
import { describe, it, expect } from "vitest";
import {
  PRO_PLANS,
  DEFAULT_PLAN,
  getPlan,
  getCheckoutCtaLabel,
  getRenewalDisclosure,
  getInlinePriceSummary,
  type PlanId,
  weeklyPriceLabel,
} from "../proPlans";

describe("PRO_PLANS — shape", () => {
  it("has exactly two plans (monthly + yearly)", () => {
    expect(PRO_PLANS).toHaveLength(2);
    const ids = PRO_PLANS.map((p) => p.id).sort();
    expect(ids).toEqual(["monthly", "yearly"]);
  });

  it("exactly one plan is recommended", () => {
    const recommended = PRO_PLANS.filter((p) => p.recommended);
    expect(recommended).toHaveLength(1);
  });

  it("DEFAULT_PLAN matches the recommended plan", () => {
    const recommended = PRO_PLANS.find((p) => p.recommended);
    expect(DEFAULT_PLAN).toBe(recommended?.id);
  });

  it("recommended plan has a topBadge (ribbon copy)", () => {
    const recommended = PRO_PLANS.find((p) => p.recommended);
    expect(recommended?.topBadge).toBeTruthy();
  });

  it("recommended plan has a savingsLabel", () => {
    const recommended = PRO_PLANS.find((p) => p.recommended);
    expect(recommended?.savingsLabel).toBeTruthy();
  });
});

describe("getPlan", () => {
  it("returns the matching plan", () => {
    expect(getPlan("monthly").id).toBe("monthly");
    expect(getPlan("yearly").id).toBe("yearly");
  });

  it("throws on unknown plan", () => {
    expect(() => getPlan("annual" as PlanId)).toThrow();
  });
});

describe("getCheckoutCtaLabel", () => {
  it("formats as 'Start Pro — <price>/<short-period>'", () => {
    expect(getCheckoutCtaLabel("monthly")).toBe("Start Pro — £3.99/mo");
    expect(getCheckoutCtaLabel("yearly")).toBe("Start Pro — £34.99/yr");
  });
});

describe("getRenewalDisclosure", () => {
  it("uses 'monthly' for the monthly plan (web default)", () => {
    expect(getRenewalDisclosure("monthly")).toContain("monthly");
  });

  it("uses 'annually' for the yearly plan (web default)", () => {
    expect(getRenewalDisclosure("yearly")).toContain("annually");
  });

  it("includes 'Cancel anytime' on web (paywall trust copy)", () => {
    expect(getRenewalDisclosure("monthly", "web")).toContain("Cancel anytime");
    expect(getRenewalDisclosure("yearly", "web")).toContain("Cancel anytime");
  });

  it("iOS variant uses Apple ID subscriptions wording", () => {
    const ios = getRenewalDisclosure("yearly", "ios");
    expect(ios).toContain("Apple ID");
    expect(ios).toContain("Auto-renews annually");
  });

  it("android falls through to the web disclosure shape", () => {
    expect(getRenewalDisclosure("monthly", "android")).toContain(
      "Cancel anytime"
    );
  });
});

describe("getInlinePriceSummary", () => {
  it("returns 'monthly or yearly' shape pulled from PRO_PLANS", () => {
    const summary = getInlinePriceSummary();
    expect(summary).toContain("£3.99/month");
    expect(summary).toContain("£34.99/year");
    expect(summary).toContain(" or ");
  });
});

/* Weekly-price anchoring — derived from priceValue so the per-week copy can
 * never drift from the display price; pins the exact strings the paywall
 * shows and that yearly reads cheaper per week than monthly. */
describe("weeklyPriceLabel", () => {
  it("expresses both plans per week", () => {
    expect(weeklyPriceLabel("monthly")).toBe("\u2248 \u00a30.92/wk");
    expect(weeklyPriceLabel("yearly")).toBe("\u2248 \u00a30.67/wk");
  });

  it("yearly per-week undercuts monthly per-week (the anchoring point)", () => {
    const num = (s: string) => Number(s.replace(/[^0-9.]/g, ""));
    expect(num(weeklyPriceLabel("yearly"))).toBeLessThan(
      num(weeklyPriceLabel("monthly"))
    );
  });
});

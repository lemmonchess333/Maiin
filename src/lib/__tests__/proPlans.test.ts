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

/**
 * The two hand-written derivations the module says cannot drift.
 *
 * `priceValue` is documented as the reason "the maths can never drift from
 * the display string", and `weeklyPriceLabel` as "Derived from priceValue so
 * it can never drift from the display price". Both are true only while the
 * number and the STRING agree — and they are two hand-written fields on the
 * same object literal, bound by nothing. Edit `price` to "£4.99" and forget
 * `priceValue` and every existing test here still passes, while the paywall
 * shows £4.99 and anchors it at "≈ £0.92/wk".
 *
 * `savingsLabel` is the third copy of the same two numbers, and the one most
 * likely to be left behind: it reads as marketing copy rather than as a
 * derived figure.
 *
 * These are display-side only — the amount actually charged comes from the
 * Stripe price / Apple product id in `purchaseProvider.ts`, which this
 * module's header already flags as an operator sync step and no test can
 * reach. That makes the display side MORE worth pinning, not less: it is the
 * half a wrong number shows up on first.
 */
describe("PRO_PLANS — the derived copy cannot drift from the price", () => {
  /** The number a user reads on the card. */
  function displayedNumber(price: string): number {
    const m = price.match(/([\d.]+)/);
    expect(m, `no number in price string "${price}"`).toBeTruthy();
    return Number(m![1]);
  }

  it("every plan's price STRING and priceValue are the same number", () => {
    for (const plan of PRO_PLANS) {
      expect(
        displayedNumber(plan.price),
        `${plan.id}: card shows ${plan.price} but priceValue is ${plan.priceValue}`
      ).toBe(plan.priceValue);
    }
  });

  it("every price string carries the £ the copy assumes", () => {
    // getCheckoutCtaLabel and getInlinePriceSummary interpolate `price`
    // raw — a bare "3.99" would render "Start Pro — 3.99/mo".
    for (const plan of PRO_PLANS) {
      expect(plan.price.startsWith("£"), `${plan.id}: ${plan.price}`).toBe(true);
    }
  });

  it("periodsPerYear agrees with the billing frequency", () => {
    // weeklyPriceLabel multiplies by this; a yearly plan with 12 would
    // anchor the annual price twelve times too high.
    for (const plan of PRO_PLANS) {
      expect(plan.periodsPerYear).toBe(
        plan.billingFrequency === "monthly" ? 12 : 1
      );
    }
  });

  it("the savings label matches what the two prices actually save", () => {
    const monthly = getPlan("monthly");
    const yearly = getPlan("yearly");
    /* Computed from the DISPLAYED numbers, not from `priceValue`. A
       mutation run showed why: raising the monthly price string while
       leaving `priceValue` behind made the label wrong against what the
       user reads (£4.99×12 vs £34.99 is 42%, not 27%) while a
       priceValue-based check stayed happily green — it would have been
       consistent with the stale field rather than with the card. */
    const monthlyShown = displayedNumber(monthly.price);
    const yearlyShown = displayedNumber(yearly.price);
    const fullYear = monthlyShown * monthly.periodsPerYear;
    const actual = Math.round(((fullYear - yearlyShown) / fullYear) * 100);
    const claimed = Number(yearly.savingsLabel?.match(/(\d+)/)?.[1]);
    expect(
      claimed,
      `label says "${yearly.savingsLabel}" but £${monthlyShown}×${monthly.periodsPerYear} vs £${yearlyShown} is ${actual}%`
    ).toBe(actual);
  });

  it("the weekly anchor is computed from the displayed price", () => {
    // Closes the loop: the label a user compares plans on is tied to the
    // number on the card, not to a second field that may have moved.
    for (const plan of PRO_PLANS) {
      const perWeek = (displayedNumber(plan.price) * plan.periodsPerYear) / 52;
      expect(weeklyPriceLabel(plan.id)).toBe(`≈ £${perWeek.toFixed(2)}/wk`);
    }
  });
});

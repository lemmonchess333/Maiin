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
 *   - The renewal disclosure says what is charged, after the trial when
 *     there is one, and that it renews (App Store Guideline 3.1.2(c)),
 *     in Apple's current name for the account ("Apple Account")
 *   - Every figure is in the currency of the plan it is worked out from:
 *     on the App Store build that is the storefront's, never pounds
 */
import { describe, it, expect } from "vitest";
import {
  PRO_PLANS,
  DEFAULT_PLAN,
  TRIAL_DAYS,
  findPlan,
  getBilledPriceLine,
  getCheckoutCtaLabel,
  getRenewalDisclosure,
  getRenewalTerms,
  getInlinePriceSummary,
  localizePlans,
  yearlySavingPercent,
  type PlanId,
  type ProPlan,
  type StorePrice,
  weeklyPriceLabel,
} from "../proPlans";

/** An amount written the way this runtime writes `currency` — the store
 *  prices' figures follow the viewer's locale, like the app's other
 *  numbers (see src/test/localeGrouping.ts), so the expected string is
 *  built from the runtime rather than spelled for one locale. */
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    amount
  );

/** A pound plan by id, as the web shows it. */
const getPlan = (id: PlanId) => findPlan(PRO_PLANS, id);

const US_STOREFRONT: Record<PlanId, StorePrice> = {
  monthly: { priceString: "$4.99", price: 4.99, currencyCode: "USD" },
  yearly: { priceString: "$39.99", price: 39.99, currencyCode: "USD" },
};

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

  it("the pound plans say they are pounds, written en-GB", () => {
    for (const plan of PRO_PLANS) {
      expect(plan.currencyCode).toBe("GBP");
      expect(plan.priceLocale).toBe("en-GB");
    }
  });
});

describe("findPlan", () => {
  it("returns the matching plan", () => {
    expect(findPlan(PRO_PLANS, "monthly").id).toBe("monthly");
    expect(findPlan(PRO_PLANS, "yearly")).toBe(PRO_PLANS[1]);
  });

  it("throws on unknown plan", () => {
    expect(() => findPlan(PRO_PLANS, "annual" as PlanId)).toThrow();
  });

  it("finds a plan in the list it is given, not in the pound list", () => {
    const plans = localizePlans(US_STOREFRONT);
    expect(findPlan(plans, "yearly").price).toBe("$39.99");
  });
});

describe("getCheckoutCtaLabel", () => {
  it("formats as 'Start Pro — <price>/<short-period>'", () => {
    expect(getCheckoutCtaLabel(getPlan("monthly"))).toBe(
      "Start Pro — £3.99/mo"
    );
    expect(getCheckoutCtaLabel(getPlan("yearly"))).toBe(
      "Start Pro — £34.99/yr"
    );
  });

  it("is priced from the plan it is handed (the App Store's price on iOS)", () => {
    const plans = localizePlans(US_STOREFRONT);
    expect(getCheckoutCtaLabel(findPlan(plans, "yearly"))).toBe(
      "Start Pro — $39.99/yr"
    );
  });

  it("the trial CTA names the trial's length", () => {
    expect(getCheckoutCtaLabel(getPlan("yearly"), true)).toBe(
      `Start your ${TRIAL_DAYS}-day free trial`
    );
    expect(TRIAL_DAYS).toBe(7);
  });
});

describe("getBilledPriceLine — what is billed, and from when", () => {
  it("with the trial, the trial and the price in one line", () => {
    expect(getBilledPriceLine(getPlan("yearly"), true)).toBe(
      "7 days free, then £34.99 a year"
    );
    expect(getBilledPriceLine(getPlan("monthly"), true)).toBe(
      "7 days free, then £3.99 a month"
    );
  });

  it("without the trial, the price and its period", () => {
    expect(getBilledPriceLine(getPlan("yearly"), false)).toBe("£34.99 a year");
    expect(getBilledPriceLine(getPlan("monthly"), false)).toBe("£3.99 a month");
  });
});

describe("getRenewalDisclosure", () => {
  it("iOS with the trial: what is charged after it, that it renews, where to cancel", () => {
    expect(
      getRenewalDisclosure(getPlan("yearly"), {
        platform: "ios",
        withTrial: true,
      })
    ).toBe(
      "7 days free, then £34.99 a year. Renews automatically until cancelled. Manage or cancel in your Apple Account subscriptions."
    );
  });

  it("iOS without the trial: the price, then the same renewal sentence", () => {
    expect(getRenewalDisclosure(getPlan("monthly"), { platform: "ios" })).toBe(
      "£3.99 a month. Renews automatically until cancelled. Manage or cancel in your Apple Account subscriptions."
    );
  });

  it("names the selected plan's period, so it flips with the selection", () => {
    expect(getRenewalDisclosure(getPlan("yearly"))).toContain("£34.99 a year");
    expect(getRenewalDisclosure(getPlan("monthly"))).toContain("£3.99 a month");
  });

  it("web: renews until cancelled, and can be cancelled any time", () => {
    expect(getRenewalDisclosure(getPlan("monthly"), { platform: "web" })).toBe(
      "£3.99 a month. Renews automatically until cancelled. Cancel any time."
    );
  });

  it("android falls through to the web wording", () => {
    expect(getRenewalTerms("android")).toBe(getRenewalTerms("web"));
  });

  it("says Apple Account, Apple's current name, never Apple ID", () => {
    const ios = getRenewalTerms("ios");
    expect(ios).toContain("Apple Account");
    expect(ios).not.toMatch(/Apple ID/);
  });
});

describe("getInlinePriceSummary", () => {
  it("both plans, from the list it is given", () => {
    expect(getInlinePriceSummary(PRO_PLANS)).toBe(
      "£3.99 a month or £34.99 a year"
    );
    expect(getInlinePriceSummary(localizePlans(US_STOREFRONT))).toBe(
      "$4.99 a month or $39.99 a year"
    );
  });
});

/* Weekly-price anchoring — derived from priceValue so the per-week copy can
 * never drift from the display price; pins the exact strings the paywall
 * shows and that yearly reads cheaper per week than monthly. */
describe("weeklyPriceLabel", () => {
  it("expresses both plans per week", () => {
    expect(weeklyPriceLabel(getPlan("monthly"))).toBe("≈ £0.92/wk");
    expect(weeklyPriceLabel(getPlan("yearly"))).toBe("≈ £0.67/wk");
  });

  it("yearly per-week undercuts monthly per-week (the anchoring point)", () => {
    const perWeek = (plan: ProPlan) =>
      (plan.priceValue * plan.periodsPerYear) / 52;
    expect(perWeek(getPlan("yearly"))).toBeLessThan(
      perWeek(getPlan("monthly"))
    );
  });

  it("is written in the plan's own currency", () => {
    const plans = localizePlans(US_STOREFRONT);
    expect(weeklyPriceLabel(findPlan(plans, "yearly"))).toBe(
      `≈ ${money(39.99 / 52, "USD")}/wk`
    );
    expect(weeklyPriceLabel(findPlan(plans, "monthly"))).toBe(
      `≈ ${money((4.99 * 12) / 52, "USD")}/wk`
    );
  });

  it("is hidden (null), not guessed, when the currency cannot be written", () => {
    expect(
      weeklyPriceLabel({ ...getPlan("yearly"), currencyCode: "" })
    ).toBeNull();
    expect(
      weeklyPriceLabel({ ...getPlan("yearly"), priceValue: Number.NaN })
    ).toBeNull();
  });
});

describe("localizePlans — the App Store's prices, in one currency", () => {
  it("takes Apple's string, number and currency for every plan", () => {
    const plans = localizePlans(US_STOREFRONT);
    expect(plans.map((p) => p.price)).toEqual(["$4.99", "$39.99"]);
    expect(plans.map((p) => p.priceValue)).toEqual([4.99, 39.99]);
    expect(plans.every((p) => p.currencyCode === "USD")).toBe(true);
    // Written the viewer's way, as Apple's own string is.
    expect(plans.every((p) => p.priceLocale === undefined)).toBe(true);
    // Everything that is not a price stays as authored.
    expect(plans.map((p) => p.id)).toEqual(PRO_PLANS.map((p) => p.id));
    expect(findPlan(plans, "yearly").recommended).toBe(true);
    expect(findPlan(plans, "yearly").topBadge).toBe("Most popular");
  });

  it("works the saving out from the store's own prices", () => {
    // $4.99 × 12 = $59.88 against $39.99: 33%, not the pound plans' 27%.
    const plans = localizePlans(US_STOREFRONT);
    expect(yearlySavingPercent(plans)).toBe(33);
    expect(findPlan(plans, "yearly").savingsLabel).toBe("Save 33%");
    expect(findPlan(plans, "monthly").savingsLabel).toBeUndefined();
  });

  it("claims no saving when the store's yearly price saves nothing", () => {
    const plans = localizePlans({
      monthly: { priceString: "€3.00", price: 3, currencyCode: "EUR" },
      yearly: { priceString: "€36.00", price: 36, currencyCode: "EUR" },
    });
    expect(findPlan(plans, "yearly").price).toBe("€36.00");
    expect(yearlySavingPercent(plans)).toBeNull();
    expect(findPlan(plans, "yearly").savingsLabel).toBeUndefined();
  });

  it("all or nothing: one plan missing from the store keeps both in pounds", () => {
    const plans = localizePlans({ yearly: US_STOREFRONT.yearly });
    expect(plans).toBe(PRO_PLANS);
    expect(plans.every((p) => p.price.startsWith("£"))).toBe(true);
  });

  it("all or nothing: two currencies, or an unusable price, keep the pounds", () => {
    expect(
      localizePlans({
        monthly: US_STOREFRONT.monthly,
        yearly: { priceString: "€39.99", price: 39.99, currencyCode: "EUR" },
      })
    ).toBe(PRO_PLANS);
    expect(
      localizePlans({
        ...US_STOREFRONT,
        monthly: { priceString: "$4.99", price: 0, currencyCode: "USD" },
      })
    ).toBe(PRO_PLANS);
    expect(
      localizePlans({
        ...US_STOREFRONT,
        monthly: { priceString: "", price: 4.99, currencyCode: "USD" },
      })
    ).toBe(PRO_PLANS);
    expect(
      localizePlans({
        ...US_STOREFRONT,
        yearly: { priceString: "$39.99", price: 39.99, currencyCode: "usd" },
      })
    ).toBe(PRO_PLANS);
  });

  it("no helper prints a pound figure for a storefront that is not in pounds", () => {
    const plans = localizePlans(US_STOREFRONT);
    const printed = [
      getInlinePriceSummary(plans),
      ...plans.flatMap((plan) => [
        plan.price,
        plan.savingsLabel ?? "",
        weeklyPriceLabel(plan) ?? "",
        getCheckoutCtaLabel(plan),
        getBilledPriceLine(plan, true),
        getRenewalDisclosure(plan, { platform: "ios", withTrial: true }),
        getRenewalDisclosure(plan, { platform: "ios" }),
      ]),
    ];
    // Anchor: the figures are really there, in dollars.
    expect(printed.join(" ")).toContain("$39.99");
    expect(printed.filter((s) => s.includes("$")).length).toBeGreaterThan(10);
    expect(printed.join(" ")).not.toContain("£");
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
 * derived figure. (On the App Store build it is recomputed from the store's
 * prices by `localizePlans`; the pound plans keep it authored, pinned here.)
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
      expect(plan.price.startsWith("£"), `${plan.id}: ${plan.price}`).toBe(
        true
      );
    }
  });

  it("periodsPerYear and periodPhrase agree with the billing frequency", () => {
    // weeklyPriceLabel multiplies by periodsPerYear; a yearly plan with 12
    // would anchor the annual price twelve times too high. periodPhrase is
    // the disclosure's "£34.99 a year".
    for (const plan of PRO_PLANS) {
      const monthly = plan.billingFrequency === "monthly";
      expect(plan.periodsPerYear).toBe(monthly ? 12 : 1);
      expect(plan.periodPhrase).toBe(monthly ? "a month" : "a year");
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
    // And the function the App Store prices go through agrees with it.
    expect(yearlySavingPercent(PRO_PLANS)).toBe(actual);
  });

  it("the weekly anchor is computed from the displayed price", () => {
    // Closes the loop: the label a user compares plans on is tied to the
    // number on the card, not to a second field that may have moved.
    for (const plan of PRO_PLANS) {
      const perWeek = (displayedNumber(plan.price) * plan.periodsPerYear) / 52;
      expect(weeklyPriceLabel(plan)).toBe(`≈ £${perWeek.toFixed(2)}/wk`);
    }
  });
});

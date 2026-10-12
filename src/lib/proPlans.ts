/**
 * Pro pricing — single source of truth.
 *
 * Pre-recovery the price/period/badge metadata was duplicated across
 * `src/pages/Upgrade.tsx` (the marketing page),
 * `src/components/ProModal.tsx` (the bottom-sheet checkout), and
 * `src/lib/subscription.ts` (the `pricing` object). Either surface
 * drifting from the other risked showing one price and checking the
 * user out at another. This module is the single display-side
 * source of truth — price IDs for the actual checkout call live in
 * `src/lib/purchaseProvider.ts` (Stripe env vars / Apple IAP product
 * IDs), which are payment-platform identifiers and stay there.
 *
 * `PlanId` lives here too so `purchaseProvider.ts` imports it rather
 * than redefining the same string-literal union.
 *
 * Surfaces using this config:
 *   - src/pages/Upgrade.tsx                (full pricing page)
 *   - src/components/ProModal.tsx          (gated-feature paywall)
 *   - src/hooks/useProCheckout.ts          (shared checkout hook)
 *   - src/hooks/useProPlanPrices.ts        (App Store prices on iOS)
 *
 * Every helper that prints money takes the PLAN, not its id. On the
 * RevenueCat build the plans carry the App Store's own price, in the
 * storefront's currency (`localizePlans`); a helper that looked the id up
 * in `PRO_PLANS` would print pounds beside a dollar price.
 *
 * If you change a price here, update the matching Stripe price /
 * Apple IAP product to match. App Store Connect renders the
 * subscription metadata it has on file on the confirm sheet — those
 * have to agree with these strings.
 */

export type PlanId = "monthly" | "yearly";

/**
 * The free trial's length in days, everywhere the paywall names it. Stripe's
 * `trial_period_days` and the App Store introductory offer are set to the
 * same 7 (Sub1a); this constant is the copy's half of that agreement.
 */
export const TRIAL_DAYS = 7;

export interface ProPlan {
  id: PlanId;
  /** Display label on the plan card (e.g. "Monthly"). */
  label: string;
  /** Display price including its currency symbol: "£3.99" as authored
   *  here, or the App Store's own string on the RevenueCat build. */
  price: string;
  /** The same price as a number, in `currencyCode` — drives derived copy
   *  (weekly anchoring, the saving) so the maths can never drift from the
   *  display string or change currency under it. */
  priceValue: number;
  /** ISO 4217 code of `price` and `priceValue`. */
  currencyCode: string;
  /** The locale `price` is written in, so a figure worked out from it is
   *  formatted the same way: en-GB for the pound prices authored here,
   *  undefined (the device's) for App Store prices. */
  priceLocale?: string;
  /** Billing periods per year (12 monthly / 1 yearly) for derived copy. */
  periodsPerYear: number;
  /** Long period suffix for the plan card (e.g. "/month"). */
  period: string;
  /** The period in a sentence: "£34.99 a year". */
  periodPhrase: "a month" | "a year";
  /** Short period suffix for the CTA copy (e.g. "mo" / "yr"). */
  shortPeriod: string;
  /** "Billed monthly" under the plan card's label. */
  billingFrequency: "monthly" | "annually";
  /** Small saving callout shown next to the label (e.g. "Save 27%"). */
  savingsLabel?: string;
  /** Ribbon-style badge on the recommended card (e.g. "Most popular"). */
  topBadge?: string;
  /** Marks the default-selected plan. Exactly one entry should be true. */
  recommended?: boolean;
}

/**
 * The pound prices. What the web shows (RevenueCat runs only in the iOS
 * shell), and what the iOS paywall shows until the App Store's prices
 * arrive, or if they never do.
 */
export const PRO_PLANS: ProPlan[] = [
  {
    id: "monthly",
    label: "Monthly",
    price: "£3.99",
    priceValue: 3.99,
    currencyCode: "GBP",
    priceLocale: "en-GB",
    periodsPerYear: 12,
    period: "/month",
    periodPhrase: "a month",
    shortPeriod: "mo",
    billingFrequency: "monthly",
  },
  {
    id: "yearly",
    label: "Yearly",
    price: "£34.99",
    priceValue: 34.99,
    currencyCode: "GBP",
    priceLocale: "en-GB",
    periodsPerYear: 1,
    period: "/year",
    periodPhrase: "a year",
    shortPeriod: "yr",
    billingFrequency: "annually",
    savingsLabel: "Save 27%",
    topBadge: "Most popular",
    recommended: true,
  },
];

/** The plan with this id in a list of plans — the pound ones, or the
 *  App Store-priced ones `useProPlanPrices` returns. */
export function findPlan(plans: readonly ProPlan[], id: PlanId): ProPlan {
  const plan = plans.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Default-selected plan id. Derived from `recommended` so the
 *  default tracks the marketing call rather than a separate constant. */
export const DEFAULT_PLAN: PlanId =
  PRO_PLANS.find((p) => p.recommended)?.id ?? "yearly";

/**
 * One product's price as the App Store reports it (through RevenueCat): the
 * string Apple's purchase sheet shows, and the number and currency it was
 * formatted from.
 */
export interface StorePrice {
  priceString: string;
  price: number;
  currencyCode: string;
}

function isUsableStorePrice(p: StorePrice | undefined): p is StorePrice {
  return (
    !!p &&
    typeof p.priceString === "string" &&
    p.priceString.trim().length > 0 &&
    Number.isFinite(p.price) &&
    p.price > 0 &&
    /^[A-Z]{3}$/.test(p.currencyCode)
  );
}

/**
 * The plans priced by the App Store (IAP slice 3): Apple's string
 * for each product, with the number and currency behind it, so the weekly
 * anchor and the saving are worked out in the currency of the price they
 * sit beside, and the saving is what THESE two prices save — Apple's price
 * tiers do not keep one ratio across storefronts.
 *
 * All or nothing. Unless every plan has a usable store price, in one
 * currency, the pound plans stand as they are: pricing one plan from the
 * store and leaving the other in pounds would put a pound figure beside a
 * dollar one.
 */
export function localizePlans(
  storePrices: Partial<Record<PlanId, StorePrice>>
): ProPlan[] {
  const prices = PRO_PLANS.map((plan) => storePrices[plan.id]);
  if (!prices.every(isUsableStorePrice)) return PRO_PLANS;
  const currencies = new Set(prices.map((p) => p.currencyCode));
  if (currencies.size !== 1) return PRO_PLANS;

  const localized: ProPlan[] = PRO_PLANS.map((plan, i) => ({
    ...plan,
    price: prices[i].priceString,
    priceValue: prices[i].price,
    currencyCode: prices[i].currencyCode,
    priceLocale: undefined,
  }));
  const saving = yearlySavingPercent(localized);
  return localized.map((plan) =>
    plan.savingsLabel === undefined
      ? plan
      : {
          ...plan,
          savingsLabel: saving === null ? undefined : `Save ${saving}%`,
        }
  );
}

/**
 * What the yearly plan saves against twelve months of the monthly one, as a
 * whole percentage of the prices shown. Null when the two are in different
 * currencies or there is no saving to claim.
 */
export function yearlySavingPercent(plans: readonly ProPlan[]): number | null {
  const monthly = findPlan(plans, "monthly");
  const yearly = findPlan(plans, "yearly");
  if (monthly.currencyCode !== yearly.currencyCode) return null;
  const fullYear = monthly.priceValue * monthly.periodsPerYear;
  const yearlyCost = yearly.priceValue * yearly.periodsPerYear;
  if (!(fullYear > 0) || !Number.isFinite(yearlyCost)) return null;
  const percent = Math.round(((fullYear - yearlyCost) / fullYear) * 100);
  return percent > 0 ? percent : null;
}

/** CTA copy for the checkout button. With the trial, the Sub1a P1 trial
 *  CTA, which names no price: the price goes directly beneath it
 *  (`RenewalDisclosure`). Otherwise the plan-priced CTA, e.g.
 *  "Start Pro — £34.99/yr". */
export function getCheckoutCtaLabel(plan: ProPlan, withTrial = false): string {
  if (withTrial) return `Start your ${TRIAL_DAYS}-day free trial`;
  return `Start Pro — ${plan.price}/${plan.shortPeriod}`;
}

/**
 * What is billed, and from when: "7 days free, then £34.99 a year" with
 * the trial, "£34.99 a year" without. App Store Guideline 3.1.2 wants the
 * amount billed to be clear and at least as prominent as the free trial,
 * so wherever the trial is offered this line leads, the trial and the
 * price in one sentence at one weight.
 */
export function getBilledPriceLine(plan: ProPlan, withTrial: boolean): string {
  const billed = `${plan.price} ${plan.periodPhrase}`;
  return withTrial ? `${TRIAL_DAYS} days free, then ${billed}` : billed;
}

export type PaywallPlatform = "web" | "ios" | "android";

/**
 * That the subscription renews, and where to stop it. On iOS cancelling
 * goes through the person's Apple Account (Apple's name for what was the
 * Apple ID), not an in-app billing portal.
 */
export function getRenewalTerms(platform: PaywallPlatform = "web"): string {
  if (platform === "ios") {
    return "Renews automatically until cancelled. Manage or cancel in your Apple Account subscriptions.";
  }
  return "Renews automatically until cancelled. Cancel any time.";
}

/**
 * The disclosure beside every purchase button (App Store Guideline
 * 3.1.2(c)): what is charged, after the trial when there is one, then
 * that it renews and where to cancel. E.g. "7 days free, then £34.99 a
 * year. Renews automatically until cancelled. Manage or cancel in your
 * Apple Account subscriptions."
 */
export function getRenewalDisclosure(
  plan: ProPlan,
  {
    platform = "web",
    withTrial = false,
  }: { platform?: PaywallPlatform; withTrial?: boolean } = {}
): string {
  return `${getBilledPriceLine(plan, withTrial)}. ${getRenewalTerms(platform)}`;
}

/**
 * Short inline price summary for places with no room for a plan tile:
 * "£3.99 a month or £34.99 a year". Takes the plans the page is showing,
 * so on the App Store build it is in the storefront's currency.
 */
export function getInlinePriceSummary(plans: readonly ProPlan[]): string {
  const monthly = findPlan(plans, "monthly");
  const yearly = findPlan(plans, "yearly");
  return `${monthly.price} ${monthly.periodPhrase} or ${yearly.price} ${yearly.periodPhrase}`;
}

/** An amount in the plan's currency, written the way its price is. Null
 *  when the runtime cannot format that currency. */
function formatInPlanCurrency(plan: ProPlan, amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  try {
    return new Intl.NumberFormat(plan.priceLocale, {
      style: "currency",
      currency: plan.currencyCode,
    }).format(amount);
  } catch {
    return null;
  }
}

/**
 * Weekly-price anchoring (Runna-teardown paywall pattern, Sub3): the same
 * plan price expressed per week — "£34.99/year" reads big, "≈ £0.67/wk"
 * reads tiny, and showing BOTH plans per-week makes the annual saving
 * visceral. Worked out from the plan's own price and currency, so it can
 * never drift from the display price or show pounds beside a dollar price.
 * Null when it cannot be written in that currency; the card then shows no
 * weekly figure rather than a wrong one.
 *
 * Not RevenueCat's `pricePerWeekString`: that divides a monthly price by
 * four, which reads the monthly plan dearer per week than it is and
 * disagrees with the saving printed on the yearly card.
 */
export function weeklyPriceLabel(plan: ProPlan): string | null {
  const perWeek = (plan.priceValue * plan.periodsPerYear) / 52;
  const amount = formatInPlanCurrency(plan, perWeek);
  return amount === null ? null : `≈ ${amount}/wk`;
}

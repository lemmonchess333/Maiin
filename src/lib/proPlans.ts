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
 *
 * If you change a price here, update the matching Stripe price /
 * Apple IAP product to match. App Store Connect renders the
 * subscription metadata it has on file on the confirm sheet — those
 * have to agree with these strings.
 */

export type PlanId = "monthly" | "yearly";

export interface ProPlan {
  id: PlanId;
  /** Display label on the plan card (e.g. "Monthly"). */
  label: string;
  /** Display price including currency symbol (e.g. "£3.99"). */
  price: string;
  /** Numeric price in GBP — drives derived copy (weekly anchoring) so the
   *  maths can never drift from the display string. */
  priceValue: number;
  /** Billing periods per year (12 monthly / 1 yearly) for derived copy. */
  periodsPerYear: number;
  /** Long period suffix for the plan card (e.g. "/month"). */
  period: string;
  /** Short period suffix for the CTA copy (e.g. "mo" / "yr"). */
  shortPeriod: string;
  /** Wording for the auto-renew disclosure ("monthly" / "annually"). */
  billingFrequency: "monthly" | "annually";
  /** Small saving callout shown next to the label (e.g. "Save 27%"). */
  savingsLabel?: string;
  /** Ribbon-style badge on the recommended card (e.g. "Most popular"). */
  topBadge?: string;
  /** Marks the default-selected plan. Exactly one entry should be true. */
  recommended?: boolean;
}

export const PRO_PLANS: ProPlan[] = [
  {
    id: "monthly",
    label: "Monthly",
    price: "£3.99",
    priceValue: 3.99,
    periodsPerYear: 12,
    period: "/month",
    shortPeriod: "mo",
    billingFrequency: "monthly",
  },
  {
    id: "yearly",
    label: "Yearly",
    price: "£34.99",
    priceValue: 34.99,
    periodsPerYear: 1,
    period: "/year",
    shortPeriod: "yr",
    billingFrequency: "annually",
    savingsLabel: "Save 27%",
    topBadge: "Most popular",
    recommended: true,
  },
];

export function getPlan(id: PlanId): ProPlan {
  const plan = PRO_PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Default-selected plan id. Derived from `recommended` so the
 *  default tracks the marketing call rather than a separate constant. */
export const DEFAULT_PLAN: PlanId =
  PRO_PLANS.find((p) => p.recommended)?.id ?? "yearly";

/** CTA copy for the checkout button. When `withTrial` is true, returns
 *  the Sub1a P1 trial CTA (single string regardless of plan — the
 *  plan choice still flows through, just not surfaced in the label).
 *  Otherwise returns the plan-priced CTA — e.g. "Start Pro — £34.99/yr". */
export function getCheckoutCtaLabel(id: PlanId, withTrial = false): string {
  if (withTrial) return "Start your 7-day free trial";
  const plan = getPlan(id);
  return `Start Pro — ${plan.price}/${plan.shortPeriod}`;
}

/**
 * Disclosure copy below the CTA. Platform-aware:
 *
 *   - web / android (default): "Renews <freq>. Cancel anytime."
 *   - ios:                     "Auto-renews <freq>. Manage or cancel
 *                              in your Apple ID subscriptions."
 *
 * The iOS variant is closer to Apple's expected App Review wording
 * because cancellation flows through Apple ID settings rather than
 * an in-app billing portal. App Store Guideline 3.1.2(c) requires
 * accurate auto-renew copy.
 */
export function getRenewalDisclosure(
  id: PlanId,
  platform: "web" | "ios" | "android" = "web"
): string {
  const plan = getPlan(id);
  if (platform === "ios") {
    return `Auto-renews ${plan.billingFrequency}. Manage or cancel in your Apple ID subscriptions.`;
  }
  return `Renews ${plan.billingFrequency}. Cancel anytime.`;
}

/**
 * Short inline price summary used on locked-Pro cards that don't
 * have room for a full plan tile. Renders as
 * "£3.99/month or £34.99/year". Pulls from PRO_PLANS so the locked
 * copy can't drift from the actual checkout prices.
 */
export function getInlinePriceSummary(): string {
  const monthly = getPlan("monthly");
  const yearly = getPlan("yearly");
  return `${monthly.price}${monthly.period} or ${yearly.price}${yearly.period}`;
}

/**
 * Weekly-price anchoring (Runna-teardown paywall pattern): the same plan
 * price expressed per week — "£34.99/year" reads big, "≈ £0.67/wk" reads
 * tiny, and showing BOTH plans per-week makes the annual saving visceral.
 * Derived from priceValue so it can never drift from the display price.
 */
export function weeklyPriceLabel(id: PlanId): string {
  const plan = getPlan(id);
  const perWeek = (plan.priceValue * plan.periodsPerYear) / 52;
  return `≈ £${perWeek.toFixed(2)}/wk`;
}

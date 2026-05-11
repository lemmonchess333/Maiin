/**
 * Pro pricing — single source of truth.
 *
 * Pre-recovery the price/period/badge metadata was duplicated across
 * `src/pages/Upgrade.tsx` (the marketing page) and
 * `src/components/ProModal.tsx` (the bottom-sheet checkout). Either
 * surface drifting from the other risked showing one price and
 * checking the user out at another. This module centralises the
 * display side; price IDs for the actual checkout call live in
 * `src/lib/purchaseProvider.ts` (Stripe env vars / Apple IAP product
 * IDs) — those are payment-platform identifiers and stay there.
 *
 * Surfaces using this config:
 *   - src/pages/Upgrade.tsx                (marketing page)
 *   - src/components/ProModal.tsx          (gated-feature paywall)
 *
 * If you change a price here, update the matching Stripe price /
 * Apple IAP product to match. The Pro tier audit pass also pings
 * App Store Connect because the IAP product subscription metadata
 * is what the App Store renders on the purchase confirmation sheet —
 * those have to agree with these strings.
 */

export type PlanId = "monthly" | "yearly";

export interface ProPlan {
  id: PlanId;
  /** Display label on the plan card (e.g. "Monthly"). */
  label: string;
  /** Display price including currency symbol (e.g. "£3.99"). */
  price: string;
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
    period: "/month",
    shortPeriod: "mo",
    billingFrequency: "monthly",
  },
  {
    id: "yearly",
    label: "Yearly",
    price: "£34.99",
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

/** CTA copy for the checkout button — e.g. "Start Pro — £34.99/yr". */
export function getCheckoutCtaLabel(id: PlanId): string {
  const plan = getPlan(id);
  return `Start Pro — ${plan.price}/${plan.shortPeriod}`;
}

/** Disclosure copy ("Renews monthly..." / "Renews annually..."). */
export function getRenewalDisclosure(id: PlanId): string {
  const plan = getPlan(id);
  return `Renews ${plan.billingFrequency}. Cancel anytime.`;
}

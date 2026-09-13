import { getPlan, type PlanId } from "@/lib/proPlans";
import { formatDayMonth } from "@/utils/formatters";
import type { SubscriptionInfo } from "@/lib/subscription";

/**
 * What the account is on, in one line — shared by every surface that
 * states it (Settings → Subscription's plan row, the offer page's
 * member card), so a billed trial cannot read "then £3.99/mo unless you
 * cancel" on one screen and "Subscribe anytime" on another.
 *
 * The lines, in the terms the user will recognise from the store's own
 * sheet:
 *
 *   - billed trial     "Free trial" · "Ends 20 Sept, then £3.99/mo unless
 *                      you cancel" — the subscription is live and converts,
 *                      so the action MANAGES it, never sells one;
 *   - billed trial,    "Ends 20 Sept · won't renew" — auto-renew is off,
 *     cancelled        access runs to the date and stops; the action is
 *                      Resubscribe (the store page is where it turns back
 *                      on). Never "unless you cancel" to someone who has;
 *   - Pro              "Renews 20 Oct" (or "Ends 20 Oct · won't renew");
 *   - legacy free week "Pro trial" · "N days left" — nothing to bill, the
 *                      action is the offer;
 *   - free             "Upgrade to Pro" · "Free plan" — the offer.
 *
 * Price comes from the plan the profile's product id names; when that is
 * unknown (a dev override, a Stripe row before the product is mirrored)
 * the line ends at the date rather than guessing a price.
 */
export type PlanAction = "manage" | "resubscribe" | "offer";

export type PlanState = "billed_trial" | "pro" | "onboarding_trial" | "free";

export interface PlanStatus {
  state: PlanState;
  title: string;
  detail: string;
  action: PlanAction;
  /** True once the user has turned auto-renew off on a live subscription. */
  cancelled: boolean;
}

export interface PlanStatusInput extends Pick<
  SubscriptionInfo,
  | "tier"
  | "isInTrial"
  | "trialKind"
  | "trialEndsAt"
  | "trialDaysLeft"
  | "autoRenew"
> {
  /** profile.subscriptionExpiresAt — when Pro renews or ends. */
  renewsAt: string | null | undefined;
  /** The plan the profile's product id names, or null when unknown. */
  planId: PlanId | null;
}

/** "then £3.99/mo" for a known plan, or nothing. */
function priceTail(planId: PlanId | null): string {
  if (!planId) return "";
  const plan = getPlan(planId);
  return `, then ${plan.price}/${plan.shortPeriod}`;
}

function dateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatDayMonth(d);
}

function daysLeft(n: number): string {
  return `${n} day${n !== 1 ? "s" : ""} left`;
}

export function describePlanStatus(input: PlanStatusInput): PlanStatus {
  const cancelled = input.autoRenew === false;
  const trialEnd = dateOf(input.trialEndsAt);
  const renews = dateOf(input.renewsAt);

  if (input.tier === "pro" && input.trialKind === "billed") {
    if (cancelled) {
      return {
        state: "billed_trial",
        title: "Free trial",
        detail: `${trialEnd ? `Ends ${trialEnd}` : daysLeft(input.trialDaysLeft)} · won't renew`,
        action: "resubscribe",
        cancelled,
      };
    }
    return {
      state: "billed_trial",
      title: "Free trial",
      detail: trialEnd
        ? `Ends ${trialEnd}${priceTail(input.planId)} unless you cancel`
        : `${daysLeft(input.trialDaysLeft)}${priceTail(input.planId)}`,
      action: "manage",
      cancelled,
    };
  }
  if (input.tier === "pro") {
    if (cancelled) {
      return {
        state: "pro",
        title: "Pro",
        detail: renews ? `Ends ${renews} · won't renew` : "Won't renew",
        action: "resubscribe",
        cancelled,
      };
    }
    return {
      state: "pro",
      title: "Pro",
      detail: renews ? `Renews ${renews}` : "Full access",
      action: "manage",
      cancelled,
    };
  }
  if (input.isInTrial) {
    return {
      state: "onboarding_trial",
      title: "Pro trial",
      detail: daysLeft(input.trialDaysLeft),
      action: "offer",
      cancelled: false,
    };
  }
  return {
    state: "free",
    title: "Upgrade to Pro",
    detail: "Free plan",
    action: "offer",
    cancelled: false,
  };
}

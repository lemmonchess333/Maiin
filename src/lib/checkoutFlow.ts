/**
 * Checkout, as one state (App1 Q20, 13 November 2026).
 *
 * A purchase came back as four flags (`success`, `cancelled`, `pending`,
 * `error`) and the paywall held three more (`loading`, `error`, `notice`).
 * Nothing stopped a purchase the store had from also reading as a failure,
 * which asks the person to pay again for something they have bought
 * (`docs/state-machines.md`), and the sign-in message could stand beside a
 * purchase's notice. Here a purchase comes to exactly one
 * `PurchaseOutcome`, the paywall is one `CheckoutState` moved only by
 * `checkoutTransition`, and the paywall draws what `checkoutView` says.
 *
 * The check that RevenueCat is this account before its sheet opens is in
 * `rcPurchase` (`revenuecat.ts`): a purchase it cannot bind to the account
 * comes back `failed`, and the sheet never opens.
 */
import type { PlanId } from "./proPlans";

/** Why a purchase the store has not refused is not Pro yet. Neither is a
 *  failure, and neither is helped by buying again. */
export type PurchasePending =
  /** The store is holding the payment for someone's yes: Ask to Buy, a
   *  bank's check. Nothing has been bought until it is given. */
  | "approval"
  /** The store took the purchase, and RevenueCat's answer carried no Pro:
   *  its servers are behind, or the product is not on the entitlement. */
  | "entitlement";

/** What one purchase came to: exactly one of these. A purchase the store
 *  has is `bought` or `pending`, never `failed`. */
export type PurchaseOutcome =
  /** The App Store sold it and RevenueCat says Pro is on. */
  | { kind: "bought" }
  /** The website's checkout has the window. */
  | { kind: "redirected"; url: string }
  /** The person closed the store's sheet: not a failure. */
  | { kind: "cancelled" }
  /** The store has not refused, and Pro is not on yet. */
  | { kind: "pending"; pending: PurchasePending }
  /** Nothing was bought. `message` is for the person; `detail` is the
   *  underlying text, for logs and telemetry, never shown. */
  | { kind: "failed"; message: string; detail?: string };

/** Where a paywall's checkout has got to. */
export type CheckoutState =
  /** Nothing under way and nothing to say. */
  | { kind: "idle" }
  /** Start was tapped with no one signed in. */
  | { kind: "signInNeeded" }
  /** A purchase is under way: the store's sheet, or the way to the
   *  website's checkout. */
  | { kind: "buying"; plan: PlanId }
  /** The store has the purchase and Pro is not on yet: said calmly. */
  | { kind: "waiting"; pending: PurchasePending }
  /** Nothing was bought, and the person is told why. */
  | { kind: "failed"; message: string };

export type CheckoutEvent =
  /** Start Pro was tapped. */
  | { type: "start"; plan: PlanId; signedIn: boolean }
  /** The purchase came back. */
  | { type: "settled"; outcome: PurchaseOutcome };

export const SIGN_IN_MESSAGE = "Sign in to start Pro.";

/** What a paywall says while the store has the purchase and Pro is not on.
 *  Each names what the person is waiting for, and neither asks them to buy
 *  again. */
const PENDING_MESSAGE: Record<PurchasePending, string> = {
  approval:
    "Your purchase is waiting for approval. Pro switches on once it’s approved.",
  entitlement:
    "The App Store has your purchase. Pro switches on once it’s confirmed. If it hasn’t in a few minutes, tap Restore.",
};

/**
 * The one way checkout moves. One purchase at a time: a start while one is
 * under way, and an answer when none is, return the same object, so a
 * caller can tell the event was ignored.
 */
export function checkoutTransition(
  state: CheckoutState,
  event: CheckoutEvent
): CheckoutState {
  if (event.type === "start") {
    if (state.kind === "buying") return state;
    return event.signedIn
      ? { kind: "buying", plan: event.plan }
      : { kind: "signInNeeded" };
  }
  if (state.kind !== "buying") return state;
  const { outcome } = event;
  switch (outcome.kind) {
    case "bought":
    case "redirected":
    case "cancelled":
      return { kind: "idle" };
    case "pending":
      return { kind: "waiting", pending: outcome.pending };
    case "failed":
      return { kind: "failed", message: outcome.message };
  }
}

/** What a paywall draws: its button's spinner, an alert, or a note. */
export interface CheckoutView {
  loading: boolean;
  error: string | null;
  notice: string | null;
}

export function checkoutView(state: CheckoutState): CheckoutView {
  switch (state.kind) {
    case "idle":
      return { loading: false, error: null, notice: null };
    case "signInNeeded":
      return { loading: false, error: SIGN_IN_MESSAGE, notice: null };
    case "buying":
      return { loading: true, error: null, notice: null };
    case "waiting":
      return {
        loading: false,
        error: null,
        notice: PENDING_MESSAGE[state.pending],
      };
    case "failed":
      return { loading: false, error: state.message, notice: null };
  }
}

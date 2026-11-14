/**
 * Checkout (App1 Q20): every event in every state, and the combination
 * `docs/state-machines.md` named, a purchase the store has reported as a
 * failure, shown unreachable.
 */
import { describe, expect, it } from "vitest";
import {
  SIGN_IN_MESSAGE,
  checkoutTransition,
  checkoutView,
  type CheckoutEvent,
  type CheckoutState,
  type PurchaseOutcome,
} from "../checkoutFlow";

const OUTCOMES: Record<string, PurchaseOutcome> = {
  bought: { kind: "bought" },
  redirected: { kind: "redirected", url: "https://pay.rev.cat/t/u1" },
  cancelled: { kind: "cancelled" },
  pendingApproval: { kind: "pending", pending: "approval" },
  pendingEntitlement: { kind: "pending", pending: "entitlement" },
  failed: { kind: "failed", message: "Card declined.", detail: "sdk text" },
};

const STATES: Record<string, CheckoutState> = {
  idle: { kind: "idle" },
  signInNeeded: { kind: "signInNeeded" },
  buying: { kind: "buying", plan: "yearly" },
  waiting: { kind: "waiting", pending: "entitlement" },
  failed: { kind: "failed", message: "Couldn’t start checkout. Try again." },
};

const EVENTS: Record<string, CheckoutEvent> = {
  start: { type: "start", plan: "monthly", signedIn: true },
  startSignedOut: { type: "start", plan: "monthly", signedIn: false },
  ...Object.fromEntries(
    Object.entries(OUTCOMES).map(([name, outcome]) => [
      `settled:${name}`,
      { type: "settled", outcome } as CheckoutEvent,
    ])
  ),
};

/** Where every event takes a state that is not buying. */
const NOT_BUYING: Record<string, CheckoutState | "same"> = {
  start: { kind: "buying", plan: "monthly" },
  startSignedOut: { kind: "signInNeeded" },
  "settled:bought": "same",
  "settled:redirected": "same",
  "settled:cancelled": "same",
  "settled:pendingApproval": "same",
  "settled:pendingEntitlement": "same",
  "settled:failed": "same",
};

const TABLE: Record<string, Record<string, CheckoutState | "same">> = {
  idle: NOT_BUYING,
  signInNeeded: NOT_BUYING,
  waiting: NOT_BUYING,
  failed: NOT_BUYING,
  buying: {
    start: "same",
    startSignedOut: "same",
    "settled:bought": { kind: "idle" },
    "settled:redirected": { kind: "idle" },
    "settled:cancelled": { kind: "idle" },
    "settled:pendingApproval": { kind: "waiting", pending: "approval" },
    "settled:pendingEntitlement": { kind: "waiting", pending: "entitlement" },
    "settled:failed": { kind: "failed", message: "Card declined." },
  },
};

const cases = Object.keys(STATES).flatMap((state) =>
  Object.keys(EVENTS).map((event) => ({ state, event }))
);

describe("checkoutTransition", () => {
  it.each(cases)("$event in $state", ({ state, event }) => {
    const from = STATES[state];
    const expected = TABLE[state][event];
    const next = checkoutTransition(from, EVENTS[event]);
    if (expected === "same") expect(next).toBe(from);
    else {
      expect(next).toEqual(expected);
      expect(next).not.toBe(from);
    }
  });

  it("covers every state kind and every outcome kind", () => {
    expect(new Set(Object.values(STATES).map((s) => s.kind))).toEqual(
      new Set(["idle", "signInNeeded", "buying", "waiting", "failed"])
    );
    expect(new Set(Object.values(OUTCOMES).map((o) => o.kind))).toEqual(
      new Set(["bought", "redirected", "cancelled", "pending", "failed"])
    );
  });
});

describe("checkoutView", () => {
  it.each([
    ["idle", { loading: false, error: null, notice: null }],
    ["signInNeeded", { loading: false, error: SIGN_IN_MESSAGE, notice: null }],
    ["buying", { loading: true, error: null, notice: null }],
    [
      "waiting",
      {
        loading: false,
        error: null,
        notice:
          "The App Store has your purchase. Pro switches on once it’s confirmed. If it hasn’t in a few minutes, tap Restore.",
      },
    ],
    [
      "failed",
      {
        loading: false,
        error: "Couldn’t start checkout. Try again.",
        notice: null,
      },
    ],
  ] as const)("draws %s", (state, expected) => {
    expect(checkoutView(STATES[state])).toEqual(expected);
  });

  it("says what an approval is waiting for", () => {
    expect(checkoutView({ kind: "waiting", pending: "approval" }).notice).toBe(
      "Your purchase is waiting for approval. Pro switches on once it’s approved."
    );
  });
});

/** Every state reachable from idle. */
function reachable(): CheckoutState[] {
  const seen = new Map<string, CheckoutState>();
  const queue: CheckoutState[] = [{ kind: "idle" }];
  while (queue.length > 0) {
    const state = queue.shift()!;
    const key = JSON.stringify(state);
    if (seen.has(key)) continue;
    seen.set(key, state);
    for (const event of Object.values(EVENTS))
      queue.push(checkoutTransition(state, event));
  }
  return [...seen.values()];
}

describe("the combinations that should not exist", () => {
  const all = reachable();

  it("reaches every kind of state from idle", () => {
    expect(new Set(all.map((s) => s.kind))).toEqual(
      new Set(["idle", "signInNeeded", "buying", "waiting", "failed"])
    );
  });

  it.each(all.map((state) => [JSON.stringify(state), state] as const))(
    "%s says one thing at a time",
    (_, state) => {
      const view = checkoutView(state);
      const said = [view.loading, !!view.error, !!view.notice].filter(Boolean);
      expect(said.length).toBeLessThanOrEqual(1);
    }
  );

  it.each(all.map((state) => [JSON.stringify(state), state] as const))(
    "from %s, a purchase the store has is never reported as failed",
    (_, from) => {
      const buying = checkoutTransition(from, {
        type: "start",
        plan: "yearly",
        signedIn: true,
      });
      for (const outcome of [
        OUTCOMES.bought,
        OUTCOMES.pendingApproval,
        OUTCOMES.pendingEntitlement,
      ]) {
        const next = checkoutTransition(buying, { type: "settled", outcome });
        expect(next.kind).not.toBe("failed");
        expect(checkoutView(next).error).toBeNull();
      }
    }
  );
});

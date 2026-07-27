/**
 * The client half of the push consent contract: the DEFAULT.
 *
 * This file used to table-test `mayTargetUser` — the sender gate — and every
 * one of those cases passed while proving nothing, because the senders are
 * Cloud Functions running their own hand-copied duplicate and nothing
 * imported the TS function. Those cases moved with the predicate to
 * `functions/__tests__/pushConsent.test.js`, which pins the copy that
 * actually decides whether a phone buzzes (ADR-0008).
 *
 * What legitimately remains client-side is the default the app WRITES.
 * `usePushSettings` seeds a user's settings doc from `DEFAULT_PUSH_CONSENT`,
 * so this constant determines whether a brand-new user is opted in or out.
 * Getting it wrong is a consent violation on the WRITE side, which no
 * server-side test of the read side would catch.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_PUSH_CONSENT } from "../pushConsent";

describe("DEFAULT_PUSH_CONSENT", () => {
  it("is opt-OUT by default — a new user is never cold-pushed", () => {
    // The global switch is the one that must default off. Flipping it true
    // would opt in every existing user who has never touched the toggle,
    // since an unwritten settings doc reads as the default.
    expect(DEFAULT_PUSH_CONSENT.enabled).toBe(false);
  });

  it("has every per-type flag ON, so opting in enables the standard set", () => {
    // Q6's model: one deliberate opt-in gets the normal notifications, which
    // the user then pares back — rather than opting in and still hearing
    // nothing until they find three more toggles.
    expect(DEFAULT_PUSH_CONSENT.streak).toBe(true);
    expect(DEFAULT_PUSH_CONSENT.recap).toBe(true);
    expect(DEFAULT_PUSH_CONSENT.badge).toBe(true);
  });
});

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
import { DEFAULT_PUSH_CONSENT, pushTurnedOn } from "../pushConsent";

describe("DEFAULT_PUSH_CONSENT", () => {
  it("is opt-OUT by default — a new user is never cold-pushed", () => {
    // The global switch is the one that must default off. Flipping it true
    // would opt in every existing user who has never touched the toggle,
    // since an unwritten settings doc reads as the default.
    expect(DEFAULT_PUSH_CONSENT.enabled).toBe(false);
  });

  it("keeps the existing standard set on", () => {
    // Q6's model: one deliberate opt-in gets the normal notifications, which
    // the user then pares back — rather than opting in and still hearing
    // nothing until they find three more toggles.
    expect(DEFAULT_PUSH_CONSENT.streak).toBe(true);
    expect(DEFAULT_PUSH_CONSENT.recap).toBe(true);
    expect(DEFAULT_PUSH_CONSENT.badge).toBe(true);
  });

  it("requires a separate opt-in for monthly challenge announcements", () => {
    expect(DEFAULT_PUSH_CONSENT.challenges).toBe(false);
    expect(DEFAULT_PUSH_CONSENT.challengeReminders).toBe(false);
  });
});

describe("pushTurnedOn — the app turning push on by itself (App1 Q26)", () => {
  it("turns on push and nothing the person did not ask for", () => {
    // A reminder push can carry was turned on: the push-only kinds stay as
    // they read while push was off, which is off.
    expect(pushTurnedOn()).toEqual({
      enabled: true,
      badge: false,
      challenges: false,
      challengeReminders: false,
    });
  });

  it("turns on the one push-only kind asked for", () => {
    expect(pushTurnedOn({ challenges: true })).toEqual({
      enabled: true,
      badge: false,
      challenges: true,
      challengeReminders: false,
    });
  });

  it("never writes the old streak or recap switches", () => {
    const written = pushTurnedOn({ badge: true });
    expect("streak" in written).toBe(false);
    expect("recap" in written).toBe(false);
  });
});

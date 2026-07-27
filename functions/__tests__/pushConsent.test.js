/**
 * The push consent gate — pinned on the copy that actually runs.
 *
 * These assertions existed before, in `src/lib/__tests__/pushConsent.test.ts`,
 * against the client `mayTargetUser`. That function had no callers: the three
 * senders (`streak`, `badge`, `recap`) all went through an inline copy in
 * `functions/index.js`. So the suite was green, thorough, and proved nothing
 * about whether anyone's phone buzzes.
 *
 * Moved here 2026-07-27 with the predicate. Same cases, now on the running
 * code — which is the entire point of ADR-0008.
 *
 * Both failure directions matter and they are not symmetric:
 *   - too permissive → we push to someone who opted out. That is a trust
 *     breach and, on iOS, a fast route to the user killing notifications
 *     wholesale.
 *   - too restrictive → a user who opted in goes silent, and nothing errors,
 *     so nobody finds out.
 */
import { describe, it, expect } from "vitest";
import { mayTargetUserConsent } from "../lib/pushConsent";

describe("mayTargetUserConsent — the senders' gate (#969)", () => {
  const on = { enabled: true, streak: true, recap: true, badge: true };

  it("blocks every type when the global switch is off", () => {
    const off = { ...on, enabled: false };
    expect(mayTargetUserConsent(off, "streak")).toBe(false);
    expect(mayTargetUserConsent(off, "recap")).toBe(false);
    expect(mayTargetUserConsent(off, "badge")).toBe(false);
  });

  it("allows a type when global + that type are on", () => {
    expect(mayTargetUserConsent(on, "streak")).toBe(true);
    expect(mayTargetUserConsent(on, "badge")).toBe(true);
  });

  it("blocks only the types switched off, when global is on", () => {
    const c = { ...on, recap: false };
    expect(mayTargetUserConsent(c, "recap")).toBe(false);
    expect(mayTargetUserConsent(c, "streak")).toBe(true);
  });

  it("defaults an absent per-type flag to ON (older docs get the standard set)", () => {
    // Pre-dates the per-type flags: the doc has only the global switch. These
    // users opted IN, so silence would be the wrong reading of a missing key.
    expect(mayTargetUserConsent({ enabled: true }, "streak")).toBe(true);
    expect(mayTargetUserConsent({ enabled: true }, "recap")).toBe(true);
  });

  it("treats null/undefined consent as no-send", () => {
    // The real shape of `consentSnap.data() || null` when the settings doc
    // was never written — i.e. every user who has never opened the toggle.
    // Defaulting this to "send" would cold-push the entire user base.
    expect(mayTargetUserConsent(null, "streak")).toBe(false);
    expect(mayTargetUserConsent(undefined, "badge")).toBe(false);
  });

  it("distinguishes false from every other falsy per-type value", () => {
    // The body tests `!== false` rather than truthiness, so only an explicit
    // false suppresses. Written down because the two readings differ on a
    // doc where the field is null/absent, and truthiness would silence a
    // user who never opted out.
    expect(
      mayTargetUserConsent({ enabled: true, streak: false }, "streak")
    ).toBe(false);
    expect(
      mayTargetUserConsent({ enabled: true, streak: undefined }, "streak")
    ).toBe(true);
    expect(
      mayTargetUserConsent({ enabled: true, streak: null }, "streak")
    ).toBe(true);
  });
});

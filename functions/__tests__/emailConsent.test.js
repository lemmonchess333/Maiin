/**
 * The email consent record (App1 Q55): its reader, how a change is applied,
 * and what the callables accept. lib/emailConsent.js's header says why each
 * field is kept.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const consent = require("../lib/emailConsent");

const AT = "SERVER_TIME";
const LATER = "LATER_TIME";

describe("emailConsentOn", () => {
  it("is a yes only for an explicit on: true", () => {
    const user = {
      emailConsent: {
        weeklyReview: { on: true },
        winBack: { on: false },
      },
    };
    expect(consent.emailConsentOn(user, "weeklyReview")).toBe(true);
    expect(consent.emailConsentOn(user, "winBack")).toBe(false);
  });

  it.each([
    ["no user document", null],
    ["never asked", {}],
    ["a record that is not a map", { emailConsent: true }],
    ["a kind that is not a map", { emailConsent: { weeklyReview: true } }],
    ["on as text", { emailConsent: { weeklyReview: { on: "true" } } }],
    ["on as 1", { emailConsent: { weeklyReview: { on: 1 } } }],
  ])("is no for %s", (_case, user) => {
    expect(consent.emailConsentOn(user, "weeklyReview")).toBe(false);
  });

  it("is no for a kind it does not know", () => {
    expect(
      consent.emailConsentOn(
        { emailConsent: { newsletter: { on: true } } },
        "newsletter"
      )
    ).toBe(false);
  });
});

describe("applyEmailConsent", () => {
  it("records a yes with when, where and the words", () => {
    const { next, changed } = consent.applyEmailConsent(
      undefined,
      { weeklyReview: true, winBack: true },
      { via: "setup", wording: 1, at: AT }
    );
    expect(changed).toEqual(["weeklyReview", "winBack"]);
    expect(next).toEqual({
      weeklyReview: { on: true, givenAt: AT, givenVia: "setup", wording: 1 },
      winBack: { on: true, givenAt: AT, givenVia: "setup", wording: 1 },
    });
  });

  it("keeps when the yes was given after a withdrawal, and says how it was withdrawn", () => {
    const stored = {
      weeklyReview: { on: true, givenAt: AT, givenVia: "setup", wording: 1 },
      winBack: { on: true, givenAt: AT, givenVia: "setup", wording: 1 },
    };
    const { next, changed } = consent.applyEmailConsent(
      stored,
      { winBack: false },
      { via: "unsubscribe", at: LATER }
    );
    expect(changed).toEqual(["winBack"]);
    expect(next.winBack).toEqual({
      on: false,
      givenAt: AT,
      givenVia: "setup",
      wording: 1,
      withdrawnAt: LATER,
      withdrawnVia: "unsubscribe",
    });
    // The other email is untouched.
    expect(next.weeklyReview).toEqual(stored.weeklyReview);
  });

  it("does not move the time of a yes already given, or a no already recorded", () => {
    const stored = {
      weeklyReview: { on: true, givenAt: AT, givenVia: "setup", wording: 1 },
      winBack: { on: false, withdrawnAt: AT, withdrawnVia: "settings" },
    };
    const yes = consent.applyEmailConsent(
      stored,
      { weeklyReview: true },
      { via: "settings", wording: 1, at: LATER }
    );
    expect(yes.changed).toEqual([]);
    expect(yes.next).toEqual(stored);
    const no = consent.applyEmailConsent(
      stored,
      { winBack: false },
      { via: "unsubscribe", at: LATER }
    );
    expect(no.changed).toEqual([]);
    expect(no.next.winBack).toEqual(stored.winBack);
  });

  it("a yes after a no keeps the record of the no", () => {
    const stored = {
      weeklyReview: {
        on: false,
        givenAt: AT,
        givenVia: "setup",
        wording: 1,
        withdrawnAt: AT,
        withdrawnVia: "unsubscribe",
      },
    };
    const { next } = consent.applyEmailConsent(
      stored,
      { weeklyReview: true },
      { via: "settings", wording: 1, at: LATER }
    );
    expect(next.weeklyReview).toEqual({
      on: true,
      givenAt: LATER,
      givenVia: "settings",
      wording: 1,
      withdrawnAt: AT,
      withdrawnVia: "unsubscribe",
    });
  });

  it("refuses a yes with no known words, or from the unsubscribe link", () => {
    expect(() =>
      consent.applyEmailConsent(
        undefined,
        { weeklyReview: true },
        { via: "settings", wording: 99, at: AT }
      )
    ).toThrow(/wording/);
    expect(() =>
      consent.applyEmailConsent(
        undefined,
        { weeklyReview: true },
        { via: "unsubscribe", wording: 1, at: AT }
      )
    ).toThrow(/unsubscribe/);
    expect(() =>
      consent.applyEmailConsent(
        { weeklyReview: { on: true } },
        { weeklyReview: false },
        { via: "setup", at: AT }
      )
    ).toThrow(/setup/);
  });
});

describe("readEmailConsentRequest (setEmailConsent's input)", () => {
  it("takes one or both emails, with the words for a yes", () => {
    expect(
      consent.readEmailConsentRequest({ weeklyReview: true, wording: 1 })
    ).toEqual({ changes: { weeklyReview: true }, wording: 1 });
    expect(
      consent.readEmailConsentRequest({ weeklyReview: false, winBack: false })
    ).toEqual({
      changes: { weeklyReview: false, winBack: false },
      wording: null,
    });
  });

  it.each([
    ["nothing", undefined],
    ["an empty request", {}],
    ["only the words", { wording: 1 }],
    ["an email it does not know", { newsletter: true, wording: 1 }],
    ["a value that is not a boolean", { weeklyReview: "yes", wording: 1 }],
    ["a yes without the words", { weeklyReview: true }],
    ["a yes to words it does not know", { winBack: true, wording: 2 }],
    ["a list", [true]],
  ])("refuses %s", (_case, data) => {
    expect(consent.readEmailConsentRequest(data).error).toBeTruthy();
  });
});

describe("readSetupEmailOptIn (completeOnboarding's input)", () => {
  it("is a yes only for emailOptIn: true with known words", () => {
    expect(
      consent.readSetupEmailOptIn({ emailOptIn: true, emailWording: 1 })
    ).toEqual({ optIn: true, wording: 1 });
  });

  it("records nothing for an unticked toggle or an older client", () => {
    expect(consent.readSetupEmailOptIn({})).toEqual({ optIn: false });
    expect(consent.readSetupEmailOptIn({ emailOptIn: false })).toEqual({
      optIn: false,
    });
    expect(consent.readSetupEmailOptIn(undefined)).toEqual({ optIn: false });
  });

  it.each([
    ["a yes as text", { emailOptIn: "true", emailWording: 1 }],
    ["a yes without the words", { emailOptIn: true }],
    ["a yes to unknown words", { emailOptIn: true, emailWording: 7 }],
  ])("refuses %s", (_case, data) => {
    expect(consent.readSetupEmailOptIn(data).error).toBeTruthy();
  });
});

describe("emailConsentSummary", () => {
  it("is both emails' on or off, absent read as off", () => {
    expect(consent.emailConsentSummary({ weeklyReview: { on: true } })).toEqual(
      { weeklyReview: true, winBack: false }
    );
    expect(consent.emailConsentSummary(undefined)).toEqual({
      weeklyReview: false,
      winBack: false,
    });
  });
});

/**
 * The words a person says yes to are part of the consent record (App1 Q55,
 * UK GDPR Article 7(1)): each stored yes names the version of
 * `EMAIL_CONSENT_WORDINGS` its switch showed, so that version's text has to
 * stay what it was. These are the words as they were shipped.
 *
 * If this fails because you changed a word, put the old words back and add
 * the new ones as the next version (here, in src/lib/emailConsent.ts and in
 * functions/lib/emailConsent.js's list), then make it the current one.
 * Editing a version in place rewrites what people already agreed to.
 */
import { describe, it, expect } from "vitest";
import {
  CURRENT_EMAIL_CONSENT_WORDING,
  EMAIL_CONSENT_COPY,
  EMAIL_CONSENT_WORDINGS,
} from "@/lib/emailConsent";

const SHIPPED = {
  1: {
    setupLabel: "Email me my weekly review, and a note if I stop",
    setupDescription:
      "Mondays at 08:00, last week’s sessions and food. If you stop logging, one email at 2 weeks and one at a month, then none. Every email has an unsubscribe link.",
    weeklyReviewLabel: "Weekly review",
    weeklyReviewDescription:
      "Mondays at 08:00: last week’s sessions and food, when you logged any",
    winBackLabel: "After a break",
    winBackDescription:
      "If you stop logging: one email at 2 weeks and one at a month, then none",
  },
};

describe("the consent words", () => {
  it("each version keeps the words it shipped with", () => {
    expect(EMAIL_CONSENT_WORDINGS).toEqual(SHIPPED);
  });

  it("the app shows the newest version", () => {
    const versions = Object.keys(EMAIL_CONSENT_WORDINGS).map(Number);
    expect(CURRENT_EMAIL_CONSENT_WORDING).toBe(Math.max(...versions));
    expect(EMAIL_CONSENT_COPY).toBe(
      EMAIL_CONSENT_WORDINGS[CURRENT_EMAIL_CONSENT_WORDING]
    );
  });

  it("the setup ask names both emails (§14n (48): the real words)", () => {
    const { setupLabel, setupDescription } = EMAIL_CONSENT_COPY;
    expect(setupLabel).toMatch(/weekly review/);
    expect(setupLabel).toMatch(/if I stop/);
    // The real time, both steps after a break, that it ends, and the way out.
    expect(setupDescription).toMatch(/Mondays at 08:00/);
    expect(setupDescription).toMatch(/2 weeks/);
    expect(setupDescription).toMatch(/a month/);
    expect(setupDescription).toMatch(/then none/);
    expect(setupDescription).toMatch(/unsubscribe/);
  });
});

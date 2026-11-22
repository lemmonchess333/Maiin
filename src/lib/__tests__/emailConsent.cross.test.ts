/**
 * The email consent record — the app and the server read one answer
 * (App1 Q55).
 *
 * src/lib/emailConsent.ts shows the switches and names the words a yes is
 * given to; functions/lib/emailConsent.js writes the record and decides,
 * before every send, whether an email may go. If they disagreed on the
 * kinds, a switch would save a kind the server ignores; on the words, the
 * app would send a version the server refuses, and every yes would fail;
 * on what counts as a yes, a switch would show on for someone the server
 * never emails, or off for someone it does.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  CURRENT_EMAIL_CONSENT_WORDING,
  EMAIL_CONSENT_WORDINGS,
  EMAIL_KINDS,
  emailConsentOn,
  type EmailConsentRecord,
} from "@/lib/emailConsent";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/emailConsent.js");

describe("email consent — client and server agree", () => {
  it("on the two emails", () => {
    expect([...EMAIL_KINDS]).toEqual([...server.EMAIL_KINDS]);
  });

  it("on the versions of the words, and which one is shown now", () => {
    expect(Object.keys(EMAIL_CONSENT_WORDINGS).map(Number)).toEqual([
      ...server.EMAIL_CONSENT_WORDINGS,
    ]);
    expect(CURRENT_EMAIL_CONSENT_WORDING).toBe(
      server.CURRENT_EMAIL_CONSENT_WORDING
    );
  });

  it("on what counts as a yes", () => {
    const records: unknown[] = [
      undefined,
      {},
      { weeklyReview: { on: true } },
      { weeklyReview: { on: false }, winBack: { on: true } },
      { weeklyReview: { on: "true" } },
      { winBack: { on: 1 } },
    ];
    let yeses = 0;
    for (const record of records) {
      for (const kind of EMAIL_KINDS) {
        const client = emailConsentOn(
          record as EmailConsentRecord | undefined,
          kind
        );
        const onServer = server.emailConsentOn(
          record === undefined ? {} : { emailConsent: record },
          kind
        );
        expect(onServer, `${JSON.stringify(record)} ${kind}`).toBe(client);
        if (onServer) yeses += 1;
      }
    }
    // Anchor: some of these are yeses, so the comparison is not vacuous.
    expect(yeses).toBe(2);
  });

  it("the server accepts the yes the app sends from a switch", () => {
    expect(
      server.readEmailConsentRequest({
        weeklyReview: true,
        wording: CURRENT_EMAIL_CONSENT_WORDING,
      })
    ).toEqual({
      changes: { weeklyReview: true },
      wording: CURRENT_EMAIL_CONSENT_WORDING,
    });
    expect(
      server.readSetupEmailOptIn({
        emailOptIn: true,
        emailWording: CURRENT_EMAIL_CONSENT_WORDING,
      })
    ).toEqual({ optIn: true, wording: CURRENT_EMAIL_CONSENT_WORDING });
  });
});

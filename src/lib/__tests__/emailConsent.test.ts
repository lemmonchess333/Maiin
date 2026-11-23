/**
 * The app's reader of the email consent record (App1 Q55), and the record
 * as the export writes it.
 */
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  emailConsentAnswered,
  emailConsentCsv,
  emailConsentOn,
  type EmailConsentRecord,
} from "@/lib/emailConsent";

describe("emailConsentOn", () => {
  it("is a yes only for an explicit on", () => {
    const record = {
      weeklyReview: { on: true },
      winBack: { on: false },
    } as EmailConsentRecord;
    expect(emailConsentOn(record, "weeklyReview")).toBe(true);
    expect(emailConsentOn(record, "winBack")).toBe(false);
    expect(emailConsentOn(undefined, "weeklyReview")).toBe(false);
    expect(emailConsentOn(null, "winBack")).toBe(false);
  });
});

describe("emailConsentAnswered", () => {
  it("is false for an account never asked, so setup asks it", () => {
    expect(emailConsentAnswered(undefined)).toBe(false);
    expect(emailConsentAnswered({})).toBe(false);
  });

  it("is true once either email has an answer, yes or no", () => {
    expect(emailConsentAnswered({ winBack: { on: false } })).toBe(true);
    expect(emailConsentAnswered({ weeklyReview: { on: true } })).toBe(true);
  });
});

describe("emailConsentCsv", () => {
  it("writes both emails with when, where and to which words, and any withdrawal", () => {
    const given = Timestamp.fromMillis(Date.UTC(2026, 10, 18, 9, 12, 3));
    const withdrawn = Timestamp.fromMillis(Date.UTC(2026, 11, 1, 8, 0, 0));
    const csv = emailConsentCsv({
      weeklyReview: {
        on: true,
        givenAt: given,
        givenVia: "setup",
        wording: 1,
      },
      winBack: {
        on: false,
        givenAt: given,
        givenVia: "setup",
        wording: 1,
        withdrawnAt: withdrawn,
        withdrawnVia: "unsubscribe",
      },
    });
    expect(csv.split("\n")).toEqual([
      "Email,On,Given,Given in,Wording,Withdrawn,Withdrawn by",
      "Weekly review,Yes,2026-11-18T09:12:03.000Z,Setup,1,,",
      "After a break,No,2026-11-18T09:12:03.000Z,Setup,1,2026-12-01T08:00:00.000Z,Unsubscribe link",
    ]);
  });

  it("writes a row for each email for an account never asked", () => {
    expect(emailConsentCsv(undefined).split("\n")).toEqual([
      "Email,On,Given,Given in,Wording,Withdrawn,Withdrawn by",
      "Weekly review,No,,,,,",
      "After a break,No,,,,,",
    ]);
  });
});

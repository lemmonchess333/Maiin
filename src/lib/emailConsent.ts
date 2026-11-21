/**
 * The two emails a person can choose (App1 Q55, owner, 13 November 2026):
 * the weekly review, and the later steps of the ladder for someone who
 * stops (Q54). Nothing else is sent beyond account emails and receipts. No
 * newsletters.
 *
 * Both are asked for once at setup, by one switch that names both
 * (`Onboarding.tsx`, the last step), off until the person turns it on
 * (DESIGN_GUIDE §14n (55): no marketing opt-in arrives ticked). Settings →
 * Notifications → Email has a switch for each (`EmailUpdatesGroup`), and
 * every email carries a link that turns both off.
 *
 * The record lives on `users/{uid}.emailConsent` and only the server writes
 * it, with its own time: setup's yes through `completeOnboarding`, the
 * switches through `setEmailConsent`, and the unsubscribe link. The rules
 * refuse a client write. Its shape and the reasons for it are in
 * functions/lib/emailConsent.js, the server's copy, which
 * emailConsent.cross.test.ts holds to this one.
 *
 * The words the person said yes to are part of the record: each yes stores
 * the version of `EMAIL_CONSENT_WORDINGS` its switch showed. Change a word
 * and you add a version; emailConsentWording.test.ts fails on an edited
 * one.
 */
import { httpsCallable } from "firebase/functions";
import type { FieldValue, Timestamp } from "firebase/firestore";
import { functions } from "@/lib/firebase";

export type EmailKind = "weeklyReview" | "winBack";

export const EMAIL_KINDS: readonly EmailKind[] = ["weeklyReview", "winBack"];

/** One email's answer, as the server keeps it. */
export interface EmailConsentAnswer {
  on: boolean;
  /** The last yes: when, where, and to which words. Kept after a no. */
  givenAt?: Timestamp | FieldValue | null;
  givenVia?: "setup" | "settings";
  wording?: number;
  /** The last no, if there has been one. */
  withdrawnAt?: Timestamp | FieldValue | null;
  withdrawnVia?: "settings" | "unsubscribe";
}

export type EmailConsentRecord = Partial<Record<EmailKind, EmailConsentAnswer>>;

/**
 * Whether the emails are being sent. Until the sender is on main, nothing
 * asks: a switch that promised "Mondays at 08:00" with no email behind it
 * would be a claim the app does not keep. The sender's change turns this
 * on.
 */
export const EMAIL_UPDATES_LIVE: boolean = false;

/** The words each version of the ask showed. Add a version; never edit
 *  one: a stored yes names the version it was given to. */
export const EMAIL_CONSENT_WORDINGS = {
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
} as const;

/** The version the app shows now. */
export const CURRENT_EMAIL_CONSENT_WORDING = 1 as const;

export const EMAIL_CONSENT_COPY =
  EMAIL_CONSENT_WORDINGS[CURRENT_EMAIL_CONSENT_WORDING];

/** Whether `kind` may be emailed: only an explicit yes counts. */
export function emailConsentOn(
  record: EmailConsentRecord | null | undefined,
  kind: EmailKind
): boolean {
  return record?.[kind]?.on === true;
}

/** Whether the person has ever answered, either way, for either email.
 *  Setup asks only an account that has not. */
export function emailConsentAnswered(
  record: EmailConsentRecord | null | undefined
): boolean {
  return EMAIL_KINDS.some((kind) => {
    const answer = record?.[kind];
    return !!answer && typeof answer.on === "boolean";
  });
}

export type EmailConsentChanges = Partial<Record<EmailKind, boolean>>;

/** Turn one or both emails on or off. Resolves to both answers as the
 *  server now holds them. */
export async function setEmailConsent(
  changes: EmailConsentChanges
): Promise<Record<EmailKind, boolean>> {
  const call = httpsCallable<
    EmailConsentChanges & { wording: number },
    { emailConsent: Record<EmailKind, boolean> }
  >(functions, "setEmailConsent");
  const result = await call({
    ...changes,
    wording: CURRENT_EMAIL_CONSENT_WORDING,
  });
  return result.data.emailConsent;
}

/** Settings' footer under the switches: where the email goes, and that an
 *  address not verified yet gets nothing until it is (the server checks). */
export function emailFooter(
  email: string | null | undefined,
  verified: boolean
): string {
  if (!email) return "Every email has a link to unsubscribe.";
  return verified
    ? `Sent to ${email}. Every email has a link to unsubscribe.`
    : `Sent to ${email} once you verify it. Every email has a link to unsubscribe.`;
}

/** A stored time as an ISO string for the export, or "". */
function isoOf(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as Timestamp).toDate();
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
  }
  return "";
}

const KIND_NAMES: Record<EmailKind, string> = {
  weeklyReview: "Weekly review",
  winBack: "After a break",
};

const VIA_NAMES: Record<string, string> = {
  setup: "Setup",
  settings: "Settings",
  unsubscribe: "Unsubscribe link",
};

/** The record as the export's CSV (Settings → Account → Export). */
export function emailConsentCsv(
  record: EmailConsentRecord | null | undefined
): string {
  const rows = ["Email,On,Given,Given in,Wording,Withdrawn,Withdrawn by"];
  for (const kind of EMAIL_KINDS) {
    const answer = record?.[kind];
    rows.push(
      [
        KIND_NAMES[kind],
        answer?.on === true ? "Yes" : "No",
        isoOf(answer?.givenAt),
        answer?.givenVia ? VIA_NAMES[answer.givenVia] : "",
        typeof answer?.wording === "number" ? String(answer.wording) : "",
        isoOf(answer?.withdrawnAt),
        answer?.withdrawnVia ? VIA_NAMES[answer.withdrawnVia] : "",
      ].join(",")
    );
  }
  return rows.join("\n");
}

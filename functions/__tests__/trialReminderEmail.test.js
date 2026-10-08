/**
 * lib/trialReminderEmail.js — the words of the reminder before a trial's
 * first payment (Sub1, STATUS 2026-10-06).
 *
 * The invariants, most costly first:
 *   - It says what the UK rules ask a reminder to say: the payment is taken
 *     unless they cancel, its amount and date, the payment after it, and
 *     how to cancel; and the subject says it is a reminder.
 *   - Every date and time is the person's own, day-first and 24-hour.
 *   - It never claims a price it does not have.
 *   - Nothing reaches the HTML unescaped.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildTrialReminderEmail,
  escapeHtml,
} = require("../lib/trialReminderEmail");
const tr = require("../lib/trialReminder");

const DAY = 86_400_000;
const MONTHLY = "com.tropos.app.pro.monthly";
const YEARLY = "com.tropos.app.pro.yearly";

/** A trial from Sunday 27 September to Sunday 4 October, 13:00 BST. */
function record({
  productId = MONTHLY,
  store = "app_store",
  endsAt = "2026-10-04T12:00:00.000Z",
  price = { amount: 3.99, currencyCode: "GBP", display: "£3.99" },
  timeZone = "Europe/London",
} = {}) {
  const endsAtMs = Date.parse(endsAt);
  return tr.planTrialRecord({
    stored: null,
    trial: {
      productId,
      store,
      startedAtMs: endsAtMs - 7 * DAY,
      endsAtMs,
      willRenew: true,
    },
    timeZone,
    reportedPrice: price ? { productId, ...price } : null,
  });
}

const email = (options = {}) =>
  buildTrialReminderEmail({
    trial: record(options),
    timeZone: options.timeZone ?? "Europe/London",
  });

describe("buildTrialReminderEmail", () => {
  it("says it is a reminder, and when the trial ends", () => {
    const { subject, text } = email();
    expect(subject).toBe(
      "Reminder: your Tropos Pro trial ends on Sunday 4 October"
    );
    expect(text).toContain(
      "Your free trial of Tropos Pro ends on Sunday 4 October at 13:00."
    );
  });

  it("names the deadline, the amount, the period and the payment after the first", () => {
    const { text } = email();
    expect(text).toContain(
      "Unless you cancel by 13:00 on Saturday 3 October, Apple will charge you £3.99 when the trial ends, for your first month of Pro, and then £3.99 every month. The payment after that would be on Wednesday 4 November."
    );
  });

  it("says how to cancel, and that a cancel already made needs nothing more", () => {
    const { text } = email();
    expect(text).toContain(
      "To cancel, open Settings on your iPhone, tap your name, then Subscriptions, then Tropos. Or go to https://apps.apple.com/account/subscriptions"
    );
    expect(text).toContain(
      "If you've already cancelled, there's nothing to do."
    );
  });

  it("gives the year when a date is in another year", () => {
    const { text } = email({
      productId: YEARLY,
      price: { amount: 34.99, currencyCode: "GBP", display: "£34.99" },
    });
    expect(text).toContain(
      "for your first year of Pro, and then £34.99 every year. The payment after that would be on Monday 4 October 2027."
    );
    const newYear = email({ endsAt: "2027-01-02T12:00:00.000Z" });
    // The reminder goes on Wednesday 30 December.
    expect(newYear.subject).toBe(
      "Reminder: your Tropos Pro trial ends on Saturday 2 January 2027"
    );
  });

  it("uses the person's own zone", () => {
    const { subject, text } = email({ timeZone: "Pacific/Auckland" });
    // 12:00 UTC on 4 October is 01:00 on Monday 5 October in Auckland.
    expect(subject).toBe(
      "Reminder: your Tropos Pro trial ends on Monday 5 October"
    );
    expect(text).toContain("ends on Monday 5 October at 01:00.");
    expect(text).toContain("Unless you cancel by 01:00 on Sunday 4 October");
  });

  it("names no amount it was not given", () => {
    const { text } = email({ price: null });
    expect(text).toContain(
      "Apple will start charging you for Tropos Pro when the trial ends, at the monthly price you saw when you started the trial. The payment after that would be on Wednesday 4 November."
    );
    expect(text).not.toMatch(/£|\d+\.\d\d/);
  });

  it("speaks for Google Play when the trial is there", () => {
    const { text } = email({ store: "play_store" });
    expect(text).toContain("Google Play will charge you £3.99");
    expect(text).toContain(
      "https://play.google.com/store/account/subscriptions"
    );
    expect(text).not.toContain("Apple");
  });

  it("holds the house's forms: no exclamation marks, no 12-hour clock", () => {
    for (const options of [{}, { price: null }, { store: "play_store" }]) {
      const { subject, text } = email(options);
      expect(`${subject}\n${text}`).not.toMatch(/!|\b(am|pm)\b/i);
    }
  });

  it("puts the same words in the HTML, escaped, with the cancel link live", () => {
    const { text, html } = email();
    expect(html).toContain("you&#39;ve already cancelled");
    expect(html).toContain(
      '<a href="https://apps.apple.com/account/subscriptions"'
    );
    for (const paragraph of text.split("\n\n").slice(0, 2)) {
      expect(html).toContain(escapeHtml(paragraph));
    }
  });
});

describe("escapeHtml", () => {
  it("escapes everything that could open markup or an attribute", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
    );
  });
});

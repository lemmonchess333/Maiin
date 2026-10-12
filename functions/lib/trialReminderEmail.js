/**
 * The email that reminds someone their free trial is about to turn into a
 * paid subscription (Sub1, STATUS 2026-10-06): subject, plain text and HTML
 * from a `subscriptionTrial` record (lib/trialReminder.js), without I/O.
 *
 * It says what the UK's subscription rules ask a reminder to say (DMCC Act
 * 2024, Schedule 23 Part 3, in force from January 2027), and nothing else,
 * so none of it is less prominent than something else in the same message:
 * that a payment is taken unless they cancel, its amount and date, the
 * payment after it, and how to cancel. The subject says it is a reminder.
 * Every date and time is the person's own, in the house's day-first and
 * 24-hour forms ("Saturday 10 October", "14:30").
 *
 * The price is the one the app showed when the trial started (RevenueCat
 * keeps no renewal price for a trial). Without it the email still names the
 * plan and points at the store's own subscription list, where the price is.
 *
 * Pinned by functions/__tests__/trialReminderEmail.test.js.
 */

const trialReminder = require("./trialReminder");

const STORES = Object.freeze({
  apple: {
    charger: "Apple",
    steps:
      "open Settings on your iPhone, tap your name, then Subscriptions, then Tropos",
    url: "https://apps.apple.com/account/subscriptions",
  },
  google: {
    charger: "Google Play",
    steps:
      "open the Google Play Store app, tap your profile picture, then Payments and subscriptions, then Subscriptions, then Tropos",
    url: "https://play.google.com/store/account/subscriptions",
  },
});

function storeFor(store) {
  return store === "play_store" ? STORES.google : STORES.apple;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Formatters by zone and shape: building one costs far more than using it. */
const FORMATS = new Map();

function format(timeZone, shape) {
  const key = `${timeZone}|${shape}`;
  if (!FORMATS.has(key)) {
    FORMATS.set(
      key,
      new Intl.DateTimeFormat(
        "en-GB",
        shape === "time"
          ? { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
          : {
              timeZone,
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }
      )
    );
  }
  return FORMATS.get(key);
}

/**
 * "Saturday 10 October", or "Saturday 2 January 2027" when the year is not
 * `referenceMs`'s. Built from the parts, because ICU versions differ on
 * whether a comma follows the weekday once a year is shown, and the house
 * form has none.
 */
function formatDay(ms, timeZone, referenceMs) {
  const parts = (at) =>
    Object.fromEntries(
      format(timeZone, "day")
        .formatToParts(at)
        .map((part) => [part.type, part.value])
    );
  const day = parts(ms);
  const words = [day.weekday, day.day, day.month];
  if (day.year !== parts(referenceMs).year) words.push(day.year);
  return words.join(" ");
}

/** "14:30". */
function formatTime(ms, timeZone) {
  return format(timeZone, "time").format(ms);
}

/** A local YYYY-MM-DD as "Tuesday 10 November", with the year when it is
 *  not `referenceMs`'s. Noon UTC on the day, read in UTC, so no zone moves
 *  it across midnight. */
function formatDateKey(dateKey, timeZone, referenceMs) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const noon = Date.UTC(year, month - 1, day, 12);
  const words = formatDay(noon, "UTC", noon).split(" ");
  const referenceYear = Object.fromEntries(
    format(timeZone, "day")
      .formatToParts(referenceMs)
      .map((part) => [part.type, part.value])
  ).year;
  if (String(year) !== referenceYear) words.push(String(year));
  return words.join(" ");
}

/**
 * The reminder for `trial`, in `timeZone`.
 *
 * @param {object} args
 * @param {object} args.trial - a `subscriptionTrial` record
 * @param {string} [args.timeZone] - the profile's IANA zone
 * @param {string} [args.appName]
 * @returns {{ subject: string, text: string, html: string }}
 */
function buildTrialReminderEmail({ trial, timeZone, appName = "Tropos" }) {
  const zone = trialReminder.resolveTimeZone(timeZone);
  const endsAtMs = Date.parse(trial.endsAt);
  const cancelByMs = Date.parse(trial.cancelBy);
  const sentAtMs = Date.parse(trial.reminderAt);
  const reference = Number.isFinite(sentAtMs) ? sentAtMs : endsAtMs;
  const store = storeFor(trial.store);
  const period = trialReminder.periodFor(trial.productId);
  const price =
    trial.price && typeof trial.price.display === "string"
      ? trial.price.display
      : null;
  const product = `${appName} Pro`;

  const endDay = formatDay(endsAtMs, zone, reference);
  const cancelDeadline = `${formatTime(cancelByMs, zone)} on ${formatDay(cancelByMs, zone, reference)}`;
  const nextKey = trialReminder.nextPaymentDateKey(endsAtMs, period, zone);
  const nextPayment = nextKey
    ? ` The payment after that would be on ${formatDateKey(nextKey, zone, reference)}.`
    : "";

  let charge;
  if (price && period) {
    charge = `${store.charger} will charge you ${price} when the trial ends, for your first ${period} of Pro, and then ${price} every ${period}.${nextPayment}`;
  } else if (price) {
    charge = `${store.charger} will charge you ${price} when the trial ends, and again each time the subscription renews.`;
  } else if (period) {
    charge = `${store.charger} will start charging you for ${product} when the trial ends, at the ${period === "year" ? "yearly" : "monthly"} price you saw when you started the trial.${nextPayment}`;
  } else {
    charge = `${store.charger} will start charging you for ${product} when the trial ends, at the price you saw when you started the trial.`;
  }

  const subject = `Reminder: your ${product} trial ends on ${endDay}`;
  const paragraphs = [
    `Your free trial of ${product} ends on ${endDay} at ${formatTime(endsAtMs, zone)}.`,
    `Unless you cancel by ${cancelDeadline}, ${charge}`,
    `To cancel, ${store.steps}. Or go to ${store.url}`,
    "If you've already cancelled, there's nothing to do.",
  ];
  const footer = `You're getting this email because you started a free trial of ${product}. We send it once, two days before the last day to cancel.`;

  const text = [...paragraphs, footer].join("\n\n");
  const html = trialReminderHtml({
    appName,
    heading: `Your trial ends on ${endDay}`,
    paragraphs,
    footer,
    url: store.url,
  });
  return { subject, text, html };
}

/** Inline styles, as email clients strip <style>: the same card as the
 *  verification email (lib/verificationEmail.js). Everything is escaped. */
function trialReminderHtml({ appName, heading, paragraphs, footer, url }) {
  const body = paragraphs
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(
        escapeHtml(url),
        `<a href="${escapeHtml(url)}" style="color:#6560C8;word-break:break-all;">${escapeHtml(url)}</a>`
      );
      return `<p style="font-size:15px;line-height:1.5;color:#3a3846;margin:0 0 16px;text-align:left;">${escaped}</p>`;
    })
    .join("\n            ");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td>
            <div style="font-size:12px;font-weight:800;letter-spacing:4px;color:#7B72E9;text-transform:uppercase;text-align:center;">${escapeHtml(appName)}</div>
            <h1 style="font-size:22px;font-weight:800;color:#1c1b22;margin:12px 0 20px;text-align:center;">${escapeHtml(heading)}</h1>
            ${body}
            <p style="font-size:12px;line-height:1.5;color:#8e8e93;margin:24px 0 0;text-align:left;">${escapeHtml(footer)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

module.exports = { buildTrialReminderEmail, escapeHtml };

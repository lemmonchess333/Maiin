"use strict";

/**
 * Share usage analytics, carried from setup to the account (owner,
 * 23 November 2026). Google Analytics is on by default; the analytics line
 * on the health-details agreement ends in Turn off, which a person in setup
 * may tap before there is an account to keep it on. Setup then sends
 * `usageAnalytics: false` beside the plan, top-level and never inside
 * profileData (the sanitiser carries no such field), and completeOnboarding
 * writes it to `users/{uid}.usageAnalytics`, the field Settings › Social &
 * privacy › Share usage analytics writes, held to a boolean as the rules
 * hold it (`usageAnalyticsValid`).
 *
 * An account that already has an answer keeps it: the device's never
 * overwrites the account's. Absent sends nothing, and the account stays on
 * by default.
 */

/** Setup's answer: `{ answer }` with true, false or undefined, or an
 *  `{ error }` for anything else. */
function readSetupUsageAnalytics(data) {
  const raw =
    data && typeof data === "object" ? data.usageAnalytics : undefined;
  if (raw === undefined || raw === null) return { answer: undefined };
  if (raw === true || raw === false) return { answer: raw };
  return { error: "usageAnalytics must be true or false." };
}

/** The field to write, or undefined: only an answer setup sent, and only
 *  onto an account that has none. */
function usageAnalyticsToWrite(answer, existingData) {
  if (answer === undefined) return undefined;
  const existing = existingData ? existingData.usageAnalytics : undefined;
  if (existing === true || existing === false) return undefined;
  return answer;
}

module.exports = { readSetupUsageAnalytics, usageAnalyticsToWrite };

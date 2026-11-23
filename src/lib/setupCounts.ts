/**
 * Setup counts (owner, 23 November 2026): the start of the funnel, counted
 * on Tropos's own server as plain daily totals with no identifier.
 * Google Analytics hears nothing before the person has met its line on the
 * health-details agreement (`analyticsProvider.ts`), and the welcome and
 * setup's first question come before it.
 *
 * What a count sends is the step's name and nothing else: a POST to
 * `countSetupStep` (functions/lib/setupCounts.js) with no credentials, no
 * referrer and no cache. It reads nothing stored on the phone to send it,
 * no device or instance id, no sign-in token, no cookie, and it writes
 * nothing, so it is not storage or access under PECR. That is why it does
 * not go through Firebase's callable SDK, which attaches the sign-in token
 * and the push token when it has them.
 *
 * Once each step per launch, held in memory: a phone is not told apart
 * from another, so the totals count showings, not phones. The third count,
 * accounts made, is the server's own (onAuthUserCreated). Never sent by a
 * development build or a browser a test harness drives.
 */
import { functionEndpoint } from "./functionEndpoint";
import { isAutomated } from "./launchSplash";

export type SetupCountStep = "welcome_viewed" | "setup_started";

const counted = new Set<SetupCountStep>();

export function countSetupStep(step: SetupCountStep): void {
  if (counted.has(step)) return;
  counted.add(step);
  if (import.meta.env.DEV) return;
  if (typeof navigator !== "undefined" && isAutomated(navigator)) return;
  try {
    void fetch(functionEndpoint("countSetupStep"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {
      // A count that did not arrive is a count lost, never a retry.
    });
  } catch {
    // fetch itself missing or refusing: nothing to count with.
  }
}


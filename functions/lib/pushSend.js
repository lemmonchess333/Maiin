/**
 * [push] Pure FCM send helpers (epic #961, slice 5+).
 *
 * Server-only, plain JS. Pure: no admin SDK calls here — just decisions over a
 * multicast response, so the prune-on-send-error invariant (Q4) is table-tested
 * in isolation. The cron/senders do the actual admin.messaging() I/O and feed
 * the response in.
 */

// FCM error codes meaning the token is permanently dead → delete its device doc
// (Q4 prune-on-send-error). Transient errors (internal/unavailable/quota) are
// NOT pruned — the token may still be valid next run.
const PRUNE_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/**
 * Given an admin.messaging() sendEachForMulticast response and the tokens it
 * was sent to (same order), return the subset of tokens to delete.
 *
 * @param {{ responses?: Array<{ success: boolean, error?: { code?: string } }> }} batch
 * @param {string[]} tokens
 * @returns {string[]}
 */
function tokensToPrune(batch, tokens) {
  const responses = (batch && batch.responses) || [];
  const dead = [];
  responses.forEach((r, i) => {
    if (!r || r.success) return;
    const code = r.error && r.error.code;
    if (code && PRUNE_ERROR_CODES.has(code) && tokens[i]) {
      dead.push(tokens[i]);
    }
  });
  return dead;
}

/**
 * The streak-nudge FCM message. DATA-ONLY (no top-level `notification`): the
 * SW's onBackgroundMessage only fires reliably on iOS PWAs for data messages,
 * so title/body travel in `data` and the SW renders them. Generic copy (Q7:
 * payloads transit FCM and show on lock screens — no PII / health / counts).
 * `data.route` deep-links when the notification is tapped (see the SW).
 *
 * @returns {{ data: { type: string, route: string, title: string, body: string } }}
 */
function buildStreakNudgeMessage() {
  return {
    data: {
      type: "streak",
      route: "/",
      title: "Keep your streak alive 🔥",
      body: "Log today to keep your streak going.",
    },
  };
}

/**
 * The badge-earned FCM message. DATA-ONLY (see buildStreakNudgeMessage). Badge
 * NAMES are deliberately omitted — names like "Month Master" / "Week Warrior"
 * encode a streak threshold, which would leak a streak count onto the lock
 * screen. `data.route` deep-links to Home where the badge surface lives.
 *
 * @returns {{ data: { type: string, route: string, title: string, body: string } }}
 */
function buildBadgeNudgeMessage() {
  return {
    data: {
      type: "badge",
      route: "/",
      title: "New badge unlocked 🏅",
      body: "Open Tropos to see what you earned.",
    },
  };
}

/**
 * The weekly-recap FCM message (on-track variant). DATA-ONLY (see
 * buildStreakNudgeMessage — a top-level `notification` field suppresses
 * onBackgroundMessage on iOS PWAs, so title/body travel in `data`). Monday-
 * morning positive summary; generic copy (Q7 — no week stats / counts on the
 * lock screen; the detail lives in-app behind `route`). Routes home.
 *
 * @returns {{ data: { type: string, route: string, title: string, body: string } }}
 */
function buildWeeklyRecapMessage() {
  return {
    data: {
      type: "recap",
      route: "/",
      title: "Your week in review 📊",
      body: "Open Tropos to see how last week went.",
    },
  };
}

/**
 * The weekly-recap FCM message (fell-behind variant). DATA-ONLY (see
 * buildStreakNudgeMessage). Sent on Monday morning when the user ran under half
 * their weekly target last week. Generic copy (Q7 — the "X of N" detail is
 * shown in-app, never on the lock screen). Deep-links the Programme page where
 * the FellBehindSheet surfaces.
 *
 * @returns {{ data: { type: string, route: string, title: string, body: string } }}
 */
function buildFellBehindRecapMessage() {
  return {
    data: {
      type: "fellbehind",
      route: "/program",
      title: "Let's realign this week 🎯",
      body: "Last week didn't go to plan — tap to adjust your runs.",
    },
  };
}

module.exports = {
  tokensToPrune,
  PRUNE_ERROR_CODES,
  buildStreakNudgeMessage,
  buildBadgeNudgeMessage,
  buildWeeklyRecapMessage,
  buildFellBehindRecapMessage,
};

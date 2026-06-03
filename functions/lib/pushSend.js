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
 * The streak-nudge FCM message. Generic copy + data only (Q7: payloads transit
 * FCM and show on lock screens — no PII / health data / streak counts). The
 * `data.route` deep-links when the notification is tapped (see the SW).
 *
 * @returns {{ notification: { title: string, body: string }, data: { type: string, route: string } }}
 */
function buildStreakNudgeMessage() {
  return {
    notification: {
      title: "Keep your streak alive 🔥",
      body: "Log today to keep your streak going.",
    },
    data: { type: "streak", route: "/" },
  };
}

/**
 * The badge-earned FCM message. Generic copy + data only (Q7). Badge NAMES
 * are deliberately omitted — names like "Month Master" / "Week Warrior" encode
 * a streak threshold, which would leak a streak count onto the lock screen.
 * The `data.route` deep-links to Home where the badge surface lives.
 *
 * @returns {{ notification: { title: string, body: string }, data: { type: string, route: string } }}
 */
function buildBadgeNudgeMessage() {
  return {
    notification: {
      title: "New badge unlocked 🏅",
      body: "Open Tropos to see what you earned.",
    },
    data: { type: "badge", route: "/" },
  };
}

/**
 * The weekly-recap FCM message (on-track variant). Monday-morning positive
 * summary. Generic copy + data only (Q7 — no week stats / counts on the lock
 * screen; the detail lives in-app behind the `route`). Routes home.
 *
 * @returns {{ notification: { title: string, body: string }, data: { type: string, route: string } }}
 */
function buildWeeklyRecapMessage() {
  return {
    notification: {
      title: "Your week in review 📊",
      body: "Open Tropos to see how last week went.",
    },
    data: { type: "recap", route: "/" },
  };
}

/**
 * The weekly-recap FCM message (fell-behind variant). Sent on Monday morning
 * when the user ran under half their weekly target last week. Generic copy +
 * data only (Q7 — the "X of N" detail is shown in-app, never on the lock
 * screen). Deep-links the Programme page where the FellBehindSheet surfaces.
 *
 * @returns {{ notification: { title: string, body: string }, data: { type: string, route: string } }}
 */
function buildFellBehindRecapMessage() {
  return {
    notification: {
      title: "Let's realign this week 🎯",
      body: "Last week didn't go to plan — tap to adjust your runs.",
    },
    data: { type: "fellbehind", route: "/program" },
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

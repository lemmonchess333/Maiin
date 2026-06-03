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

module.exports = { tokensToPrune, PRUNE_ERROR_CODES };

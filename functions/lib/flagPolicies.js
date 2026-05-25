/**
 * F2 / security audit 2026-05-25 finding #2 — per-flag failure
 * policy for `isFlagEnabled` in `index.js`.
 *
 * A Firestore read failure inside `isFlagEnabled` has to pick
 * between fail-open (keep serving) and fail-closed (block to
 * honour the kill-switch). The right choice depends on the flag's
 * purpose, not on a single global policy:
 *
 *   - `fail-open` — availability / performance toggles. A
 *     Firestore blip mustn't take down food scan because the flag
 *     is a degrade-gracefully knob, not a safety stop.
 *   - `fail-closed` — true emergency kill-switches. An ops
 *     "disable feature X" response must NOT silently re-enable on
 *     a transient read failure.
 *
 * Add a new entry to `FLAG_POLICIES` for any flag added to
 * `config/flags`. Unknown keys default to `fail-open` so legacy
 * callers behave as they did before the audit.
 */

const FLAG_FAIL_OPEN = "fail-open";
const FLAG_FAIL_CLOSED = "fail-closed";

const FLAG_POLICIES = Object.freeze({
  // geminiEnabled gates AI food analysis. Availability toggle —
  // a Firestore blip degrading food-scan is worse UX than briefly
  // honouring stale enable state. True emergency disable for AI
  // (cost runaway, abuse incident) belongs on a separate
  // `geminiKillSwitch` flag with fail-closed policy.
  geminiEnabled: FLAG_FAIL_OPEN,
});

/**
 * Returns the failure policy for a flag key. Defaults to
 * `fail-open` for unknown keys.
 */
function flagPolicyFor(key) {
  return FLAG_POLICIES[key] || FLAG_FAIL_OPEN;
}

/**
 * Decision helper — given a flag key and a read-failure context,
 * return the value to surface to callers. Pure; `isFlagEnabled`
 * delegates here for the catch-block return.
 */
function fallbackForReadFailure(key) {
  return flagPolicyFor(key) === FLAG_FAIL_OPEN;
}

module.exports = {
  FLAG_FAIL_OPEN,
  FLAG_FAIL_CLOSED,
  FLAG_POLICIES,
  flagPolicyFor,
  fallbackForReadFailure,
};

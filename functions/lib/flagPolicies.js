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
  // geminiEnabled gates AI food analysis (real Vertex compute). It IS the
  // operator's cost kill-switch — flipped to false in config/flags "to cut off
  // scans instantly if costs spike" (index.js:950). It must therefore fail
  // CLOSED: a config/flags read failure (Firestore outage, permission
  // regression) during a cost/abuse incident must NOT silently keep spending on
  // Vertex while the operator believes the switch is protecting them. The
  // accepted tradeoff is that a rare read failure briefly degrades food-scan to
  // a 503 "use manual entry" — far cheaper than unbounded AI spend.
  // (2026-07-09 money-path audit F6 — was fail-open, which contradicted the
  // call-site's own documented kill-switch intent. Any future flag guarding AI
  // or billing must likewise be fail-closed.)
  geminiEnabled: FLAG_FAIL_CLOSED,
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

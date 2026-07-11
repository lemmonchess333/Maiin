/**
 * Shared per-trigger maxInstances caps (2026-07-11 audit batch 6).
 *
 * CLAUDE.md invariant: every HTTP / trigger / scheduled function MUST
 * carry a cap (1st-gen has no default — a runaway client can spin up
 * thousands of containers). Domain modules extracted out of index.js
 * import these instead of re-declaring magic numbers, so a cap change
 * is one edit and the triggerMetadata snapshot pins the outcome.
 */
module.exports = {
  DEFAULT_HTTP_CAP: { maxInstances: 100 },
  ADMIN_HTTP_CAP: { maxInstances: 10 },
  TRIGGER_CAP: { maxInstances: 50 },
  SCHEDULED_CAP: { maxInstances: 1, timeoutSeconds: 540 },
};

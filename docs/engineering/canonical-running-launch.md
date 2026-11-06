# Canonical running launch: inactive candidate

Both source flags remain `false`: `RUNNING_PRESCRIPTION_GATE_ENABLED` and
`CANONICAL_RUNNING_LAUNCH_ENABLED`. No account was enrolled, no rollout switch
changed, and no deployment was performed. The mapper and transport remain lazy.
This is not an activation recommendation or a complete prescribed-run lifecycle.

## Entry and mapping

The gated Run setup offers an explicit check/start action for one canonical
session on the authority timezone's current date. `canonicalSessionId` can pin
that identity. Legacy `template`, `scheduledRunId`, `type` and auto-start query
parameters cannot select or authorize it. Missing/held/stale review shows the
review action instead of an inert Start. A newly adopted plan needs the explicit
current-revision safety review required by the server.

Only actual-catalogue timed easy and run-walk templates are supported. The client
requires exact kind/minutes/template agreement and verifies run-walk segment
sums. Distance, pace, quality, strides, unknown templates, protected/moved/manual
or completed sessions are rejected. There is no profile-pace or legacy fallback.

An own `recordedActivityLinks[sessionId]` suppresses further Start, regardless
of the link payload. The setup shows Activity recorded without claiming exercise
completion or progression. Malformed linkage containers fail closed. Linkage may
stale the current review marker; the read-only label does not bypass re-review.

## Two server boundaries

1. `authorizeRunningLaunch({expectedUid,expectedRevision,sessionId})` is a
   read-only preflight after wake-lock setup. It can prepare GPS but cannot
   authorize the actual recording timer.
2. `registerRunningStart({...request,activityId})` runs after GPS/countdown or
   treadmill setup, immediately before the timer. `activityId` is the already
   allocated saved-run ID. The server returns the same schema/account/revision/
   goal/timezone/session identity plus `authorizedAtMs`, `expiresAtMs`,
   `activityId` and `launchId` (`launch_` plus 64 lowercase hexadecimal digits).

Responses must match the selected identity exactly and have the original
15-second validity window. Current auth-object identity, connection, canonical
revision/holds, selected route, date and timezone are checked across awaits and
again at the timer boundary. A preflight permit cannot satisfy registration.
The recording's `recordingStartedAt`, not earlier GPS-preparation `startedAt`,
belongs inside the server start window.

Treadmill selection stops GPS and serializes against late GPS acquisition.
Cancel invalidates delayed responses. An uncertain registration retry reuses
its prepared activity ID; it never silently allocates a replacement. An expired
immutable replay remains blocked rather than being renewed. Expiry removes the
planned Start action and explains the terminal state. After a registration
failure, an explicit Discard unstarted session action clears only matching,
zero-recording local preparation. It does not cancel or renew the server receipt.
A later explicit Start may allocate a new identity. Voluntary recording remains
available. No automatic retry or background start is installed.

Same-ID retry is mount-local. After a remount, cached preparation follows the
existing explicit unprescribed-continuation or discard chooser; this patch does
not claim cross-remount canonical registration recovery.

The server receipt proves an authorized app start, not completed exercise.
Authorization is point-in-time, not a lock. This patch does not claim continuous
server enforcement while running or control over old offline binaries.

## History, resume and credit

The full response is retained in `runConfig.canonicalLaunch`, including the
activity/launch binding, and is serialized by the existing interrupted-run and
saved-run writers. It is an untrusted client copy of the server-owned receipt,
not self-authenticating proof for completion.

Legacy plan metadata remains freeform with null slot/template linkage. Because
the legacy matcher also uses dates/types, canonical and explicitly unprescribed
recordings additionally carry `legacyPlanClaimExcluded: true` in RunConfig and
the saved document. The saved-run parser preserves that marker and the shared
legacy `computeClaims` boundary excludes it. It remains visible in Home/day-peek
extras, history, volume and food calculations; the claim fingerprint includes
marker changes. The companion server race-recovery exclusion is required too.

Cached canonical sessions never restore coaching or auto-resume, even in a
rolled-back legacy-enabled build. Explicit continuation keeps recorded activity
but strips targets, segments and canonical launch permission, and retains the
no-legacy-claim marker. Active canonical provenance is intentionally not carried
forward as a new authorization during that continuation.

No canonical completion reconciliation or accepted progression is asserted by
this client patch. A completion command must independently verify the saved
activity and its server start receipt. It must not trust the nested provenance,
award date-only credit, clear holds or advance a stage based on this launch.

## Verification limits

Focused mapping, awaited-context changes, response/registration mismatch,
expiry, mounted Run countdown/treadmill/cancel/retry/rollback paths, and the real
save → parser → legacy-claim/extras paths are tested. Source review caught and
corrected the treadmill/GPS race, date-only legacy credit, rollback coaching,
and run-walk generic pace announcements.

No browser, emulator, live account, deployment or multi-device validation was
performed here. The integration coordinator owns production build/budget and
full aggregate checks. Remaining rollout work includes subscription/revision
invalidation, other legacy readers and notifications/Watch integrations, and
end-to-end canonical completion/reconciliation UX.

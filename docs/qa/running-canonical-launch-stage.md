# Canonical launch authorization stage

No activation, deployment or live-account access. The server command is read-only and does not create workout completion, progression credit, saved-run identity or an authorization token.

Request: expectedUid, expectedRevision, sessionId. Identity comes from authenticated uid, with expectedUid as an account-switch precondition. The transaction reads profile, current authority, deletion ledger, tombstone and rollout. Rollout requires protocolVersion 1 and enrollmentEnabled, transportEnabled, launchEnabled all true. The actual callable remains behind its source-time false flag.

Authorization requires matching revision/schema/account, no holds, complete migration, a current explicit goal-bound safe review, unique canonical session IDs/dates, and the requested date equal to today's date in canonical timezone. Completion/protection/manual intent, moved/unknown metadata, unknown templates, distance/quality/interval/tempo/stride templates and mismatched minutes/kind fail closed. The actual TypeScript catalogue is bundled into the existing server domain artifact, not duplicated. Current session minutes and weekly canonical session count must fit reviewed capacity and clinician limits.

Response: schemaVersion 1, accountId, revision, raceGoalId, timeZone, exact session {id,date,templateId,minutes,kind}, authorizedAtMs and expiresAtMs (15 seconds later). It is a point-in-time response, not a lock. The client must reauthorize after all awaited setup immediately before Start and invalidate on identity/session/revision/connection changes. Authority can change immediately after the transaction; no universal real-time enforcement or control of old offline binaries is claimed.

Adoption and adaptation advance revision and deliberately stale the review marker. Launch rejects that state until an explicit review is saved again. The test suite exercises actual enrollment -> review -> migration -> review -> initial adoption -> stale launch rejection -> explicit review -> successful launch. No fabricated valid marker substitutes for that chain.

Verification: 44 launch tests pass, including the real command chain in the deterministic store; three local-emulator tests are present but skipped without a host. The memory store is not concurrency proof. Related review suite passed, touched TypeScript lint and generated-byte parity passed. Full application typecheck in this sparse worktree cannot resolve omitted exercise-art JSON and e2e helpers; the integrator owns full verification. No emulator startup or denied socket retry occurred.

## Separate durable app-start registration

registerRunningStartTransaction additionally takes activityId, allocated before final physical recording starts. It uses the same current authorization checks and requires startRegistrationEnabled:true. It creates an immutable server-owned runningState/launch_<SHA256([uid,activityId])> document containing type authorized_app_start and the exact authorization plus activityId/launchId. This remains inside existing private runningState rules and recursive account deletion.

Read-only authorization remains a preflight. Final registration occurs after GPS/countdown setup and immediately before the actual recording timer. Saved provenance must retain returned activityId/launchId, the authorization and both legacyPlanClaimExcluded markers. The relevant recorded timestamp is recordingStartedAt, not the earlier preparation startedAt.

Retries reuse the same activity ID and return the original proof/expiry. They never renew its 15-second window, and reject changed state, already-saved activity, deletion, disabled rollout or expiry. An unused receipt is only evidence of authorized app-start preparation; it does not prove the person exercised, and is never treated as completion or progression credit. Canceled/failed starts must not become completed sessions. Later reconciliation must read actual same-account saved activity and this server receipt, and must label activity as user-reported rather than verified interval execution or medical readiness.

The server legacy race-completion boundary now rejects either exclusion marker or any own canonicalLaunch metadata, including malformed metadata, so canonical easy activity cannot trigger a legacy race recovery claim by matching date/distance. No completion reconciliation has yet been activated or asserted by this registration step.

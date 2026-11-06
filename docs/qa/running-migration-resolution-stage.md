# Empty-history migration resolution

Inactive source stage, not a recovery release or a completed legacy migration.

Enrollment stamps a server-owned one-time initial-review sentinel. Only revision-zero, empty-plan authority with the exact initial unknown constraint shape can consume it. The first saved review consumes it whether safe or unsafe. Safe first answers do not turn the never-reviewed sentinel into a clinical hold. Unsafe first answers still add a lasting review hold. Existing holds are never removed by review saving.

completeRunningMigrationTransaction accepts expectedUid, expectedRevision, requestId, raceGoalId, confirmed:true and acknowledgedLegacyPrescriptionsRetired:true. Auth derives identity. The transaction checks account/deletion/tombstone, current revision, exact goal-bound current review, immutable snapshot, migration provenance, empty sessions and rollout configuration. system/runningAuthority must have protocolVersion:1, enrollmentEnabled:true and migrationEnabled:true. Missing or disabled configuration rejects replay too.

This first stage completes only when no legacy programme document existed and its snapshot is empty, and the live legacy document is still absent in the same transaction. All legacy documents, even empty ones, remain blocked for explicit safety reconciliation. Keeping a snapshot is not evidence that injury/restriction/recovery facts were reconciled. Completion removes only enrollment_review_required, preserves every other hold and every history/goal/plan field, and never imports or seeds prescriptions. Its singleton receipt is runningState/migrationReceipt, covered by existing owner-read/Admin-write rules and recursive runningState deletion.

Completion advances revision and deliberately stales reviewConfirmation. Obtain a fresh review before subsequent prescription operations. A ready response indicates the protocol has no hold, not that an initial plan exists or the user has medical clearance. Existing unsafe/recovery/goal holds require distinct supported resolution, never a generic clear-holds action.

Outstanding critical path: legacy safety mapping, verified race-completion recovery entry, seven-day no-prescription interval and gradual return, initial plan generation from explicit reviewed capacity, canonical client render/subscription, full transport wiring, emulator contention/deletion validation and device/offline compatibility. Old unmodified offline clients can still paint cached/optimistic legacy prescriptions. This source cannot remotely prevent that.

Verification: 90 focused unit tests pass; three real emulator tests are present and skipped without an emulator host. Memory transactions are not concurrency proof. No emulator launched, production access, rules deployment or activation performed.

## Explicit legacy retirement extension

Negotiation now returns a versioned legacyReconciliation summary containing the exact typed snapshotDigest, evidence codes and mapped holds. Existing-account completion additionally requires expectedLegacyDigest and confirmedLegacyReview:true. Live legacy state must still match that immutable snapshot inside the same transaction. A changed old-client write cannot be silently accepted. This does not control old-client writes after completion, which remains a rollout compatibility constraint.

Supported legacy fields are retired, not imported into the new prescription plan. Recovery phase/date/race markers and effective race template overrides produce recovery_evidence_required, never proof that a race was completed. Compressed/below-floor plans and reduced-load snapshots produce load_review_required. Unknown fields or unsupported safety data produce legacy_safety_review_required. All preexisting holds remain. Lift workouts/weekHistory are preserved historical namespaces, not running capacity. Manual run completion entries are accepted as history only when shape-valid and tied to one known row; orphan/unknown entries remain held. Race indicators are still mapped from those rows.

Snapshot, legacy document, account and goal are unchanged. No history deletion or exhaustive historical conversion is needed. Completion stores the evidence summary under canonical migration metadata, advances revision, and leaves the current review stale. A subsequent explicit review and safe initial-plan command are separate prerequisites. Unsupported clinical/recovery holds cannot be acknowledged away by this command.

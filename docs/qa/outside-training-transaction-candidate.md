# Dormant authenticated outside-training transaction

Base: authority contract 49d8e72. No callable export, UI adapter, migration, enrolled account or live access is enabled. The progression/UI prototype remains on its separate branch.

## Implemented boundary

`submitOutsideTrainingReportTransaction` accepts exactly expectedUid, commandId, expectedAuthorityRevision, raceGoalId, scheduledRunId, confirmationVersion and bounded report facts. Identity comes from authentication, with expectedUid as an account-switch fence. The accepted primitives are copied before any await and fingerprinted in a fixed order. Linked saved-activity submissions are explicitly unsupported by this outside-only endpoint.

One Admin transaction reads the profile, authority, report, separate receipt, saved-activity identity collision, deletion ledger and tombstone. It checks account existence/deletion before receipt replay. Initial saves require current authority revision, exact race identity and a unique nonrace session from the supported nine-stage beginner catalogue. Unknown templates and general race-training sessions outside that catalogue are not supported by this first endpoint. A claimed stage must match that session's template and its catalogue full-session duration. The nine-session table is cross-tested against the client catalogue. Short incomplete/unknown sessions remain legitimate factual reports without stage credit. Dates use the authoritative timezone and retry-current server clock.

Successful save creates both report and durable receipt and increments only authority.revision. Plan sessions, race goal, all holds, history, completion ticks, accepted capacity and constraints.reviewConfirmation remain unchanged. The old confirmation marker becomes stale because the authority revision increased. No synthetic saved run is created. Identical retries replay the original receipt without writing; changed payloads, reused activity identities or corrupt evidence/receipt metadata fail closed. Corrections are not implemented and must not overwrite this immutable first report.

## Storage and erasure

- users/{uid}/runningTrainingReports/{outsideActivityId}
- users/{uid}/runningReportReceipts/{commandId}

These are separate from adaptation acceptance receipts. Rules allow owner reads only and deny all client writes. Both sibling collections are included in account erasure, inventory, counts (73 → 75), read-only rule classification and complete-erasure fixtures. No rules are deployed by this work.

## Verification limits

Deterministic tests exercise the real dormant transaction with the repository memory store, including atomic injected failures, deletion before replay, all active deletion statuses, account/scope/revision rejection, payload mutation, receipt integrity and a discarded-attempt retry seam. This is not proof of Firestore contention. Four actual emulator cases cover parallel duplicates, competing reports, concurrent holds and replay after deletion; they skip without a local emulator and fail when REQUIRE_FIRESTORE_EMULATOR=1 without a host. Existing rules emulator cases are extended to both paths. No emulator was started and no live Firebase project was accessed.

Before activation: actual emulator execution, correction policy, authenticated form adapter, persistent draft/command identity ownership, report-to-progression evidence reader, authoritative adoption/Apply, complete revision participation, capability negotiation/legacy compatibility, client review, callable rate limits/App Check/maxInstances and executing-source verification. Report receipt means the facts were stored, never that a runner is medically cleared or a plan has advanced.

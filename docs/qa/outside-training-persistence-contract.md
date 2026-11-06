# Outside-training report persistence contract (inactive design)

No callable, rule change, or production writer is enabled by this document. The reporting form is dormant unless a parent provides an authority-aware adapter. It does not call Mark as done, create a saved run, or change a plan, capacity confirmation, race date or hold.

## Align with running authority

The authority worker owns `users/{uid}/runningState/current`, schema version 1, with accountId, revision, timeZone, plan.raceGoalId/sessions, constraints and holds. Every evidence or hold change advances revision. Proposal/acceptance receipt collections remain owned by that protocol. Use a separate runningReportReceipts collection and dedicated receipt schema for report commands; do not reuse adaptation-acceptance receipts. Do not add client-write permission to authority documents.

Use a separate `users/{uid}/runningTrainingReports/{reportId}` collection for facts, with Admin-only writes and owner-only reads. Do not overload `manualCompletions` or `runs`. The client supplies expectedUid solely as an account-switch precondition. The server still derives identity from authentication and requires an exact match. Do not accept client-authored authority state, holds, stage credit, prescriptions or timestamp authority.

## Proposed callable: submitOutsideTrainingReport

Inputs: expectedUid, stable command ID, confirmationVersion, expectedAuthorityRevision, raceGoalId, scheduledRunId, and a bounded report payload. Outside reports have a stable outside:UUID activity identity. Report facts are local calendar date, full-session duration in seconds, easier/matched/harder/null effort, explicit completed-as-described answer, optional claimed stage, and explicit manageable answer. Unknown answers remain unknown, not false. The UI leaves subjective answers and consent blank and requires an explicit save confirmation. It validates facts but cannot authenticate them.

The server derives uid from the authenticated invocation, verifies account is not deleting, and uses the authoritative time zone to validate the date. Reject unrecognized fields, oversized payloads, invalid enums, non-finite durations, future dates, invalid stage, missing IDs, wrong ownership and unsatisfied expected revision. The accepted race block must match raceGoalId. scheduledRunId must belong to that block and must not be a race slot. Reporting a shorter or incomplete session is legitimate; it must not earn full-stage credit.

Do not silently attach a report to a new stage or race when a client is stale. The user should review the changed context and submit again deliberately. The form preserves its draft and original scope if the supplied authority revision/stage changes, disables submission and asks the user to review the latest plan. It never silently rebinds typed answers to new authority.

In one transaction, read account profile/deletion/tombstone state before even replaying a receipt, current authority, target report/receipt, and any linked same-account saved activity. Require authenticated uid to match expectedUid and current authority accountId. If the same command ID already committed with the same payload fingerprint, return its original durable receipt. If its payload differs, reject as a command conflict. If authority changed, reject without writing. Otherwise store the factual report with server timestamp/schema version/revision, advance authority revision to invalidate stale proposals, and store the receipt atomically. Preserve plan sessions, history, constraints and every hold exactly. Never call the completion or race-recovery transition from report ingestion.

Linked-activity reporting is a separate UI mode not implemented in this form. Its trusted facts must be read server-side from this user's saved activity; the report cannot override date/duration. Outside identities must not collide with saved activity identities. An outside report cannot be relabeled to escape invalid saved-run evidence.

## Correction and uncertainty

A report correction must name reportId and expected report revision as well as authority revision. Keep an auditable revision history. Do not merge conflicting records using client timestamps. Recompute evidence and invalidate proposals, but never undo a completed workout or rewrite history. A separate correction UI/command is not implemented yet.

Return a durable receipt with accountId, raceGoalId, scheduledRunId, activity identity, the exact accepted report facts and committed authority revision. The form shows success only for a matching report and advanced revision. On a rejected or uncertain response, keep answers and identity; never retry automatically or claim the report was saved. A deliberate identical retry must be idempotent. An edited retry after an uncertain result must be resolved by the server's payload fingerprint, not return success for a different previous payload.

## Adoption and proposal application

Reports alone never create adoption, clear holds, or advance a stage. A separately confirmed capacity/adoption command reads authoritative constraints, holds and evidence, scopes adoption to the exact race block, and records current accepted stage. The candidate's proposedState is not current state. Applying a reviewed proposal must use the authority protocol's revision/precondition checks and preserve independent holds. Acknowledging an activity, submitting a report, or saying a session felt manageable cannot clear injury/post-race/clinical restrictions.

## Required tests before activation

Authentication isolation, wrong-account saved links, nonrace/session/block validation, boundary dates in authoritative time zones and DST, malformed payloads, stale authority/report revisions, idempotent identical retry, changed-payload retry conflict, atomic failure, no alteration of holds/history/completions/race date, proposal invalidation, and older-client compatibility. UI tests cover explicit confirmation, unknown answers, short incomplete sessions, invalid data, rapid taps, rejected/uncertain writes and matching receipts. Browser accessibility/mobile/light-dark review and authenticated emulator tests remain outstanding.

Account switches hide the old draft immediately rather than displaying one account's answers in another account. Same-account scope changes keep answers but disable submission. The removed run-slot key avoids a needless remount on slot replacement; draft storage above any conditionally removed sheet subtree remains a prerequisite before live activation. Both new collections need owner-read/Admin-write rules and account-deletion inventory coverage before deployment.

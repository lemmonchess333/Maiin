# Held-only running enrollment and compatibility gate

Base: integrated c48afec. Inactive adapters only. No callable exports, live
accounts, rollout configuration changes, deployment or activation.

## Server stage implemented

`functions/lib/runningEnrollment.js` provides authenticated account-bound
`enrollRunningAuthority` and `negotiateRunningAuthority`. Both require the
Admin-controlled `system/runningAuthority` protocolVersion 1 and
`enrollmentEnabled: true`. Missing/disabled configuration fails closed.

Enrollment atomically reads profile, legacy programme, canonical authority,
legacy snapshot, deletion ledger/tombstone and rollout configuration. It creates:
- `runningState/legacySnapshot`: exact old programme, without truncation or extra
  envelope overhead. Completed/manual entries, lifting and history are preserved.
- `runningState/current`: zero prescribed sessions, preserved saved goal, unknown
  capacity expressed as null values and an enrollment_review_required hold.
  Legacy recovery adds a separate recovery_evidence_required hold.

The original programme/profile and all saved activities remain untouched. A
scheduled race date never becomes completed-race evidence. A newer profile goal
is preserved instead of replacing it with the completed legacy plan goal. Repeat
enrollment never replaces the canonical state or snapshot; orphaned snapshots
require review. Unknown/missing timezone does not receive an invented fallback.

Old client writes to legacy programState remain legal but cannot alter either
server-owned document. There is no account-wide write freeze or new history array
limit. Both new documents use the already protected and erased runningState
collection. Pending migration independently blocks negotiation AND adaptation
acceptance even if a faulty future writer removes its holds.

## Negotiation contract

Request: `{expectedUid,supportedSchemaVersions:[1]}`.
Response: `{status,accountId,checkedAtMs,...}` where status is ready, held,
not_enrolled or unavailable. Valid authority responses additionally include
schemaVersion, revision and authority. Ready describes protocol availability,
not medical readiness. Held responses remove prescription sessions from the
returned projection. Unsupported schemas, invalid authority, duplicate dates and
malformed completion/protection/status metadata fail closed. There is never a
legacy-authorized fallback response.

Client gates must suppress prescriptions before this authenticated read and on
offline/cache/error/account switching/delayed responses. A one-time ready response
is not sufficient indefinitely: authority rendering needs server-confirmed
subscription/revision invalidation. The client stage currently keeps ready blocked
until an authority-to-prescription adapter is implemented; it does not paint legacy
rows merely because negotiation succeeded.

## Remaining activation sequence

1. Implement explicit migration/status resolution from verified race-completion
   and current capacity facts. No command here clears enrollment/recovery holds.
2. Complete all canonical writers, recovery entry, seven-day suppression and
   gradual later rollover. Review ingestion must preserve independent holds.
3. Complete all client prescription readers/launchers, including cache-first
   Programme, independent Home, Settings previews and later recommendation views.
   Keep activity history, voluntary unprescribed recording, lifting and food intact.
4. Run real emulator concurrency/rules tests and mixed-version web/native/device
   checks before enabling any server or client rollout configuration.

## Unavoidable legacy limitation

No server rule, trigger or new-client gate can retract a prescription already
painted or cached in an unmodified old offline binary. Existing minimum-version
handling is fail-open and cannot prove retirement. Canonical isolation protects
supported clients/data; it does not control that old screen. A universal guarantee
remains blocked until unsupported-client retirement scope is explicitly settled.
Do not describe this stage as completed recovery enforcement.

## Evidence

115 focused enrollment/authority/adapter tests pass. Four real enrollment
contention/deletion tests and one rules isolation case were added and registered,
but remain unexecuted locally because no allowed emulator exists. Independent
source review found and verified fixes for unfinished-migration readiness and
duplicate dates. No concurrency, device, deployment or release approval claimed.

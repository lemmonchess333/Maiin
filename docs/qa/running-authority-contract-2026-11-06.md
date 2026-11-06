# Running authority: dormant acceptance contract

Base: main `124680f`. This slice adds no callable, Firestore rules, enrollment,
client behavior or migration. It must remain dormant until the gates below pass.
It complements the compatibility design in `db89056`; it does not activate that
older branch's recovery runtime changes.

## Implemented primitive

`functions/lib/runningAuthority.js` exposes `applyRunningProposal` as a pure
transaction decision. The proposed canonical path is
`users/{uid}/runningState/current`, not owner-writable `programState`.

Authority fields:
- `schemaVersion: 1`, `accountId`, authoritative `timeZone`, and monotonic nonnegative safe-integer `revision`.
- `plan: {raceGoalId, sessions}`. Each candidate prescription has `id`, `date`,
  `templateId`, positive finite `minutes`, and `kind: easy | run_walk`.
- `constraints`, and `holds` as independent string IDs. All holds block this
  adaptation acceptance path; acceptance never clears one implicitly.
- History, manual completions, recovery evidence and week anchors are separate
  envelope fields. Acceptance preserves all fields except plan and revision.

An immutable server proposal carries `id`, `accountId`, `baseRevision`,
`expiresAtMs`, `windowStart`, bounded-week `plan`, and `validation: {policyVersion: 1, authorityRevision}`.
The validation record is written ONLY after server-side domain validation against
that revision's constraints. This marker is not itself clinical validation.
The acceptance request carries `uid`, `proposalId`, `expectedRevision`,
`idempotencyKey`, and explicit `accepted: true`. A wrapper must derive uid from
authentication, not trust a payload uid.

The helper checks owner identity, revision, expiry, schema, goal identity, explicit
acceptance, independent holds and validated revision. It rejects duplicate session
IDs/dates, invalid calendar dates, unsupported intensity kinds and unknown plan
fields. It returns the next envelope and an immutable receipt, or an exact-replay
result with NO state write. A stale proposal cannot be reused without a receipt.
Application overlays only the specified seven-day window, preserving outside-window
sessions and plan metadata. Selected IDs and dates must already exist in that
window. Protected, completed, manual or non-planned rows block the patch. The
window must still be in the future in the authoritative timezone at acceptance;
missing timezone fails closed. This prevents a preview crossing local midnight
from modifying a window already underway.
A receipt conflict never becomes a fresh application.

The matching adaptation worker owns template/capacity/clinician/symptom validation.
This helper does not replace that policy. It is for injury adaptation acceptance;
it is not a general race-plan writer, recovery entry command or hold-clear command.
A new symptom/capacity/restriction review must first be persisted through a
separate server command that advances revision. Preview then uses those stored
inputs. Otherwise a proposal might claim to fit constraints never saved.

## Next transaction slice, before exporting a callable

1. Add owner-readable/Admin-only authority, proposal and receipt paths, including
   explicit account-deletion inventory and retention handling. Legacy programme
   writes stay unchanged. Do not store authorization markers in the legacy doc.
2. Authenticate and check app/account access. Derive account identity from auth.
   In one Admin transaction read deletion fence, authority, immutable proposal
   and receipt. Every read must precede writes. Check deletion even on replay.
3. Invoke the pure decision with transaction-current documents and server time.
   For `applied`, atomically write authority and create the immutable receipt;
   for `replayed`, return its recorded result without changing authority.
   Do not retain only the most recent receipt. A delayed retry of an older
   operation must remain deduplicated after subsequent changes.
4. Every writer of plan inputs, holds, recovery evidence or review constraints
   must participate in the same revision protocol. Account deletion, recovery
   completion, accepted adaptation, successor goals and rollover cannot use
   independent last-write-wins paths. Unknown schema fails closed.
5. Add exact-source deployment verification when an executing export imports
   these helpers. Do not claim source verification before an export exists.

## Migration and supported-client gate still required

No negotiation endpoint exists in this slice. A supported client must suppress
prescriptions before negotiation and while unavailable, including offline/cache,
Home, Programme, start shortcuts, notification routes, account switches and old
server responses. Missing or unsupported authority never falls back to legacy
rows. Scope blocking to running prescriptions, not lifting, food or history.

Recovery enrollment requires saved completion evidence, on-open treatment of
returning/inactive accounts, an explicit empty-week anchor, and conservative
unresolved status on missing evidence/query failure. Scheduled race dates alone
are not completed-race facts. Migration cannot be enabled piecemeal while some
canonical writers still bypass revision/hold enforcement.

Legacy installed binaries can still display cached or locally generated rows.
The existing minimum-version gate initially renders children and fails open.
Neither new rules nor an asynchronous repair controls those old offline screens.
The universal old-client safety limitation remains unresolved; do not describe
this contract as complete seven-day recovery enforcement.

## Test gates

Local pure tests cover exact acceptance, no input mutation, preservation of all
unmodified envelope fields, four independent hold classes, stale revisions,
expiry, account separation, missing validation, unsupported schema, goal changes,
malformed prescriptions, empty weeks, retry after later state changes and
idempotency conflicts. These are protocol tests, not transactions or clinical
policy proof.

Required emulator cases for the NEXT slice:
- Parallel acceptance of two proposals at one revision: exactly one advances;
  the other conflicts. Parallel duplicate acceptance creates one receipt.
- Retry a prior receipt after a later successful change: no extra revision/write.
- Race a new injury/recovery hold, evidence update or goal change with acceptance:
  a fresh transaction reads the changed revision and cannot apply stale policy.
- Deletion fence racing acceptance/replay; no state resurrection.
- Deny client create/update/delete of authority, proposals and receipts, including
  the owner; permit appropriate own reads and deny cross-account access.
- Old direct programme writes do not change canonical state and remain available
  for lifting/history. No unbounded-history array cap is introduced.
- Failed migration evidence query leaves authority inactive/unresolved.

Required mounted-client gates are separate: prove no pre-negotiation prescription
paint; no offline/error fallback; account isolation; actual empty-week rollover;
all entry points; new client against old server; and supported web/native builds.

No local emulator is available and a prior socket restriction must not be bypassed.
Run transaction/rules evidence in existing emulator-enabled CI when that slice is
implemented. Full aggregate verification is the integrator's serialized gate;
this dormant slice is not a release or migration approval.

Final focused verification: 268 tests across four suites pass (51 new authority
cases plus programme command, account-boundary and schema-key parity coverage).
Node syntax and diff whitespace checks pass. Independent review found two guard
edge cases, both corrected and covered: malformed falsy statuses must not become
editable, and inherited object properties must not count as manual completions.
Explicit moved/override metadata and malformed protection metadata also block a
window patch rather than being erased. Full aggregate/emulator/client gates
remain pending as described above; no live accounts were accessed.

## Offline transaction adapter slice (still dormant)

`runningAuthorityTransaction.js` now supplies an authenticated adapter, but is NOT
imported/exported by `functions/index.js`. Payload is exactly
`{expectedUid, accepted, proposalId, expectedRevision, idempotencyKey}`. It derives
uid from auth and rejects missing/mismatched account binding before Firestore
access. It reads the profile, authority, proposal, receipt, deletion ledger and
tombstone inside one transaction before any write. Deletion/profile-existence
checks precede replay. Server time is evaluated after those reads on each retry.
Applied authority and a create-only receipt commit together; replay writes nothing.
Responses contain only outcome/receipt, not a replacement plan to optimistically
paint. The client must reconcile authoritative state before confirming the plan.

Paths are now explicit sibling user subcollections:
- `runningState/current`: canonical authority.
- `runningProposals/{proposalId}`: immutable server-generated validated preview.
- `runningReceipts/{idempotencyKey}`: durable acceptance receipt.

Local rules changes grant only owner reads and deny every client write. Legacy
programme writes are untouched. No rules were deployed. All three sibling paths
are included in the deletion executor, inventory, inventory counts and synthetic
complete-erasure fixture. No nested subcollection is introduced.

The adapter's memory-store tests exercise the real adapter's deterministic
control flow and write-failure handling; they do NOT emulate Firestore locking,
contention, security rules or retries. Real emulator fixtures now cover parallel
duplicate acceptance, competing proposals, concurrent hold changes, concurrent
deletion, receipt replay after later holds, and deletion/missing-account gates.
A separate rules suite covers owner read/client write denial, cross-account
isolation and unchanged legacy lifting/history writes. It is included in the
existing `test:rules` script; function fixtures are discovered by the existing
emulator CI suite. Both suites fail fast with REQUIRE_FIRESTORE_EMULATOR=1 when
no host is configured, and restrict execution to a loopback emulator/demo project.

Local evidence: 122 tests passed across five authority/adapter/deletion suites;
six transaction emulator cases skipped. Inventory count/drift checks: 12 passed;
four rules emulator cases skipped. Focused lint, Node syntax and whitespace checks
pass. Emulator cases have NOT executed here: no host exists and the prior socket
restriction remains respected. No concurrency or deployed-rules proof is claimed.
Full aggregate verification remains the serialized integration gate.

Before activation, still implement validated immutable proposal creation,
constraint/hold review commands, complete input-revision participation, enrollment
and migration, pre-render client negotiation, rate limits/App Check/maxInstances
on any eventual callable export, executing-source verification and all emulator/
mounted-client gates. The legacy offline-binary limitation remains unchanged.

## Immutable proposal creation wrapper (inactive)

`runningProposalTransaction.js` validates exact account-bound requests containing
expectedUid, expectedRevision, requestId, windowStart and explicit session
selections. Identity comes only from auth. It derives a stable account-scoped
proposal ID, fingerprints the exact normalized request and creates the proposal
once. Identical replay returns the original expiry; edited replay conflicts and
expired previews are not renewed. Do not garbage-collect immutable request
records while their identity could be reused without a separate deduplication
ledger. No policy ever clears a hold during preview generation.

Inside the transaction, profile/authority/proposal/deletion/tombstone reads precede
all writes. The real shared generated server domain receives canonical authority,
selections, window and server time. The client cannot supply authority, clinical
constraints, preview content or validation markers. The wrapper adds its validation
marker only after the domain succeeds and the acceptance boundary independently
validates preservation/holds/window. Displayed after-session summaries must match
the stored plan. Server time is checked again after domain computation. Preview
creation writes only its immutable proposal, never authority or completion facts.

The generated-domain dependency is owned by the adaptation worker at
`functions/lib/generated/runningAdaptationDomain.cjs`. There is no hand-maintained
catalogue or production fallback. Missing/generated-domain failure returns an
unavailable preview. Isolated adapter tests inject a trusted internal stub to test
control flow only; these are not domain, catalogue, clinical or concurrency proof.
Actual generated-domain integration and emulator replay/contention checks remain
required before any callable export or activation.

# R1A-Deletion — collectionGroup Fallback Plan

**Status:** Contingency design. NOT implemented. Triggered only if the
emulator feasibility tests reveal that one or more
`collectionGroup() + documentId == uid` queries are unreliable in
production Firestore (missing-index errors, query-shape rejections,
or unexpected blast radius).

## When this plan activates

The Chunk 2.B emulator suite
(`firestore.collectionGroup.test.ts`) tests four `collectionGroup +
__name__` query shapes:

- `blocksReverse` — `collectionGroup('users').where(documentId(), '==', uid)`
- `kudosByMe` — same shape, filtered by `pathFilter: kudos/*/users`
- `crewMemberships` — `collectionGroup('members').where(documentId(), '==', uid)`
- `challengeParticipations` — `collectionGroup('participants').where(documentId(), '==', uid)`

If the emulator passes AND a staging Firestore project confirms the
queries work with production indexes, no fallback is needed. If
either fails, this plan activates.

## What the fallback adds

A denormalised field on the cross-user docs so the cleanup uses a
standard `where('userId', '==', uid)` field-filter instead of the
documentId collectionGroup query.

| Inventory key | Current shape | Denormalised field | Backfill collection |
|---|---|---|---|
| blocksReverse | doc-id = blocking user uid | `blockedUid` | `blocks/*/users` (all subcollections) |
| kudosByMe | doc-id = kudos giver uid | `userId` | `kudos/*/users` |
| crewMemberships | doc-id = member uid | `memberUid` | `groups/*/members` |
| challengeParticipations | doc-id = participant uid | `participantUid` | `challenges/*/participants` |

## Migration / backfill plan

### Phase 1 — Code changes (no data writes)

1. Update every WRITE site to ALSO write the new denormalised field
   alongside the existing doc-id.
   - `src/lib/socialApi.ts:215,223,232,235` — kudos writes add
     `userId: uid`.
   - `src/lib/socialApi.ts:695` — block writes add `blockedUid: targetUid`.
   - `src/hooks/useCrews.ts:104,157` — crew member writes add
     `memberUid: uid`.
   - Challenge participant writes — locate, add `participantUid: uid`.
2. Update inventory entries' `feasibilityNote` to reference the new
   field. Update Chunk 3 executor query design (when it lands) to
   use `where('userId', '==', uid)` etc.
3. Deploy code. New writes from this point carry the denormalised
   field; existing docs do not.

### Phase 2 — Backfill script

Operator-run script (`functions/scripts/backfillR1AFallbackFields.js`)
that:
- Iterates every `blocks/{uid}/users/{targetUid}` doc and adds
  `blockedUid: targetUid` if missing.
- Iterates every `kudos/{activityId}/users/{userId}` doc and adds
  `userId: <doc-id>` if missing.
- Iterates every `groups/{crewId}/members/{uid}` doc and adds
  `memberUid: <doc-id>` if missing.
- Iterates every `challenges/{challengeId}/participants/{uid}` doc
  and adds `participantUid: <doc-id>` if missing.
- Records progress in `_backfillState/r1aFallback` so re-runs are
  idempotent.
- Dry-run by default; requires `--really-write` flag for actual
  writes.

Backfill is bounded in scale: the underlying collections are small
relative to user/meal/run logs. Even a heavy-traffic estimate puts
total docs in the low millions, which is a single afternoon of
backfill at 500 ops/sec.

### Phase 3 — Verification

A static-scan integration test asserts that EVERY doc in the four
collections has the denormalised field. Run via emulator with
production-like sample data. Until this passes, Phase 4 is blocked.

### Phase 4 — Switch the executor to the new query shape

Chunk 3 executor design changes to use `where('userId', '==', uid)`
etc. instead of `where(documentId(), '==', uid)`. Inventory entries
update `strategy` and `feasibilityNote`.

## UX position during the migration window

**Apple Guideline 5.1.1(v) consideration.** Apple requires apps that
allow account creation to offer functional in-app account deletion.
During the migration window between Phase 1 (deploy code) and Phase 4
(executor uses new query), the in-app Delete Account flow has three
possible postures:

1. **Hide the button until backfill completes.** SAFE but creates App
   Review risk — reviewers may flag "deletion unavailable" as
   incomplete UX. Mitigation: pre-launch + TestFlight only, never in
   App Store release.

2. **Keep the current (pre-Chunk-3) deletion path available.** NOT
   ACCEPTABLE. The pre-Chunk-3 path is known to leave residual data
   per the Phase 0 audit. Continuing to use it during the migration
   window is the failure mode we're explicitly trying to fix.

3. **Surface "Deletion temporarily unavailable, contact support" with
   a mailto.** RECOMMENDED. Support manually processes deletion
   requests during the migration window using Admin SDK against the
   already-deployed inventory. Operator has the documented runbook
   from decision-log #7 (historical cleanup script) which provides
   the same execution pattern.

**Chosen position.** Option 3 — support-assisted in-app deletion
during the migration window. The Delete Account button remains
visible. Tapping it shows a modal: "Account deletion is temporarily
handled by our support team while we improve the system. Email
<support@troposfit.com> with subject 'Delete my account' and we'll
process it within 24 hours." with a mailto button.

This is functional in-app deletion per Apple's bar — the user can
initiate from inside the app — and avoids both the App Review risk
of (1) and the data-residue risk of (2).

**Trigger word for Chunk 4.** If this plan activates, Chunk 4
client work must include the support-assisted UI variant alongside
the normal Delete Account flow, gated by a remote config flag
(e.g. `config/flags.r1aFallbackMigrationInProgress`).

## Rollback strategy

If Phase 2 backfill produces incorrect data or Phase 4 reveals a
new issue:
1. Set `config/flags.r1aFallbackMigrationInProgress = true` to
   activate the support-assisted UI.
2. Revert the executor query change (Phase 4 → 3.5).
3. Continue support-assisted deletion until the cause is fixed.

No rollback of Phase 1 code changes — adding fields is forward-
compatible; old executor code just ignores the new fields.

## Tests required before activating

If this plan activates:
- Backfill script idempotency tests (re-running on already-backfilled
  data is a no-op).
- Emulator integration test for the new query shape
  (`where('userId', '==', uid)` etc.) — passes against seeded data.
- Inventory feasibilityNote updates pinned by inventory shape test.
- Snapshot test for the executor's query usage (Chunk 3) confirms
  the migration query shape is in use, not the legacy
  documentId-collectionGroup shape.

## Sizing

Implementation work: ~3-4 days. Backfill execution time: ~1 day for
typical scale. Total: ~1 week before Chunk 3 executor work could
begin if this plan activates.

## When NOT to activate

If only the `collectionGroup('items') where authorId == uid` queries
(feedFanout, notificationsFromMe) fail, this plan does NOT apply
— those use field-filters already, not documentId. Index-missing
failures on those queries are fixed by `firebase deploy --only firestore:indexes`
after adding the relevant composite to `firestore.indexes.json`
(Chunk 2.C already added them).

Activation criterion is narrow: emulator failure on the four
`collectionGroup + documentId` queries listed above.

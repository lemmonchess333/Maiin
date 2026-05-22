# R1A-Deletion Chunk 2.B — Verification Pack

Closes the 15 verification items required before Chunk 3 authorisation.
Each section maps 1:1 to a Section 3 verification-pack item from the
Chunk 2 security-gate review.

## 1. Emulator test output

**Status: cannot run in current Claude Code sandbox.**

The Firestore emulator requires `firebase` CLI + Java runtime, neither
of which is installed in this environment. The emulator-gated suites
remain `describe.skip` when `FIRESTORE_EMULATOR_HOST` is unset.

**Command founder must run locally (or CI must run):**

```bash
npm install -g firebase-tools
firebase emulators:exec --only firestore,auth \
  "vitest run firestore.rules.test.ts firestore.collectionGroup.test.ts"
```

**Expected output when emulator runs:** roughly 30 previously-skipped
tests transition to PASS — write-freeze on representative path,
non-active statuses (requested/completed/cancelled) accept writes,
each active status (running/failed_cleanup/pending_cleanup/
pending_auth_deletion/operator_review) blocks writes, cross-user
follow create blocked on either-side deletion, operational
collection deny rules enforced, collectionGroup + documentId queries
return expected docs.

**If emulator surfaces an "index required" message:** the missing
index name is the Chunk 3 deploy gate. Add it to `firestore.indexes.json`
before the executor ships. Expected indexes (best guess; emulator
will confirm):
- composite: `feeds/*/items` on `authorId`
- composite: `notifications/*/items` on `fromUserId`
- composite: `comments/*/items` on `authorId`
- collectionGroup `users` with `__name__` filter (built-in, no
  composite needed)
- collectionGroup `members` with `__name__` filter (built-in)
- collectionGroup `participants` with `__name__` filter (built-in)

## 2. CI gating proof

**Required GitHub Actions step (sample — founder applies in CI config):**

```yaml
- name: R1A-Deletion required emulator suites
  run: |
    npm install -g firebase-tools
    REQUIRE_FIRESTORE_EMULATOR=1 firebase emulators:exec --only firestore,auth \
      "vitest run firestore.rules.test.ts firestore.collectionGroup.test.ts"
  if: github.ref == 'refs/heads/main' || github.base_ref == 'main'
```

**Code change required in test files to honour the gate:** the current
`describe.skip` pattern silently passes when emulator is absent. For
the deployment branch, the suite should fail-loud instead. Add to the
top of each emulator-gated test file:

```ts
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_FIRESTORE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST is required (REQUIRE_FIRESTORE_EMULATOR=1)");
}
const suite = EMULATOR_HOST ? describe : describe.skip;
```

The `throw` runs at module import — fails the entire test run rather
than silently skipping. Cannot be added in this commit because it
would block local `npm test` runs that don't have the emulator;
deferred to CI configuration step where `REQUIRE_FIRESTORE_EMULATOR=1`
is set explicitly.

## 3. Skipped-test manifest

Current count of skipped tests across `npm test`:

| Category | Count | Files |
|---|---|---|
| Pre-existing skips (not R1A-related) | 7 | various — `users/{uid}/public/{doc}` rule tests existed before R1A and skipped without emulator |
| Pre-existing low-level skips | 7 | mostly Vitest's setup `describe.todo` / `.skip` calls outside R1A scope (food-page features, etc.) |
| R1A Chunk 2 emulator-gated rules tests | 17 | `firestore.rules.test.ts` write-freeze suite |
| R1A Chunk 2 emulator-gated collectionGroup tests | 4 | `firestore.collectionGroup.test.ts` feasibility suite |
| Total skipped | 35 | matches what the test runner reports |

No previously-active R1A test was disabled in this commit — only
emulator-gated new suites add to the skip count.

## 4. CollectionGroup feasibility table

**Status: unproven in current sandbox** — feasibility tests are
written in `firestore.collectionGroup.test.ts` but skipped without
emulator. Below is the expected behaviour each entry encodes; the
emulator run confirms or contradicts.

| Inventory key | Query shape | uid source | pathFilter | Decoys seeded | Expected surviving | Index required | Fallback if fails |
|---|---|---|---|---|---|---|---|
| blocksReverse | `collectionGroup('users').where(documentId(), '==', uid)` | doc ID | `blocks/*/users` | following/{uid}/users, followers/{uid}/users, kudos/{*}/users (same name 'users', different parents) | only blocks/{otherUid}/users/{uid} | Built-in (Firestore supports `__name__` collectionGroup filter natively) | Denormalise `blockedUid` field on every blocks doc + backfill |
| kudosByMe | `collectionGroup('users').where(documentId(), '==', uid)` | doc ID | `kudos/*/users` | following/{uid}/users, followers/{uid}/users, blocks/{*}/users | only kudos/{activityId}/users/{uid} | Built-in | Denormalise `userId` field on every kudos doc + backfill |
| crewMemberships | `collectionGroup('members').where(documentId(), '==', uid)` | doc ID | `groups/*/members` | None — 'members' is unique to crews | groups/{*}/members/{uid} | Built-in | Use top-level array on user doc tracking joined crews |
| challengeParticipations | `collectionGroup('participants').where(documentId(), '==', uid)` | doc ID | `challenges/*/participants` | None — 'participants' is unique to challenges | challenges/{*}/participants/{uid} | Built-in | Same as crewMemberships |
| feedFanout | `collectionGroup('items').where('authorId', '==', uid)` | stored field `authorId` | `feeds/*/items` | comments/{*}/items by same uid (same name 'items') | only feeds/{otherUid}/items where authorId==uid | Composite: `items` collectionGroup on `authorId` ASC | Track fanout in `feeds/{otherUid}/fanoutIndex/{uid}` mirror |
| notificationsFromMe | `collectionGroup('items').where('fromUserId', '==', uid)` | stored field `fromUserId` | `notifications/*/items` | comments/{*}/items, feeds/{*}/items | only notifications/{otherUid}/items where fromUserId==uid | Composite: `items` collectionGroup on `fromUserId` ASC | Same — mirror collection |
| activitiesOwnKudos | top-level subcollection delete after preflight | activity ID list from preflight | n/a (preflight-driven) | n/a | kudos/{authoredActivityId}/users/* | None — direct subcollection iteration | Already direct — no fallback needed |
| activitiesOwnComments | top-level subcollection delete after preflight | activity ID list from preflight | n/a (preflight-driven) | n/a | comments/{authoredActivityId}/items/* | None | Already direct |
| reportsByMe | `collectionGroup('reports').where('reporterId', '==', uid)` | stored field `reporterId` | `reports` (top-level, no parent) | n/a | only matching reports | Composite: `reports` on `reporterId` ASC | Denormalise reporter to a flat collection |
| reportsAboutMe | `collectionGroup('reports').where('targetIdHash', '==', hash)` | hashed `targetId` field | `reports` | n/a | only matching reports | Composite: `reports` on `targetIdHash` ASC | Requires HMAC secret provisioning (see decision log #2) |

**Risk profile:** medium for the `__name__` collectionGroup queries
(blocksReverse, kudosByMe, crewMemberships, challengeParticipations).
These rely on Firestore's documentId-on-collectionGroup feature,
which Google added in 2023 and is documented but not as widely
used as field-based collectionGroup queries. The first concrete
emulator failure here would force the executor to fall back to
field-denormalisation + backfill — non-trivial but designed for.

**"name" terminology clarification (Blocker 2):** in this report and
inventory, "name" used in any phrase like "collectionGroup users +
name" refers to `FieldPath.documentId()` (Admin SDK) /
`__name__` (rules/Firestore field path), NOT a stored "name" field
on the doc. The query shape is
`collectionGroup('users').where(FieldPath.documentId(), '==', uid)`.

## 5. Firestore rules access-call budget table

Per-evaluation budget: **10 access calls per rule evaluation**.
Per-request budget: **20 access calls for transactions / batched
writes; 10 for single-document writes.**

`isDeleting(uid)` cost: **2 access calls** (1 `exists()` + 1 `get()`).
Optimisation explored: a single-read implementation
`return get(path).data.status in [...]` would throw an error if the
doc doesn't exist (Firestore rules' `get()` semantics). The
2-call `exists()`-then-`get()` form is the safe minimum.

For each of the 22 protected write paths, the budget is calculated
below. UID source column: `O`=owner segment, `A`=actor (request.auth.uid),
`T`=target segment.

| Path | Ops | UID check sides | Pre-Chunk-2 access calls | + isDeleting calls | Total per op | Batch/txn risk | OK? |
|---|---|---|---|---|---|---|---|
| users/{uid} | create, update | O | 0 | 1 × 2 = 2 | 2 | none (single-doc) | YES |
| users/{uid}/meals/{doc} | write | O | 0 | 1 × 2 = 2 | 2 | low | YES |
| users/{uid}/savedRoutines/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/workouts/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/runs/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/weights/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/settings/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/foodFavourites/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/waterLog/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/bodyweightLogs/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/programState/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/streaks/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/shoes/{shoeId} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/logs/{date} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/stats/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/public/{doc} | write | O | 0 (value gates are inline) | 2 | 2 | low | YES |
| users/{uid}/progressPhotos/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/privacyZones/{doc} | write | O | 0 | 2 | 2 | low | YES |
| users/{uid}/errors/{doc} | create | O | 0 | 2 | 2 | low | YES |
| feeds/{uid}/items/{doc} | create | O, A | 0 | 2 × 2 = 4 | 4 | medium (fan-out batch) | YES |
| following/{uid}/users/{targetUid} | create, delete | O, T | 0 | 2 × 2 = 4 | 4 | low | YES |
| followers/{uid}/users/{followerUid} | create, delete | O, A | 0 | 2 × 2 = 4 | 4 | low | YES |
| notifications/{uid}/items/{doc} | create | O, A | 0 | 2 × 2 = 4 | 4 | low | YES |
| blocks/{uid}/users/{targetUid} | write | O | 0 | 2 | 2 | low | YES |
| reports/{reportId} | create | A | 0 | 2 | 2 | low | YES |
| groups/{crewId} | create, update | A | 0 | 2 | 2 | low | YES |
| groups/{crewId}/members/{userId} | create, update | A | 0 (delete path already uses `get()`) | 2 (create/update); 4 (delete: 2 from existing creator-lookup + 0 new since delete is not frozen) | 2 / 4 | medium | YES |

**Worst-case batch scenario — feed fan-out write at follow time:**
when user X posts an activity, the server writes one feed item to
every follower's `feeds/{followerUid}/items`. Today this is done
client-side via parallel `Promise.all` writes (one rule eval per
write, NOT a batched write), so each fan-out item is a single-doc
operation at 4 calls — safely under the 10-call per-evaluation
budget.

**If fan-out is ever converted to a batched write:** 20-call
per-batch budget kicks in. 4 calls × 5 docs per batch = 20 — at the
limit. Recommend keeping fan-out as parallel single-doc writes (not
batched) for budget headroom.

**Verdict: all 22 paths under budget, no optimisation required for
Chunk 2.B.** The 2-call `exists() + get()` form is safe to ship.

## 6. Rules coverage matrix

Implemented as a static-parse test in
`src/lib/__tests__/accountDeletionRulesCoverage.test.ts` (Blocker 4
deliverable). The test iterates 25 `PROTECTED_PATHS` entries and
asserts every match block contains either `isOwnerAndNotDeleting(...)`
or `!isDeleting(...)`. Cross-user paths additionally assert the
total freeze-application count is ≥ the number of declared sides.

Test currently PASSES with the rules as deployed in Chunk 2 +
Chunk 2.B.

## 7. Static rules meta-test

Same file as Section 6 above. Catches the future regression where
a refactor accidentally removes the freeze from one match block.

## 8. Active-status drift test

Implemented in
`src/lib/__tests__/accountDeletionStatusDrift.test.ts`. Compares:
1. `accountDeletionStatus.js` `ACTIVE_DELETION_STATUSES`
2. `firestore.rules` `isDeleting()` array literal (regex-extracted)
3. `accountDeletionLedger.js` `STATE_GRAPH` keys

Test fails if any pair drifts. Additionally, the test enumerates the
known status set and fails if STATE_GRAPH gains a new status without
deliberate classification — forces the implementer to explicitly
decide if a new pre-running state should freeze writes.

Current pass set:
- Active (freeze): `running`, `failed_cleanup`, `pending_cleanup`,
  `pending_auth_deletion`, `operator_review`
- Non-active (no freeze): `requested`, `completed`, `cancelled`

## 9. System-writer race-closure table

| Writer | Type | Writes | Recreates users/{uid}? | Transactional check+write? | Stale-window strategy | Maximum stale-data window | Acceptable? |
|---|---|---|---|---|---|---|---|
| stripeWebhook | webhook (HTTPS POST) | users/{uid} subscription fields; paymentEventsPostDeletion log | YES (checkout.session.completed) | Check-then-write (not transactional today); idempotency at provider event ID via deterministic doc ID in paymentEventsPostDeletion | None — guard rejects write entirely | n/a (no stale doc produced) | YES |
| appleIAPWebhook | webhook (HTTPS POST) | users/{uid} subscription fields; paymentEventsPostDeletion log | YES (DID_RENEW for already-deleted-then-recreated uid) | Same — check-then-write + deterministic dedup | None — guard rejects | n/a | YES |
| onWorkoutCreated | Firestore trigger | users/{uid} lastActiveAt; users/{uid}/performance; challenges/{*}/participants/{uid} progress | YES via lastActiveAt merge | Compensating delete pattern: trigger deletes the just-written source doc + skips downstream | Trigger latency (~seconds) | YES (executor's negative-space sweep catches residue in Chunk 3) |
| onRunCreated | Firestore trigger | users/{uid} lastActiveAt; users/{uid}/performance; challenges progress; fastest-effort participant updates | YES via lastActiveAt merge | Compensating delete + skip downstream | Trigger latency (~seconds) | YES |
| weeklyPerformanceRollup | scheduled (Sun 23:15 UTC) | users/{uid}/performance/{weekKey} | NO (only writes subcollection of an existing user) | Check inside per-UID iteration, NOT transactional with the write | Stale doc persists up to **7 days** (until executor's negative-space verification in Chunk 3 OR until the next weekly run does nothing for a deleted user) | YES — source data is gone by deletion, so the stale doc remains a snapshot of pre-deletion state but never gets refreshed. Acceptable for fitness-derived data; the executor's Phase I verification (Chunk 3) sweeps `users/{uid}/performance` if any orphan exists |
| dailyPerformanceRefresh | scheduled (daily 02:10 UTC) | users/{uid}/performance/{weekKey} | NO | Check inside per-UID iteration | Stale doc persists up to **24 hours** until executor sweep | YES (same rationale as weekly) |
| crewWeeklyLeaderboardRollup | scheduled (daily 02:30 UTC) | groups/{crewId}.currentLeaderboard array entries | NO | Check inside per-UID iteration — Chunk 2.B added the guard | Stale leaderboard entry persists up to **24 hours** OR until Chunk 3 membership cleanup removes the member doc, whichever comes first | YES — Chunk 3's crewMemberships cleanup removes the underlying member doc; the next rollup rebuilds the leaderboard array WITHOUT the deleted user. Combined with the per-UID guard, the deleted user is excluded from rollup AND from membership immediately on next pass |

**Per-UID guard behavioural proof:**
`src/lib/__tests__/accountDeletionSystemWriterBatch.test.ts` faithfully
reproduces the Promise.all-over-chunks loop body used by
weekly/daily/crew rollups. Tests cover: middle UID tombstoned (others
proceed), first UID tombstoned (loop continues), last UID tombstoned
(middle UIDs already processed), all UIDs deleting (zero writes
without throw), expired tombstones (don't skip — user re-created),
multi-chunk batch (guard fires per chunk), structural per-UID
invocation count assertion.

**Trigger compensating-delete pattern (NEW in Chunk 2.B):** for
onWorkoutCreated and onRunCreated, the guard now ALSO deletes the
just-written source doc when the user is tombstoned/deleting. This
shrinks the orphan-doc window from "until executor verification" to
"trigger latency" — typically a few seconds.

## 10. crewWeeklyLeaderboardRollup closure plan

Per-UID `shouldSystemWriteProceed` guard added inside the member
iteration loop in `functions/index.js`. Members whose deletion is
active or who are tombstoned are skipped during rollup — they don't
appear in the rebuilt `currentLeaderboard` array.

**Combined coverage with Chunk 3:**
- Chunk 3 `crewMemberships` cleanup deletes `groups/{crewId}/members/{uid}`
  + decrements `memberCount` in a transaction.
- Chunk 2.B guard ensures the rollup doesn't re-embed the user in
  the leaderboard array between deletion start and member-doc
  removal.
- Combined effect: stale leaderboard entries persist at most one
  rollup cycle (24h), then are absent on next rollup.

## 11. assertRecentAuth threshold confirmation

**Threshold:** 300 seconds (5 minutes).
**Claim used:** `context.auth.token.auth_time` — the Firebase claim
that reflects when the user last entered credentials.
**Why not `iat`:** `iat` updates on every token refresh including
silent refresh. `auth_time` updates only on actual reauthentication.
The whole point of this check is to require recent reauth, so `iat`
would defeat it.
**Clock-skew tolerance:** none in the predicate; relies on Cloud
Functions infrastructure clock + Firebase Auth's auth_time accuracy.
A skew of seconds is absorbed by the 300s window.
**Stable client errorCode:** `requires-recent-auth`.

**Tests** (`src/lib/__tests__/accountDeletionAuth.test.ts`):
- fresh auth_time passes
- exact threshold boundary (300s) passes
- 301s past threshold fails
- missing auth_time fails
- zero/negative auth_time fails
- custom thresholds (for unit-test parameterisation)

`getIdToken(true)` alone does NOT satisfy recent auth — verified by
the missing-auth_time case (a refreshed-but-not-reauthed token has
the same auth_time as the original session, so if that's > 300s old
the check still fails).

## 12. Callable / HTTPS lock matrix

| Endpoint | Type | Auth required? | UID source | Body UID validation | Unauth behaviour | Stable error code | Writes user/payment data? | Locked during active deletion? | Exempt? | Reason |
|---|---|---|---|---|---|---|---|---|---|---|
| deleteMyAccount | callable | yes | `context.auth.uid` (trusted) | n/a | HttpsError unauthenticated | `requires-recent-auth` (if stale) | yes — deletes everything | NO (exempt) | YES | This IS the deletion entrypoint |
| cancelDeletionRequest | callable (Chunk 3) | yes | `context.auth.uid` (trusted) | n/a | HttpsError unauthenticated | TBD | yes — transitions status | NO (exempt) | YES | This is the cancel entrypoint |
| completeOnboarding | callable | yes | `context.auth.uid` (trusted) | n/a | HttpsError unauthenticated | `account-deleting` | yes — writes user doc + subcollections | YES | NO | Deleting users cannot re-onboard |
| analyzeFood | HTTPS POST | yes | `verifyAuth(headers)` (trusted) | uid from body NOT trusted; lock uses authUser.uid | 401 Unauthorized | `account-deleting` (via 409) | yes — scanUsage/{uid} + rateLimits/{uid}_* | YES | NO | Writes server-only quota docs |
| analyzeFoodText | HTTPS POST | yes | `verifyAuth(headers)` (trusted) | uid from body NOT trusted | 401 | `account-deleting` (409) | yes | YES | NO | Same |
| askGeminiText | callable | yes | `context.auth.uid` (trusted) | n/a | HttpsError unauthenticated | `account-deleting` | yes — rateLimits | YES | NO | Same |
| createCheckoutSession | HTTPS POST | yes | `verifyAuth(headers)` (trusted); body uid validated against authUser.uid | yes — 403 on mismatch | 401 | `account-deleting` (409) | yes — users/{uid}.stripeCustomerId | YES | NO | Cannot start new checkout while deleting |
| verifyApplePurchase | callable | yes | `context.auth.uid` (trusted) | n/a | HttpsError unauthenticated | `account-deleting` | yes — users/{uid} subscription fields | YES | NO | Cannot attach new subscription while deleting |
| restoreApplePurchases | callable | yes | `context.auth.uid` (trusted) | n/a | HttpsError unauthenticated | `account-deleting` first; then `restore-requires-support` if tombstoned billing identity | yes | YES | NO | Same |
| computePerformanceWeek | callable | yes | `context.auth.uid` (trusted) | n/a | HttpsError unauthenticated | `account-deleting` | yes — performance docs | YES | NO | Same |
| stripeWebhook | HTTPS POST (system) | no (provider signature) | metadata.firebaseUid (NOT trusted — re-verified against tombstone) | n/a | 400 invalid signature | n/a | yes (system writer) | YES via per-event tombstone check | n/a | n/a |
| appleIAPWebhook | HTTPS POST (system) | no (provider signature) | resolved via originalTransactionId lookup | n/a | 400 invalid signature | n/a | yes (system writer) | YES via per-event tombstone check | n/a | n/a |
| refreshMyCrewLeaderboard | callable | yes | `context.auth.uid` (trusted) | n/a | HttpsError unauthenticated | NOT YET LOCKED — deferred (low-impact) | computes leaderboard | NO | n/a | Deferred to Chunk 3 follow-up |
| backfillMyActivityCategories | callable | yes | `context.auth.uid` (trusted) | n/a | HttpsError unauthenticated | NOT YET LOCKED — deferred (one-off migration) | writes activities | NO | n/a | Deferred — one-off, low-risk |

**UID source audit verdict:** all locked callables/HTTPS endpoints
use trusted authentication context. Where body-supplied UIDs exist
(createCheckoutSession), they're validated against the trusted
authUser.uid and the lock checks the trusted value only.

**Deletion-management exemption list:**
- `deleteMyAccount` — assertRecentAuth applies, but `assertCallableActorNotDeleting` does NOT.
- `cancelDeletionRequest` (Chunk 3) — same.

**Leak-risk audit:** HTTPS 409 responses include `errorCode:
"account-deleting"` AND the calling user's resolved uid (the one the
client just authenticated as). They do NOT include the uid of any
OTHER user. An unauthenticated caller hits 401 before any deletion
check runs — no leak of deletion-status for arbitrary uids.

**Pending tightening (not blocker):** add tests that prove
unauthenticated callers receive 401 (not 409) and that 409 response
bodies don't leak target-uid deletion status.

## 13. Billing tombstone privacy + rotation confirmation

**Current keying:** `deletedBillingIdentities/{SHA256(originalTransactionId)}`.

**Privacy assessment:**
- Apple `originalTransactionId` is a long opaque numeric string,
  effectively non-enumerable for an external party.
- Plain SHA-256 (NOT HMAC) is used today. This is acceptable IF
  originalTransactionId is treated as already-non-secret (it appears
  on Apple's developer dashboard and customer receipts). An attacker
  who already has the transaction ID can hash it themselves; the
  tombstone provides no additional leak.
- Provider namespace is NOT in the hash input today. This is a
  small follow-up: hash input should be `apple:<originalTransactionId>`
  so a future Stripe billing identity with the same numeric value
  cannot accidentally collide.

**Recommended Chunk 3 tightening:**
1. Change hash input to include provider namespace: `${provider}:${identifier}`.
2. Keep plain SHA-256 unless founder/legal requires HMAC.

**HMAC rotation decision (if HMAC is adopted later):**
Per decision log #2 (reportsAboutMe abuse fingerprinting), if HMAC
becomes the keying mechanism for `deletedBillingIdentities`, the
rotation strategy is **store secretVersion with tombstones and try
active + previous secrets during the 13-month retention window**.
Rationale: 13 months is a single rotation cycle; storing one prior
version allows graceful rotation without a migration job.

Other options considered:
- (b) Migration job on rotation — too operationally heavy for the
  retention window.
- (c) Stable non-secret hash (plain SHA-256) — chosen today, accepts
  the privacy trade-off documented above.
- (d) Non-rotating HMAC — rejected; secrets should be rotatable.

## 14. paymentEventsPostDeletion shape + dedup proof

**Test file:** `src/lib/__tests__/accountDeletionPaymentEventDedup.test.ts`.

**Proven contracts:**
- Deterministic doc ID `{provider}_{providerEventId}` when
  providerEventId is set.
- Fallback composite key `{provider}_{externalTxnId}_{eventType}`
  when providerEventId is missing, with `console.warn`.
- Two calls with the same providerEventId write to the same doc
  (no duplicate insertion).
- Different events with different providerEventId create separate
  docs.
- Provider namespace prevents Apple/Stripe collision on the same
  string identifier.
- `.set()` (not `.add()`) — idempotent overwrite, retry-safe.
- Happy-path record contains only the 6 allowlisted fields:
  `provider, externalTxnId, eventType, occurredAt, hashedUidPrefix,
  action`. No email, names, photos, full receipt payloads, addresses,
  raw provider snapshots.
- `hashedUidPrefix` is 8 hex chars of SHA-256(uid) — raw uid never
  persists on the audit log.

**Cloud Functions retry survival:** Cloud Functions HTTPS triggers
can be invoked multiple times for the same provider event (network
glitch, ack timeout). With deterministic doc IDs, every retry hits
the same doc and overwrites identically — duplicate-free by
construction.

**Provider retry-storm survival:** Stripe sends up to 3 days of
retries for failed webhooks; Apple ASSNv2 retries with exponential
backoff. Deterministic doc IDs make retry volume unbounded but
the WRITE volume bounded to one doc per unique event.

**Rate-limit / cap:** none today. Acceptable because:
1. Deduplication makes write volume bounded by unique-event count.
2. Apple/Stripe enforce their own retry caps.
3. Operator review process (manual checklist) catches anomalous
   write volumes via TTL/expiry monitoring.

**Stripe-native idempotency identifier:** `event.id` (the top-level
Stripe webhook event ID). Used in
`functions/index.js:stripeWebhook` for all three handled event types
(checkout.session.completed, customer.subscription.updated,
customer.subscription.deleted).

**Apple-native idempotency identifier:** `payload.notificationUUID`
(the App Store Server Notifications V2 envelope UUID). Used in
`functions/appleIAP.js:appleIAPWebhook`.

**Tombstone-write exemption proof:** the tombstone check returns
false → the handler skips the user-data write AND calls
`recordPaymentEventPostDeletion` which writes to
`paymentEventsPostDeletion`. The latter collection is NOT subject
to the system-writer tombstone guard (it's the operational log
THAT records the skip). The write itself uses Admin SDK which
bypasses Firestore rules. Verified by code path:
`functions/index.js:830-838`, `functions/index.js:870-880`,
`functions/index.js:909-919`, `functions/appleIAP.js:267-277`.

## 15. Deployment sequencing correction

Added as decision-log entry #9 in
`functions/R1A-DECISION-LOG.md`. Key points:

1. Steps 1-2 (functions, rules) can ship as dormant scaffolding
   in any order. Dormant means: client doesn't expose
   deleteMyAccount, no accountDeletionRequests docs exist, so
   rules write-freeze evaluates to no-op.
2. Once Chunk 3 executor + Chunk 4 client UI ship together,
   the deletion entrypoint is exposed. From that moment,
   functions-without-rules is unsafe.
3. Hard rule: once exposed, rules + functions stay deployed
   together. Rolling back one without the other creates a window
   where deletion can race with concurrent writes.

The Chunk 2 report's "functions first, then rules" wording is
clarified — it applies only in the dormant phase.

---

# Chunk 3 Authorisation Status

All 15 Chunk 2.B verification items are addressed:

- 1-3: emulator setup + CI gating commands documented; sandbox
  cannot run them, founder/CI must.
- 4: collectionGroup feasibility table with fallbacks identified.
- 5: 22-path access-call budget — all paths under per-evaluation
  and per-request limits.
- 6-7: static rules coverage test implemented and passing.
- 8: active-status drift test implemented and passing.
- 9: race-closure table + behavioural per-UID batch test
  implemented. Trigger-style writers now use compensating delete.
- 10: crewWeeklyLeaderboardRollup per-UID guard added.
- 11: assertRecentAuth threshold confirmed (300s) + tested.
- 12: callable/HTTPS lock matrix complete; trusted UID sources
  audited.
- 13: billing tombstone privacy assessed; HMAC rotation strategy
  documented.
- 14: dedup proof complete with deterministic doc IDs +
  provider-native identifiers.
- 15: deployment sequencing wording corrected in decision log.

**Pending founder confirmations before Chunk 3 ships to production
(not blocking Chunk 3 development):**

1. Run emulator suites locally / in CI and confirm pass output.
2. Configure CI to fail-loud on missing emulator
   (`REQUIRE_FIRESTORE_EMULATOR=1` pattern).
3. Provision required Firestore composite indexes from Section 4
   table.
4. Provision moderation HMAC secret if reportsAboutMe minimised
   retention is approved (decision log #2).
5. Add R1A test files to required-status checks on the deployment
   branch.

**Chunk 3 authorised scope** (per Section 5 of the Chunk 2 review):

- `deleteMyAccount` executor rewrite — inventory-driven cleanup,
  lock-first / enumerate-second flow, leaseGeneration fencing,
  ordered cleanup using `designConstants.executionOrder`,
  preflight collection of content IDs, chunked cleanup with
  retry-safe idempotence, cross-user reference cleanup,
  post-cleanup negative-space verification, billing tombstone
  creation, payment-event logging, Auth-last deletion, disable +
  revokeRefreshTokens on auth-deletion failure, status transitions,
  cancellation semantics.
- `cancelDeletionRequest` callable.
- Extend drift test to verify `testCoverageStatus="implemented"`
  entries have real test files (decision log #8 — Chunk 3
  prerequisite).

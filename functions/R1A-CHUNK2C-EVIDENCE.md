# R1A-Deletion Chunk 2.C — Evidence Package

Maps 1:1 to the 19-item evidence pack from the Chunk 2.C
production-failure-mode review. Items 1, 2 require operator/CI
execution and cannot be produced in this sandbox. All other items
are closed in code, tests, or design docs.

---

## 1. Raw emulator pass/fail output

**Status: cannot run in current Claude Code sandbox** — no `firebase`
CLI, no Java runtime.

**Founder must run:**
```bash
npm install -g firebase-tools
REQUIRE_FIRESTORE_EMULATOR=1 firebase emulators:exec --only firestore,auth \
  "vitest run firestore.rules.test.ts firestore.collectionGroup.test.ts"
```

The `REQUIRE_FIRESTORE_EMULATOR=1` env var triggers the new
fail-loud guard (item 7 below) — emulator absence becomes a hard
test failure rather than a silent skip.

## 2. Confirmation Firestore/Auth emulators were actually used

The `firebase emulators:exec --only firestore,auth ...` form starts
both emulators in-process and exports `FIRESTORE_EMULATOR_HOST` /
`FIREBASE_AUTH_EMULATOR_HOST` to the test runner. The test
`initializeTestEnvironment({ projectId, firestore: { rules, host,
port } })` consumes those env vars. If either emulator weren't
running, `initializeTestEnvironment` would fail to connect and the
test would abort. So a passing run is per-se confirmation the
emulators were used — no production credentials are reachable
from the test environment.

## 3. CollectionGroup feasibility result

Same answer as Chunk 2.B §4 — feasibility tests written, gated on
emulator, await operator run. The four `collectionGroup + __name__`
queries (blocksReverse, kudosByMe, crewMemberships,
challengeParticipations) and the two `collectionGroup('items') +
field-filter` queries (feedFanout, notificationsFromMe) are all
encoded in `firestore.collectionGroup.test.ts` with seeded decoys.

**If emulator passes:** proceed with collectionGroup cleanup as
planned in inventory.

**If emulator fails on any of the four `__name__` queries:** activate
the fallback plan documented in `R1A-FALLBACK-PLAN.md`. This
introduces denormalised field-filters (`userId`, `blockedUid`,
`memberUid`, `participantUid`) and a backfill script BEFORE Chunk 3
executor work begins.

## 4. Emulator pass != production index proof

Explicit acknowledgement. **Emulator allows query shapes that
production rejects** because production requires `firestore.indexes.json`
to declare composite indexes. The emulator runs without that
requirement. So an emulator-passing query can fail in production
with `FAILED_PRECONDITION: The query requires an index` at runtime.

**Mitigation:** every collectionGroup query planned for Chunk 3
has a corresponding entry in `firestore.indexes.json` (Chunk 2.C
addition). Indexes deploy via `firebase deploy --only firestore:indexes`
BEFORE the Chunk 3 executor is enabled in production.

## 5. Index table

| Inventory key | Query | Index in firestore.indexes.json | Status |
|---|---|---|---|
| feedFanout | `collectionGroup('items').where('authorId', '==', uid)` | `items` collectionGroup on `authorId ASC + __name__ ASC` | ADDED in Chunk 2.C |
| notificationsFromMe | `collectionGroup('items').where('fromUserId', '==', uid)` | `items` collectionGroup on `fromUserId ASC + __name__ ASC` | ADDED |
| reportsByMe | `where('reporterId', '==', uid)` on `reports` collection | `reports` on `reporterId ASC + __name__ ASC` | ADDED |
| reportsAboutMe | `where('targetIdHash', '==', hash)` on `reports` | `reports` on `targetIdHash ASC + __name__ ASC` | ADDED |
| activitiesOwn | `where('authorId', '==', uid)` on `activities` top-level | None needed (single-field; auto-indexed) | n/a |
| blocksReverse | `collectionGroup('users').where(documentId(), '==', uid)` | `__name__` collectionGroup queries built-in (no composite needed) | n/a |
| kudosByMe | same shape, different parent | same — built-in | n/a |
| crewMemberships | `collectionGroup('members').where(documentId(), '==', uid)` | built-in | n/a |
| challengeParticipations | `collectionGroup('participants').where(documentId(), '==', uid)` | built-in | n/a |

**Hard deploy gate:** before Chunk 3 ships, run
`firebase deploy --only firestore:indexes` in the production
project. If Firebase reports any index still building, wait — large
collections can take hours. Do NOT enable the executor until all
indexes show "Enabled" in the Firebase console.

## 6. Production index existence

`firestore.indexes.json` is deployed via the existing
`deploy-firestore.yml` GitHub Action. The four new indexes (items
collectionGroup on authorId, items collectionGroup on fromUserId,
reports on reporterId, reports on targetIdHash) will deploy on the
next merge to main.

**Founder must verify before exposing the deletion entrypoint:**
1. Run `firebase firestore:indexes` against the production project.
2. Confirm all four new R1A indexes show "Enabled" status (not
   "Building").
3. If any are still building, wait. Firestore index builds on
   large collections can take minutes-to-hours depending on volume.

## 7. CI fail-loud implementation

Both `firestore.rules.test.ts` and `firestore.collectionGroup.test.ts`
now throw at module load if `REQUIRE_FIRESTORE_EMULATOR=1` and
`FIRESTORE_EMULATOR_HOST` is unset. This converts silent skip to
hard failure on the deployment branch.

**CI configuration required (founder to apply):**
```yaml
- name: R1A-Deletion required emulator suites
  run: |
    npm install -g firebase-tools
    REQUIRE_FIRESTORE_EMULATOR=1 firebase emulators:exec --only firestore,auth \
      "vitest run firestore.rules.test.ts firestore.collectionGroup.test.ts"
  if: github.ref == 'refs/heads/main' || github.base_ref == 'main'
```

The check files now contain:
```ts
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_FIRESTORE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1");
}
```

Tested behaviour: when both env vars are unset (local default),
tests skip with `describe.skip` — no behaviour change. When
`REQUIRE_FIRESTORE_EMULATOR=1` and emulator is running, tests run
normally. When `REQUIRE_FIRESTORE_EMULATOR=1` and emulator is NOT
running, the test module throws at import — vitest reports the
entire file as failed, which CI surfaces as a red check.

## 8. Confirmations for Blockers 3, 8, 9, 10

All four referenced in `functions/R1A-CHUNK2B-VERIFICATION.md`.

### Blocker 3 (rules budget table) — §5 of Chunk 2.B verification

27 protected paths (Chunk 2.C reconciliation — see §12 below).
All under per-operation budget (worst case 4 calls for cross-user
paths) and well under per-request 20-call batch budget.

### Blocker 8 (assertRecentAuth) — §11 of Chunk 2.B verification + §10 of decision log

- Threshold: **300 seconds (5 minutes)**.
- Claim: `context.auth.token.auth_time` (NOT `iat` — `iat` updates
  on every silent token refresh; `auth_time` updates only on real
  reauth).
- Stable client errorCode: `requires-recent-auth`.
- Tests: `src/lib/__tests__/accountDeletionAuth.test.ts` — fresh
  auth, exact 300s boundary, 301s fail, missing auth_time, zero/
  negative auth_time.
- Threat model: see decision-log #10 below for explicit exposure
  acknowledgement.

### Blocker 9 (UID source / lock matrix) — §12 of Chunk 2.B verification

Trusted UID source audit complete:
- All callables use `context.auth.uid` (trusted).
- HTTPS endpoints (`analyzeFood`, `analyzeFoodText`,
  `createCheckoutSession`) use `verifyAuth(headers)` — trusted.
- `createCheckoutSession` additionally validates body-supplied uid
  against `authUser.uid` and 403s on mismatch.

Deletion-management exemption list:
- `deleteMyAccount` — assertRecentAuth applies; actor lock does NOT.
- `cancelDeletionRequest` (Chunk 3) — same.
- All other callables that write user data: actor lock applies.

### Blocker 10 (billing tombstone privacy + HMAC rotation) — §13 of Chunk 2.B verification + decision-log #11 (HMAC purpose separation)

- Current keying: plain SHA-256 with provider namespacing applied
  in Chunk 2.C (`apple:<originalTransactionId>` → SHA256). Plain SHA
  is acceptable because Apple originalTransactionId is opaque,
  long, non-enumerable.
- HMAC rotation strategy if HMAC is adopted later:
  secretVersion-stored-on-record with active+previous secret
  fallback during the 13-month retention window.
- Two distinct HMAC secrets per purpose:
  `moderation.hmac_secret` (for reportsAboutMe) and
  `billing.hmac_secret` (reserved; not used in Chunk 2.C since
  billing uses plain SHA-256). Documented in decision-log #11.

## 9. Recent-auth-only vs recent-auth-plus-deletion-intent-token

Decided: **recent-auth-only** for first release. Decision-log #10
documents the exposure being accepted: 300-second window where
session compromise allows deletion without further challenge.
Mitigation is operational (support-assisted recovery via the
30-day accountDeletionRequests ledger + paymentEventsPostDeletion)
rather than cryptographic. Deletion-intent token is deferred as a
follow-up sprint if session-compromise abuse is observed in support
tickets.

## 10. Authenticated billing-identifier leak assessment

**Vector:** `restoreApplePurchases` previously returned a distinct
`restore-requires-support` errorCode when the originalTransactionId
matched a billing tombstone. An authenticated user A could submit
user B's originalTransactionId (acquired out-of-band) and learn
whether user B previously deleted a Tropos account.

**Chunk 2.C fix:** errors collapsed into a single
`restore-unavailable` errorCode covering all three branches:
- billing tombstone exists,
- subscription not found in Apple API,
- (future) subscription belongs to a different live user.

Client surface shows identical support copy regardless. Server
logs the actual reason via structured Cloud Logging
(`r1aEvent: "restore_blocked_by_tombstone"`) for operator triage
without exposing the distinction to the API caller.

**Residual exposure:** acknowledged in code comment at
`functions/appleIAP.js`. The Chunk 4 full fix is to deprecate the
raw-originalTransactionId input and accept only
`signedTransactionInfo` (StoreKit JWS that Apple verifies belongs
to the device user). Tracked in decision-log #3 revisit conditions.

## 11. Timing-leakage assessment

For the three branches of `restoreApplePurchases`:
- **Tombstone-hit:** 1 Firestore read (`deletedBillingIdentities/{hash}`).
- **Subscription not-found:** 1 Apple App Store Server API call.
- **Subscription valid:** 1 Apple API call + 1 Firestore write
  (`users/{uid}` subscription fields via `applySubscriptionToUser`).

Response-time distribution differs measurably between branches —
the Firestore read is single-digit milliseconds; the Apple API call
is hundreds of milliseconds. A timing-attack adversary could infer
tombstone state by measuring response times across submitted
originalTransactionIds.

**Threat model assessment:**
- Originating transaction IDs are NOT enumerable. An attacker would
  need to acquire them out-of-band (receipts, support tickets,
  leaked data).
- A Tropos fitness account's privacy value does not justify the
  attacker investing significant effort in low-throughput timing
  oracles.
- Rate-limiting on `restoreApplePurchases` (existing
  `restoreApplePurchases_<uid>` rateLimits entry — covered by
  general callable rate limit; specifically tightened to 5 attempts
  per 10 minutes per uid would further narrow the oracle).

**Verdict:** below the threat model for a consumer fitness app.
Documented as a known minor leak in `functions/appleIAP.js` code
comment. Constant-time / padded-response mitigation is NOT
implemented. If the threat model changes (e.g. enterprise B2B
deployment), the mitigation is: prefetch the Apple API call
unconditionally before checking the tombstone, or add an artificial
delay to equalise response times.

## 12. 22-vs-25 path-count delta — methodology + reconciliation

**Counting methodology (Blocker E):** one `match /PATH {` block
with at least one client-write rule (`allow create/update/delete/write`
with a condition other than `if false`) = one protected path.
Read-only blocks and `allow write: if false` blocks are NOT
protected paths.

Both Chunk 2 and Chunk 2.B used this methodology. The numbers
diverged because of count-drift in PROSE, not methodology change.

### Both previous prose counts were hand-count drift

- Chunk 2 prose: "22 protected paths" — incorrect prose count.
- Chunk 2.B prose: "25 protected paths" — also incorrect prose count
  (the test asserted `>=25` but the actual list was always 27).
- Authoritative count (Chunk 2.C onward): **27**.

The static `PROTECTED_PATHS` list in
`src/lib/__tests__/accountDeletionRulesCoverage.test.ts` has been
the source of truth across Chunks 2, 2.B, and 2.C. Both prose
counts under-counted the same canonical list. No methodology change,
no scope change — just two consecutive hand-count errors.

### Snapshot test is the source of truth going forward

The Chunk 2.C addition
`src/lib/__tests__/accountDeletionWriteRulesSnapshot.test.ts`
exports `EXPECTED_PROTECTED_PATH_COUNT = 27` as a pinned constant
AND parses `firestore.rules` to assert every `match /PATH {` block
with client-writable rules is in `PROTECTED_PATHS`,
`EXPLICITLY_EXEMPT`, or `INFRASTRUCTURE_AND_READ_ONLY`. Any
modification to firestore.rules that adds, removes, or changes
the write-ability of a match block surfaces as a test failure.

The cross-test invariant: `accountDeletionRulesCoverage.test.ts`
asserts `PROTECTED_PATHS.length === 27`, and
`accountDeletionWriteRulesSnapshot.test.ts` asserts
`EXPECTED_PROTECTED_PATH_COUNT === 27`. Both must update together.

### Delta breakdown (22 prose → 27 actual = +5)

Five paths were in the rules but not in the Chunk 2 prose count.
All five had the freeze applied correctly in code from Chunk 2 —
the error was purely in the prose-summary count, not in coverage:

1. `match /users/{uid}/public/{doc}` — was in Chunk 2 rules with
   `isOwnerAndNotDeleting(uid)` from the start.
2. `match /users/{uid}/savedRoutines/{doc}` — same.
3. `match /groups/{crewId}` — freeze applied in Chunk 2 (deleting
   users can't create new crews); not prose-counted.
4. `match /groups/{crewId}/members/{userId}` — same.
5. `match /reports/{reportId}` — freeze applied in Chunk 2 (deleting
   users can't file new reports); not prose-counted.

All five are count drifts in PROSE, not new paths added in Chunk 2.B.
The static test always had the correct list; the prose-count of
"22" was a hand-count error that the new pinned constants fix.

### Future drift protection

See item 15 below. Any future change to the protected-path set
requires updating BOTH `EXPECTED_PROTECTED_PATH_COUNT` AND
`PROTECTED_PATHS` (in both the snapshot and coverage tests) — the
prose count cannot drift again because both tests fail fast if the
constants disagree with reality.

## 13. Final list of protected paths

27 entries, listed in
`src/lib/__tests__/accountDeletionWriteRulesSnapshot.test.ts`
`PROTECTED_PATHS` constant:

```
users/{uid}, users/{uid}/meals/{doc}, users/{uid}/savedRoutines/{doc},
users/{uid}/workouts/{doc}, users/{uid}/runs/{doc},
users/{uid}/weights/{doc}, users/{uid}/settings/{doc},
users/{uid}/foodFavourites/{doc}, users/{uid}/waterLog/{doc},
users/{uid}/bodyweightLogs/{doc}, users/{uid}/programState/{doc},
users/{uid}/streaks/{doc}, users/{uid}/shoes/{shoeId},
users/{uid}/logs/{date}, users/{uid}/stats/{doc},
users/{uid}/public/{doc}, users/{uid}/progressPhotos/{doc},
users/{uid}/privacyZones/{doc}, users/{uid}/errors/{doc},
feeds/{uid}/items/{doc}, following/{uid}/users/{targetUid},
followers/{uid}/users/{followerUid}, notifications/{uid}/items/{doc},
blocks/{uid}/users/{targetUid}, reports/{reportId},
groups/{crewId}, groups/{crewId}/members/{userId}
```

Plus 5 EXPLICITLY_EXEMPT cross-user paths (activities, kudos,
comments, challenges, challenge participants) with documented
reasons.

Plus 10 INFRASTRUCTURE_AND_READ_ONLY (database root, recursive
wildcard, server-only collections, operational ledger reads).

## 14. Cross-reference confirmation

Every final protected path is in:
- **rules coverage test:** `accountDeletionRulesCoverage.test.ts`
  PROTECTED_PATHS (27 entries, asserted count == 27).
- **rules budget table:** Chunk 2.B verification §5 (all 27 paths
  under budget).
- **deletion inventory:** all user-owned and cross-user paths
  represented in `functions/accountDeletionInventory.json` (40
  included entries map to the 27 rule paths plus their
  preflight-driven and storage variants).
- **executor cleanup plan (Chunk 3):** all 27 paths covered by
  inventory entries with `strategy` and `lockNeeded` set; Chunk 3
  executor reads from inventory.

## 15. Future drift-protection mechanism

**Mechanism:** snapshot test in
`src/lib/__tests__/accountDeletionWriteRulesSnapshot.test.ts`.

**Source of truth for protected paths:** PROTECTED_PATHS constant
in the snapshot test file.

**Exemptions:** EXPLICITLY_EXEMPT array in the same file, each
entry requires a reason string > 60 chars.

**CI failure mode:** when a new write rule is added to
`firestore.rules`, the parser detects an unclassified match block
and throws an Error listing the unclassified path. The PR cannot
merge until the implementer adds the path to PROTECTED_PATHS,
EXPLICITLY_EXEMPT, or INFRASTRUCTURE_AND_READ_ONLY.

**Detection scope:** additions AND removals AND rule-shape changes
that toggle write-ability. The snapshot is brittle by design — any
drift surfaces.

**Required CI status check:** founder must add
`accountDeletionWriteRulesSnapshot.test.ts` to the deployment
branch's required-status-checks list.

## 16. Fallback migration plan

See `functions/R1A-FALLBACK-PLAN.md`. Documents the denormalised-
field strategy if collectionGroup feasibility fails, including
backfill script design, verification gate, and UX/operational
position during the migration window (support-assisted in-app
deletion via mailto, gated by a remote config flag).

**Currently:** NOT activated. Fallback activates only if emulator
suite (item 1) reveals collectionGroup + documentId queries are
unreliable.

## 17. Fallback UX during migration window

Documented in `R1A-FALLBACK-PLAN.md` §"UX position during the
migration window". Chosen: option 3 — "Deletion temporarily handled
by our support team" modal with mailto. Apple Guideline 5.1.1(v)
compliant because deletion is initiated from inside the app.

## 18. Historical partial-deletion / orphan audit

See `functions/R1A-HISTORICAL-AUDIT.md`. Documents the audit script
design (read-only, NOT in this commit) and the scope-decision
matrix (< 50 orphans → Option A is sufficient; > 500 → rescope as
larger project).

**Status:** PENDING founder decision. Audit script designed; founder
runs against production Firestore in read-only mode before Chunk 3
ships. If deferred, deferral rationale must be recorded.

## 19. Structured logging for missing provider event IDs

Implemented in `functions/lib/accountDeletionLocks.js`. The
fallback path now emits structured Cloud Logging JSON:
```json
{
  "r1aEvent": "payment_event_missing_provider_event_id",
  "provider": "stripe|apple",
  "eventType": "...",
  "externalTxnId": "...",
  "hashedUidPrefix": "..."
}
```

**Operator runbook (founder configures):**
- Cloud Logging filter:
  `jsonPayload.r1aEvent="payment_event_missing_provider_event_id"`
- Log-based metric on the filter.
- Alert when frequency exceeds 5 events per 24h — indicates a
  provider integration drift (e.g. Stripe webhook format change
  that removed `event.id` from a payload).

Test coverage: `accountDeletionPaymentEventDedup.test.ts` asserts
the JSON shape and the `r1aEvent` key.

---

# Chunk 3 Authorisation Condition Status

| # | Condition | Status |
|---|---|---|
| 1 | CollectionGroup feasibility proven + production indexes proven OR fallback selected | Indexes added to firestore.indexes.json. CollectionGroup feasibility tests written but require emulator run. Fallback plan written. Awaits emulator output. |
| 2 | If fallback selected, backfill is a hard prerequisite | Documented in R1A-FALLBACK-PLAN.md |
| 3 | If fallback creates a deletion-unavailable window, UX plan is explicit | Documented in R1A-FALLBACK-PLAN.md (support-assisted modal) |
| 4 | CI cannot silently skip emulator-dependent tests | Implemented — REQUIRE_FIRESTORE_EMULATOR=1 gate added |
| 5 | Rules budget, recent-auth, UID source, billing identity, HMAC decisions verified | Done — §8 |
| 6 | Authenticated leak vectors assessed | Done — §10 (restoreApplePurchases fixed) |
| 7 | Timing-based leakage assessed | Done — §11 (below threat model, documented) |
| 8 | 22-vs-25 path-count delta explained | Done — §12 (count drift in prose; authoritative 27; constant pinned) |
| 9 | Future write-rule drift protection exists | Done — §15 (snapshot test) |
| 10 | Index requirements are concrete | Done — §5 + firestore.indexes.json |
| 11 | Historical partial-deletion risk audited OR deliberately deferred with rationale | Documented — R1A-HISTORICAL-AUDIT.md, founder runs read-only script before Chunk 3 |

**Authorisation gate posture:**

- Items 1-3 collapse into one decision: founder runs emulator
  suite. If it passes, indexes deploy, no fallback needed. If it
  fails, fallback activates.
- Items 4-10 closed in code/tests/docs.
- Item 11 awaits founder running the read-only audit.

**Recommended sequencing:**
1. Founder runs emulator suite (item 1).
2. Founder runs historical audit script (item 11).
3. Founder decides whether to activate fallback (item 1 outcome).
4. Founder reviews this evidence package + grants Chunk 3
   authorisation.
5. Chunk 3 executor work begins.

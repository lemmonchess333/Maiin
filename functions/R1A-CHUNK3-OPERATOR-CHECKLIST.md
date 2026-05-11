# R1A Chunk 3 Operator Checklist

Operator runbook for closing the three Chunk 2.D operator gates so
Chunk 3 implementation can begin.

**Current state.** Repo held at commit `f9e1db1` on branch
`claude/r1a-account-deletion`. No further development until gates
1–3 return clean. The deployment secret gates (A–B) come later,
before any Cloud Functions deploy.

**Naming convention** (per Chunk 2.D review):

- **Operator gates 1–3** (this document) — emulator, indexes, orphan audit.
- **Deployment secret gates A–B** — `billing.hmac_secret`,
  `moderation.hmac_secret`. Separate doc, applied at deploy time.

---

## Gate 1 — Emulator suite must pass with REQUIRE_FIRESTORE_EMULATOR=1

### Command

Run from the repo root:

```bash
npm install -g firebase-tools

firebase emulators:exec --only firestore,auth \
  "REQUIRE_FIRESTORE_EMULATOR=1 vitest run firestore.rules.test.ts firestore.collectionGroup.test.ts"
```

### Expected passing output

vitest summary line:

```
Test Files  2 passed (2)
Tests       47-50 passed (47-50)
```

Exact count depends on vitest's case-name resolution for parameterised
tests; the suite has ~30 rules tests + ~4 collectionGroup tests + setup.
The important assertion is:

- **2 test files passed, 0 failed, 0 skipped** (with
  REQUIRE_FIRESTORE_EMULATOR=1 set, skips are converted to hard
  failures).
- Zero tests show `(skipped)` or `(todo)` in the rules or
  collectionGroup files.

If the suite reports any skipped tests, the REQUIRE_FIRESTORE_EMULATOR
guard didn't fire — investigate before proceeding.

### CollectionGroup feasibility — the 4 tests that must pass

These tests in `firestore.collectionGroup.test.ts` map to the
executor's planned cleanup queries. Each test name and the inventory
keys it proves feasible:

| Test name (in `firestore.collectionGroup.test.ts`) | Inventory keys proven |
|---|---|
| `collectionGroup('users') + documentId == uid returns kudos+blocks+follows leaves; pathFilter discriminates` | `kudosByMe` AND `blocksReverse` (combined test — both must pass together) |
| `collectionGroup('members') + documentId == uid (crewMemberships)` | `crewMemberships` |
| `collectionGroup('items') + where(authorId == uid) + pathFilter (feedFanout)` | `feedFanout` AND `notificationsFromMe` (same query shape, different fields — combined proof) |
| `collectionGroup('participants') + documentId == uid (challengeParticipations)` | `challengeParticipations` |

### Failure scenarios per collectionGroup query

If any test FAILS, the corresponding inventory keys are infeasible
with the current `collectionGroup + __name__` query shape. Activate
the fallback plan documented in `functions/R1A-FALLBACK-PLAN.md` for
those specific keys.

**Test 1 fails (kudosByMe AND blocksReverse infeasible):**

- Most likely cause: Firestore rejects `where(FieldPath.documentId(),
  '==', uid)` on collectionGroup queries, OR rejects the path-filter
  in-memory discrimination.
- Activate fallback for BOTH `kudosByMe` and `blocksReverse`. Add
  denormalised `userId` and `blockedUid` fields per
  `R1A-FALLBACK-PLAN.md`. Backfill is required.
- Cannot partially activate — they share the same query shape; if one
  fails, both fail.

**Test 2 fails (crewMemberships infeasible):**

- Same query shape as Test 1 but different parent collection. If
  Test 1 passed and Test 2 failed, the cause is specific to the
  `groups/*/members` parent path or its rules. Investigate before
  assuming it's a general infeasibility.
- Activate fallback for `crewMemberships` only: denormalise
  `memberUid` per `R1A-FALLBACK-PLAN.md`.

**Test 3 fails (feedFanout AND notificationsFromMe infeasible):**

- These use a stored field (`authorId` / `fromUserId`), NOT
  `__name__`. Failure here usually means a missing composite index
  rather than a fundamental query shape issue.
- First check the emulator stderr for `FAILED_PRECONDITION: The
  query requires an index`. If present, the fix is Gate 2 (index
  deploy) — not the fallback plan.
- If the test fails for any OTHER reason, activate the fallback
  plan: denormalise the path on each fanout doc (e.g. add a
  `parentCollection` field) and switch the query to a top-level
  collection.

**Test 4 fails (challengeParticipations infeasible):**

- Same query shape as Test 1+2. Activate fallback for
  `challengeParticipations` only: denormalise `participantUid` per
  `R1A-FALLBACK-PLAN.md`.

### Partial-pass interpretation rules

**Rule 1 — all 4 tests pass:** Chunk 3 proceeds with the inventory's
documented collectionGroup queries. No fallback work needed.

**Rule 2 — only tests 1 / 2 / 4 fail (one or more of the
documentId-based queries):** Chunk 3 proceeds with PARTIAL fallback.
The failed paths get denormalised fields + backfill before executor
work for those paths begins. The succeeding paths use the documented
collectionGroup queries.

This is allowed because each path has independent cleanup logic in
the executor. The blast radius of each query is isolated by the
inventory entry's `pathFilter`.

Decision rule: if 1 or 2 paths fail, run the fallback ONLY for
those paths. If 3 or 4 paths fail, treat as a general infeasibility
and run the fallback for all 4 — the underlying issue is likely a
Firestore behaviour difference that affects every documentId-based
query, and fixing them individually is more work than the wholesale
fallback.

**Rule 3 — test 3 fails:** Most likely an index issue, not a query
shape issue. Confirm Gate 2 indexes are deployed and Enabled, then
re-run the suite. If still failing after indexes are Enabled,
escalate as a genuine infeasibility and activate the fallback.

**Rule 4 — emulator setup fails entirely (suite can't run):** Cannot
proceed. Resolve the emulator setup issue first. The fallback plan
is NOT a workaround for "we never got the emulator running" — it's a
response to genuine query infeasibility.

### Reporting requirement

Capture the full vitest output to a file:

```bash
firebase emulators:exec --only firestore,auth \
  "REQUIRE_FIRESTORE_EMULATOR=1 vitest run firestore.rules.test.ts firestore.collectionGroup.test.ts" \
  2>&1 | tee /tmp/r1a-gate-1-output.txt
```

Paste the last 50 lines of `/tmp/r1a-gate-1-output.txt` in the
report-back.

---

## Gate 2 — Firestore indexes deployed and Enabled

### Command

```bash
firebase deploy --only firestore:indexes
```

The deploy starts the index builds asynchronously. Builds on
empty/small collections complete in seconds. Builds on large
existing collections (e.g. `comments/{*}/items` if there are
millions of comments already) can take minutes-to-hours.

### What's being deployed

Four new indexes added in Chunk 2.C (see `firestore.indexes.json`):

| Collection / scope | Fields | Used by |
|---|---|---|
| `items` (collectionGroup) | `authorId ASC, __name__ ASC` | feedFanout cleanup |
| `items` (collectionGroup) | `fromUserId ASC, __name__ ASC` | notificationsFromMe cleanup |
| `reports` (collection) | `reporterId ASC, __name__ ASC` | reportsByMe minimisation |
| `reports` (collection) | `targetIdHash ASC, __name__ ASC` | reportsAboutMe minimisation |

Plus the pre-existing `activities` composite which is unchanged.

### Console verification step

1. Open the Firebase Console for the production project.
2. Navigate to **Firestore → Indexes** (left-side nav).
3. Confirm ALL FOUR new R1A indexes show status **"Enabled"** (not
   "Building" and not "Error").
4. Take a screenshot of the indexes page showing all four with
   "Enabled" status.
5. Save the screenshot to a location of your choice and reference
   its path in the report-back (the screenshot doesn't need to live
   in the repo; the location reference is for audit trail only).

**Suggested screenshot path conventions:**
- Local: `~/Desktop/r1a-gate-2-indexes-enabled.png`
- Shared drive: anywhere accessible to the team

**If any index shows "Building":** wait. Re-check every 5 minutes
until all show "Enabled". Building indexes are NOT yet queryable in
production — Chunk 3 deployment must not happen while any are still
building or the executor will fail with FAILED_PRECONDITION mid-run.

**If any index shows "Error":** capture the error message from the
Firebase Console and stop. The fix is index-specific (sometimes a
field-type mismatch, sometimes a composite that conflicts with an
existing one). Investigate before proceeding.

### Reporting requirement

In the report-back, include:

- Confirmation that all 4 R1A indexes show "Enabled".
- Screenshot location/path.
- Time taken from `firebase deploy` to all-Enabled (useful for
  estimating future index deploys).

---

## Gate 3 — Historical orphan audit (read-only)

### Pre-requisites

- Firebase Admin SDK service-account credentials (operator's
  Personal Access Token, or service-account JSON file from the
  Firebase Console → Project Settings → Service Accounts).
- Node 20 runtime locally (matches the `functions/` runtime).
- Read access to production Firestore + Auth.

**No writes.** The audit only reads. No deploy required.

### Script (NOT YET IN THE REPO — operator writes locally)

Per `functions/R1A-HISTORICAL-AUDIT.md`, the audit is a small Node
script the operator runs from their local machine with admin
credentials. Suggested structure:

```js
// audit-r1a-historical.js (operator-local, not committed)
const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

async function auditOrphans() {
  // Step 1-2: identify orphan Firestore roots
  const userDocs = await db.collection("users").select().get();
  const orphans = [];
  let checked = 0;
  for (const doc of userDocs.docs) {
    checked += 1;
    if (checked % 100 === 0) console.error(`checked ${checked}/${userDocs.size}`);
    try {
      await auth.getUser(doc.id);
    } catch (err) {
      if (err.code === "auth/user-not-found") orphans.push(doc.id);
      else console.error(`auth lookup error for ${doc.id}:`, err.code);
    }
  }
  return { totalUsers: userDocs.size, orphans };
}

async function auditBillingTombstones() {
  // Step 3b: tombstone format histogram
  const billingSnap = await db.collection("deletedBillingIdentities").get();
  const formatGuess = (id) => {
    if (/^[0-9a-f]{64}$/.test(id)) return "64-hex (plain-SHA-256 or HMAC-SHA256)";
    if (/^[0-9a-f]{40}$/.test(id)) return "40-hex (SHA-1)";
    return "unknown format";
  };
  const summary = {
    totalCount: billingSnap.size,
    formatHistogram: {},
    sampleDocIds: billingSnap.docs.slice(0, 5).map((d) => d.id),
  };
  for (const doc of billingSnap.docs) {
    const fmt = formatGuess(doc.id);
    summary.formatHistogram[fmt] = (summary.formatHistogram[fmt] || 0) + 1;
  }
  return summary;
}

(async () => {
  console.log("=== Orphan audit ===");
  const orphanResult = await auditOrphans();
  console.log(JSON.stringify(orphanResult, null, 2));
  console.log("\n=== Billing tombstone format histogram ===");
  const tombstoneResult = await auditBillingTombstones();
  console.log(JSON.stringify(tombstoneResult, null, 2));
})();
```

Run:

```bash
node audit-r1a-historical.js 2>&1 | tee /tmp/r1a-gate-3-output.txt
```

### Orphan count thresholds + branch decisions

The `orphans.length` value from the audit drives the scope decision.

**Branch A: orphans < 50** — Option A (decision-log #7) is
sufficient. Founder writes a follow-up `functions/scripts/cleanupHistoricalDeletions.js`
script accepting `--uids=<file>` with `--dry-run` default. Run
later, after Chunk 3 + 4 ship. No Chunk 3 scope change.

**Branch B: 50 ≤ orphans ≤ 500** — Option A+ bounded cleanup
decision. Same script as Branch A, but the operator plans a
dedicated cleanup session post-Chunk-3. No Chunk 3 scope change but
the runbook for the cleanup needs to be drafted before App Store
submission so reviewers see a documented compliance posture.

**Branch C: orphans > 500** — rescope as a larger historical cleanup
project. Chunk 3 scope expands to include a managed background
cleanup job (a new Cloud Function that paginates the orphan list,
runs in the background, and reports progress via Firestore). This
changes the Chunk 3 estimate from ~1 week to ~2-3 weeks.

**What the founder does in each branch:**

- **A:** report the count, note "Option A sufficient", proceed to
  authorise Chunk 3 with the current scope.
- **B:** report the count, note "Option A+ bounded — cleanup planned
  for week of <date>", proceed to authorise Chunk 3 with the current
  scope plus a documented cleanup runbook.
- **C:** report the count, halt Chunk 3 authorisation, request a
  rescoping discussion that defines the managed-cleanup job
  requirements before Chunk 3 begins.

### Tombstone format histogram — expected zero, branch on non-zero

**Expected result:**

```json
{
  "totalCount": 0,
  "formatHistogram": {},
  "sampleDocIds": []
}
```

`deletedBillingIdentities` is a new collection introduced by R1A in
Chunk 1. No pre-R1A code path writes to it. Expectation is zero.

**If totalCount is 0:** HMAC is the only key type from day one.
Proceed to authorise Chunk 3. Document in the report-back as
"tombstone format histogram: empty as expected".

**If totalCount is non-zero:** Stop and follow the migration
decision tree:

1. **Inspect 5 sample doc IDs.** If they're 64-hex strings, the
   tombstones could be plain SHA-256 (rejected) or HMAC-SHA256
   (current target). Without the secret, you can't distinguish.
2. **Check git history on `functions/appleIAP.js`.** The plain-
   SHA-256 attempt only existed on the
   `claude/r1a-account-deletion` development branch — it was never
   deployed to production. If git history confirms no deploy,
   then the existing tombstones came from another source
   (operator script? manual seeding?) — investigate before
   proceeding.
3. **If legacy plain-SHA-256 tombstones DO exist (verified):**
   - Add a dual-read window to `billingIdentityLookupHashes`:
     check the HMAC hash first, then fall back to checking the
     plain-SHA-256 hash for the 13-month retention window.
   - Document the dual-read deprecation window in decision-log
     #4 with a removal date 13 months out.
   - Add a one-off migration script (operator-run) that re-keys
     existing legacy tombstones under HMAC. This is a Chunk 3
     prerequisite if legacy tombstones exist.
   - Do NOT proceed with Chunk 3 executor tombstone writes until
     the dual-read window code lands.

### Reporting requirement

In the report-back, include:

- Raw output of `/tmp/r1a-gate-3-output.txt` (last 50 lines).
- Orphan count.
- Tombstone format histogram + sample doc IDs.
- Branch decision (A / B / C from above).
- Migration decision if tombstones are non-zero.

---

## What to report back here before Chunk 3 is unblocked

Paste in this format:

```
GATE 1 — EMULATOR
====================
Command run: <as documented>
Result: <PASS | FAIL>
Test counts: <X passed, Y failed, Z skipped>
CollectionGroup tests: <all 4 pass | which failed and how>
Partial-pass decision: <none | fallback X / Y / Z>
Output tail (last 30-50 lines):
<paste>

GATE 2 — INDEXES
====================
Command run: firebase deploy --only firestore:indexes
Time to all-Enabled: <X minutes>
All 4 R1A indexes show 'Enabled': <YES | NO>
Screenshot location: <path>

GATE 3 — ORPHAN AUDIT
====================
Total users scanned: <X>
Orphan count: <Y>
Branch decision: <A | B | C>
Tombstone totalCount: <0 | N>
Tombstone format histogram: <as documented>
Tombstone sample doc IDs: <as documented>
Migration decision (if non-zero): <none | dual-read plan | other>

BRANCH DECISIONS MADE
====================
- <enumerate any decisions taken in any gate>

NEXT STEP
====================
- Chunk 3 implementation: <unblocked | blocked because <reason>>
```

---

## What is NOT in this gate cycle

- Deployment secret gates (A, B):
  - `firebase functions:config:set billing.hmac_secret="<32-byte-hex>"`
  - `firebase functions:config:set moderation.hmac_secret="<32-byte-hex>"`

  These apply later, before any Cloud Functions deploy. They do
  NOT block Chunk 3 implementation work — only the deploy.

- Any Cloud Functions or Firestore rules deploy of Chunk 3
  executor code (separate gate, documented in
  `R1A-CHUNK2C-EVIDENCE.md` §15).

- Client UI work that exposes the Delete Account button to users
  in production (Chunk 4 scope).

---

## Repo state

Held at commit `f9e1db1` on branch `claude/r1a-account-deletion`
until gates 1–3 return clean. No further local implementation work
should begin until the report-back lands here.

Last verification on `f9e1db1`:
- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npx tsc --build --force` — PASS (gate 4-of-Chunk-2.D)
- `npm run build` — PASS
- `npm run test --run` — PASS (1679 / 30 skipped)
- Operator gate output: pending.

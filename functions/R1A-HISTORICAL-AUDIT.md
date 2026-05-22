# R1A-Deletion — Historical Partial-Deletion Audit Plan

**Status:** Audit design. Not run in this commit (requires
production Firestore access).

**Purpose.** Quantify the volume of historical partial deletions
that occurred before Chunk 3 ships — accounts whose Auth user is
gone but whose Firestore residue persists. The audit result drives
the scope decision under decision-log #7 (historical cleanup
script): is "operator-provided UID list" sufficient, or does the
volume warrant a larger backfill project?

## Audit method

### Step 1: Inventory the historical-deletion code surface

Pre-R1A deletion paths the codebase has supported:
1. **The current `deleteMyAccount` Cloud Function** (functions/index.js:35).
   This is what's in production today. It deletes a CORRECT subset of
   user data but misses many subcollections per the Phase 0 inventory
   audit. Any user who tapped Delete Account before Chunk 3 ships
   left residual data in the missing subcollections.
2. **Pre-W1f client-side deletion path** (referenced in
   functions/index.js:23-27). Deletes the Auth user first, then
   attempts Firestore cleanup. As soon as auth is gone, subsequent
   writes fail with permission-denied, leaving partial state.
   STATUS: Removed in W1f. Any user who deleted via this path is
   in the historical-deletion population.

### Step 2: Identify orphan Firestore roots

An "orphan" is a Firestore document tree whose `users/{uid}` root
exists but whose Firebase Auth user is gone, OR whose `users/{uid}`
root is gone but whose subcollections still have data.

**Discovery query (operator runs via Cloud Functions Admin SDK in a
read-only audit script):**

```js
// functions/scripts/auditHistoricalDeletions.js (NOT IN THIS COMMIT)
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

async function audit() {
  // Iterate every users/{uid} root in batches of 1000.
  const userDocs = await db.collection("users").select().get();
  const orphans = [];
  for (const doc of userDocs.docs) {
    try {
      await auth.getUser(doc.id);
      // Auth exists — not an orphan.
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        orphans.push(doc.id);
      } else {
        // Surface other errors.
        console.error(`auth lookup failed for ${doc.id}:`, err);
      }
    }
  }
  return orphans;
}
```

**Inverse discovery** — find subcollections under uids whose user
root is gone. This is harder because Firestore doesn't index by
"root missing"; the audit script needs to iterate every relevant
top-level keyed collection (feeds, notifications, following,
followers, blocks, scanUsage, rateLimits) and check whether
`users/{uid}` exists.

For each of the 33 inventory paths from accountDeletionInventory.json,
the audit produces:
- count of docs in that subcollection
- count of unique uids those docs key off
- intersection with the orphan uid list from the forward discovery

### Step 3: Categorise

Three buckets:
1. **Auth-deleted, root-deleted, residue exists.** Historical
   pre-W1f deletion. Cleanup script run is straightforward — every
   inventory path is swept for these uids.
2. **Auth-deleted, root-exists, residue exists.** Indicates the
   current `deleteMyAccount` ran but missed the root (unlikely
   given the function deletes root last) OR a manual operator
   intervention. Investigate before sweeping.
3. **Auth-exists, root-missing, residue exists.** Should not happen
   in production but possible if Auth was created via a different
   path (e.g. server-side seeding for testing). Flag for manual
   review.

### Step 3b: Billing tombstone format check (Chunk 2.D-billing addition)

Before the Chunk 3 executor begins writing billing tombstones with
HMAC-SHA256 keys (decision-log #4 revised), confirm whether any
production `deletedBillingIdentities` tombstones already exist from
earlier code paths.

**Audit query (operator runs read-only):**

```js
const billingSnap = await db.collection("deletedBillingIdentities").get();
const formatGuess = (id) => {
  if (/^[0-9a-f]{64}$/.test(id)) return "64-hex (plain-SHA-256 or HMAC-SHA256)";
  if (/^[0-9a-f]{40}$/.test(id)) return "40-hex (SHA-1)";
  return "unknown format";
};
const summary = {
  totalCount: billingSnap.size,
  formatHistogram: {},
  sampleDocIds: billingSnap.docs.slice(0, 3).map((d) => d.id),
};
for (const doc of billingSnap.docs) {
  const fmt = formatGuess(doc.id);
  summary.formatHistogram[fmt] = (summary.formatHistogram[fmt] || 0) + 1;
}
console.log(JSON.stringify(summary, null, 2));
```

**Expected result:** `{ totalCount: 0, formatHistogram: {}, sampleDocIds: [] }`.

`deletedBillingIdentities` is a new collection introduced by R1A in
Chunk 1. No pre-R1A code path writes to it. The audit confirms this
empirically before the HMAC switch ships.

**If the audit finds non-zero tombstones:**

1. Inspect 5 sample doc IDs. 64-hex format is ambiguous between
   plain SHA-256 (rejected) and HMAC-SHA256 (current).
2. If format is 64-hex but the project has never had a deployed
   plain-SHA-256 implementation (verify via git log on
   functions/appleIAP.js — the plain-SHA-256 attempt was only on
   the `claude/r1a-account-deletion` development branch, never
   deployed), the existing tombstones must have come from another
   source. Investigate before proceeding.
3. If legacy plain-SHA-256 tombstones DO exist:
   - Document the dual-read window in decision-log #4.
   - Update `billingIdentityLookupHashes` to also try the legacy
     plain-SHA-256 form for the 13-month retention window.
   - Add a one-off migration script that re-keys existing legacy
     tombstones under HMAC.
   - Remove the dual-read path after the deprecation window.

**Status of this check:** PENDING — operator runs alongside the
Step 1-3 orphan audit. Result must be recorded in decision-log #4
before Chunk 3 executor tombstone writes begin.

### Step 4: Scope decision

After the audit reports counts, founder + operator decide:

- **< 50 orphans:** decision-log #7 Option A is sufficient. The
  operator runs the cleanup script with `--uids=<list>` and
  processes them manually.
- **50-500 orphans:** Option A still works but takes a day or two
  of operator time. No scope rescope needed.
- **> 500 orphans:** rescope as a larger backfill project. May
  require a dedicated Cloud Function that paginates over the orphan
  list, runs in the background, and reports progress. This is a
  follow-up sprint (R1A-Historical) rather than a small script.

## Why the audit is BEFORE Chunk 3

Per the Chunk 2.C review: "If the audit reveals significantly more
orphaned or partially deleted accounts than expected, the founder
may need to rescope historical cleanup as a larger project rather
than treating it as a small follow-up script."

Running the audit before Chunk 3 starts means the founder can:
1. Confirm Option A is sufficient before the executor lands.
2. Plan the cleanup runbook in parallel with Chunk 3/4 work.
3. Set realistic expectations for App Store submission (if 500+
   orphans exist, the historical cleanup may need to gate App
   Store submission to demonstrate full compliance).

## When the audit can be deferred

If the founder accepts the risk that historical orphan count is
unknown until post-launch, the audit can be deferred. In that case,
the deferral is recorded in this document with rationale, and the
cleanup script (decision-log #7) is built assuming low scale (< 50
orphans) until the audit happens. If post-launch the count is
higher, the script may need to be re-written.

**Current posture:** PENDING founder decision. The audit script
is designed (above) but not executed. Founder runs the audit
locally against production Firestore in read-only mode before
deciding whether to defer.

## Audit safety

The audit script is READ-ONLY by design — it produces a list of
uids and counts, nothing more. It does NOT:
- Delete any data.
- Modify any Firestore docs.
- Modify any Auth users.
- Make any Stripe/Apple API calls.

It performs O(N_users + N_subcollection_docs) read operations.
At Tropos's current scale (likely a few thousand users), this is
~minutes of execution time and well within Firestore's free-tier
read budget.

## Audit dependencies

- Firebase Admin SDK service-account credentials (operator
  Personal Access Token or service-account JSON).
- Node 20 runtime (matches functions/ runtime).
- Read access to production Firestore + Auth.

No writes; no deploy required; can run from a local machine with
the admin credentials.

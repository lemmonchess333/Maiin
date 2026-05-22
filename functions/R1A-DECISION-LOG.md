# R1A-Deletion Decision Log

Source of truth for founder decisions on account-deletion design.
Each entry should be readable in six months without needing the
back-and-forth context that produced it.

Status conventions:
- **Decided** — founder approved, encoded in the inventory / executor / client.
- **Interim** — implementation default chosen pending founder review;
  reversible without data loss.
- **Pending** — release-blocking; cannot ship until founder answers.

## Index

1. [Comment body deletion policy](#1-comment-body-deletion-policy)
2. [reportsAboutMe retention](#2-reportsaboutme-retention)
3. [Restore-after-deletion App Store release](#3-restore-after-deletion-app-store-release)
4. [Billing identity tombstone retention](#4-billing-identity-tombstone-retention)
5. [paymentEventsPostDeletion retention](#5-paymenteventspostdeletion-retention)
6. [Native iOS reauth path](#6-native-ios-reauth-path)
7. [Historical cleanup script scope](#7-historical-cleanup-script-scope)
8. [testCoverageStatus enforcement (Chunk 3 prereq)](#8-testcoveragestatus-enforcement)

---

## 1. Comment body deletion policy

**Date:** 2026-05-11  ·  **Status:** Decided (interim default, revisitable)

**Question.** When a user deletes their account, what happens to comments they
posted on other users' activities — both the authorship metadata AND the
comment text itself?

**Decision.** Option C — hybrid. Visible text becomes "Comment deleted",
authorship metadata is anonymised (authorId → null, authorName → "Deleted
user", authorPhotoURL → null), AND the original comment text is retained
server-side in a separate `originalText` field for moderation reversibility
with a bounded 365-day retention window aligned to reportsAboutMe.

**Reasoning.** Option A (drop original text entirely) destroys optionality —
once original text is deleted there's no way to switch to Option B
(preserve substance of past discussions) later. Option C preserves
reversibility at minimal cost. Founder can still choose A or B as final
policy later, but the interim default must not destroy optionality.

**Encoding.** `commentsAuthoredByMe` entry in
`functions/accountDeletionInventory.json` strategy is
`anonymiseAndOverwriteContent` with `anonymiseFields` clearing
authorship + visible text, AND `preservedOriginalFields` listing
`originalText` with 365-day retention and server-only read access.

**Revisit conditions.** If founder explicitly chooses final policy A
(no originalText retention) or B (visible text preserved), update this
entry. Final-policy A requires a one-off migration to clear retained
originalText fields.

---

## 2. reportsAboutMe retention

**Date:** 2026-05-11  ·  **Status:** Decided

**Question.** When a user is deleted, what happens to moderation reports
filed by OTHER users about them?

**Decision.** Option A — `anonymiseMinimisedShape` with HMAC-fingerprinted
`targetId`, retained fields `[reportId, reason, type, createdAt, targetIdHash]`,
stripped fields `[targetId raw, targetDisplayName, targetPhotoURL,
targetProfileLink, screenshots, routeContext, commentSnippets, deepLinks]`,
365-day bounded retention then full removal.

**Reasoning.** Future re-registration detection (same person opens a new
account under a different email and resumes abuse) requires an abuse identity
that survives the deletion. Raw `targetId` retention is a compliance issue —
uid is PII even when minimised. HMAC-SHA256(uid, server-side secret) yields
a stable abuse fingerprint without retaining the raw uid; 365 days covers
the realistic re-registration timeline.

**Encoding.** `reportsAboutMe` entry in inventory: strategy
`anonymiseMinimisedShape`, retentionWindow `365 days post-deletion`.

**Manual setup.** Provision HMAC secret before Chunk 3 executor ships:
`firebase functions:config:set moderation.hmac_secret="<32-byte-hex>"`.
Without it the executor falls back to full targetId removal (no
re-registration detection).

**Revisit conditions.** If legal/safety team requires longer audit retention,
extend window. If re-registration abuse is not observed in practice,
shorten window or move to immediate full removal.

---

## 3. Restore-after-deletion App Store release

**Date:** 2026-05-11  ·  **Status:** Decided (TestFlight + first App Store)

**Question.** When a new account on a device attempts to restore Apple
purchases that were attached to a previously-deleted account, what should
happen?

**Work-split framing:**
- **A/a2 (support-assisted)** — ships fastest, creates operator overhead
  for each restore occurrence.
- **A/a1 (explicit in-app confirmation)** — requires Chunk 4 UI work plus
  R1B IAP/payment integration before it can ship.
- **B (defer)** — accepts App Review / user-experience risk on first
  submission.

**Decision.** A/a2 — support-assisted restore for TestFlight and first App
Store submission. The Restore Purchases button surfaces a support contact
flow when the backing original-transaction is tombstoned. Suggested copy:
"If you previously had a Tropos account and want to restore a subscription,
contact support." with mailto link.

**Reasoning.** Ships in this sprint; doesn't require R1B IAP/payment
integration; explicit operator-touchpoint for each case keeps billing
ambiguity visible. A/a1 (in-app confirmation) is treated as a separate
post-launch sprint — speculatively building it now creates ambiguous
Chunk 3/Chunk 4 scope.

**Encoding.** `restoreApplePurchases` callable in Chunk 2:
- Look up tombstoned billing identity via deletedBillingIdentities.
- If tombstoned, return a stable error code `restore-requires-support` so
  the client surfaces support copy + mailto.
- Record event in `paymentEventsPostDeletion` with `action: "logged"`.

**Revisit conditions.** If App Review flags A/a2 as insufficient, OR if
support-assisted volume becomes operationally painful, escalate to A/a1
(explicit in-app confirmation) as a follow-up sprint.

---

## 4. Billing identity tombstone retention + keying

**Date:** 2026-05-11 (initial), 2026-05-11 (keying revised post-Chunk-2.D review)  ·  **Status:** Decided

**Question.** (a) How long does the `deletedBillingIdentities` tombstone retain
hashed provider-identifier fingerprints? (b) Is the keying plain SHA-256 or HMAC?

**Decision (a) — retention.** 13 months. Covers annual Apple subscription cycle + Apple's
chargeback window. Unchanged from earlier rounds.

**Reasoning (a).** Annual subscriptions can renew up to ~12 months after the
last billing event; chargebacks for fitness subscriptions are rare but
possible up to ~3 months post-charge. 13 months is a defensible
intersection. Shorter windows (e.g. 90 days) leave annual subscribers
exposed to silent recreation. Longer windows (e.g. 24 months) expand
exposure surface without operational benefit.

**Decision (b) — keying. REVISED to HMAC-SHA256 with `billing.hmac_secret`.**
The Chunk 2.C plain-SHA-256 decision was reopened by the Chunk 2.D
review. HMAC is now the chosen path. Tombstone key shape:

```
HMAC-SHA256(billing.hmac_secret, "apple:<originalTransactionId>")
HMAC-SHA256(billing.hmac_secret, "stripe:<customerId|subscriptionId|...>")
```

### Why the Chunk 2.C plain-SHA-256 reasoning was wrong

The Chunk 2.C entropy audit (preserved below for reviewer context)
argued that Apple's 10^13 to 10^19 numeric value space makes
brute-force enumeration infeasible at 1ms per online probe (~317
years for the 10^13 lower bound). **That estimate addresses the
wrong threat model.**

The threat that matters is OFFLINE hash cracking after exposure of
the `deletedBillingIdentities` collection — via Firestore export,
backup leak, log access, or admin-readable dataset. Modern hardware
can compute billions of SHA-256 hashes per second; a 10^13 candidate
space falls in hours, not centuries. Plain SHA-256 over a 13-digit
numeric identifier is not a privacy boundary against an attacker
with read access to the tombstone hashes.

HMAC fixes this without requiring more entropy from the provider
IDs: without `billing.hmac_secret` the attacker cannot pre-compute
candidate hashes, so even with full read access to the tombstone
collection there is no offline shortcut.

### Apple identifier length distribution (what we actually know)

The "13-19 digits" range from the earlier audit is a documented
bound, not a uniform distribution. What we know:

- Apple's documentation describes `originalTransactionId` as an
  opaque numeric string. The format has evolved across iOS versions.
- Legacy transactions (pre-iOS-12 / 2018-era StoreKit 1) commonly
  have 10-13 digit identifiers from the legacy receipt format.
- Current StoreKit 2 transactions (iOS 15+) typically issue 18-19
  digit identifiers.
- Sandbox identifiers follow the same format generators but live
  in a segregated environment; they do not share state with
  production tombstones.
- A production restore flow CAN receive a 13-digit identifier if
  the user originally purchased on an older device/version and is
  restoring on a current device.

**The weakest valid production case determines the security
posture.** A 13-digit lower bound (10^13 candidates) is the
floor that must be defended. HMAC defeats this regardless of
distribution.

### Stripe identifier format (unchanged from earlier audit)

- `cus_*`: `cus_` + 14-24 chars from a base62-ish alphabet (~10^25
  to 10^43 value space).
- `sub_*`: same format.
- `evt_*` (used for `paymentEventsPostDeletion` doc IDs, NOT
  billing tombstones): same format.

Stripe identifiers are higher entropy than Apple legacy
identifiers; HMAC is therefore "belt-and-braces" for Stripe but
still preferred for consistency: both providers go through the
same tombstone hashing path with one rotation story.

### Existing production tombstone check (Chunk 2.C review item)

`deletedBillingIdentities` is a NEW collection introduced by R1A
in Chunk 1. Pre-R1A code paths (the legacy `deleteMyAccount` in
production) did not write any billing tombstone. So:

- **Expectation:** zero production tombstones exist today.
- **Verification:** the historical orphan audit
  (`R1A-HISTORICAL-AUDIT.md`) was extended to explicitly count
  `deletedBillingIdentities` docs and report their key format if
  any are present.
- **If verification confirms zero:** HMAC is the only key type
  from day one. No migration, no dual-read window, no plain-SHA
  ever in production.
- **If verification finds non-zero tombstones:** identify whether
  they are plain SHA-256, HMAC, or unknown format. Document
  migration before the HMAC switch ships. New lookup logic checks
  both legacy plain-SHA and new HMAC during a bounded deprecation
  window; deprecation window is recorded here when it lands.

The Chunk 2.D implementation assumes the expectation (zero
tombstones) holds. If the audit reveals otherwise, this entry
gets a transition plan before Chunk 3 executor tombstone writes
begin.

### Encoding

- `deletedBillingIdentities` entry retentionWindow `13 months`,
  Firestore TTL on `expiresAt`.
- Hash input is `${provider}:${identifier}` passed through
  `crypto.createHmac("sha256", secret)`.
- Helper module: `functions/lib/billingIdentityHash.js`.
- Lookup (rotation-aware) returns hashes under active + previous
  secret; both are checked against Firestore.
- Write (Chunk 3 executor) uses the active secret and records
  `secretVersion` on the tombstone doc for rotation tracking.
- `billing.hmac_secret` provisioned via:

  ```bash
  firebase functions:config:set billing.hmac_secret="<32-byte-hex>"
  ```

  Manual setup checklist item. Operator generates the secret with
  `openssl rand -hex 32` or equivalent.

### Rotation story (per decision-log #11 — HMAC purpose separation)

- Distinct from `moderation.hmac_secret` (used for `reportsAboutMe`
  fingerprinting). Rotated independently.
- During rotation, set `billing.previous_hmac_secret` to the old
  value before rotating `billing.hmac_secret`. Lookup helper
  checks both for the 13-month retention window. After the window
  passes, the `previous_hmac_secret` entry is removed.
- Single-secret deployment (no rotation yet) skips
  `previous_hmac_secret` entirely.

### Fail-closed posture on missing secret

If `billing.hmac_secret` is not provisioned when the lookup runs
(deploy-time misconfiguration), the helper throws
`billing-hmac-secret-missing`. The `restoreApplePurchases` call
site catches the throw, emits a structured Cloud Logging warning
(`r1aEvent: billing_hmac_secret_missing`), and returns the
generic `restore-unavailable` error to the client. Users get the
support-assisted path; operator sees the misconfiguration alert
in logs.

### Revisit conditions

- Annual subscriptions are not a product feature → drop retention
  to 6 months.
- Legal/finance require longer audit retention → extend retention.
- Provider format unifies to higher-entropy UUIDs across all
  versions → plain SHA-256 could become defensible if the offline-
  crackability concern dissolves. Even then, HMAC remains the
  simpler choice given the secret-rotation story already exists.

---

## 5. paymentEventsPostDeletion retention

**Date:** 2026-05-11  ·  **Status:** Decided

**Question.** How long does the `paymentEventsPostDeletion` log retain
records of payment events that arrived after account deletion?

**Decision.** 90 days post operator-review acknowledgement.

**Reasoning.** The 90-day clock starts from `action: "acknowledged"` — the
moment an operator has reviewed and decided no further action is needed.
Events with `action: "skipped"` or `"logged"` (not yet reviewed) retain
their creation-time-based 90-day timer as a fallback so unreviewed events
don't accumulate indefinitely.

**Encoding.** `paymentEventsPostDeletion` entry retentionWindow
`INTERIM 90 days post operator-review`. TTL on a `cleanupAfter` field
that is set when action transitions to "acknowledged".

**Revisit conditions.** If legal/finance require longer audit retention
(typical accounting standards are 7 years for material billing events).
Most events in this log are NOT material billing events — they're skipped
webhooks for already-deleted accounts. If material events ever land here,
escalate retention for those specifically.

---

## 6. Native iOS reauth path

**Date:** 2026-05-11  ·  **Status:** Decided

**Question.** How does a native iOS user reauthenticate before account
deletion when their session token's `auth_time` claim is older than the
5-minute recent-auth threshold?

**Decision.** Option A — support-assisted fallback. Web reauth uses
already-imported `reauthenticateWithCredential` /
`reauthenticateWithPopup`. Native iOS shows an inline support-assisted
state with copy "Your sign-in session has expired. Contact support to
complete account deletion." and a mailto link.

**Reasoning.** Firebase Web SDK's `signInWithPopup` is unreliable in
Capacitor WKWebView for Apple Sign-In specifically. Adding the
`@capacitor-firebase/authentication` plugin would enable native reauth
but requires pod install, Xcode rebuild, and real-device smoke testing —
out of this sprint's scope per the original spec ("do not add package in
this sprint").

**Encoding.** Chunk 4 `AccountSection.tsx` client UX:
- Force `getIdToken(true)` before calling `deleteMyAccount`.
- On `requires-recent-auth` error from callable:
  - Web: show inline reauth modal (`reauthenticateWithCredential`).
  - Native iOS: show support-assisted state with mailto.

**Revisit conditions.** If support-assisted volume becomes
operationally painful, or if Apple Sign-In native reauth is required
for a future feature, add the plugin in a follow-up sprint.

---

## 7. Historical cleanup script scope

**Date:** 2026-05-11  ·  **Status:** Decided

**Question.** How do we clean up data from accounts that were "deleted"
before the Chunk 3 executor shipped — accounts whose Auth user is gone
but whose Firestore residue persists?

**Decision.** Option A — operator-provided UID list, dry-run by default,
`--really-delete` flag for destructive mode, `--resume` flag for
interrupted runs.

**Reasoning.** Cannot scan Firebase Auth for deleted users (their Auth
records are gone). Discovery method is admin-provided UID list (from
support tickets, known cases) OR scan for residual Firestore roots whose
Auth user no longer exists (slow but bounded). Dry-run-first is mandatory
per the original spec.

**Encoding.** `functions/scripts/cleanupHistoricalDeletions.js`
(new file in Chunk 4 or as a separate hotfix).
- Accepts: `--uids=<file>` or `--scan-orphans` for discovery.
- Default behaviour: dry-run, logs what would be deleted, no writes.
- Destructive: `--really-delete` required, additionally requires
  `--operator=<email>` for audit trail.
- Interruption-safe: `--resume` flag picks up from the last
  recorded uid in the run log.

**Revisit conditions.** If a scaled discovery mechanism is needed (e.g.
hundreds of historical UIDs), add a managed queue. Current expectation
is small-N operator-driven cleanup, not bulk.

---

## 9. Deployment sequencing — dormant scaffolding vs exposed deletion

**Date:** 2026-05-11  ·  **Status:** Decided

**Question.** In what order do rules, functions, and client deletion UI
deploy, and what counts as "safe to ship"?

**Decision.** Rules and functions can deploy independently AS DORMANT
SCAFFOLDING. The deletion entrypoint is "exposed" only when the
client deletion UI ships AND the executor is in production. Until
then, function code is dormant — no callable can be invoked because
the client doesn't expose it; the rules write-freeze evaluates against
an absent `accountDeletionRequests/{uid}` doc and acts as a no-op.

**Concrete order.**
1. Deploy functions (lock helpers, system-writer guards, payment
   webhook idempotency). Dormant — no client invokes deleteMyAccount.
2. Deploy rules (write-freeze + operational collection deny). Dormant
   — no `accountDeletionRequests` doc exists so freeze is a no-op.
3. Deploy Firestore indexes for collectionGroup + documentId queries
   (Chunk 3 prerequisite).
4. Enable TTL policies for `accountDeletionRequests.cleanupAfter`
   (30d), `deletedAccounts.expiresAt` (90d),
   `deletedBillingIdentities.expiresAt` (13mo),
   `paymentEventsPostDeletion.cleanupAfter` (90d post-acknowledgement).
5. Run staging end-to-end smoke test with seeded user.
6. Deploy Chunk 3 executor code AND Chunk 4 client UI in the same
   release window — this is the moment the deletion entrypoint is
   exposed.
7. Production smoke test on a real test account.
8. Open to general users.

**Wording correction from Chunk 2.** The Chunk 2 report's "functions
first, then rules" sentence is correct only in the dormant phase. It
must NOT be read as "functions-first is safe once deletion can be
invoked." Once the client exposes deleteMyAccount and the executor
runs in production, functions-without-rules is unsafe: a callable
invocation could start a deletion that doesn't get write-freeze
protection. The hard rule:

- Steps 1-2 (functions, rules) can ship in any order as dormant
  scaffolding.
- Steps 3-6 must complete before exposing the deletion entrypoint.
- Once exposed, rules + functions stay deployed together.

**Revisit conditions.** None. This ordering applies for the lifetime
of the deletion subsystem.

---

## 10. Recent-auth threat model — exposure acknowledgement

**Date:** 2026-05-11 (Chunk 2.C, framing tightened 2026-05-11 post-review)  ·  **Status:** Decided (with documented exposure)

**Question.** Is `assertRecentAuth` (300s `auth_time` check) the only
challenge before `deleteMyAccount` proceeds, or is there also a
server-issued deletion-intent token?

**Decision.** Recent-auth-only for first release. No deletion-intent
token in Chunk 3 / Chunk 4.

### Prevention vs recovery — the load-bearing distinction

The recent-auth check is a **prevention** measure that limits the
window during which deletion can be authorised. The
`accountDeletionRequests` ledger is a **recovery** measure that
makes deletion reversible if the user catches it in time. These
are NOT substitutes for each other. The recent-auth-only model
provides prevention; the ledger provides recovery. A future
maintainer reading this should not assume "the ledger covers us"
— it doesn't prevent any deletion, it only enables undo IF the
user notices within the recovery window.

### Prevention

Recent-auth-only limits deletion authorisation to fresh ID tokens
whose `auth_time` claim is within 300 seconds. The relevant attack
vectors this defends against:

- **Stale-token replay.** A captured ID token older than 300s
  cannot drive deletion. Mitigated.

The attack vectors recent-auth-only does NOT defend against:

- **Browser session hijack within the 300s window.** XSS, malicious
  browser extension, or stolen device cookies acquired during the
  recent-auth window can drive deletion.
- **Malicious mobile-app injection within the 300s window.**
  Runtime injection / jailbreak hooks with token access during the
  recent-auth window can drive deletion via the authenticated
  callable.
- **Family member / device-access attacker during the 300s window.**
  Anyone with access to an unlocked device shortly after the user
  reauths can tap Delete Account and complete the flow.
- **Shortening the threshold** narrows the window but does not
  remove session-token-only compromise risk. Lengthening makes the
  UX more permissive but expands the attack surface.

### Recovery

The `accountDeletionRequests/{uid}` ledger persists deletion
status + leaseGeneration + cleanup progress for 30 days post-
completion via Firestore TTL. The
`paymentEventsPostDeletion` log retains payment events for 90 days
post operator-review. The `deletedAccounts/{uid}` tombstone retains
operational identity for 90 days. The `deletedBillingIdentities`
tombstone retains hashed billing identity for 13 months.

If a user reports wrongful deletion within the 30-day ledger
window, the operator has the data to:
1. Confirm the deletion happened (ledger).
2. See which provider events arrived post-deletion (payment events).
3. Re-link the previous billing identity to a new account if
   appropriate (billing tombstone).

**The ledger does NOT prevent the deletion.** It supports
operator-assisted recovery if the user notices in time.

### Why this is acceptable for first release

Tropos is a consumer fitness app, not a financial or healthcare
data store. The deletion action is destructive but its outcomes
(weeks of meal logs, run history, lift history) are reproducible
by the user themselves — the user can re-log if they want.
Operator-assisted recovery via the 30-day ledger covers the
"someone deleted my account maliciously" support ticket. The
attack surface (session hijack within 300s of reauth) is narrow
enough that the operational recovery path is the correct
mitigation rather than a deletion-intent token.

### Production deletion-intent token model (deferred, for reference)

If session compromise becomes a real problem post-launch, the
deferred model is:
1. User taps Delete Account.
2. Client triggers reauthentication.
3. Server mints a short-lived (≤ 5min), single-use deletion-intent
   token bound to the user + a nonce + the reauth timestamp.
4. Client must present BOTH a fresh ID token AND the deletion-intent
   token to `deleteMyAccount`.
5. Server consumes the token (one-shot) and verifies its binding
   matches the calling uid.

This requires a new short-lived token store and Chunk 4 client UI
changes. Not in this sprint's scope.

**Revisit conditions.** If session-compromise abuse is observed in
support tickets, escalate to the deletion-intent token model as a
follow-up sprint.

---

## 11. HMAC purpose separation

**Date:** 2026-05-11 (Chunk 2.C)  ·  **Status:** Decided

**Question.** Does the moderation HMAC secret (decision #2,
`reportsAboutMe` targetId fingerprinting) share its secret with any
other HMAC use (e.g. billing-identity tombstones, future abuse
fingerprints)?

**Decision.** Distinct secrets per purpose. Two named secrets:
- `moderation.hmac_secret` — used ONLY for `reportsAboutMe`
  targetIdHash and any future moderation-pseudonym keying.
- `billing.hmac_secret` — reserved for future billing-identity HMAC
  keying (NOT currently used; `deletedBillingIdentities` uses plain
  SHA-256 with provider-namespacing in Chunk 2.C — see decision #4
  revisit).

**Reasoning.** A single shared secret would couple the two purposes
operationally: rotating one would force re-hashing of records from
the other. Distinct secrets allow independent rotation cycles aligned
to each purpose's retention window (365d for moderation, 13mo for
billing).

**Provisioning.** Operator sets both via
`firebase functions:config:set moderation.hmac_secret="<32-byte-hex>"`
and `firebase functions:config:set billing.hmac_secret="<32-byte-hex>"`
before Chunk 3 ships. Distinct random values, not derived from each
other.

**Rotation strategy.** Per purpose:
- Moderation: secretVersion stored on each fingerprinted record;
  fingerprint lookup tries active + previous secrets during the 365d
  retention window. Documented in decision #2.
- Billing: plain SHA-256 in Chunk 2.C (no secret). If HMAC is adopted
  later, same secretVersion-with-fallback pattern within the 13mo
  retention window.

**Revisit conditions.** None. Use distinct secrets indefinitely.

---

## 8. testCoverageStatus enforcement

**Date:** 2026-05-11  ·  **Status:** Pending — Chunk 3 prerequisite

**Question.** How do we prevent an entry from being marked
`testCoverageStatus: "implemented"` without an actual corresponding
test existing?

**Decision.** Before Chunk 3 (deletion executor) marks the first entry
as implemented, the drift-prevention test
(`src/lib/__tests__/accountDeletionDrift.test.ts`) must be extended
with a check that:
1. For every entry where `testCoverageStatus === "implemented"`,
2. Scan `src/lib/__tests__/` and `functions/__tests__/` for a test
   file containing the entry's `testCoverageKey`.
3. If no file matches, fail the test.

**Reasoning.** All 40 included entries are currently "planned" so the
hole is empty. As soon as Chunk 3 lands a smoke test and flips an
entry to "implemented", the check needs to be in place to prevent
"implemented" from becoming a meaningless badge.

**Not done in Chunk 2** because Chunk 2 doesn't add executor smoke
tests — no entry transitions to "implemented" in Chunk 2.

**Revisit conditions.** Closed when Chunk 3 adds the static check.

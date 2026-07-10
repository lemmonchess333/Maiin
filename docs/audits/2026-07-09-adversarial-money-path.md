# Adversarial threat model — money / entitlement / trial / deletion surface — 2026-07-09

**Method:** exploit-first red-team. An attacker with one (and, where relevant, two)
normal user account(s) constructs concrete exploit sequences against the payment,
entitlement, trial, and account-deletion surfaces, then each finding is adversarially
verified (default-refute) against the code. This complements the 2026-05-25 compliance
audit (manual read + pattern scan) with hostile exploit construction, and design-reviews
the not-yet-built RevenueCat path (ADR-0006).

**Confidence labelling.** Every finding is **CONFIRMED** (exploit chain re-traced to
`file:line`), **PLAUSIBLE** (code gap real, runtime confirmation needed), **INVARIANT
HOLDS** (probed and genuinely closed — a useful result), or **FLAGGED — NOT VERIFIED**
(surfaced by the exploit pass but its adversarial verification did not run; see Auditor
Notes). Ranked by blast radius.

## Scope

- **Entitlement / tier derivation:** `firestore.rules` (`subscriptionFieldsUnchanged`,
  `billingFieldsUnsetOnCreate`, `allowedUserFields`), `functions/helpers.js`
  (`computeEffectiveTier`, `ALLOWED_RETURN_PATHS`, Stripe return-origin allowlist),
  `src/lib/subscription.ts`.
- **Webhooks:** `functions/webhookIdempotency.js`, the Stripe + Apple handlers in
  `functions/index.js` / `functions/appleIAP.js` / `functions/applePurchase.js`.
- **Trial + AI-compute:** `functions/index.js` `completeOnboarding`,
  `functions/lib/aiScanQuota.js`, `functions/lib/backfillTrialFlag.js`, `hasUsedTrial`.
- **Account deletion:** `functions/accountDeletion.js`, `functions/lib/accountDeletionLedger.js`,
  the billing-tombstone HMAC (`functions/lib/billingIdentityHash.js`), the kill-switch.
- **Planned RevenueCat surface (design review):** `docs/adr/0006-adopt-revenuecat-iap.md`,
  `src/lib/revenuecat.ts`, `src/hooks/useRevenueCatIdentity.ts`.
- **Re-check:** the two 2026-05-25 medium findings against current code.

## Methodology

1. Ground each trust boundary to `file:line` (5 parallel readers).
2. Construct exploit sequences per attacker goal (6 goals: free→pro, pro→lost,
   trial-farming, deletion-corruption, shared-device, RevenueCat-design).
3. Adversarially verify each candidate finding (default: refute; name the guard that stops
   it or the `file:line` that makes it reachable).

## Executive Summary

**Overall:** the *core* entitlement invariant — "a client cannot self-grant Pro" — genuinely
holds, and the AI-scan cost gate is server-authoritative and atomic. The real exposure is
not self-grant; it is **(a) trial re-grant turning free signups into a Vertex-compute
faucet, (b) an account-deletion write-freeze that is designed but never engaged, and (c) a
platform-migration path that strips Pro from a paying user.** The planned RevenueCat slice-3
is unbuilt, so its risk is entirely in what gets built next — captured here as a
must-get-right gate.

- **CONFIRMED — High:** 3 (trial re-grant faucet; deletion write-freeze no-op;
  Stripe→Apple migration strips Pro).
- **CONFIRMED — Low:** 1 (kill-switch fail-open on `"false"`-as-string — a documented
  tradeoff, see F5).
- **PLAUSIBLE — Low:** 1 (dropped Apple `DID_RENEW` silent lapse).
- **PARTIALLY LIVE (prior audit):** 1 (`geminiEnabled` flag still fail-open).
- **INVARIANT HOLDS (clean bills):** 8 — including the whole direct-self-grant surface and
  the AI-gate bypass surface.
- **FLAGGED — NOT VERIFIED (session-limit):** shared-device (4) + RevenueCat-design (9).

## Findings

### 1) Trial re-grant → unmetered Vertex-compute faucet

- **Severity:** High · **Confidence:** CONFIRMED
- **Area:** Trial grant / AI cost gate
- **Evidence:** `completeOnboarding` mints a fresh 7-day trial purely on
  `!existing.exists` for `users/{uid}` (`functions/index.js:676-692`) with **no
  `hasUsedTrial` consultation** — that guard exists only on the *Stripe checkout* path
  (`__tests__/checkoutTrial.test.js`), not the onboarding trial. A future
  `trialExpiresAt` alone makes `computeEffectiveTier` return `"pro"`
  (`functions/helpers.js:48-50`), which flips `aiScanQuota` `image_ai` from `0` to `100`/day
  and `text_ai` to `100`/day (`functions/lib/aiScanQuota.js:47-50,107-108`) — real Vertex
  compute. Three reachable cycles:
  - **In-account, no auth deletion:** `deleteDoc(users/{myUid})` is permitted
    (`firestore.rules:156` `allow delete: if isOwner(uid)`) with **no `onDelete` tombstone
    trigger** (the only user-tree `onDelete` is on challenge participants), then re-onboard →
    fresh trial. (CONFIRMED/high)
  - **Full delete + re-signup** or a **fresh/disposable email** → new uid → fresh trial;
    the trial gate is uid-keyed with no email/device dedup, and `completeOnboarding` has
    **no `email_verified` gate** (`functions/index.js:537-543`). (CONFIRMED/medium)
- **Why it matters:** each cycle grants 7 days of Pro-tier AI (up to 100 image + 100 text
  scans/day) at real per-scan Vertex cost, repeatable indefinitely by one person. This is
  the single largest cost-abuse vector in the tree.
- **References:** `functions/index.js:676-692`, `:537-543`; `functions/helpers.js:48-50`;
  `functions/lib/aiScanQuota.js:47-50,107-108`; `firestore.rules:156`.
- **Recommendation:** make trial eligibility **identity-durable, not doc-existence-durable**.
  Best: per ADR-0006 (M2), replace the card-free Firestore-timestamp trial with a StoreKit /
  RevenueCat intro offer (card-gated, Apple-enforced one-per-Apple-ID). Interim: persist a
  delete-resistant `hasUsedTrial`/`trialGrantedAt` in a collection the client cannot
  delete/write, and gate the `completeOnboarding` else-branch on it. Optionally add a
  per-IP/device signup throttle for the AI gate.

### 2) Account-deletion write-freeze never engages (concurrent-write orphan / resurrection)

- **Severity:** High · **Confidence:** CONFIRMED
- **Area:** Account deletion executor
- **Evidence:** `firestore.rules` denies client writes while
  `accountDeletionRequests/{uid}.status` is active (`isDeleting`, `firestore.rules:46-56`),
  but the live executor **never writes that status** — `transitionStatus` is a stub
  (`functions/lib/accountDeletionLedger.js:167`) and a grep of `functions/**` finds no write
  of `accountDeletionRequests/{uid}.status='running'`. So `isDeleting()` stays `false` for
  the entire cascade, the callable actor-lock never fires, and the user-doc delete
  (`functions/accountDeletion.js:284`) runs unfrozen. Because Auth is deleted **last**
  (`accountDeletion.js:299-300`), the client's token is live throughout — concurrent writes
  can orphan data or **resurrect the user doc** after step 5.
- **Why it matters:** the "ghost user with orphan data" failure mode the executor's step
  ordering was designed to prevent is reachable via a concurrent write, because the freeze
  that should stop it is inert.
- **References:** `functions/lib/accountDeletionLedger.js:167`; `firestore.rules:46-56`;
  `functions/accountDeletion.js:284,299-300`.
- **Recommendation:** set `accountDeletionRequests/{uid}.status='running'` as the **first**
  executor action (real `transitionStatus`, not the stub) so `isDeleting()` freezes client
  writes for the cascade duration; clear/tombstone it at the end. This also depends on the
  Chunk-3 ledger/tombstone work (see F below), which is the same gap.

### 3) Stripe→Apple migration strips Pro from a paying user

- **Severity:** High · **Confidence:** CONFIRMED
- **Area:** Cross-platform subscription reconciliation
- **Evidence:** A Stripe-Pro user who buys via Apple IAP: `applySubscriptionToUser`
  writes `subscriptionSource='ios_iap'`, `tier='pro'`, a future `subscriptionExpiresAt`, but
  **does not clear `stripeSubscriptionId`** (`functions/applePurchase.js:205-216`). The Apple
  path then auto-cancels the displaced Stripe sub (`functions/lib/stripeAutoCancel.js:67`,
  immediate cancel), which fires `customer.subscription.deleted`. That handler
  (`functions/index.js:1986-2074`) has **no `subscriptionSource` check** — its id-match +
  staleness guards both pass — so it writes the user back to `free`, overriding the just-purchased
  Apple entitlement. The still-future `subscriptionExpiresAt` does not save them
  (`computeEffectiveTier`'s expiry fallback only runs under the `"pro"` branch).
- **Why it matters:** a user who just *paid* via Apple is silently downgraded to free by the
  cleanup of their old Stripe sub — a direct paid→lost-Pro on a real migration path.
- **References:** `functions/index.js:1986-2074`; `functions/applePurchase.js:205-216`;
  `functions/lib/stripeAutoCancel.js:67`; `functions/helpers.js:31-47`.
- **Recommendation:** in the `customer.subscription.deleted` handler, refuse to downgrade
  when the entitlement no longer belongs to Stripe: `if (userData.subscriptionSource &&
  userData.subscriptionSource !== 'stripe') { log + break; }` before the free-write (mirror
  the source-aware `resolveSubscriptionUpdate` contract). Also clear `stripeSubscriptionId`
  on the Apple write so the id-match guard can't fire.

### 4) Dropped Apple `DID_RENEW` → silent lapse to free (no reconciliation backstop)

- **Severity:** Low · **Confidence:** PLAUSIBLE
- **Area:** Apple subscription lifecycle
- **Evidence:** `computeEffectiveTier` fail-closes `"pro"`→`"free"` once
  `subscriptionExpiresAt` elapses (`functions/helpers.js:40-46`); the client mirrors this
  reading Firestore only, no StoreKit fallback (`src/lib/subscription.ts:97-105`); the Apple
  write sets `subscriptionExpiresAt` to the exact transaction `expiresDate` with no grace
  buffer (`applePurchase.js:212`). There is **no scheduled Apple-status reconciliation cron**
  in `functions/`. So a `DID_RENEW` lost past Apple's retry window — or swallowed by the
  idempotency dedup on a partial earlier delivery (`appleIAP.js:334-356`) — lapses a paying
  subscriber at the old period boundary.
- **Why it matters:** paid→lost-Pro with no self-healing; only a support ticket recovers it.
- **References:** `functions/appleIAP.js:334-356`; `functions/helpers.js:40-46`;
  `src/lib/subscription.ts:97-105`.
- **Recommendation:** add a scheduled reconciliation (mirror the PR-L sweeps) that queries
  Apple's App Store Server API `getAllSubscriptionStatuses` for `ios_iap` users near/after
  expiry and re-materialises `subscriptionExpiresAt`/`tier`. RevenueCat's webhook backstop
  (ADR-0006) subsumes this once it ships — until then the gap is live.

### 5) Kill-switch fail-open on a `"false"`-as-string value

- **Severity:** Low · **Confidence:** CONFIRMED (documented tradeoff)
- **Area:** Deletion kill-switch
- **Evidence:** `deleteAccount` treats only boolean `value === false` as active
  (`functions/accountDeletion.js:156-164`). A Firebase Console field defaults to **string**,
  so a stored `"false"` (or `null`/`0`/read error) leaves `killSwitchActive=false`, emits at
  most a `kill_switch_malformed` warning, and deletion proceeds.
- **Why it matters:** during an incident an operator who types `false` believes deletions are
  paused; they are not. **Note:** CLAUDE.md documents this fail-open as *intentional*
  (lock-out defence — a malformed value must not be able to *disable* the executor
  permanently), so this is a calibrated tradeoff, not an oversight. The residual issue is
  only the silent defeat of the operator's *pause* intent.
- **References:** `functions/accountDeletion.js:156-164`.
- **Recommendation:** keep fail-open for missing/unreadable values, but treat a value that
  clearly reads as "disable" (case-insensitive `"false"`/`"0"`/`"off"`) as **active** for the
  kill-switch specifically, so a stringified pause is honoured while lock-out defence is
  preserved.

### 6) `geminiEnabled` feature flag still fail-open (2026-05-25 Finding 2 — PARTIALLY LIVE)

- **Severity:** Medium · **Confidence:** CONFIRMED (partially live)
- **Area:** Feature-flag containment
- **Evidence:** `isFlagEnabled` was reworked into a per-flag `FLAG_POLICIES` design, but
  `geminiEnabled` still resolves fail-open: a Firestore outage or `config/flags` permission
  regression during an abuse/cost incident would **not** stop AI food-analysis calls
  (`functions/index.js:954,:1145`). A new flag that forgets `FLAG_FAIL_CLOSED` silently
  inherits the fail-open default (`functions/flagPolicies.js:38-40`) — the original audit risk
  per-flag.
- **Why it matters:** the one production flag guarding real per-call Vertex cost cannot be
  used as a kill-switch during the exact incident it exists for.
- **References:** `functions/index.js:505-525,954,1145`; `functions/flagPolicies.js:38-40`.
- **Recommendation:** set `geminiEnabled` (and any AI/payment-write flag) `FLAG_FAIL_CLOSED`;
  add a lint/test that any flag touching AI or billing must declare a fail-closed policy.

## Strengths Observed (invariants that genuinely hold — clean bills)

- **Direct client self-grant of Pro is closed.** `firestore.rules` blocks all 7 billing
  fields: `subscriptionFieldsUnchanged()` on update (`firestore.rules:64-70`) and
  `subscriptionTier=='free'` + `billingFieldsUnsetOnCreate()` on create (`:136-151`). The
  exact attack (set a future `trialExpiresAt` → server grants Pro) was **anticipated and
  documented** at `firestore.rules:127-135`. *(Independently re-verified.)*
- **AI-scan cost gate is server-authoritative and atomic.** `checkDailyAiQuota` runs in a
  `runTransaction`, derives tier server-side via `computeEffectiveTier`, hard-blocks
  `image_ai` at limit `0` with no write, and **fails closed** on any error
  (`functions/lib/aiScanQuota.js:104-163`). Client `DAILY_LIMITS`/`isPro` tampering and
  offline-queue replay cannot bypass it. *(Independently re-verified.)*
- **Webhook forgery / crafted-event tier flip** — refuted: Stripe signature + Apple JWS
  verification gate the handlers; a client cannot mint a valid event.
- **Apple webhook replay / non-transactional dedup race** — refuted at *correctness*: the
  dedup is explicitly "a perf/cost optimisation, not a correctness boundary"
  (`functions/webhookIdempotency.js:19-27`), and the per-event handlers are idempotent
  read-modify-write-by-uid, so a duplicate cannot flip a tier incorrectly.
- **Restore-purchase cross-account claim** — refuted (see Auditor Notes: the
  `appleSubscriptions/{originalTransactionId}` uniqueness binding from PR #822 is the named
  guard; the shared-device variant of this was not re-verified this run).
- **`Date.parse` locale-sensitivity as a Pro-loss vector** — refuted: `subscriptionExpiresAt`
  is only ever written server-side as ISO-8601-UTC, which `Date.parse` handles reliably.
- **Billing-tombstone HMAC is forge-resistant** — doc IDs are HMAC-SHA256 over a server-side
  secret (`functions/lib/billingIdentityHash.js:88-92`), so a full read leak can't forge one
  (though it is currently *inert* because tombstones are never written — see F2/remediation).
- **2026-05-25 Finding 1 (staging origin in prod checkout allowlist) — REMEDIATED.**
  `getDefaultStripeReturnUrlOrigins` now branches by deploy surface and defaults **prod-only**
  for any real production deploy (`functions/helpers.js:121-160`), fail-secure on a
  misconfigured `TROPOS_DEPLOY_ENV`.

## RevenueCat slice-3 — must-get-right gate (design review; code does not exist yet)

The RevenueCat webhook + sync-on-purchase callable are **unbuilt** (ADR-0006 slice-3;
`src/lib/revenuecat.ts` is client-side identity scaffold only). These are *design
requirements*, not shipped vulnerabilities — the risk is in what gets built. Each must hold
so the swap doesn't repeat the hand-rolled Apple path's "first-caller-wins" defect:

1. **[critical]** Sync-on-purchase callable must derive tier from the RC **REST API keyed to
   `context.auth.uid`** — never from the request body / client-supplied `appUserId`.
2. **[critical]** RC webhook `Authorization`-header check must be **constant-time AND
   fail-closed** on an unset/mismatched secret.
3. **[critical]** The RC REST/secret key must be **server-only (Secret Manager)** — never a
   `VITE_` var, never the public `appl_` key.
4. **[high]** Webhook event-id idempotency must be a Firestore **`runTransaction` claim**, not
   get-then-set (the exact non-transactional dedup the swap is meant to kill).
5. **[high]** RC dashboard **"transfer behaviour" must be deliberately set** — the RC-native
   equivalent of the unbound-purchaser (`appAccountToken`) defect.
6. **[medium]** Webhook writes only to the event's own `app_user_id`, and must respect the
   deletion tombstone guard (it is a system writer to a possibly-resurrected uid — ties to F2).
7. **[medium]** Any new RC-introduced entitlement field must be added to the `firestore.rules`
   deny-lists, or it reopens the client self-grant hole.
8. **[medium]** Both new functions need mandatory `maxInstances`; the callable keeps App Check
   + auth, the webhook must **not** enforce App Check.
9. **[low]** Webhook secret rotation needs an overlap window (two accepted secrets) or rotation
   drops live events.

## Priority Remediation Plan

- **P1:** F1 (trial faucet — biggest cost exposure) · F2 (deletion write-freeze — data
  integrity) · F3 (Stripe→Apple strips Pro — paid user loses entitlement).
- **P2:** F6 (`geminiEnabled` fail-closed) · F4 (Apple renewal reconciliation).
- **P3:** F5 (kill-switch string handling) · the shared-device items once re-verified.
- **Gate (before slice-3 merges):** the 9 RevenueCat must-get-right items.

## Suggested Verification Tests After Fixes

- **F1:** emulator test — delete `users/{uid}` then re-run `completeOnboarding`; assert NO
  new `trialExpiresAt` when the durable trial flag is set. Second account, same device →
  assert AI gate still enforces free limits.
- **F2:** integration — call `deleteMyAccount` and race a `users/{uid}` write; assert the
  racing write is denied (rules) and the user doc does not resurrect.
- **F3:** webhook test — Stripe-Pro user + Apple purchase → fire `customer.subscription.deleted`;
  assert tier stays `pro` and `subscriptionSource==='ios_iap'`.
- **F4:** simulate a swallowed `DID_RENEW`; assert the reconciliation cron restores
  `subscriptionExpiresAt`.
- **F5:** store `"false"` (string) in `deletionExecutorEnabled`; assert the executor treats it
  as active.
- **F6:** stub a `config/flags` read failure; assert `geminiEnabled` resolves disabled.

## Auditor Notes — coverage gap this run

The adversarial-verify pass for two goal areas **did not complete** (the subagent session
budget was exhausted mid-run — an environmental limitation, not a repo signal). These are
recorded as **FLAGGED — NOT VERIFIED**, distinct from the CONFIRMED/INVARIANT-HOLDS findings
above, and must be re-verified before action:

- **Shared-device (4, from the exploit pass, unverified):** (a) first-claim-wins theft of a
  victim's Apple subscription via `restoreApplePurchases` on a raw `originalTransactionId`;
  (b) stale `appleSubscriptions` binding never cleared on account deletion → self-lockout /
  permanent theft; (c) an "always share" preference bleeding across an account switch on a
  shared device; (d) the RC transfer-behaviour default routing entitlement to the wrong uid.
  **Note:** PR #822 added an `appleSubscriptions/{originalTransactionId}` uniqueness binding
  that throws "different account" — this **likely mitigates (a)** already; re-verify against
  `functions/applePurchase.js` rather than treating (a) as open. (b) is the more likely-live
  item (it ties to the F2 tombstone gap).
- **RevenueCat-design (9):** captured above as the must-get-right gate; theoretical by
  construction (the code does not exist), so "unverified" here means "design requirement, not
  a shipped defect."

Re-running only these two verify groups (after the session budget resets) closes the gap; the
exploit sequences and their cited `file:line` are recorded above so the re-verification is a
targeted read, not a re-derivation.

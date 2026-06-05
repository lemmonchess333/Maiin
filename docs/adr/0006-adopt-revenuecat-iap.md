---
Status: accepted
---

# Adopt RevenueCat for in-app purchases; retire the hand-rolled Apple receipt validation

## Context

Tropos is an iOS-first Capacitor app (the `ios/` project exists; `appId:
com.tropos.app`). Monetisation today is **hand-rolled**, in two codepaths
routed by `src/lib/purchaseProvider.ts`:

- **iOS:** `cordova-plugin-purchase` (StoreKit) on the client +
  server-side Apple receipt / JWS validation in `functions/appleIAP.js` /
  `functions/applePurchase.js`, including an `appleSubscriptions/{originalTransactionId}`
  uniqueness binding.
- **Web / Android:** Stripe Checkout (`@stripe/stripe-js` +
  `stripeWebhook`). The Stripe path was exploratory — the standing intent
  is that Stripe is for a future web marketing/funnel site, not the primary
  in-app monetisation.

Two forces converged on this decision:

1. A 2026-06 security audit found the hand-rolled Apple path has latent
   sharp edges: the App Store Server Notification handler's dedup is
   non-transactional (vs the Stripe handler's transactional claim), and
   `verifyApplePurchase` is "first-caller-wins" on a raw
   `signedTransactionInfo` because purchaser-identity binding
   (`appAccountToken`) was deferred. The Apple path is also **never
   device-tested** (pre-launch QA backlog). It is "partially built and
   leaky", not done.
2. Apple's receipt-validation contract (StoreKit 2, App Store Server API,
   Server Notifications V2) is a moving target. For a solo developer,
   maintaining it correctly is an open-ended tax where mistakes either
   grant Pro for free or fail to grant paid users.

## Decision

**Adopt RevenueCat as the IAP layer when wiring real monetisation for the
iOS launch.** Replace `cordova-plugin-purchase` with
`@revenuecat/purchases-capacitor`, configure products in App Store Connect +
RevenueCat, and let RevenueCat own receipt validation + entitlement state.
The backend shrinks to a single path: **receive a RevenueCat webhook (verify
its auth header) → write `subscriptionTier` / `subscriptionExpiresAt`
server-side.** Prefer letting RevenueCat front Stripe (web) too, so web + iOS
share one entitlement source of truth.

On adoption, **retire `functions/appleIAP.js` / `applePurchase.js`** and the
direct StoreKit client path. Do **not** invest in fixing their audit
findings (webhook dedup, `appAccountToken`) — they die with the swap.

**Timing: deferred, not now.** There are zero paying users pre-launch;
nothing to monetise yet. This is a launch-wiring task, sequenced with the
iOS monetisation work — not urgent today.

## Provider-agnostic invariants that survive the swap

These are already shipped (security audit 2026-06) and are exactly the
posture a RevenueCat webhook → entitlement-write path needs. They must hold
regardless of provider:

- **Entitlement is server-authoritative.** `subscriptionTier`,
  `subscriptionExpiresAt`, and the trial/billing timestamps are server-only
  (`firestore.rules` `subscriptionFieldsUnchanged()` on update +
  `billingFieldsUnsetOnCreate()` on create). A client cannot self-grant Pro.
- **The server honours expiry.** `functions/helpers.js`
  `computeEffectiveTier()` treats an elapsed `subscriptionExpiresAt` as
  free (mirrors the client), so a dropped expiry webhook can't strand a
  user on server-side Pro.
- **The trial-farming follow-up (M2) is folded into this work.** The no-card
  7-day onboarding trial granted in `completeOnboarding`
  (`profileData.trialExpiresAt = now + 7d`) is farmable for AI compute. When
  real trials land they become StoreKit introductory offers (Apple-ID /
  card-gated, Apple-enforced one-per-ID), which replace the no-card grant —
  so this is tracked here, not separately hardened.

## Considered options

- **Keep hand-rolling Apple IAP + Stripe.** Rejected. Two codepaths, two
  webhooks, two reconciliation flows, and an open-ended receipt-validation
  maintenance tax for a solo dev. The audit already demonstrated the failure
  modes. Defensible only with a dedicated billing engineer.
- **Adopt RevenueCat (chosen).** One entitlement API across iOS / Android /
  web; offloads validation, restore, grace periods, billing retry, refunds,
  trial eligibility, promo offers. Free under ~$2.5k/mo tracked revenue, 1%
  after — trivial insurance versus solo-dev time. Official Capacitor plugin.
- **RevenueCat for iOS only, keep Stripe separate for web.** Acceptable
  fallback, but leaves two entitlement systems. Prefer RevenueCat-fronts-
  Stripe for a single source of truth.

## Consequences

- A third party enters the revenue path (outage / lock-in risk). Mitigated
  by RevenueCat's reliability + client-side entitlement caching; migration
  tooling exists if ever needed.
- The audit's Apple-IAP findings (M-1 webhook dedup, M-2 `appAccountToken`)
  are **closed-by-deletion**, not by patching — do not spend effort on them.
- Net backend surface for billing shrinks substantially; the security focus
  shifts to "verify the RevenueCat webhook signature" + the invariants above.

## Locked decisions (2026-06-05)

Four implementation forks, reasoned through and locked. These refine — not
replace — the decision above.

1. **Web monetisation: iOS-only for v1.** All paid conversion goes through
   StoreKit/RevenueCat. The web app stays a free preview; the marketing
   funnel drives App Store installs (on web the paywall UI renders for
   review, the buy button is a "Get it on iOS" CTA). The current Stripe
   path is **gated off in v1**, not ripped out immediately — full Stripe
   code retirement is a later cleanup because it has tendrils into the
   account-deletion machinery (`deletedBillingIdentities`,
   `paymentEventsPostDeletion`, `subscriptionReconciliation.js`,
   `stripeAutoCancel.js`). Web billing is **deferred to RevenueCat Web
   Billing** (Stripe-backed, unified entitlement) if/when web-pay demand
   appears — RC makes that an incremental add, so deferring costs nothing.
   Standalone Stripe-for-web was rejected (two entitlement systems, no
   upside over RC Web Billing).

2. **Trial model: StoreKit introductory offer + a tiny bounded free-taste.**
   The card-gated, auto-converting StoreKit intro offer is THE trial. The
   no-card 7-day onboarding grant in `completeOnboarding`
   (`trialExpiresAt = now + 7d`) is **removed — this closes the M2
   trial-farming finding.** Separately, free users get a _tiny bounded
   free-taste_ of AI logging (single-digit lifetime scans, or ~1/day) so the
   headline feature is discoverable without a card; the exact number is a
   product call. Rationale: Tropos's Pro headline (AI food logging) costs
   real Vertex compute per use, so a no-card full trial is uniquely bad here
   (farmable AND bleeds compute on zero-intent users); the dominant
   nutrition-app pattern (MyFitnessPal / MacroFactor / Cronometer / Hevy /
   Fitbod) is the card-gated trial.

3. **Identity: Firebase `uid` as the RevenueCat App User ID.**
   `Purchases.logIn(uid)` / `logOut()` wired to `onAuthStateChanged`
   (same uid-scoping discipline as the offline-queue rule). Tropos's
   mandatory auth removes RC's anonymous-purchase alias-merge risk — there
   is no anonymous state, so `logIn` always precedes any purchase. **Set
   RevenueCat's dashboard "transfer behaviour" deliberately** (transfer vs
   keep-with-original on an Apple-ID / App-User-ID conflict) — this is the
   RC-native equivalent of the `appAccountToken` purchaser-binding concern
   the audit raised; do not leave it on the unconsidered default.

4. **Source of truth: client `customerInfo` for UX + webhook for server,
   with a sync-on-purchase close.** `customerInfo` drives instant in-app
   gating; the RevenueCat webhook → user-doc write is server truth that
   `aiScanQuota` reads. To close the post-purchase lag window (customerInfo
   updates instantly, the webhook trails by seconds — an AI scan in that
   window would hit the server still reading `free`), **on purchase success
   the client calls a callable that pulls RC subscriber status via the RC
   REST API and writes the user doc synchronously.** The webhook is the
   backstop for renewals / cancellations / out-of-band changes.

### Cross-cutting

- **Android compounds the decision.** RC unifies iOS + Android behind one
  Entitlement, so this also avoids hand-rolling Play Billing validation when
  Android lands.
- **The RC webhook is not an App Check surface.** It authenticates via a
  shared `Authorization` header (constant-time compare) + event-id
  idempotency — separate from the app callables' App Check rollout.

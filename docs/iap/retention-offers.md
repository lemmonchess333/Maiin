# Cancel-path save-offer (retention) setup

Operator runbook for the **Sub3** cancel-path save-offer — the discount a
subscriber is shown when they try to cancel. **Almost no app code**: both
platforms own the cancellation UI, so the save-offer is configured as a
platform-native retention offer, not an in-app intercept.

That is deliberate and correct, not a shortcut. On iOS a subscriber cancels in
**Settings → Apple ID → Subscriptions** and on web inside **Stripe's hosted
billing portal** — Tropos never sees the cancel tap, so it cannot draw its own
"wait, don't go" screen. Every reference app (Runna, Strava, Duolingo) relies on
the platform's own retention mechanism for exactly this reason. Building a custom
intercept would mean re-inventing a flow Apple and Stripe already run, and on iOS
it isn't even possible.

Tropos bills through **two** stacks, so there are two offers to create:

| Platform   | Billing stack                    | Retention mechanism                                |
| ---------- | -------------------------------- | -------------------------------------------------- |
| iOS/iPadOS | Apple IAP via RevenueCat         | **Win-Back Offer** (App Store Connect)             |
| Web        | Stripe Checkout + Billing Portal | **Coupon** + Billing Portal cancellation retention |

Do both. iOS is where the users are (native-first), so Part A is the priority;
Part B covers the web-Stripe subscriber segment.

---

## Recommended offer

One consistent offer across both platforms so the value story doesn't diverge:

- **Monthly plan → 50% off for 2 months** (≈ £1.99/mo, then back to £3.99).
- **Yearly plan → 25% off the next renewal** (≈ £26.24, then back to £34.99).

These are the operator's call — tune to taste. The only hard rule: keep the two
platforms' offers equivalent so a user who compares them (or migrates) sees the
same deal. The pricing they anchor against is the single source of truth in
`src/lib/proPlans.ts` (£3.99/mo, £34.99/yr).

---

## Part A — iOS: Apple Win-Back Offer

Win-Back Offers are Apple's built-in retention discount (StoreKit 2 era). Apple
surfaces them automatically to **lapsed and about-to-lapse** subscribers across
the App Store, in the subscription-management sheet, and via an offer URL — you
configure the discount, Apple does the showing. RevenueCat reads and reports
redemptions through the same `pro` entitlement the app already gates on, so
**no client change is required**.

1. **App Store Connect → your app → Subscriptions →** open the subscription
   group (`Tropos Pro`).
2. Open **Tropos Pro Monthly** (`com.tropos.app.pro.monthly`). Find the
   **Win-Back Offers** section (alongside Promotional Offers / Introductory
   Offers on the product page) and **create a win-back offer**:
   - Eligibility: subscribers who cancelled/lapsed (Apple's win-back audience).
   - Offer type: **Pay as you go** or **Pay up front** — pick a discounted
     price that matches "50% off for 2 months" (≈ £1.99 × 2).
   - Reference name + duration as above.
3. Repeat on **Tropos Pro Yearly** (`com.tropos.app.pro.yearly`) with the
   "25% off next renewal" figure.
4. **RevenueCat** (`app.revenuecat.com`): win-back offers flow through the
   existing App Store connection and the `pro` entitlement — confirm the
   products still resolve after the offer is live (RevenueCat → your project →
   the two products). No new RevenueCat config is needed for Apple to show the
   offer; see RevenueCat's "Win-Back Offers" doc if you later want to present
   one from inside the app rather than letting Apple surface it.

**Verify:** on a sandbox Apple ID, subscribe, cancel, then re-enter the
subscription flow — Apple should present the win-back price. Redemption should
keep/return the `pro` entitlement (check RevenueCat's customer view).

> Prerequisite: the **Paid Applications agreement** must be active and the
> subscriptions out of "Missing Metadata" (see `revenuecat-setup.md` Part A) —
> a win-back offer on a product that isn't itself approved will not show.

---

## Part B — Web: Stripe coupon + Billing Portal retention

Stripe's hosted **Billing Portal** already owns the web cancellation UI. Its
cancellation flow can show a **retention coupon** automatically — configured in
the Stripe Dashboard, no code.

1. **Create the coupon(s).** Stripe Dashboard → **Product catalog → Coupons →
   New**:
   - `save-monthly-50-2mo` — 50% off, **Duration: repeating, 2 months**.
   - `save-yearly-25-once` — 25% off, **Duration: once**.
     (Or a single amount-off coupon if you prefer parity by absolute value.)
2. **Enable retention on the Billing Portal.** Stripe Dashboard →
   **Settings → Billing → Customer portal**:
   - Under **Cancellations**, enable **"Show a coupon before cancelling"** (the
     retention offer) and attach the coupon(s) above.
   - Keep **Prorations** and **"Cancel at end of period"** as they are today.
3. That's it for the happy path — when a web subscriber opens the portal and
   clicks cancel, Stripe offers the coupon before confirming.

### ⚠️ Blocker — `createStripeBillingPortal` is missing server-side

The web "Manage subscription" button (`src/pages/Upgrade.tsx` →
`purchaseProvider.manageSubscription`) calls a Firebase callable named
**`createStripeBillingPortal`**, but **that function is not defined in
`functions/index.js`**. So today the web portal path fails with
`functions/not-found` and the retention coupon in step 2 is unreachable — it
only ever shows _inside_ the portal the button is meant to open.

On iOS this never fires (the native branch redirects to
`apps.apple.com/account/subscriptions`), which is why it hasn't surfaced
pre-launch, but the web-Stripe segment needs it. Building it is a small,
payments-critical Cloud Function that must mirror `createCheckoutSession`'s
security envelope:

- `runWith({ ...DEFAULT_HTTP_CAP, secrets: [STRIPE_SECRET_KEY] })` (never ship a
  Stripe function without a `maxInstances` cap).
- `verifyAuth(..., { checkRevoked: true })` before any body read; 401 on
  failure, 403 on uid mismatch, 405 on non-POST — same auth-ordering the
  `createCheckoutSession` tests pin.
- Look up `users/{uid}.stripeCustomerId`; if absent, the user has no Stripe sub
  → return a clean error (don't create a customer here).
- `stripe.billingPortal.sessions.create({ customer, return_url })` with
  `return_url` built from the **same allowlist** (`_isAllowedStripeReturnUrl`)
  checkout uses — never a client-supplied URL.
- Optional: pass `flow_data: { type: 'subscription_cancel', ... }` to deep-link
  straight into the retention/cancel flow.

It cannot be verified in the agent sandbox (no Stripe emulator), so it's tracked
in the CLAUDE.md pre-launch backlog rather than shipped blind here.

---

## Status

- Apple Win-Back + Stripe coupon/portal-retention: **operator config, documented
  here.** No app code required for the offers themselves.
- `createStripeBillingPortal`: **missing — must be built + deployed before the
  web save-offer works.** Tracked in the CLAUDE.md pre-launch QA backlog.

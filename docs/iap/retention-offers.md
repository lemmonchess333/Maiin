# Cancel-path save-offer (retention) setup

Operator runbook for the **Sub3** cancel-path save-offer — the discount a
subscriber is shown when they try to cancel. **No app code**: the store owns the
cancellation UI, so the save-offer is configured as a platform-native retention
offer, not an in-app intercept.

That is deliberate and correct, not a shortcut. On iOS a subscriber cancels in
**Settings → Apple ID → Subscriptions** — Tropos never sees the cancel tap, so
it cannot draw its own "wait, don't go" screen. Every reference app (Runna,
Strava, Duolingo) relies on the store's own retention mechanism for exactly this
reason; a custom intercept isn't even possible on iOS.

**Distribution:** Tropos is **App Store now, Google Play later** — there is no
web/Stripe storefront (the Stripe backend stays dormant — Sub4). So there is one
save-offer to configure today (Apple), and a second to add when Android ships
(Google Play). Both are store config, not code.

---

## Recommended offer

- **Monthly plan → 50% off for 2 months** (≈ £1.99/mo, then back to £3.99).
- **Yearly plan → 25% off the next renewal** (≈ £26.24, then back to £34.99).

The operator's call — tune to taste. The pricing they anchor against is the
single source of truth in `src/lib/proPlans.ts` (£3.99/mo, £34.99/yr). When
Android ships, mirror the same values on Google Play so the deal doesn't diverge
by platform.

---

## iOS — Apple Win-Back Offer

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

## Android (future) — Google Play win-back

When the Android build ships, Google Play's equivalent is **Cancel Survey +
win-back / promotional offers** configured in the Play Console
(Monetize → Subscriptions → your product → Offers). RevenueCat handles the same
`pro` entitlement across both stores, so the app code stays platform-agnostic.
Mirror the offer values above. This is a placeholder until Android exists —
nothing to do now.

---

## Status

- Apple Win-Back Offer: **operator config, documented here.** No app code
  required.
- Web/Stripe retention: **N/A — no web storefront** (App Store + future
  Google Play only). Per the Sub4 lock the working Stripe backend stays
  DORMANT (it's the future web-margin lever vs Apple's 15–30% cut), the web
  Upgrade page gets an App-Store steer at launch, and the never-defined
  `createStripeBillingPortal` is simply not built. See the CLAUDE.md
  pre-launch backlog for the launch-gate steer task.

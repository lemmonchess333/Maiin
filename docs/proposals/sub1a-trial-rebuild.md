# Sub1a trial rebuild — P1 implementation playbook

**Status:** Queued. Decision locked on 2026-05-24 (Option A — auto-converting trial). Audit at `docs/audits/2026-05-24-sub1.md` finding #2. P0 (zombie-charge fix) shipped via PR #739. This doc is the P1 implementation plan; pick up directly from here.

## Goal

Move from the current "free 7-day Pro at signup, no payment, no conversion" model to the locked "explicit opt-in + payment upfront + auto-converts" model.

## Why this is queued (not started)

P0 was the pre-launch blocker (zombie charges). P1 is the real subscription-funnel work — substantial scope, deserves a fresh session with full context. The decision is locked and the competitive landscape was verified; the only remaining work is implementation.

## What needs to change

### Server-side

- **`src/lib/auth.tsx` `createDefaultProfile()`** — stop setting `trialExpiresAt`. New users start in true free tier (no Pro features) until they explicitly tap "Start Pro trial".
- **`UserProfileSubscription` interface** — add `hasUsedTrial: boolean` (default `false`). Once true, the user can never start another trial (per-UID; IP-rate-limit mitigation for new-account abuse covered by Sub1a pin #1).
- **Migration for existing users (one-off Cloud Function)** — for every user with `trialExpiresAt !== null`, set `hasUsedTrial: true`. Existing accidental trials expire naturally; future attempts blocked. No retroactive grace.
- **`functions/index.js` `createCheckoutSession`** — accept a `withTrial?: boolean` param. When `true` + user's `hasUsedTrial` is `false`, add `subscription_data: { trial_period_days: 7 }` to the Stripe session. Set `hasUsedTrial: true` on the user doc atomically with the session creation (so abandoned checkouts still consume the trial slot — prevents click-trial-bail-retry-trial loops).
- **Apple IAP introductory offer** — configure the matching "7 days free trial" introductory offer on the IAP product in App Store Connect. `functions/applePurchase.js` should already pass `isTrialPeriod=true` receipts through to `applySubscriptionToUser` correctly — verify.
- **Stripe webhook (`customer.subscription.updated`)** — should already correctly flip `isPro = true` when the sub status transitions from `trialing` → `active`. Verify with a test event replay.

### Client-side

- **`ProModal` + `Upgrade.tsx`** — replace generic "Upgrade to Pro" CTA with two states:
  - User where `!profile.hasUsedTrial`: "Start your 7-day free trial" CTA. Tapping → Stripe checkout with `trial_period_days: 7` OR Apple IAP with introductory offer.
  - User where `profile.hasUsedTrial`: "Subscribe to Pro" CTA (no trial offered). Tapping → standard checkout, immediate charge.
- **Trial-state UI** — small banner / footer text when `isInTrial`: "Pro trial — X days left. Cancel anytime in {Stripe portal / App Store settings}." Already partially supported by existing `isInTrial` + `trialDaysLeft` from `useSubscription()`.
- **App Store metadata** — copy can now honestly say "7-day free trial" since auto-conversion is wired.

### Out-of-scope for P1 (follow-ups)

- **P3 — Trial-end notification cadence** (Day 5 email, Day 6 in-app banner, Day 7 conversion fired). Layer in once P1 is shipped and we have real telemetry to verify the cadence's effect.
- **Sub1b pins #1-3 (cross-platform reconciliation guards)** — separate slice (`claude/sub1-p2-reconciliation-guards`).

## TDD plan

### Server (`functions/__tests__/`)

1. **Tracer:** `createCheckoutSession` with `withTrial: true` + free user passes `trial_period_days: 7` to Stripe SDK.
2. `createCheckoutSession` with `withTrial: true` + `hasUsedTrial: true` user does NOT pass `trial_period_days` (no second trial).
3. Atomically setting `hasUsedTrial: true` on the user doc when the trial session is created (race-safe).
4. Stripe webhook `customer.subscription.updated` on `trialing → active` transition flips `isPro` and sets `subscriptionTier: "pro"`.

### Client (`src/components/__tests__/`)

5. **Tracer:** Free user with `hasUsedTrial: false` sees "Start your 7-day free trial" CTA in `ProModal`.
6. User with `hasUsedTrial: true` sees "Subscribe to Pro" CTA (no trial language).
7. Tapping the trial CTA fires `createCheckoutSession({ withTrial: true })`.
8. Tapping the no-trial CTA fires `createCheckoutSession({ withTrial: false })` (or omits the param entirely).

### Migration (`functions/__tests__/`)

9. Migration CF: for every user with `trialExpiresAt` set, writes `hasUsedTrial: true`. Idempotent on rerun. Doesn't touch users who already have `hasUsedTrial: true`.

## Estimated work

- Server: ~half-day (3 cycles + production wiring + migration CF)
- Client: ~half-day (2-3 cycles + UI copy iteration)
- Migration: ~1-2 hours (one-off CF, can run in dev emulator first)
- **Total: 1-2 days** (matches the original audit estimate)

## What's already in place

- `createCheckoutSession` infrastructure (functions/index.js:1135)
- Stripe webhook handler (functions/index.js:1369) — likely handles `trialing → active` correctly already; needs verification
- `subscription.ts.getSubscriptionInfo` — handles `isInTrial` derivation cleanly
- Apple IAP receipt parsing (`functions/applePurchase.js`)
- `ProModal` + `Upgrade.tsx` already exist with checkout integration
- `useProCheckout` hook (src/hooks/useProCheckout.ts)
- Profile type infrastructure for adding `hasUsedTrial`

## What's blocking before P1 can start

Nothing on the code side. The only environmental dependency is configuring the Apple IAP introductory offer in App Store Connect (a UI/admin task, not code).

## How to pick up this work

1. Branch off the current main with `claude/sub1-p1-trial-rebuild`.
2. Start with TDD cycle 1 (server tracer — `trial_period_days` reaches Stripe SDK). Mock the Stripe client; assert the args.
3. Work through cycles 1-9 in order. Each cycle is a vertical slice through one behavior.
4. Production wiring (the Stripe SDK call site + migration CF + UI copy strings) happens out-of-cycle inside each slice.
5. App Store Connect introductory-offer configuration is a separate operational step — not blocking the code work, but blocking the actual user-facing trial mechanic.

## R1A coordination

- P0 (PR #739) added the Stripe cancellation step. P1 doesn't change deletion mechanics.
- `hasUsedTrial` field is user-keyed — deleted with the user doc on account deletion. No new inventory entry needed.

## Audit cross-references

- `.claude/plans/programme-run-followups.md` row Sub1 (line 534) — STATUS 2026-05-24a (grill resolution).
- `docs/audits/2026-05-24-sub1.md` finding #2 — full audit context.
- Competitive landscape research (in-session): MacroFactor is the closest analog; Cal AI is the wrong model for Tropos.

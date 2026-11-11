# First-week activation outcomes

**Status:** Implemented on `feat/activation-outcomes`, 2026-10-30. Requires backend deployment before the updated onboarding client and before treating new billing cohorts as complete.

## Decision

Use one read-only cohort report to judge the direct plan-to-Today journey alongside subscription outcomes. Keep the saved-session measure at 168 hours. Count a verified trial start in the same 168-hour window and a first paid subscription period within 14 days, long enough to include a seven-day trial conversion. Segment by training type and the platform on which setup first completed. Both are stamped at the first setup commit. The billing source is a separate fact: iOS RevenueCat or web Stripe.

The report reads `users/{uid}.activationBillingFirsts`, a server-only map with at most two entries: `{trial, paid}`, each containing a provider time in milliseconds and source enum. RevenueCat's production REST entitlement snapshot can add a trial or normal paid-period observation after its existing grant checks; it does not expose the charge amount. Signed Stripe checkout completion can add a trial only when the server's trial decision was attached to that session; a positive paid Checkout session or invoice for the account's subscription can add a charge. A late earlier provider observation corrects a later one. A client event, checkout click, trial-slot reservation or current Pro tier cannot create a billing outcome.

## Rollout

1. Deploy the `completeOnboarding`, `revenueCatWebhook`, `syncRevenueCatEntitlement` and `stripeWebhook` changes before releasing the client that sends `onboardingPlatform`. Older clients that omit it remain valid; an already released version 2 client continues to use the existing callable contract.
2. Record the exact deployment time. Only setup cohorts whose entire follow-up occurs after these writers are live have complete billing coverage. The report does not backfill missed provider events from current subscription state.
3. Run `node functions/scripts/report-first-week-activation.js --project=ID --since=YYYY-MM-DD --until=YYYY-MM-DD` with an exclusive UTC `until` at least 14 days old. Read `groups` by cohort and sport, `byOnboardingPlatform`, then `bySportAndPlatform`. Compare saved activity, verified trial starts and verified paid starts together. Examine raw counts before rates; small groups cannot support a conversion claim.

## Privacy and trust review

- The setup platform is a closed client-reported enum (`ios`, `web`, `android`) accepted only at the first successful version 2 onboarding commit. It is server-stamped once, but it is not device attestation. Legacy clients and older completed accounts remain `unknown` for platform analysis.
- The server also stamps training type at first setup. Older accounts without that marker fall back to current profile type, which may have changed; interpret their sport comparison cautiously.
- `activationBillingFirsts` is absent from the Firestore client-write allow-list and the onboarding sanitiser. It contains no provider identifier, receipt, email, price or analytics user ID. The existing account deletion removes it with `users/{uid}`. Provider event logs remain minimised and unlinked.
- RevenueCat sandbox purchases, Stripe test-mode events, unsupported stores, stale or conflicting entitlements, uncharged Stripe invoices, lifetime Checkout sessions and unrelated subscriptions cannot create a paid observation. The app's entitlement logic remains the source of truth for access.
- The report outputs aggregate counts only. It reads current accounts, so deleted accounts are missing from the denominator. Provider delivery can lag. Payment records for cohorts before deployment can be incomplete. The Stripe billing path is dormant for launch, so web billing outcomes require actual signed Stripe events after web sales are enabled.

## Acceptance

- A version 2 plan save keeps its original platform on retries; a legacy retry cannot enroll it. Invalid platform values fail before any plan write.
- A production RevenueCat trial and its later paid renewal produce distinct first observations. Sandbox, conflict, expiry and duplicate syncs do not fabricate starts.
- A signed Stripe completed trial and its later positive invoice produce trial and paid observations. A free invoice, unrelated subscription, replay and deleted account cannot add one.
- The cohort report uses server-created activity times and provider times with separate 7-day and 14-day windows, and exposes the unknown platform group rather than silently treating it as web.

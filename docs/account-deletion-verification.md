# Account deletion and email verification

The account flow keeps private workout and meal logging available before email
verification. Public posts and comments still require a verified email on the
server. Account settings now explain this distinction, and verification checks
only succeed after both the Firebase user reload and a forced ID-token refresh
succeed. A failed refresh leaves a retry action visible instead of announcing
success while public writes remain blocked.

## Deletion changes

- The confirmation dialog resets after cancellation or failure, accepts form
  submission, blocks duplicate requests and dismissal during deletion, and
  counts failed identity checks correctly. Cancelling an OAuth sheet does not
  consume an attempt.
- The server attempts every Storage prefix but preserves Auth if any cleanup
  fails. Firestore profile/quota deletion errors also remain retryable. A failed
  executor expires its lease immediately while keeping the data write freeze.
  Auth remains the final irreversible step; the existing tombstone, generation
  checks, kill switch, billing retention, and Stripe cancellation policy remain.
- The callable allows nine minutes for large accounts; the client allows ten
  minutes including response transit. An owner-readable, server-confirmed
  `completed` deletion ledger recovers a lost response. Cache contents, a missing
  profile, and revoked credentials are not treated as proof of completion.
- Once the server confirms deletion, device cleanup and sign-out are handled
  separately. Sign-out failure can be retried without calling deletion again.
  The deleted-account push-release exemption survives repeated sign-out attempts.
  Meal-photo erasure covers this device; the executor cannot erase device-local
  photos on another device.
- Account settings are reachable during onboarding, including when a partially
  deleted profile no longer exists. Verification is never a prerequisite for
  deleting an account.

## Apple and Google

Native reauthentication uses provider credentials against the existing Firebase
JS user, then refreshes the ID token. Web popup failures stay in the dialog;
redirect initiation is never mistaken for completed identity confirmation.

Accounts linked to Apple confirm with Apple before deletion, including recently
signed-in accounts. Web revocation uses Firebase's access-token API. On native
Apple sign-in, the app reauthenticates the existing JS user and sends the returned
authorization code to Firebase's revocation endpoint. Codes and tokens are neither
persisted nor logged. The native Firebase SDK stays signed out under
`skipNativeAuth`; its revocation helper requires a native current user and would
otherwise never complete. The native request follows Firebase iOS
`RevokeTokenRequest` (a native authorization has no redirect URI).

The App Store subscription warning also recognizes `subscriptionSource: ios_iap`,
not only the legacy transaction ID. Immediate deletion remains available, with
Apple's subscription-management link and a warning about continuing charges.

References: [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/),
[Firebase Apple authentication](https://firebase.google.com/docs/auth/ios/apple),
[Firebase token revocation API](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/accounts/revokeToken).

## Validation and release

Regression tests cover cleanup failures and immediate retries, delayed responses,
account switching, password and OAuth errors, Apple revocation ordering/failure,
device cleanup/sign-out errors, cached completion, and verification refresh
failures. The light and dark account screens and deletion dialogs were checked at
390 × 844; the account page has no horizontal overflow or button targets below
44 CSS pixels. The browser checks use mock accounts and services.

The Account route intentionally adds about 2.7 KiB for the recovery and confirmation
flow, plus a 1 KiB shared verification chunk. Only these chunk budgets were
updated; the global size budget and tolerance were kept. A clean production build
is about 5.6 KiB larger overall (roughly 0.1%).

Before an iPhone release, validate native Google/Apple confirmation and Apple
revocation on a signed device build with a disposable account. Confirm the Apple
sign-in configuration and subscription-management handoff. Automated mocks and a
mobile browser viewport do not establish that those device/provider integrations
work in a signed build. These changes do not themselves deploy the web app or
`deleteMyAccount` Cloud Function.

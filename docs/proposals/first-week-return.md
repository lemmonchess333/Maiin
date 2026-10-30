# First-week return: ask after a saved session

**Status:** Implemented on `feat/first-week-return`, 2026-10-29. First-week activation merged as #2998; release verification remains separate.

## Decision

Offer one optional reminder on the saved workout and run completion screens for a version 2 athlete in local onboarding days 1–7. Ask in the existing completion stack, below the result and above session details. Do not open an automatic modal or request operating-system permission until the athlete taps **Turn on reminder**. Show **Not now** beside it. Once answered, stop asking on every device for that account. Keep all reminder controls in Settings.

The offer enables the existing once-ever first-week nudge for the next evening when there is no activity. If the athlete builds a streak, the existing streak reminder can continue on later inactive days. It does not schedule a workout. The old `CompletionExtras` toggle started checked because `streakReminder.enabled` defaulted true while `primingShown` defaulted false; no reminder was actually armed. The offer replaces that misleading state for eligible new athletes. Existing accounts keep the existing completion control, with its displayed state based on effective consent. The default preference is now off until consent is confirmed.

## Why now

The direct plan-to-Today journey removes the mandatory sales and teaching screens so an athlete can save a first session. The repo already has a once-ever local and server first-week return nudge, but both require consent. Push is off by default, while the completion screen's local reminder toggle is shown without a clear first-use explanation. A return prompt after a real save closes that gap without interrupting the first training action.

Mobbin's [Strava account setup](https://mobbin.com/flows/44d47f7c-1dd8-4ce4-bea5-a82efb5dfb21) includes a notification permission screen before the first activity; [Future Pro's permissions flow](https://mobbin.com/flows/b630f124-26a7-4f2d-bcb7-99a68a8e8f00) keeps push as a named permission with an explicit switch. Those iOS captures support clear purpose and an explicit choice. They do not establish that either timing converts better for Tropos.

## Journey

1. A valid lift or run is saved. The existing completion result, badge, next-session context and Done remain in their order. Unsaved, failed, abandoned and invalid sessions do not get an offer.
2. If the server-stamped `activationJourneyVersion` is 2, `onboardingCompletedAt` resolves to local day 1–7, the athlete has not answered the offer, and no reminder channel is already enabled, show one small card. If the account or prompt state cannot be read, wait or hide it rather than flash an offer.
3. **Turn on reminder** is a user gesture. On a supported remote-push build, request system permission, register this device token, then save global push consent with streak nudges enabled. The server consent gate must stay off if registration fails. On a native build without the remote plugin, use the existing local-notification permission and `streakReminder` prefs. On an unsupported web build, do not show a promise of background delivery.
4. If permission is denied, say that reminders remain off and point to Settings. Record that answer so the completion screen does not nag on the next session. If the permission request fails while permission is still undecided, leave the offer retryable. **Not now** records a dismiss answer; it never opens system permission.
5. The existing once-ever day-2 nudge is the first-week send. After a streak reaches the existing threshold, the regular streak reminder may run on later inactive days. The local scheduler and server sender consult the same account-wide first-week marker; a local device claims it in a Firestore transaction after arming its notification. When push owns streak reminders, the local scheduler stays suppressed. A logged activity on the first-week fire day cancels/skips that nudge as it does today. No new scheduled function or notification cadence is added.
6. Settings can opt in or change notification types later, regardless of the completion answer.

## Data and safety

- Store the answer in `users/{uid}/settings/firstSessionReturn` with `response: accepted | later | denied` and server timestamp. It is account-scoped, already covered by owner-only settings rules and recursive account deletion. A successful consent or local preference also hides the offer, including on another device.
- The prompt read fails closed. A choice save failure leaves the choice retryable, but never claims the reminder is on. An account switch during permission/registration must not write a choice under the new account; reuse the existing token lifecycle fences and check UID before each persistence step.
- `push.enabled` remains false until the device claim succeeded. If consent persistence fails after the claim, revoke that claim or leave it inert behind the server consent gate and report a retryable error. Never claim an unregistered device can receive a push.
- Keep `streakReminder.primingShown` as the local-notification consent marker. Do not set it for a remote opt-in. Do not reset an existing user's reminder preferences or offer answer.

## Measurement

Track one offer impression per saved completion view and the explicit choice (`enabled`, `later`, `denied`, `setup_failed`) with sport and local first-week day only. The report from first-week activation remains the authority for valid saved activity. Review opt-in and actual send/delivery outcomes alongside day-2 return, and monitor whether the completion screen's Done action is delayed. Client events are directional; they do not prove notification delivery or retention lift on a small cohort.

## Acceptance

- New lifter, runner and hybrid: saved lift/run within days 1–7 shows the offer after result content; an unsaved draft and day 8 do not.
- Permission granted, denied, registration failed and Firestore failed each leave truthful UI and state. Native local fallback works only where remote push is unavailable; unsupported web shows no offer.
- An answered prompt is not repeated for the same UID on a second device; a different UID can receive its own offer.
- At most one first-week nudge is claimed for the account, push and local paths do not both deliver it, and logging on the fire day suppresses it. Existing regular streak reminders remain available after the streak threshold.
- Light/dark phone, large text, reduced motion, keyboard focus and 44px targets pass visual and accessibility review.

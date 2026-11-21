# App Review risk audit

Every App Review Guideline that applies to Tropos, checked against the code
on `main` at `6f1d1b6` (18 November 2026). Line numbers are at that commit.
The guideline text was read from
[Apple's App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
on the same day; its last change was 16 October 2026 (new 2.3.14 and 2.5.19,
a wider 1.2). What to paste into App Store Connect is in
[submission-pack.md](submission-pack.md).

Verdicts:

- **Pass**: the code on main meets the guideline.
- **Risk**: it meets it on paper, but rests on an owner step, a device check
  nobody has done, or a reading a reviewer may not share; or a gap that can
  draw a rejection.
- **Fail**: main does not meet it.

## The short version

Nothing in the app's code is a plain fail. Three things are most likely to
reject the first submission, and none of them can be fixed from the code
alone:

1. **A reviewer's test purchase may unlock nothing** (2.1(b), Risk, high).
   A sandbox purchase grants Pro only to the uids in
   `REVENUECAT_SANDBOX_UIDS` (`functions/lib/revenueCatEntitlement.js:59-92`).
   App Review buys in the sandbox, often on an account it makes itself. On
   any other account the purchase goes through, Apple charges nothing, and
   the account stays free. This is a deliberate guard, so it is an owner
   decision; the options are under [2.1](#21-app-completeness).
2. **Deleting an account that signed in with Apple can dead-end** (5.1.1(v),
   Risk, high, unverified). Deletion waits on revoking the Apple token
   (`src/lib/reauth.ts:47`, `src/lib/nativeAuth.ts:86-131`), and that call
   only works when Firebase's Apple provider holds the Services ID, Team ID,
   Key ID and private key. No doc or check proves it does. Reviewers delete
   accounts routinely.
3. **The listing on main describes an older app** (2.3.1, 2.3.2, Fail as
   metadata). `docs/app-store/listing.md` says Home shows steps, setup ends
   on a Pro offer and the marathon plans are free; none is true now. The
   submission pack replaces it.

Fix PRs opened from this audit, each small and separate:

| PR                                         | Guideline       | What it does                                                                            |
| ------------------------------------------ | --------------- | --------------------------------------------------------------------------------------- |
| #3399 `claude/launch-pro-cta-store-trial`  | 3.1.2, 2.3.1    | "Try Pro free" only when the App Store will give the trial; paywall links named in full |
| #3406 `claude/launch-paywall-store-prices` | 3.1.2, 2.3.1    | The iPhone paywall shows the App Store's prices, never the pound fallback               |
| #3408 `claude/launch-privacy-policy-gaps`  | 5.1.1(i), 5.1.3 | The Privacy Policy names push tokens and the screened run maps                          |
| #3413 `claude/launch-iphone-copy`          | 2.3.10, 4.2     | No "browser" in the iPhone camera message; no other app named under GPX import          |
| #3418 `claude/launch-submission-pack`      | 2.3, 5.1, 2.3.3 | The submission pack, the privacy label's push token, 6.9" and 6.5" screenshots          |

## 1. Safety

### 1.1 Objectionable content: Pass

No content of the kinds 1.1 lists. Race names in Spaces are text with no
logos, and each race page says it is not affiliated with the event
(`src/pages/Space.tsx:286`).

### 1.2 User-generated content: Pass for the main surfaces, Risk for segments

STATUS 2026-11-21: Pass for segments too since #3453 (the segment risk
below).

Apple asks for a filter, a way to report with timely responses, blocking,
and published contact details. Since 16 October 2026 the guideline also
names nonconsensual intimate imagery, including AI-made.

- **Filter.** Posts, comments, Space posts and display names pass the word
  filter on the phone and on the server (`src/lib/profanityFilter.ts`,
  `functions/profanityFilter.js:34-37`; posts flagged in
  `functions/lib/activityModeration.js:39-50`, comments refused before they
  are written at `functions/index.js:8637`, Space posts deleted by
  `functions/lib/spacePostModeration.js:72-90`). Every photo other people see
  (profile, post, Space post, run map) is checked by Google Cloud Vision
  SafeSearch first, and one rated LIKELY or VERY_LIKELY adult is refused and
  deleted (`functions/lib/photoScreen.js:12-15, 35`). The check fails closed.
- **Report.** "Report activity" on a post (`src/components/social/ActivityCard.tsx:1413`),
  "Report comment" (`src/components/social/CommentPanels.tsx:121`), "Report
  post" on a Space post (`src/features/spaces/SpacePostCard.tsx:297`) and
  "Report user" on a profile (`src/pages/UserProfile.tsx:421`). Each report
  is stored and emails the moderator (`functions/index.js:7701-7807`,
  `functions/lib/reportAlert.js:26, 51-57`); the queue is
  `src/pages/AdminModeration.tsx`, where a moderator hides the content or
  restricts the account.
- **Block.** "Block user" beside each Report entry, and both people are
  hidden from each other (`useBlockedUsers`).
- **Timely response.** The Terms promise review within 24 hours
  (`src/pages/TermsOfService.tsx:150-152`) and rule out objectionable content
  and abusive users (`:136-138`). Sign-up and sign-in say that continuing
  means agreeing to the Terms (`src/pages/Login.tsx:567-577`).
- **Contact.** Settings → Support & legal shows support@troposfit.com and a
  "Report objectionable content" email row
  (`src/components/settings/SupportLegalSection.tsx:86-101`); `/support`
  opens signed out (`src/App.tsx:598`).

Risks:

- **Segment names cannot be reported.** A segment's name is chosen by the
  runner who made it and shows on other people's runs that cross it
  (`functions/lib/segments.js:334-345`, `matchRunToSegments`), but the report targets are activity,
  comment, user, Space post and Space comment only (`src/lib/socialApi.ts:1057-1063`),
  and `src/pages/Segment.tsx` has no menu. Names pass the word filter
  (`functions/lib/segments.js:222-231`). Fix: a `segment` report target in
  `functions/lib/reportTargets.js` with a "Report segment" entry, and a
  moderator action that deletes the segment. It changes `functions/`, so it
  runs the backend deploy chain; not built in this pass. Until then the
  "Report objectionable content" email row is the way to report one.
  STATUS 2026-11-21: built in #3453. Anyone but its maker can report a
  segment from "More options" beside its name (Report segment, the
  `segment` report target, `src/pages/Segment.tsx`, `functions/lib/reportTargets.js`),
  and the moderation page's Remove segment deletes it as its maker's
  Delete does (`src/pages/AdminModeration.tsx`).
- **Circle names, meet-up text and Circle notes cannot be reported** either.
  They reach only the Circle's members, at most 8, invited by code, and pass
  the filter (`functions/lib/goalSpaceMembership.js:180`,
  `functions/lib/circleMeetups.js:220`). Low.
- **SafeSearch refuses nudity only.** Violent or gory photos pass the check
  (the owner's call, `functions/lib/photoScreen.js:12-15`); they can be
  reported. Low.
- **The 24-hour promise depends on the report email arriving.**
  `MODERATION_ALERT_EMAIL` and `RESEND_FROM` on a verified domain are owner
  settings (`docs/launch/owner-steps-2026-10-14.md`, Part 1).

### 1.3 Kids category: not applicable

Tropos is rated 16+ and not in the Kids category.

### 1.4.1 Physical harm, medical apps: Pass

Tropos is not a medical app and makes no measurement claims. Calorie
targets never fall below 1,200 kcal, or below maintenance where that is
lower, unless the person types their own (`src/lib/macroConstants.ts:81-94`); a typed target below that is kept with
a warning (`src/components/settings/CalorieTargetOverride.tsx:94-100`).
Weight-loss rates stop at 0.75 kg a week (`NutritionSection.tsx:385-388`).
Readiness is said in words, not a score, and only describes sleep and heart
rate against the person's own usual (`src/lib/readiness.ts`). The Terms say
Tropos is not a medical device and gives no medical advice
(`src/pages/TermsOfService.tsx:165-169`). Low risk: that line lives only in
the Terms; the review notes repeat it.

### 1.5 Developer information: Pass

Support URL `https://troposfit.com/support`, reachable signed out
(`src/pages/Support.tsx`, `src/App.tsx:598`), with support@troposfit.com.
Check it still renders once troposfit.com becomes the App Store page
(App1 Q52, PR #3375, open).

### 1.6 Data security: Pass

Firestore and Storage rules hold every collection to its owner or the
server (`firestore.rules`, `storage.rules`, with rules tests at the repo
root); App Check on both platforms; Hosting sends HSTS and a
`frame-ancestors 'none'` header (`firebase.json`).

## 2. Performance

### 2.1 App completeness: Risk

- **(a) Demo account.** Sign-in is required, so App Review needs a demo
  account with setup finished, a verified email and a few weeks of logs
  (submission pack, App Review information). The backend must be live
  during review: the Firebase functions and RevenueCat's webhook.
- **(a) Tested on a device.** TestFlight build 12 bought Pro in the sandbox
  on 8 November (`docs/iap/revenuecat-setup.md`, STATUS 2026-11-08). The
  widgets and the lift's Live Activity (#3373, 15 November) have open
  device rows (`docs/qa/pre-launch-backlog.md`, "The widgets and the lift's
  whole-workout card"). Both are in the binary, so a broken one is a 2.1
  rejection. Run those rows before submitting.
- **(b) In-app purchases must be complete, visible and functional.**
  - The submitted build needs `VITE_REVENUECAT_IOS_KEY`
    (`.github/workflows/deploy-ios.yml:354`); without it the paywall says
    purchases aren't available (`src/lib/purchaseProvider.ts:271-274`).
  - Both products must be attached to the version, each with its review
    screenshot.
  - **The sandbox guard.** A sandbox purchase grants Pro only to a uid in
    `REVENUECAT_SANDBOX_UIDS` (`functions/lib/revenueCatEntitlement.js:59-92`).
    The app still sees RevenueCat's active entitlement (`src/lib/revenuecat.ts:284-290`),
    so the purchase looks done while Pro stays off. The guard exists because
    a sandbox purchase costs nothing and anyone holding a test build or the
    web sandbox link could attach one to an account. Owner decision, before
    submitting:
    - **Keep the guard** (today's design): put the demo account's uid on the
      list, and the review notes ask App Review to buy on that account.
      Reviewers usually use the demo account, but a reviewer who makes an
      account to test deletion and then buys on it sees nothing unlock.
    - **Let App Store sandbox purchases through for every account**, and
      keep the guard for the web's sandbox link. Only builds signed by
      Tropos's own team (TestFlight, App Review) can make an App Store
      sandbox purchase, so the cost is free Pro for TestFlight testers. It
      changes `functions/lib/revenueCatEntitlement.js` and runs the backend
      deploy chain.
  - **Version.** `package.json` is 1.2.0, and `deploy-ios.yml` stamps the
    build with it; the App Store Connect version must match.

### 2.2 Beta testing: Pass

Pilot builds are marked "Not for App Store release" and kept to their own
TestFlight group (`scripts/ios/testflight-build.mjs`, `docs/ios-release.md`).

### 2.3 Accurate metadata: Fail as metadata, until the submission pack lands

- **2.3.1(a), 2.3.2.** `docs/app-store/listing.md` no longer matches main:
  - "Steps from Apple Health on Home" (`listing.md:98`): Home dropped steps
    (App1 Q31); steps now feed the activity-level offer under Food, for Pro.
  - The review notes send the reviewer to "the offer shown after setup"
    (`listing.md:262`): setup goes straight to Home (App1 Q27).
  - "Race plans for 5K, 10K, half marathon and marathon" sits under the free
    features (`listing.md:82`): half marathon and longer are Pro after their
    first week (`src/lib/racePlanAccess.ts`, Q85). 2.3.2 asks the
    description and screenshots to say what needs a purchase, and the race
    plan screenshot shows a half marathon.
  - Readiness, older charts and the score's details are Pro and missing
    from the Pro list (`src/components/paywall/proIncludesCopy.ts:15-23`).
  - The review notes say Tropos reads steps and shows them on Home
    (`listing.md:276`); the Health permission now also reads sleep, resting
    heart rate and HRV (`ios/App/App.xcodeproj/project.pbxproj:681`).
  - Spaces, challenges and leagues are listed as features, but they stay
    hidden until at least 10 people are training on Tropos
    (`src/lib/enoughPeople.ts:66-76`, App1 Q6). At launch a reviewer sees
    none of them unless the demo account is already in one.
    Fix: the submission pack rewrites each, and its test pins the claims.
    STATUS 2026-11-21: Q6 (#3447, owner 18 Nov) shows all three from the
    first day, with "Filling up" below their floors; that gate is deleted.
- **2.3.3 Screenshots** show the app in use, from the capture rig
  (`e2e/screenshots/app-store.capture.spec.ts`). Pass once taken from the
  final build; see the pack.
- **2.3.7 Name and keywords.** "Tropos: Gym & Running Planner" fits 30
  characters; the keywords carry no other app's name. Pass.
- **2.3.10 Other platforms.** No Android or Google Play in the app or the
  listing. The camera message on iPhone says "device or browser settings"
  (`src/components/FoodCameraModal.tsx:1266-1267`) and the GPX hint names
  Strava and Komoot (`src/components/run/RouteSetupSection.tsx:184`). Neither
  is another platform; both read as a web page in an app. Fixed in
  `claude/launch-iphone-copy`. Low.
- **2.3.14 Creative assets** (new): only if the owner adds product page
  headers or search assets; no prices on them. Not used today.

### 2.4 Hardware compatibility: Risk

- **2.4.1 iPad.** The app is iPhone-only (`TARGETED_DEVICE_FAMILY = 1`,
  `project.pbxproj:647, 679`), and App Review may run it on an iPad in
  iPhone mode. Purchases there take the App Store path (`isNativeIOS()`
  reads the native shell, `src/lib/purchaseProvider.ts:76-78`). No one has
  opened the build on an iPad: Home, a sheet, the paywall and a run, once.
- **2.4.2 Power.** GPS runs only while a run is recorded; the warm-up
  watcher stops with the setup screen (`src/lib/nativeLocationSource.ts:147, 218, 231`).

### 2.5 Software requirements

- **2.5.1 Public APIs, and HealthKit shown in the UI: Pass.** HealthKit is
  read only, through `@capgo/capacitor-health`. A reviewer finds it at
  Settings → Apple Health → Connect, on any account
  (`src/components/settings/HealthSection.tsx:322-340`); the sleep and heart
  link sits on Home's readiness line for Pro (`src/components/home/ReadinessStrip.tsx:54`).
  The review notes give both paths.
- **2.5.2 Self-contained: Pass.** No update plugin, no `server.url`
  (`capacitor.config.ts:10-12`), web assets bundled by `cap sync`, service
  worker off in the native shell (`src/lib/register-sw.ts:104-105`).
- **2.5.4 Background modes: Risk.** `UIBackgroundModes` holds `location` and
  `bluetooth-central` (`ios/App/App/Info.plist:51-55`). Location records a
  run with the screen locked; Bluetooth keeps reading a paired heart-rate
  strap during a run (`src/components/settings/HeartRateSensorSection.tsx`,
  Settings → Run plan). Both are their intended purposes, but neither has
  passed its device row (`docs/qa/pre-launch-backlog.md`: the locked-screen
  run and the strap with the phone locked), and App Review often asks for
  a video of paired hardware. Record one before submitting, and the notes
  explain both modes.
- **2.5.9 Standard switches: Pass.**
- **2.5.14 Recording activity: Pass.** Location is in use only during a run,
  with the system indicator.
- **2.5.16 Widgets, extensions, notifications: Pass.** The Today, Streak and
  Today's food widgets and the run and lift Live Activities show only the
  person's own sessions and food (`ios/App/LiveActivities/*.swift`,
  `src/lib/runLiveActivity.ts`, `src/lib/liftLiveActivity.ts`), with no
  offers. Live Activities have their own switch
  (`src/components/settings/LiveActivitiesGroup.tsx:38-41`). The food widget
  shows calories on the Lock Screen when added there; the owner may want it
  marked `.privacySensitive()`. Low.
- **2.5.19 Hidden or dormant features (new): Risk.**
  - `/diagnostics` and `/admin/moderation` are routes in the production
    build (`src/App.tsx:1084, 1096`), linked from nowhere; the admin page
    shows "Not authorised" to anyone not on the admin list
    (`src/pages/AdminModeration.tsx:309-311`).
  - The Watch app and Health workout export are compiled into the iPhone
    app but switched off for the App Store build by `TroposConnectedTrainingEnabled = NO`
    (`ios/App/App/Info.plist:7-8`, `project.pbxproj:676`). Turning them on
    takes a new build, which App Review sees.
  - Spaces, challenges and leagues open once 10 people are training
    (`src/lib/enoughPeople.ts`), from server counts.
    STATUS 2026-11-21: since Q6 (#3447) all three are shown from the first
    day, with "Filling up" below their floors.
    All three are named in the review notes, which is what 2.5.19 asks
    ("your app's functionality should be clear to end users and App Review").

## 3. Business

### 3.1.1 In-App Purchase: Pass

On the iPhone, Pro is sold only through RevenueCat and the App Store
(`src/lib/purchaseProvider.ts:256`, `src/lib/revenuecat.ts:239-301`). The
website's checkout link is built only when the app is not running in the
iOS shell (`src/lib/purchaseProvider.ts:140-155, 256-276`), its token is set
only for the Firebase Hosting build (`.github/workflows/deploy-hosting.yml:91`),
and no iPhone screen links to a page that sells. Nothing is unlocked by a
code, a link or a reward; invites only make follows
(`functions/lib/inviteCodes.js`).

### 3.1.2 Subscriptions: Risk, fixed by two PRs

- **Pass:** the paywall says what Pro adds before any price
  (`src/pages/Upgrade.tsx:557-561`, `proIncludesCopy.ts`); with the trial,
  the price after it is the bold line ("7 days free, then … a year",
  `src/lib/proPlans.ts:220-223`); renewal and cancellation terms sit under
  the button (`Upgrade.tsx:614-620`, `RenewalDisclosure`); Restore is on
  both paywalls (`Upgrade.tsx:325-337`, `src/components/ProModal.tsx:393-402`);
  the description links the Terms and the Privacy Policy; one subscription
  group, 7-day trial set in App Store Connect.
- **Risk, "Try Pro free".** The Food composer's Pro line, the scanner, the
  pace card and the run plan's Pro line say "Try Pro free" from the
  account's record alone (`src/hooks/useProCtaLabel.ts:15-19`). Apple gives
  one introductory offer per Apple ID, so an Apple ID that had the trial
  under another account, which App Review's sandbox accounts often have,
  reads "free" and then a price. The paywall already asks the App Store
  (`src/hooks/useStoreTrialEligibility.ts`). Fixed in
  `claude/launch-pro-cta-store-trial`.
- **Risk, the legal links.** The paywall's links read "Terms" and "Privacy"
  (`src/components/paywall/PaywallLegalLinks.tsx:18-25`). Reviewers look for
  the terms of use and the privacy policy by name. Same PR: "Terms of
  Service" and "Privacy Policy", the names the pages and Settings use.
- **Risk, the pound fallback.** Until RevenueCat returns the App Store's
  prices, or if it never does, the iPhone paywall shows the hard-coded
  £3.99, £34.99 and "Save 27%" (`src/hooks/useProPlanPrices.ts:17-23`,
  `src/lib/proPlans.ts:83-113`). A reviewer on the US storefront can see
  pounds above a dollar purchase sheet. Fixed in `claude/launch-paywall-store-prices`.
- **Note.** A website subscriber who opens the iPhone app reads "Manage your
  subscription at troposfit.com" as plain text, with no link or price
  (`Upgrade.tsx:447-454`). Managing an existing subscription is not a call to
  buy (3.1.3(b)). Once troposfit.com is the App Store page (PR #3375), that
  line should name where a web subscription is managed instead.

### 3.1.3 Other purchase methods: Pass

3.1.3(b): Pro bought on the website is honoured in the app, and Pro is also
sold as an in-app purchase. The app says nothing that sends anyone to buy
outside it, so the US storefront exemption is not needed.

### 3.2.2 Unacceptable business practices: Pass

No review prompts and no rewards for ratings (no `requestReview` anywhere).

## 4. Design

### 4.0 Design: Risk until the iPad pass under 2.4.1

### 4.1 Copycats: Pass

Own name, own icon and mark (`src/components/ui/BrandMark.tsx`).

### 4.2 Minimum functionality: Pass

A Capacitor app with bundled assets that uses HealthKit, background GPS,
CoreMotion auto-pause, a Bluetooth heart-rate strap, Live Activities,
widgets with an App Intent (`ios/App/LiveActivities/LogDrinkIntent.swift`),
push, local reminders, haptics, Sign in with Apple and In-App Purchase.

### 4.3 Spam: Pass

One app, a combined lifting, running and food planner.

### 4.5.3 Apple services (Live Activities named since June 2026): Pass

A Live Activity runs only while the person's own run or lift is under way,
and carries no messages or offers.

### 4.5.4 Push notifications: Pass

- Asked once, after the first saved session, with Not now
  (`src/components/workout/ReminderOffer.tsx:164-178`); the app works with
  push off.
- No push sells anything. Pushes not from a person are capped at one a day
  and five a week (`functions/lib/pushBudget.js:56-57`); monthly challenge
  pushes are off until asked for (`functions/lib/pushConsent.js:52-55`);
  every kind has a switch in Settings → Notifications.
- Low: the one Remind me also turns on the evening streak nudge, Monday's
  review and badge pushes (`src/lib/pushConsent.ts:51-58`), while the
  card names the training-day reminder only. That is the owner's design
  (Q66); the card could say so.

### 4.8 Login services: Pass

"Continue with Apple" is first, filled, and the same size as "Continue with
Google" on both sign-in screens (`src/pages/Login.tsx:426-454`). Sign in with
Apple lets the person hide their email, and both of Apple's relay domains
are recognised (`src/lib/appleRelay.ts:8-9`).

## 5. Legal

### 5.1.1 Data collection and storage

- **(i) Privacy policy: Risk, fixed by a PR.** Linked in App Store Connect,
  from the paywall and from Settings → Support & legal, and public at
  troposfit.com/privacy. It names every service the app calls
  (`src/pages/PrivacyPolicy.tsx:446-552`) except one: the push token the
  phone registers (Firebase Cloud Messaging and Apple's push service,
  `functions/index.js:3271`). Its Cloud Vision entry leaves out the run
  maps that are screened (`PrivacyPolicy.tsx:457-462`,
  `functions/lib/photoScreen.js:8`). Fixed in `claude/launch-privacy-policy-gaps`.
  - STATUS 2026-11-18: the second review found the policy has more gaps
    than this one, so "names every service except one" is wrong. It does
    not say that public posts are open to anyone on the web, signed out
    (`functions/lib/publicPost.js`); it does not mention segments; it says
    "age range" where the app stores a year of birth; it does not name the
    run map images stored in `route-maps/`, or Circle meet-ups; its Social
    Activity entry leaves out hidden posts, blocks, league standings,
    challenge places, medals, `invitedBy` and the race identity; it
    describes Watch runs and workout export, which are off in the App Store
    build; it lists food searches as collected where the privacy label says
    not; and its Resend and error-report entries leave out that Resend also
    carries moderation alert emails with the reported content, and that
    error reports keep the page address and user agent.
    `claude/launch-privacy-policy-gaps` fixes the push token, the screened
    run maps and the age wording only. The rest of the policy text waits on
    the owner.
    STATUS 2026-11-21: #3408 now covers each gap listed above, checked
    against `main`, with a legal-basis table, the transfers and their
    safeguards, and complaints to Tropos and the ICO. One correction: the
    report alert carries the reason, the kind of thing reported and the
    reporter's note, not the reported content (`functions/lib/reportAlert.js`).
- **(ii) Permission and purpose strings: Pass.** Each string says what the
  data is for (`ios/App/App/Info.plist:43-67`). The Health write string
  says Tropos writes nothing, which is true of the App Store build
  (`project.pbxproj:684`); the key is present because the plugin's write
  call is in the binary.
- **(iii) Data minimisation: Pass.** Photos come through the system picker
  or the camera, never full library access.
- **(iv) Access: Pass.** Every prompt follows a tap, and declining leaves a
  way on: a run without GPS (`src/pages/Run.tsx:2959-2967`), typing instead
  of the camera, a sensor never paired. The steps primer has Not now and
  Connect, and Connect goes straight to Apple's sheet
  (`src/components/home/StepsPrimingModal.tsx:35-46`).
- **(v) Account sign-in and deletion: Risk, high.**
  - Sign-in is needed because the plan, logs and social features are the
    account's (`src/App.tsx:592-603`). Setup asks for weight, height, year
    of birth and sex to work out the calorie target, says why
    (`src/pages/Onboarding.tsx:2166-2170`), and offers "Prefer not to say".
  - Deletion is in the app: Settings → Account → Delete account
    (`src/components/settings/AccountSection.tsx:402-421`), immediate, with
    what is kept stated (`:533-539`, `PrivacyPolicy.tsx:396-418`). An App
    Store subscriber is told the subscription keeps billing until cancelled,
    with a link to Apple's subscriptions page (`AccountSection.tsx:430-472`).
  - **The Apple revoke.** An account linked to Apple confirms with Apple,
    then the app sends Apple's authorisation code to Firebase's revoke
    endpoint (`src/lib/nativeAuth.ts:86-131`), as Apple requires. Deletion
    runs only after that succeeds (`src/lib/reauth.ts:47`,
    `AccountSection.tsx:287-291`). Firebase can exchange the code only if
    its Apple provider has the OAuth code flow set: the Services ID, Apple
    Team ID, Key ID and the key's private key. Nothing in the repo says it
    is set, and the code is marked unverified on a device
    (`src/lib/nativeAuth.ts:21`). If it is missing, every Apple account sees
    "Couldn’t disconnect Sign in with Apple. Try again." and cannot delete.
    Owner: check the Firebase console, then delete a disposable Apple
    account on a TestFlight build (`docs/account-deletion-verification.md`).
    Whether deletion should go ahead when the revoke fails for a reason
    other than the person cancelling is an owner call: going ahead keeps
    5.1.1(v), stopping keeps Apple's revoke rule.

### 5.1.2 Data use and sharing

- **(i) Third-party AI: Pass.** A meal photo or a typed meal goes to Google's
  Gemini only after the person says yes to a sheet that names Google and
  says what is sent (`src/lib/aiConsent.ts:53-62`), on every path
  (`src/components/FoodAnalyzer.tsx:851-854`, `src/pages/Food.tsx:1030-1037`),
  and the server refuses an account that said no
  (`functions/lib/aiConsent.js`, `functions/index.js:1574, 1843`).
- **(i) Cloud Vision: Risk, low.** A photo someone posts is checked by
  Google Cloud Vision with no notice at the moment of upload; the Privacy
  Policy says so. It is moderation 1.2 asks for, by the same Google Cloud
  project as the rest of the backend, and it returns a rating, not content.
- **(i) Tracking: Pass.** No advertising identifier and no App Tracking
  Transparency prompt needed: the analytics plugin is built without ad-ID
  support (`capacitor.config.ts`), the tracking framework is patched out of
  the sign-in plugin (`patches/@capacitor-firebase+authentication+8.5.2.patch`),
  and `NSPrivacyTracking` is false (`ios/App/App/PrivacyInfo.xcprivacy`).
- **(i) No system feature is required to use the app: Pass.**

### 5.1.3 Health and health research: Pass

- (i) Health data is used only for the person: steps, sleep, resting heart
  rate and HRV are read on the phone and never stored, sent to analytics or
  to an AI model (`src/hooks/useSteps.ts`, `src/hooks/useBodySignals.ts:63-82`,
  `functions/lib/foodTextRequest.js:21, 47`). Accepting the steps offer
  saves the new activity level, not the steps. The Privacy Policy names the
  Health types read (`PrivacyPolicy.tsx:124-133, 581-604`).
- (ii) Nothing is written to Health in the App Store build, and nothing
  goes to iCloud.

### 5.2 Intellectual property: Risk, owner's call stands

- Maps credit OpenFreeMap and OpenStreetMap (`src/lib/basemap.ts:94-95`),
  weather credits MET Norway (`src/lib/weather.ts:74`) and food data credits
  Open Food Facts (`src/lib/offNutrition.ts:30`).
- Photographs on Space and challenge cards have source records under
  `src/assets/editorial/`, except `space-the-big-half` and
  `space-london-10000`, which were not traced; the owner keeps them
  (`src/assets/editorial/README.md:56-58`). The content-rights answer in
  App Store Connect is the owner's word that Tropos may use them.
- "Apple Health" is the name in the UI; "HealthKit" appears in no string.

### 5.3 to 5.5: not applicable

No gambling, contests with prizes, VPN or MDM.

### 5.6 Developer code of conduct: Pass

Nothing in the app misleads about price or trial (once the two paywall PRs
land), and no review manipulation.

## New App Store Connect requirements this year

These are questions in App Store Connect rather than guidelines; the
answers are in the submission pack.

- **Regulated medical device status** (26 March 2026): every Health &
  Fitness app in the EEA, UK or US declares it. Tropos: No.
- **Age rating: social media** (required since September 2026) and the
  **Shared Location** descriptor (16 November 2026): Tropos shares run maps
  on posts, so Yes.
- **Texas SB 2420, then Utah and Louisiana** (its date was 1 January 2026;
  in force in Texas since 4 June 2026, when an injunction was lifted): duties on developers to use the store's age category and
  parental consent for minors. Tropos is 16+ and does not read Apple's
  Declared Age Range API. A legal question for the owner, not an App
  Review one.
- **Builds from Xcode 26 and the iOS 26 SDK** (since 28 April 2026):
  `deploy-ios.yml` builds on `macos-26`.

## Owner and device checks this audit depends on

They are listed as rows in `docs/qa/pre-launch-backlog.md`, "App Review
submission checks (launch audit, 2026-11-18)".

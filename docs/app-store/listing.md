# App Store listing

What to enter in App Store Connect for Tropos (Apple ID 6762416918, bundle
`com.tropos.app`, English (U.K.)), the answers to its questionnaires, and
what has to be true before the first submission. Tracked by
[issue 2542](https://github.com/lemmonchess333/Maiin/issues/2542).

Every claim here was checked against the code on 2026-10-04. When a feature,
an SDK or a flow of data changes, change the matching section in the same PR:
the privacy answers in particular describe what the code does, and Apple
holds the label, the privacy policy and the app to each other.
`src/lib/__tests__/appStoreListing.test.ts` checks each pasteable field
against Apple's length limit and a few claims against the code.

Each pasteable field is in a box of its own. Paste the box's contents, not
the line above it.

## Product page

### Name

Up to 30 characters. Search weighs the name more than anything else, so it
carries a description after the brand, as most fitness apps' names do. The
name under the icon on the home screen stays "Tropos" either way
(`CFBundleDisplayName`). If you'd rather the store name were the brand alone,
use `Tropos`, and give "gym" and "running" two of the keywords' places.

<!-- field: name -->

```text
Tropos: Gym & Running Planner
```

### Subtitle

Up to 30 characters.

<!-- field: subtitle -->

```text
Workout, run & calorie tracker
```

### Promotional text

Up to 170 characters. It can be changed at any time without a review, so
it is the place for news later on.

<!-- field: promotional-text -->

```text
A lifting and running plan that fits your week, and a daily calorie target worked out from your numbers. Log food by typing or barcode, or from a photo with Pro.
```

### Description

Up to 4,000 characters. The two links at the end are required for
auto-renewable subscriptions (App Review Guideline 3.1.2), and both must open
without signing in.

<!-- field: description -->

```text
Tropos builds a weekly plan for lifting and running, works out a daily calorie target from your numbers, and keeps your training and food in one place.

Tell it your goal, the days you can train, your equipment and your experience. It plans lift sessions for those days, fits your runs around them, and suggests the next step from what you log.

Lifting
• 2 to 6 sessions a week, split to suit your days: full body, upper and lower, or push, pull and legs.
• Starting weights from your bodyweight and experience. Last session's numbers are filled in, and when every set reaches its reps the app suggests adding 2.5 kg.
• Warm-up sets, a rest timer and a plate calculator.
• Shorter versions when time is tight: 45 or 30 minutes with the main lifts kept, or an easier day, without changing the plan.
• Exercise choices that work around a limitation in your lower back, shoulders, knees, elbows or wrists.
• Over 150 exercises, many with drawn form guides.
• A suggested deload week when your training calls for one, and new personal bests marked as you lift.

Running
• GPS runs with pace, splits, elevation and a route map coloured by pace.
• Easy runs, tempo runs, intervals, long runs and guided runs, with spoken splits and pace alerts.
• Race plans for 5K, 10K, half marathon and marathon, built back from race day through base, build and taper. Choose a race from the directory or enter your own date.
• Adjust a week when you're unwell or busy, and keep the race date.
• Plan routes, run them again against your last time, and hide the start and end of the runs you share.
• Training paces from a recent race time, race predictions and shoe mileage.

Food
• Type a meal the way you'd say it, search the food database, or scan a barcode.
• Log your usual breakfast in one tap, or copy yesterday's meals.
• A daily calorie target from your weight, height, age and goal, with protein, carbs and fat.
• Water and weight on Home, with your weight trend rather than the day-to-day swings.

Progress
• Analytics for lifting, running, body and food, with personal records and a map of the muscles you've trained.
• A weekly performance score from 0 to 100, and a review of each week.
• Progress photos, streaks and badges.
• Steps from Apple Health on Home.

With other people
• Share sessions with the people who follow you, give props and comment.
• Join Spaces for races and interests, start a Circle of up to 8 people, and keep a shared streak with a training partner.
• Weekly, monthly and seasonal challenges, and a weekly leaderboard with the people you follow.
• Choose who sees each session, and report or block anyone.

Tropos Pro
• Log a meal from a photo. The food and its macros are filled in for you to check. Photos are analysed by Google and kept only on your phone.
• Typed meals read by AI, which handles more than the built-in food list.
• A calorie target that adapts to what you log and how your weight moves.
• Protein, carbs and fat that shift with each day's training.
• Pace targets that move with your recent runs, and planned routes that follow the roads.

Pro is a monthly or yearly subscription, with a 7-day free trial for new subscribers. Payment is taken from your Apple Account when the trial ends, or when you subscribe if there is no trial. It renews automatically unless you cancel at least 24 hours before the end of the current period. Manage or cancel it in your Apple Account settings.

Terms of Use: https://troposfit.com/terms
Privacy Policy: https://troposfit.com/privacy
```

What the description leaves out on purpose, because the app can't do it
yet: phone notifications for social activity (iPhone gets reminders only,
`src/lib/pushNotifications.ts`), live heart rate or Apple Watch
(`src/lib/heartRateSource.ts`), lock-screen Live Activities, data exports
(they don't save on iPhone, `src/lib/export.ts`), and "unlimited" anything:
Pro allows 100 photo scans and 100 typed-meal reads a day
(`DAILY_AI_LIMITS`, `src/lib/subscription.ts`). It also doesn't promise
recording with the screen locked until a device run has proved it
(`docs/run-background-gps.md`).

### Keywords

Up to 100 bytes, separated by commas with no spaces. Apple already indexes
the words in the name and subtitle, so these don't repeat them; between the
three fields the listing covers searches such as "calorie counter", "macro
tracker", "workout log", "strength training", "half marathon" and "hybrid
training". Apple's guidelines rule out other apps' names.

<!-- field: keywords -->

```text
lifting,strength,training,plan,marathon,hybrid,5k,10k,half,macro,counter,food,log,protein,weight
```

## App information

| Field              | Entry                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Support URL        | `https://troposfit.com/support`. Until that domain serves the app, `https://adaptive-fitness-af8bb.firebaseapp.com/support` (the same page, public, `src/pages/Support.tsx`)                                                                                                                                             |
| Marketing URL      | Optional. Leave it empty until troposfit.com has a home page of its own                                                                                                                                                                                                                                                  |
| Privacy Policy URL | `https://troposfit.com/privacy`, or `https://adaptive-fitness-af8bb.firebaseapp.com/privacy` until then. Not the static `public/legal/privacy.html`: it is the May 2026 version                                                                                                                                          |
| Category           | Health & Fitness. No secondary category                                                                                                                                                                                                                                                                                  |
| Copyright          | `2026 Myles Kennedy`, the owner named in the Terms (`src/pages/TermsOfService.tsx`)                                                                                                                                                                                                                                      |
| Content rights     | "Yes, it contains third-party content": map data from OpenStreetMap through CARTO, food data from Open Food Facts, weather from Open-Meteo, road routes from Mapbox, and real race names in Spaces. Answer that you hold the rights only once the licensing items under [Before submitting](#before-submitting) are done |

If the description's links go to the firebaseapp.com addresses for now,
change both lines at the end of it to match.

### Age rating

Apple's questionnaire as it stands since 2025, with the answer for each
question and the reason.

| Question                                                   | Answer    | Why                                                                                                              |
| ---------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| Parental controls                                          | No        |                                                                                                                  |
| Age assurance                                              | No        | Setup asks for an age range and turns away anyone under 16 (`src/pages/Onboarding.tsx`), but nothing verifies it |
| Unrestricted web access                                    | No        | Outside links open in Safari                                                                                     |
| User-generated content                                     | Yes       | Posts, comments, Space posts with photos, profile photos                                                         |
| Messaging and chat                                         | Yes       | No private messages, but Apple's definition includes public posting and comments                                 |
| Advertising                                                | No        |                                                                                                                  |
| Social media                                               | Yes       | A feed with props, comments and sharing. This places the app at 13+ at least                                     |
| Health or wellness topics                                  | Yes       | Calorie tracking and exercise plans                                                                              |
| Medical or treatment information                           | None      | Injury limits only change which exercises are chosen; the app gives no treatment advice                          |
| Alcohol, tobacco or drug use or references                 | None      | The food search includes drinks such as beer and wine for logging; the app doesn't depict or encourage them      |
| Profanity, sexual content, violence, horror, mature themes | None      |                                                                                                                  |
| Gambling, simulated gambling, contests, loot boxes         | No / None | Challenges and leaderboards carry no prizes                                                                      |

Then raise the rating to **16+**, the minimum age in the Terms (section 2)
and at setup. Apple allows a higher rating than the questionnaire gives.

## App Privacy

The label, answered against the code. All the data below is linked to the
person's account, and none of it is used for tracking.

**Tracking: No.** There is no App Tracking Transparency prompt and no
advertising identifier is read. This holds only while Google Analytics stays
unlinked from Google Ads and Google Signals is off in the Firebase console.
The analytics plugin still links Google's ad-ID support by default; see
[Before submitting](#before-submitting).

### Data linked to you

| Category         | Data type             | Purposes                     | What it is                                                                                                                                                                 |
| ---------------- | --------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact info     | Name                  | App functionality            | The display name, shown to other people on posts and the profile                                                                                                           |
| Contact info     | Email address         | App functionality            | Sign-in, and the verification and password-reset emails (sent through Resend)                                                                                              |
| Health & fitness | Health                | App functionality, analytics | Weight, height, sex, age range, goal weight, injury limits, max heart rate, the food diary and calorie targets. Some figures, such as macro shares, reach Google Analytics |
| Health & fitness | Fitness               | App functionality, analytics | Workouts, runs, the training plan, records, streaks and badges. Weekly totals and the performance score reach Google Analytics                                             |
| Location         | Precise location      | App functionality            | Run routes, privacy zones and saved routes                                                                                                                                 |
| Location         | Coarse location       | Analytics                    | The city and country Google Analytics works out from the IP address                                                                                                        |
| User content     | Photos or videos      | App functionality            | Profile, progress and Space post photos. Meal photos are analysed by Google and not kept on any server                                                                     |
| User content     | Other user content    | App functionality            | Posts, comments, captions, notes, check-ins, reports and meal descriptions                                                                                                 |
| Identifiers      | User ID               | App functionality            | The account ID, which is also the customer ID RevenueCat holds                                                                                                             |
| Identifiers      | Device ID             | Analytics                    | Google Analytics' app-instance ID                                                                                                                                          |
| Purchases        | Purchase history      | App functionality            | Subscription status, product and expiry                                                                                                                                    |
| Usage data       | Product interaction   | App functionality, analytics | Screens and actions sent to Google Analytics, and social actions such as props and follows                                                                                 |
| Usage data       | Other usage data      | App functionality, analytics | Last active time, AI scan counts, settings                                                                                                                                 |
| Diagnostics      | Crash data            | App functionality            | Crash reports saved to the account (`src/lib/errorReporting.ts`)                                                                                                           |
| Diagnostics      | Performance data      | Analytics                    | Screen load times sent to Google Analytics                                                                                                                                 |
| Diagnostics      | Other diagnostic data | App functionality            | Error reports with the device model and system version                                                                                                                     |

Google Analytics data carries no account ID (the code never calls
`setUserId`), so "not linked" is defensible for the coarse location, device
ID and performance rows. They are marked linked here because that is the safe
side; whichever you choose, use the same in the privacy manifest
(`ios/App/App/PrivacyInfo.xcprivacy`).

### Data not collected

Phone number, physical address, other contact info, payment info, credit
info, other financial info, sensitive info, contacts, emails or text
messages, audio, gameplay content, customer support, browsing history,
search history, advertising data, surroundings, body, other data.

- **Apple Health steps** are read and shown on the phone, and never stored or
  sent (`src/hooks/useSteps.ts`), so they are not collected.
- **Food searches** go from the phone straight to Open Food Facts and are not
  stored.
- **Support emails** are written in the person's own mail app, so they fall
  outside the label.

## App Review information

**Sign-in required: yes.** Give a demo account that signs in with email and
password and doesn't expire. Before submitting, the account should:

- have finished setup;
- have a verified email address, or posting and commenting are refused;
- have a few weeks of workouts, runs, meals and weigh-ins, entered by hand,
  so Analytics and the weekly review have something in them (the seed
  scripts only work against the emulator);
- follow someone and have joined a Space with a post;
- have its uid in `REVENUECAT_SANDBOX_UIDS`, or its test purchase won't
  unlock Pro (`docs/iap/revenuecat-setup.md`, Part C).

**Notes.** Up to 4,000 bytes. Every line has to be true of the build you
submit; the lines on moderation and on AI consent depend on items under
[Before submitting](#before-submitting).

<!-- field: review-notes -->

```text
Tropos is a training and food app. Setup asks about goals, training days, equipment and experience, then builds a weekly lifting and running plan and a daily calorie target.

The demo account has finished setup and has several weeks of workouts, runs and meals, so Analytics and the weekly review have data. Its email address is verified, so posting and commenting work, and it can make sandbox purchases.

Where to find things
- Today's session: the card at the top of Home. Start opens the workout.
- Food logging: the Food tab. Type a meal, or tap the orange camera button to scan a meal photo (Pro) or a barcode (free).
- Pro: the offer shown after setup, any "Try Pro free" button, or Settings > Subscription. Restore is on the same screen.
- Settings: tap the photo or initials at the top right of Home.
- Account deletion: Settings > Account > Delete account.
- Reporting and blocking: "More options" on a post (Report activity, Block user), "Post options" on a Space post (Report post, Block user) and "More options" on a profile (Report user, Block user). Blocked people are listed in Settings > Social & privacy.
- Privacy Policy, Terms and support contact: Settings > Help & legal.

Pro and In-App Purchase
Tropos Pro is sold as monthly and yearly auto-renewable subscriptions through In-App Purchase, with a 7-day free trial for new subscribers. Pro adds meal logging from a photo, AI reading of typed meals, an adaptive calorie target, macros that follow the day's training, adaptive pace targets and road-following route planning. Everything else is free.

AI food analysis
When a Pro user scans a meal or a label, or types a meal, the photo or text is sent to Google's Gemini model on Vertex AI, which returns the foods and their macros. The app asks before the first one is sent. Photo results are shown for the user to check and edit before they are logged. Photos are not stored on our servers: the app keeps them on the phone for 90 days to show in the food diary. No account identifier is sent to Google. AI analysis can be switched off in Settings > Social & privacy.

Apple Health
Tropos reads the daily step count and shows it on Home. It does not write to Health, does not store step counts on our servers, and does not use Health data for advertising.

Location
Location is used only while a run is being recorded, to draw the route and work out distance and pace. Recording continues while the screen is locked, which is why the app asks for Always access when a run starts. Treadmill and manual runs work without location. Users can hide the start and end of the routes they share and set private zones.

Moderation
New accounts agree to the Terms, which do not allow objectionable content or abusive behaviour. Posts and comments pass a word filter, and users can report posts, comments and people. Reports go to a review queue that we check every day, and we act within 24 hours by removing the content or restricting the account.

Health
Tropos is not a medical device and gives no medical advice. Calorie targets are estimates from standard formulas, and can be changed in Settings > Nutrition.
```

Contact information: your own name, phone number and email. Apple calls
them only about the review.

## In-app purchases

One subscription group with two auto-renewable products. The product IDs are
fixed by the code (`src/lib/purchaseProvider.ts`); the prices are the ones
the paywall falls back to (`src/lib/proPlans.ts`), and the actual prices are
your choice in App Store Connect.

|                    | Monthly                                          | Yearly                        |
| ------------------ | ------------------------------------------------ | ----------------------------- |
| Reference name     | Tropos Pro Monthly                               | Tropos Pro Yearly             |
| Product ID         | `com.tropos.app.pro.monthly`                     | `com.tropos.app.pro.yearly`   |
| Duration           | 1 month                                          | 1 year                        |
| Price (UK)         | £3.99                                            | £34.99                        |
| Introductory offer | Free, 1 week, new subscribers                    | Free, 1 week, new subscribers |
| Review screenshot  | The paywall's plan screen, from the iPhone build | The same                      |

The group's reference name and display name are both `Tropos Pro`. Display
names go up to 30 characters and descriptions up to 45.

<!-- field: iap-monthly-name -->

```text
Tropos Pro Monthly
```

<!-- field: iap-monthly-description -->

```text
Meal photo logging, adaptive calorie target
```

<!-- field: iap-yearly-name -->

```text
Tropos Pro Yearly
```

<!-- field: iap-yearly-description -->

```text
Meal photo logging, adaptive calorie target
```

## Before submitting

What the research for this listing found still standing between the app and
a first review, most likely to cause a rejection first.

### In App Store Connect and the other consoles

These are yours; none of them can be done from the code.

1. **Purchases must work in the submitted build.** `deploy-ios.yml` leaves
   `VITE_REVENUECAT_IOS_KEY` out on purpose, and without it buying says
   "Purchases aren't available in this build" (`src/lib/purchaseProvider.ts`).
   The build you submit needs the key, after the activation order in
   `docs/iap/revenuecat-setup.md` (agreements, banking and tax, both products
   with their trials, RevenueCat set up). Then a sandbox purchase on a phone.
2. **The demo account's uid goes in `REVENUECAT_SANDBOX_UIDS`**, which isn't
   set yet (`docs/qa/pre-launch-backlog.md`).
3. **troposfit.com must serve `/terms`, `/privacy` and `/support`** with no
   sign-in, or the listing uses the firebaseapp.com addresses above
   (`docs/public-legal-pages.md`).
4. **The version must match the build.** The record in App Store Connect is
   1.0, and `deploy-ios.yml` stamps builds with `package.json`'s version,
   1.2.0. Rename the App Store version to 1.2.0, or set `package.json` to 1.0.0
   before the build you submit.
5. **iPad.** The app is built for iPad as well as iPhone
   (`TARGETED_DEVICE_FAMILY = "1,2"`, Capacitor's default rather than a
   choice), so App Store Connect will ask for iPad screenshots, and App Review
   will try it on an iPad. On an iPad today, buying goes down the web path and
   fails (item 8 below). Either fix that and add an iPad set, or make the app
   iPhone-only for 1.0.
6. **Screenshots from the iPhone build**, 6.9-inch, once it shows Steps
   ([issue 2543](https://github.com/lemmonchess333/Maiin/issues/2543)).
7. **Other settings.** Set `RESEND_FROM` once troposfit.com is verified in
   Resend, or a reviewer who taps "Forgot password" gets no email
   (`docs/LAUNCH_TODO.md`). Keep Google Signals off and Analytics unlinked
   from Ads. Check that Vertex AI still serves `gemini-2.0-flash`.

### In the app

Code changes. Each one is a likely rejection, or makes a line in this
listing untrue.

8. **Purchases on iPad take the Stripe path** (Guidelines 2.1, 3.1.1).
   `isNativeIOS()` looks for "iPad" in the user agent, but an iPad's web view
   reports a desktop Mac (`src/lib/purchaseProvider.ts`). Restore is hidden
   there too. `Capacitor.getPlatform() === "ios"` fixes it.
9. **The paywall's price** (3.1.2). The first screen leads with "No payment
   due today" and shows no price, the trial button carries none, and the
   renewal line doesn't say what is charged after the trial
   (`src/pages/Upgrade.tsx`, `src/lib/proPlans.ts`). The weekly figures are
   always in pounds, even beside Apple's local price. Both paywalls also say
   "Unlimited AI photo food logging" against a cap of 100 a day.
10. **User-generated content rules** (1.2). Nobody agrees to the Terms at
    sign-up, and the Terms have no "no tolerance for objectionable content or
    abusive users" line. Comments can't be reported (`CommentSheet.tsx` offers
    delete only, though the server accepts comment reports). Space post
    comments and display names pass no word filter. Nothing tells you when a
    report comes in, so "within 24 hours" in the review notes is a promise
    only a notification can keep.
11. **Asking before sending to Google** (5.1.2(i)). Meal photos and typed
    meals go to Gemini without asking first, and the Settings switch "AI food
    analysis" is saved but never read, so turning it off changes nothing
    (`aiAnalysisEnabled`, `src/components/settings/PrivacySection.tsx`).
12. **The privacy policy doesn't match the label** (5.1.1). It never
    mentions Apple Health. It leaves out RevenueCat, Resend, Open Food Facts,
    Open-Meteo and CARTO, the analytics sent to Google, several of the data
    types above, and what is kept after deletion (RevenueCat, Analytics,
    `trialLedger`). "Nothing is published automatically" is untrue once
    automatic sharing is on. The static copies in `public/legal/` are months
    old.
13. **The privacy manifest** (`ios/App/App/PrivacyInfo.xcprivacy`) uses
    `NSPrivacyCollectedDataTypeHealthFitness`, which isn't one of Apple's keys
    (Health and Fitness are separate), lists no Analytics purpose, and leaves
    out Device ID, Performance Data, Other User Content and Other Usage Data.
14. **`Info.plist`** has no `NSPhotoLibraryAddUsageDescription`, which
    `@capacitor/camera` requires and "Save Image" on a share sheet needs. The
    photo library string mentions progress photos only.
15. **Credits and licences** (content rights). The run maps switch CARTO's
    and OpenStreetMap's attribution off (`attributionControl: false`,
    `RunMap.tsx`, `RoutePlannerSheet.tsx`), and nothing credits Open Food
    Facts or Open-Meteo, whose licences require it. CARTO's basemaps and
    Open-Meteo's free API are both meant for non-commercial use, and a
    subscription app is commercial, so both need a paid plan or a
    replacement.
16. **Copy that promises what isn't there** (2.3). Settings says "Live heart
    rate streams in the app during runs (Apple Watch / HealthKit)"
    (`HeartRateZonesSection.tsx`). The push switch in Settings > Notifications
    fails on iPhone with "Couldn't register for push (unsupported)", and the
    exports toast "exported" without saving anything. The paywall says "Apple
    ID" where Apple now says "Apple Account", and the Terms mention lifetime
    purchases and Google Play.
17. **SDKs that can track.** The Firebase Analytics plugin links Google's
    ad-ID support unless the `AnalyticsWithoutAdIdSupport` trait is set, and
    the sign-in plugin references App Tracking Transparency, which can make
    the upload ask for a tracking purpose string. Setting the trait, and
    confirming the upload raises no ITMS-90683 warning, keeps "Tracking: No"
    simple.

Before the first build goes to App Review, test on a phone: a run with the
screen locked, Sign in with Apple and Google, App Attest, and whether
progress photos load in the iPhone app (`docs/qa/pre-launch-backlog.md`).

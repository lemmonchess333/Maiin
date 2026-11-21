# App Store submission pack

Everything to enter in App Store Connect for Tropos (Apple ID 6762416918,
bundle `com.tropos.app`, English (U.K.)), and the screenshots to upload.
It replaces `listing.md` (October 2026), which now points here; the
reasons each answer is what it is are in
[review-risk-audit.md](review-risk-audit.md), and what only you can do
first is the backlog section "App Review submission checks (launch audit,
2026-11-18)" in `docs/qa/pre-launch-backlog.md`.

Every claim here was checked against the code on `main` at `6f1d1b6` on
18 November 2026. When a feature, an SDK or a flow of data changes, change
the matching section in the same PR: Apple holds the label, the privacy
policy and the app to each other. `src/lib/__tests__/appStoreListing.test.ts`
checks each pasteable field against Apple's limit, the privacy label
against the app's privacy manifest, and a few claims against the code.

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
auto-renewable subscriptions (Guideline 3.1.2), and both must open
without signing in. Guideline 2.3.2 asks it to say which features need a
purchase: the Tropos Pro list is every gate on the paywall's own list
(`src/components/paywall/proIncludesCopy.ts`) plus AI reading of typed
meals, and the race plan in screenshot 6 is a half marathon, Pro after
its first week.

<!-- field: description -->

```text
Tropos builds a weekly plan for lifting and running, works out a daily calorie target from your numbers, and keeps your training and food in one place.

Tell it your goal, the days you can train, your equipment and your experience. It plans lift sessions for those days, fits your runs around them, and suggests the next step from what you log.

Lifting
• 2 to 6 sessions a week, split to suit your days: full body, upper and lower, or push, pull and legs.
• Starting weights from your bodyweight and experience, in kg or lb. Each session starts from what you lifted last time, and the plan adds weight or reps when you hit your targets.
• Warm-up sets, a rest timer and a plate calculator.
• Shorter versions when time is tight: 45 or 30 minutes with the main lifts kept, or an easier day, without changing the plan.
• Exercise choices that work around a limitation in your lower back, shoulders, knees, elbows or wrists.
• Over 150 exercises, each with a drawn form guide.
• A suggested deload week when your training calls for one, and new personal bests marked as you lift.

Running
• GPS runs with pace, splits, elevation and a route map coloured by pace.
• Easy runs, tempo runs, intervals and long runs, with spoken splits and pace alerts.
• Race plans built back from race day through base, build and taper. 5K and 10K plans are free; plans for a half marathon or longer are Pro after their first week. Choose a race from the directory or enter your own date.
• Adjust a week when you're unwell or busy, and keep the race date.
• Plan routes, run them again against your last time, and hide the start and end of the runs you share.
• Make a segment from a stretch of your run, and see your times on it and those of the people you follow.
• Training paces from a recent race time, race predictions and shoe mileage.
• A drawn guide to running form.

Food
• Type a meal the way you'd say it, search the food database, or scan a barcode.
• Log your usual breakfast in one tap.
• A daily calorie target from your weight, height, age and goal, with protein, carbs and fat.
• Water and weight on Home, with your weight trend rather than the day-to-day swings.

Progress
• Analytics for lifting, running, body and food over the last 3 months, with personal records and a map of the muscles you've trained.
• A weekly performance score from 0 to 100, and a review of each week.
• Progress photos, streaks and badges.

With other people
• Share sessions with the people who follow you, give props and comment.
• Start a Circle of up to 8 people and plan runs and lifts together.
• Spaces for races and interests, and weekly, monthly and seasonal challenges.
• A weekly league scored against your own plan, which starts once 10 people have joined.
• Choose who sees each session, and report or block anyone.

Tropos Pro
• Log a meal from a photo, up to 100 a day. The food and its macros are filled in for you to check. Photos are analysed by Google and kept only on your phone.
• Typed meals read by AI, which handles more than the built-in food list.
• A calorie target that adapts to what you log, how your weight moves and, with Apple Health, your steps.
• Protein, carbs and fat that shift with each day's training.
• Running paces that move with your recent races and sessions.
• Readiness from your sleep and heart rate in Apple Health.
• Charts older than 3 months, your training load and your score's details.
• Race plans for a half marathon or longer, after their first week.

Pro is a monthly or yearly subscription, with a 7-day free trial for new subscribers. Payment is taken from your Apple Account when the trial ends, or when you subscribe if there is no trial. It renews automatically unless you cancel at least 24 hours before the end of the current period. Manage or cancel it in your Apple Account settings.

Terms of Use: https://troposfit.com/terms
Privacy Policy: https://troposfit.com/privacy
```

What the description leaves out on purpose, until a phone has proved it
(`docs/qa/pre-launch-backlog.md`): Live Activities and the widgets (#3373,
their rows are open), notifications for comments and follows on the iPhone
(`docs/ios-push-notifications.md`), a heart-rate strap during a run, and
recording with the screen locked (`docs/run-background-gps.md`). All of them
are in the binary, so the review notes describe them. It also never says
"unlimited": Pro allows 100 photo scans and 100 typed-meal reads a day
(`DAILY_AI_LIMITS`, `src/lib/subscription.ts`).

### Keywords

Up to 100 bytes, separated by commas with no spaces. Apple already indexes
the words in the name and subtitle, so these don't repeat them; between the
three fields the listing covers searches such as "calorie counter", "macro
tracker", "workout log", "strength training", "half marathon" and "hybrid
training". Apple's guidelines rule out other apps' names (2.3.7).

<!-- field: keywords -->

```text
lifting,strength,training,plan,marathon,hybrid,5k,10k,half,macro,counter,food,log,protein,weight
```

### What's new

App Store Connect asks for this from the second version on; the first has
none. Keep the box for 1.2.1, rewritten for what it changes.

<!-- field: whats-new -->

```text
Tropos is on the App Store. Plan your lifting and running week, log your food, and follow your progress in one place.
```

## App information

| Field              | Entry                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support URL        | `https://troposfit.com/support` (public; `src/pages/Support.tsx`). Recheck it opens signed out once troposfit.com shows the App Store page (PR #3375)                                                                                                                                                                                                                                         |
| Marketing URL      | Optional. `https://troposfit.com` once PR #3375 makes it the App Store page; empty until then                                                                                                                                                                                                                                                                                                 |
| Privacy Policy URL | `https://troposfit.com/privacy` (public). The static copy, `public/legal/privacy.html`, is generated from the app's own page (`npm run legal:sync`)                                                                                                                                                                                                                                           |
| Category           | Health & Fitness. No secondary category                                                                                                                                                                                                                                                                                                                                                       |
| Copyright          | `2026 Myles Kennedy`, the owner named in the Terms (`src/pages/TermsOfService.tsx`)                                                                                                                                                                                                                                                                                                           |
| Content rights     | "Yes, it contains third-party content": maps from OpenStreetMap through OpenFreeMap, weather from MET Norway, food data from Open Food Facts (each credited where it appears), photographs on Space and challenge cards (Unsplash and Pexels licences, source records in `src/assets/editorial/`; two covers have no traced source and you chose to keep them), and real race names in Spaces |
| App Compliance     | Regulated Medical Devices: **No** (required since 26 March 2026 for Health & Fitness apps in the EEA, UK and US). Tropos gives no diagnosis or treatment and claims no measurement                                                                                                                                                                                                            |
| Encryption         | Nothing to answer per build: `ITSAppUsesNonExemptEncryption` is false in `ios/App/App/Info.plist` (the app uses only the system's and Firebase's TLS)                                                                                                                                                                                                                                         |
| EU trader status   | Required to be on sale in the EU (Digital Services Act). It was pending on 7 November (`docs/iap/revenuecat-setup.md`)                                                                                                                                                                                                                                                                        |

### Age rating

Apple's questionnaire as it stands on 18 November 2026, with the two
descriptors added on 16 November and the social media questions required
since September.

| Question                                                   | Answer    | Why                                                                                                                   |
| ---------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Parental controls                                          | No        |                                                                                                                       |
| Age assurance                                              | No        | Setup asks for the year of birth and turns away anyone under 16 (`src/lib/age.ts`), but nothing verifies it           |
| Unrestricted web access                                    | No        | Outside links open in Safari                                                                                          |
| User-generated content                                     | Yes       | Posts, comments, Space posts with photos, profile photos, segment and Circle names                                    |
| Social media                                               | Yes       | A feed with props, comments and sharing that reaches people beyond those you follow (Explore)                         |
| Social media disabled for users under 13                   | No        | Not offered: no one under 16 can finish setup                                                                         |
| Messaging and chat                                         | Yes       | No private messages, but Apple's definition includes public posting and comments                                      |
| Shared location                                            | Yes       | A shared run carries its route map, with its ends cut off, to followers or everyone, and Circle meet-ups name a place |
| Dating and relationships                                   | No        |                                                                                                                       |
| Advertising                                                | No        |                                                                                                                       |
| Health or wellness topics                                  | Yes       | Calorie tracking and exercise plans                                                                                   |
| Medical or treatment information                           | None      | Injury limits only change which exercises are chosen; the app gives no treatment advice                               |
| Alcohol, tobacco or drug use or references                 | None      | The food search includes drinks such as beer and wine for logging; the app doesn't depict or encourage them           |
| Profanity, sexual content, violence, horror, mature themes | None      |                                                                                                                       |
| Gambling, simulated gambling, contests, loot boxes         | No / None | Challenges and leagues carry no prizes                                                                                |

Then raise the rating to **16+**, the minimum age in the Terms (section 2)
and at setup. Apple allows a higher rating than the questionnaire gives. In
Brazil, Shared Location means A16, which matches.

## App Privacy

The label, answered against the code. All the data below is linked to the
person's account, and none of it is used for tracking.

**Tracking: No.** There is no App Tracking Transparency prompt and no
advertising identifier is read: the analytics plugin is built without
ad-ID support and the sign-in plugin's tracking framework is patched out.
This holds only while Google Analytics stays unlinked from Google Ads and
Google Signals is off in the Firebase console.

### Data linked to you

| Category         | Data type             | Purposes                     | What it is                                                                                                                                                                  |
| ---------------- | --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact info     | Name                  | App functionality            | The display name, shown to other people on posts and the profile                                                                                                            |
| Contact info     | Email address         | App functionality            | Sign-in, and the verification and password-reset emails (sent through Resend)                                                                                               |
| Health & fitness | Health                | App functionality            | Weight, height, sex, year of birth, goal weight, injury limits, max heart rate, the activity level, the food diary and calorie targets. None of it reaches Google Analytics |
| Health & fitness | Fitness               | App functionality            | Workouts, runs, the training plan, segments, records, streaks and badges. No figure from them reaches Google Analytics; that a session was finished is Product interaction  |
| Location         | Precise location      | App functionality            | Run routes, privacy zones, saved routes and segments                                                                                                                        |
| Location         | Coarse location       | Analytics                    | The city and country Google Analytics works out from the IP address                                                                                                         |
| User content     | Photos or videos      | App functionality            | Profile, progress, post and Space post photos. Meal photos are analysed by Google and not kept on any server                                                                |
| User content     | Other user content    | App functionality            | Posts, comments, captions, notes, check-ins, meet-ups, segment and Circle names, reports and meal descriptions                                                              |
| Identifiers      | User ID               | App functionality            | The account ID, which is also the customer ID RevenueCat holds                                                                                                              |
| Identifiers      | Device ID             | App functionality, analytics | The push token the phone registers so notifications reach it (Firebase Cloud Messaging), and Google Analytics' app-instance ID                                              |
| Purchases        | Purchase history      | App functionality            | Subscription status, product and expiry                                                                                                                                     |
| Usage data       | Product interaction   | App functionality, analytics | Screens and actions sent to Google Analytics, and social actions such as props and follows                                                                                  |
| Usage data       | Other usage data      | App functionality, analytics | Last active time, AI scan counts, settings                                                                                                                                  |
| Diagnostics      | Crash data            | App functionality            | Crash reports saved to the account (`src/lib/errorReporting.ts`); on iOS also sent to Firebase Crashlytics with the account uid (`src/lib/crashReporting.ts`)               |
| Diagnostics      | Performance data      | Analytics                    | Screen load times sent to Google Analytics                                                                                                                                  |
| Diagnostics      | Other diagnostic data | App functionality            | Error reports with the device model and system version                                                                                                                      |

Google Analytics data carries no account ID (the code never calls
`setUserId`), so "not linked" is defensible for the coarse location and
performance rows and Analytics' half of Device ID. They are marked linked
here because that is the safe side, and the privacy manifest
(`ios/App/App/PrivacyInfo.xcprivacy`) says the same; the test holds them
together.

### Data not collected

Phone number, physical address, other contact info, payment info, credit
info, other financial info, sensitive info, contacts, emails or text
messages, audio, gameplay content, customer support, browsing history,
search history, advertising data, surroundings, body, other data.

- **Apple Health** steps, sleep, resting heart rate and heart rate
  variability are read and used on the phone, and never stored or sent
  (`src/hooks/useSteps.ts`, `src/hooks/useBodySignals.ts`). Accepting the
  steps offer saves only the new activity level, covered by Health above.
- **Food searches** go from the phone straight to Open Food Facts and are not
  stored.
- **Weather before a run** comes from MET Norway through the
  `getCurrentWeather` function. The phone sends a location rounded to
  about a kilometre, and nothing stores or logs it.
- **Meal photos and typed meals** go to Google's Gemini only after the
  person allows it (`src/lib/aiConsent.ts`), and are covered by the
  photos and user content rows above.
- **Motion** for auto-pause is read on the phone and never stored or sent.
- **Support emails** are written in the person's own mail app, so they fall
  outside the label.

## App Review information

**Sign-in required: yes.** Give a demo account that signs in with email and
password and doesn't expire. Before submitting, the account should:

- have finished setup, with a verified email address, or posting and
  commenting are refused;
- have a few weeks of workouts, runs, meals and weigh-ins, entered by hand,
  so Progress and the weekly review have something in them (the seed
  scripts only work against the emulator);
- follow someone, and be a member of one Space with a post;
- be free, not Pro, so the reviewer can buy;
- have its uid in `REVENUECAT_SANDBOX_UIDS`, or its sandbox purchase won't
  turn Pro on (`docs/iap/revenuecat-setup.md`, Part C), and in
  `DISCOVERY_HIDDEN_UIDS`, so its posts stay out of everyone's Explore.

If you decide instead to let App Store sandbox purchases through for every
account (the audit, 2.1), drop the sentence about it from the notes.

**Attachment.** If App Review asks about the background modes, the video
in the backlog row (a strap paired, then a run with the screen locked).

**Notes.** Up to 4,000 bytes. Every line has to be true of the build you
submit; the 24-hour promise is yours to keep.

<!-- field: review-notes -->

```text
Tropos is a training and food app. Setup asks about goals, training days, equipment and experience, builds a weekly lifting and running plan and a daily calorie target, then opens Home.

The demo account has finished setup, several weeks of logs and a verified email. Please make test purchases on this account: a sandbox purchase turns Pro on only for the accounts we list for testing.

Where to find things
- Today's session: the card at the top of Home. Start opens the workout.
- Food: the Food tab. Type a meal, scan a barcode, or use the camera to log a meal from a photo (Pro).
- Pro: "Try Pro free" or "See Pro" under the Food composer, or Settings > Account > the plan card. Restore is on the Pro page.
- Apple Health: Settings > Apple Health > Connect, on any account. With Pro, "Add sleep and heart from Apple Health" on Home.
- Settings: the photo or initials at the top right of Home.
- Account deletion: Settings > Account > Delete account. An Apple account confirms with Apple, and its Sign in with Apple token is revoked.
- Report and block: "More options" on a post, a comment or a profile, and "Post options" on a Space post. Blocked people are in Settings > Social & privacy.
- Privacy Policy, Terms and support: Settings > Support & legal.

Pro and In-App Purchase
Monthly and yearly auto-renewable subscriptions, with a 7-day free trial for new subscribers. Pro adds meal logging from a photo, AI reading of typed meals, an adaptive calorie target, macros that follow the day's training, adaptive running paces, readiness from Apple Health, charts older than 3 months, the training load, the score's details, and plans for a half marathon or longer after their first week. Everything else is free.

AI food analysis
A meal or label photo, or a typed meal (Pro), goes to Google's Gemini on Vertex AI only after the user allows it on a sheet that names Google. Results are checked before they are logged. Photos are kept on the phone for 90 days for the diary, never on our servers. It can be switched off in Settings > Social & privacy.

Apple Health
Tropos reads steps, and with Pro sleep, resting heart rate and HRV, to check the activity level the calorie target assumes and to say how ready the user is for today's session. They are read on the phone, never stored on our servers or used for advertising, and Tropos writes nothing to Health. This build has no Apple Watch app and no Health workout export; both are only in a separate test build. Its Health write string, there for the Health plugin, says Tropos adds nothing.

Background modes
Location: a GPS run asks for location as it starts and keeps recording with the screen locked; iOS may later offer Always. Treadmill and manual runs need no location. Bluetooth: Settings > Run plan pairs a heart-rate strap, read during a run with the screen locked.

Live Activities and widgets
A run or a lift shows on the Lock Screen and in the Dynamic Island while under way (switch in Settings > Notifications). The Today, Streak and Today's food widgets show the session, the streak and calories left.

Shared spaces
The feed, follows, Circles, Spaces and challenges work from the first account; a small Space or challenge says "Filling up". The weekly league says the league starts once 10 people have joined, and runs from the Monday after. Two operator pages, /diagnostics and /admin/moderation, are linked from nowhere; the second is for our moderators only.

Moderation
Signing up or in means agreeing to the Terms, which allow no objectionable content or abusive users. Posts, comments, names and photos are filtered, photos by Google Cloud Vision SafeSearch. Each report emails us and joins a review queue, and we act within 24 hours by removing the content and, where needed, restricting the account so it can't post, comment or follow anyone.

Health
Tropos is not a medical device and gives no medical advice. Calorie targets are estimates from standard formulas, and can be changed in Settings > Nutrition.
```

Contact information: your own name, phone number and email. Apple calls
them only about the review.

## In-app purchases

One subscription group with two auto-renewable products. The product IDs are
fixed by the code (`src/lib/purchaseProvider.ts`); the prices are the ones
the web shows (`src/lib/proPlans.ts`), and the actual prices are your choice
in App Store Connect. The iPhone paywall shows the App Store's own prices.

|                    | Monthly                                          | Yearly                        |
| ------------------ | ------------------------------------------------ | ----------------------------- |
| Reference name     | Tropos Pro Monthly                               | Tropos Pro Yearly             |
| Product ID         | `com.tropos.app.pro.monthly`                     | `com.tropos.app.pro.yearly`   |
| Duration           | 1 month                                          | 1 year                        |
| Price (UK)         | £3.99                                            | £34.99                        |
| Introductory offer | Free, 1 week, new subscribers                    | Free, 1 week, new subscribers |
| Review screenshot  | The paywall's plan screen, from the iPhone build | The same                      |

Both products are submitted with the first version: attach them on the
version page under In-App Purchases and Subscriptions, or App Review
cannot find them (Guideline 2.1(b)). The group's reference name and
display name are both `Tropos Pro`. Display names go up to 30 characters
and descriptions up to 45.

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

## Screenshots

App Store Connect requires at least one screenshot for "iPhone with
Dynamic Island, medium display", and fills that from a "Face ID, large
display" set when it has none of its own; the large Dynamic Island class
falls back to the same set
([screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)).
So there are two sets, each of eight frames in listing order, committed
here ready to upload in name order:

| Folder                            | App Store Connect class             | Pixels      | Phone it lays out as |
| --------------------------------- | ----------------------------------- | ----------- | -------------------- |
| `docs/app-store/screenshots/6.9/` | iPhone 6.9" (Dynamic Island, large) | 1320 x 2868 | iPhone 16 Pro Max    |
| `docs/app-store/screenshots/6.5/` | iPhone 6.5" (Face ID, large)        | 1242 x 2688 | iPhone 11 Pro Max    |

| #   | Frame          | Shows                                                                      |
| --- | -------------- | -------------------------------------------------------------------------- |
| 1   | `01-home`      | Home: today's lift against last time, a check-in and the week so far       |
| 2   | `02-train`     | Train: the next lift in the rotation and its exercises                     |
| 3   | `03-workout`   | A lift in progress, two working sets done                                  |
| 4   | `04-food`      | Food: the calorie wheel, the week, macros and the day's diary              |
| 5   | `05-analytics` | Progress: the performance score and the last 30 days                       |
| 6   | `06-race-plan` | Train's run week: the next run and a half-marathon plan (Pro after week 1) |
| 7   | `07-social`    | The feed, with a run and a lift shared                                     |
| 8   | `08-run`       | A saved run: its route coloured by pace, its figures and best efforts      |

They come from the capture rig (`e2e/screenshots/app-store.capture.spec.ts`,
the season athlete's sixteen weeks, dark theme), run by `app-screenshots.yml`
against the emulator. The status bar band is left as the app paints it, and
no frame shows a price or a trial: Food's personal-target offer is closed
with its "Not now" before the shot (2.3.7 keeps pricing out of metadata,
and 2.3.14 out of creative assets). The Pro locks on Progress stay, since
they say which features cost extra (2.3.2). No frame shows a Space, a
challenge or the league, which say "Filling up" at launch.

To take them again: run App Screenshots (Actions → App Screenshots → Run
workflow, on the branch to capture), which commits the frames to the
`app-screenshots` branch as `screenshots/app-store-0*.png` (6.9") and
`screenshots/app-store-6.5-0*.png` (6.5"). Copy them into the two folders
above without those prefixes. Upload the iPhone build's own screenshots
instead if you prefer: they would show the real status bar.

## Before submitting

The audit's three likeliest rejections, and the checks only you or a phone
can make, are rows in `docs/qa/pre-launch-backlog.md`, "App Review
submission checks (launch audit, 2026-11-18)". The ones from October still
stand:

1. **Purchases must work in the submitted build.** It needs
   `VITE_REVENUECAT_IOS_KEY` (`deploy-ios.yml` passes it). Then a sandbox
   purchase on a phone, signed in as the demo account.
2. **The version must match the build.** `deploy-ios.yml` stamps the build
   with `package.json`'s version (1.2.0 on 18 November); the App Store
   Connect version must be the same.
3. **Moderation and email settings** (`docs/launch/owner-steps-2026-10-14.md`,
   Part 1): `ADMIN_UIDS`, `MODERATION_ALERT_EMAIL`, `RESEND_FROM` and
   `PUBLIC_APP_BASE_URL`. Until `RESEND_FROM` is on a verified domain,
   report alerts reach nobody but the Resend account's owner, and the
   24-hour promise can't be kept.
4. **Keep Google Signals off and Analytics unlinked from Ads**, or the
   tracking answer above is wrong.
5. **Road routing stays out** of the listing: it was removed on 1 November
   2026 and is not coming back on Mapbox.

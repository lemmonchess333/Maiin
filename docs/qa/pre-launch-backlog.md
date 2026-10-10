# Pre-launch QA backlog

Moved here from CLAUDE.md, which points at this file. Sections it names
without a file ("the Cloud Functions deploy gotchas", "the Food9 lock",
"the plan-file lock rule") are in CLAUDE.md.

Manual checks deferred from work that already shipped to a feature branch. Burn down before launch — automated tests + tsc + lint cover the basics, but these need eyes on a real device or production-like environment.

## The plan moves on with the day while the app stays open (2026-10-10)

Affects: `useProgram` (`src/features/program/useProgram.ts`). The lift and
run weeks' rollover, the runner's recent-running read and the race's rest
days now re-run when the day changes (`useLocalDateKey`: a check every 30
seconds, and on focus and `visibilitychange`), not only on a reload. On a
phone the app is resumed far more often than it is started, so before
this a plan stayed on last week until the app was killed and reopened.

The hook tests (`useProgramResume.test.ts`) fire the resume in jsdom.
WKWebView's own resume events need a device.

- [ ] **Monday, from the background.** On Sunday evening open Train, then
      leave the app in the background (don't close it). Open it again on
      Monday morning: within a few seconds Train shows the new week, its
      sessions not done and the week number one on, and Home's week strip
      and today's card agree with it. No relaunch, no pull to refresh.
- [ ] **Race week's rest days.** On a race-prep account with the race on a
      Saturday and a lift session not done that week, leave the app in
      the background from Wednesday to Thursday. On Thursday's return the
      session shows as skipped, under the "Race week" banner ("No lifting
      in the two days before your race…").

## Race plans the rollover dropped end on the server (2026-10-10)

Affects: `dailyRaceReconciliationSweep`, the orphaned race goal in
`_decideReconciliationActions` (`functions/index.js`). A profile left in
`race_prep` on a finished race after the rollover dropped its plan (before
the plan was kept until its race ends) returns to free running once the
race is past both exits the sweep would have taken: day 15, 21, 28 or 35
after a 5K, 10K, half or marathon.

The decision tests and the emulator case cover the rule and its
profile-only write; these need the deployed function.

- [ ] **The deployed source.** The deploy's read-back prints
      `Verified deployed source: dailyRaceReconciliationSweep`.
- [ ] **The first sweep.** The 04:00 UTC log line after the deploy ends
      `orphanedGoalCleared=N`. Every stuck active account goes in that one
      sweep, so N may be more than one; most days after, 0. Open one
      profile it counted: `runMode` is `freeform`, `raceGoal` is gone, and
      Train shows free running, not "Race day has passed".
- [ ] **A race ahead stays.** A race-prep account whose race is still
      ahead, or whose plan is still there, is not counted and keeps its
      race.

## A restriction stops what reaches other people (S4e, 2026-10-06)

Affects: `firestore.rules` (`isRestricted()` on feed and Space posts,
follows, Space and challenge joins, Circle events and partner bonds), the
props, comment, like, reaction and Circle callables
(`functions/lib/restriction.js`), the app's gates (`RestrictedNotice`,
`showRestrictedToast`), Settings → Social & privacy's explanation, and
the moderation page's Restricted accounts with Lift (`listRestrictedUsers`,
`liftRestriction`).

The rules suite (`firestore.restriction.rules.test.ts`) and the unit tests
cover each refusal and what stays open; these need a device or the
console.

- [ ] **One restriction, end to end.** With two test accounts, report the
      second from the first, then Restrict user on the moderation page.
      On the second account (no sign-out): the feed and Space composers,
      comments, props, likes, reactions, Follow (a profile's too), Space,
      challenge and Circle joins, a Circle check-in and a partner streak
      each say "Your account is restricted" and nothing goes out; taking
      back props, unfollowing and leaving still work; Social & privacy
      explains it, and Contact support opens Mail.
- [ ] **Lift.** Lift the second account from Restricted accounts: within
      a minute, without signing out, every one of those works again, and
      the report in the console shows `restrictionLiftedBy`.
- [ ] **App Review notes.** If the notes are already in App Store Connect,
      paste the moderation sentence from `docs/app-store/listing.md`
      ("…restricting the account so it can't post, comment or follow
      anyone"). This replaces the trial reminder section's notes row.

## The trial reminder (Sub1, 2026-10-06)

Affects: the RevenueCat sync (`subscriptionTrial`, `lib/trialReminder.js`),
`trialReminderSweep` and its email (`lib/trialReminderEmail.js`), the
phone reminder (`useTrialReminder`), the Upgrade page's trial lines and
"Remind me before the trial ends", Home's strip for a trial's last two
days, Settings → Subscription. The email goes at 10:00 local, two days
before the last moment to cancel (a day before the trial ends).

Unit tests cover the timing in every zone, the record and the email's
words; these need the operator, a device, or a real trial.

- [ ] **The sender.** troposfit.com verified in Resend and `RESEND_FROM`
      set (the LAUNCH_TODO §19 item; until then every email reaches only
      the Resend account's owner).
- [ ] **Apple's relay.** troposfit.com and Resend's `send.troposfit.com`
      registered under Certificates, Identifiers & Profiles → Services →
      Sign in with Apple for Email Communication. Then, from the sign-in
      screen, ask for a password reset for an account that signed in with
      Apple and Hide My Email: the email must arrive in that iCloud inbox.
      Same sender as the reminder; a bounce there is a bounce here.
      Passing this unlocks the paywall's reminder step (Sub1, the PR after
      this one).
- [ ] **The Upgrade page on the iOS app.** After a sandbox trial purchase
      (TestFlight, a uid on `REVENUECAT_SANDBOX_UIDS`), the Pro card shows
      "Free trial until …", the price line with the last moment to cancel,
      and "Remind me before the trial ends"; tapping it brings the system
      prompt once, and Diagnostics lists the pending reminder (id 3003).
      Sandbox trials last minutes, so check the screens, not the date.
- [ ] **The first real reminder.** The first App Store trial after launch:
      the email arrives at 10:00 local on day 4 with the price, the dates
      and the cancel link right, and the console shows
      `subscriptionTrial.reminderEmailedAt` on that profile. The
      `trialReminderSweep` log line counts it as `emailed`.
- [ ] **Who the "trader" is.** Before the UK rules start in January 2027,
      someone qualified confirms whether Tropos counts as the trader for
      App Store subscriptions sold through Apple as commissionaire. The
      build assumes it does.
- [ ] **App Review notes.** If the notes are already in App Store Connect,
      paste the corrected moderation sentence from
      `docs/app-store/listing.md` ("…removing the content and, where
      needed, disabling the account").

## The lifting system, Lift4 (2026-10-06, #2593)

Affects: progression, the plan generator, lighter weeks and races
(`raceRest.ts`, `weekPrescription.ts`), Swap for today and Skip
(`WorkoutSession`), Welcome back, the rules sheet, and the schema 5
migrations (`migrations.ts`). Deploy production release 242 shipped it,
with the functions' source read back.

Unit, emulator and large-text checks cover the rules and the layout in
Chromium; these need the iOS app or a production account.

- [ ] **The screens in the iOS app.** In the native shell, at the phone's
      own text size and at its largest: the rules sheet from the ⓘ beside
      Train's week label and from "Why this session"; an exercise's menu,
      Swap for today (one pick, its bar reads "Swap for today"), Skip, and
      Finish's question about keeping a swap; Welcome back's "Ease back
      in" after two weeks away; setup's "What do you have?" and the
      session length beside the days.
- [ ] **The schema 5 migration on a real plan.** After the first open
      on the new build, the console shows `programSchemaVersion: 5`;
      every weight sits on its equipment's steps (no 101 kg, no 9.25 kg);
      miss counts are 0; a bodyweight lift that a swap had handed a load
      shows none.
- [ ] **A plan carrying the new fields takes a command.** With
      `easingBack` (after "Ease back in") or `raceWeek` (a race plan in its
      last two weeks) on the plan, "Take a lighter week" and Skip are
      accepted by the deployed allow-list, not refused.
- [ ] **The race's rest days on a real race plan.** Two days before the
      race date, race week's session, if not done, shows as skipped, and
      Train's banner reads "No lifting in the two days before your race,
      or on the day, so your legs are fresh for it."

## TestFlight from the API key, function settings on GitHub, the status bar (2026-10-04)

Affects: `deploy-ios.yml` and `scripts/ios/asc-signing.mjs`,
`deploy-functions.yml` and `scripts/write-functions-env.mjs`, and the
full-screen layers (`WorkoutSession`, `SessionCompleteScreen`, Social's
people search, `FoodCameraModal`).

Unit tests pin the API client, the settings file and the padding; these
need Apple, the Cloud console or a phone.

- [ ] **The first TestFlight run signs from the API key.** With only the
      five secrets `docs/ios-release.md` asks for, Deploy iOS to
      TestFlight makes a certificate and a profile named
      `Tropos CI <serial>`, passes the import step's checks, archives and
      uploads. A second run deletes the first run's profile and revokes
      its certificate (Apple Developer → Certificates shows one Apple
      Distribution certificate from these runs), and the first build
      stays installable in TestFlight.
- [ ] **Function settings from GitHub.** After setting `ADMIN_UIDS` and
      the rest as repository variables and running Deploy production,
      the "Write functions/.env from repository variables" step names
      them, and the Cloud console shows them on `listPendingReports`,
      `createReport` and the two RevenueCat functions. `/admin/moderation`
      opens for that uid on the web build with no `VITE_ADMIN_UIDS`
      secret.
- [ ] **The status bar on a phone.** On the first TestFlight build, the
      workout session, its finish screen, Social's people search, the
      food camera, the run screen (setup, countdown and the live map's
      controls), the run summary and the Privacy Policy, Terms and
      Support pages keep their first row clear of the clock and the
      Dynamic Island, with no doubled gap above it. The shell sets
      `ios.contentInset: "automatic"`, so whether its web view reports a
      top inset is unverified; pages and these screens pad by the same
      `--safe-top`, so a gap on one is a gap on all.

## Privacy and consent for App Review (2026-10-04)

Affects: the AI permission (`src/lib/aiConsent.ts`, `useAiConsent`,
`AiConsentSheet`, `FoodAnalyzer`, `FoodCameraModal`, the Settings switch,
`functions/lib/aiConsent.js` in `analyzeFood` / `analyzeFoodText`), the
run save's privacy zones (`RunSummary`, `usePrivacyZones`), the Privacy
Policy, `ios/App/App/PrivacyInfo.xcprivacy`, the `Info.plist` purpose
strings, the SPM traits in `capacitor.config.ts`, and the patched
`@capacitor-firebase/authentication` (`patches/`).

Unit tests pin the rules, the copy and the committed files; these need a
phone, Xcode or a console.

- [ ] **Functions deployed.** The deployed `analyzeFood` and
      `analyzeFoodText` contain `refuseUnlessAiAllowed`. An account with
      `aiAnalysisEnabled: false` gets 400 with reason
      `ai-analysis-disabled` and no scan counted.
- [ ] **The question over the scanner** (iPhone, Pro or trial account,
      never asked): the first Meal photo opens "Send food to Google for
      analysis?" above the scanner, not under it, with the camera still
      running. Allow analyses the photo just taken. Not now leaves the
      photo tabs saying "AI analysis is off", and Turn on asks again.
- [ ] **A typed meal** on a fresh Pro or trial account asks first; Not
      now logs it from the on-device parser.
- [ ] **Settings → Social & privacy → AI food analysis** shows off for an
      account that hasn't been asked.
- [ ] **A run that ends offline.** If the finish screen loaded while
      online, Save works offline. If it never reached the server, the
      Retry banner says the privacy zones couldn't be checked, and Retry
      saves once online, with the zone cut from the route.
- [ ] **Archive** (Xcode 16.3 or later): the Swift tools 6.1 traits
      resolve, the Facebook SDK is not fetched, GoogleSignIn is.
- [ ] **No tracking framework in the binary:** `otool -L` on the built app
      lists neither AppTrackingTransparency.framework nor
      AdSupport.framework.
- [ ] **Upload to App Store Connect:** no ITMS-91053 (missing
      required-reason API) warning and no request for
      `NSUserTrackingUsageDescription`. Xcode Organizer → Generate Privacy
      Report lists the 16 data types.
- [ ] **File the App Store privacy label** from the manifest's list: each
      type linked to the user, none used for tracking, purposes as listed.
- [ ] **Permission prompts** show the new words: the camera (the
      scanner), adding to Photos (Save Image from a share card's share
      sheet), location (the first run).

## Credits, weather, push and exports for the App Store (2026-10-04)

Affects: `src/lib/basemap.ts` (RunMap, RoutePlannerSheet), the new
`getCurrentWeather` callable (`functions/currentWeather.js`,
`functions/lib/metWeather.js`) and `src/lib/weather.ts`, the Open Food
Facts credit (FoodAnalyzer, FoodSuggestionsDropdown, ServingSizeDrawer),
`NotificationsSection`, and `src/lib/shareFile.ts` (the CSV exports,
both Export GPX buttons, the share cards).

Unit tests pin the rules; the tiles, MET's answer and the share sheet
need a phone and a deploy.

- [ ] **Maps on the phone.** A live run, a saved run (RunDetail), the
      finish screen and the route planner draw OpenFreeMap's basemap in
      both themes. The credit shows as each map opens and folds to its
      (i) after five seconds; the (i) opens it again, and its links open
      outside the app. On the live run it sits top-right, clear of the
      GPS pill and the sheet; on RunDetail bottom-left, clear of Replay.
- [ ] **Weather after the deploy.** `getCurrentWeather` is a new function
      with no secret. Open run setup with location allowed: the strip
      shows the weather and "Weather data from MET Norway". The function
      logs show no `weather.failed` with status 403 (MET refusing the
      User-Agent) and no `weather.met_deprecated`.
- [ ] **No push on the iPhone app.** Settings > Notifications shows the
      meal, workout and streak reminders and no push switch; the Settings
      list says "Reminders, activity". The web build still has the switch.
- [ ] **Exports on the iPhone app.** Settings > Your data > Export
      workouts opens the share sheet; Save to Files saves a .csv that
      opens in Numbers, then "Workouts exported" shows. Closing the sheet
      says nothing. On a slow connection a "Workouts export ready" toast
      may come instead: its Share opens the sheet. Export GPX on the
      finish screen and on a saved run opens the sheet with a .gpx.
- [ ] **Open Food Facts credit** under a barcode result, the search
      results and the portion sheet, which still fits on an SE.

## User content moderation for App Review 1.2 (2026-10-04)

Affects: `src/pages/Login.tsx` (the Terms line), `src/pages/TermsOfService.tsx`,
`src/components/social/CommentSheet.tsx`, `CommentPanels.tsx`, `ReportForm.tsx`,
`src/features/spaces/SpaceCommentSheet.tsx`, `src/pages/AdminModeration.tsx`;
`functions/index.js` (`createReport`, `listPendingReports`, `resolveReport`,
the two comment callables, `completeOnboarding`, `configurePlan`, the new
`onSpacePostWritten` trigger), `functions/lib/reportTargets.js`,
`reportAlert.js`, `objectionableText.js`, `spacePostModeration.js`.
Operator setup (ADMIN_UIDS, MODERATION_ALERT_EMAIL, RESEND_FROM, the
VITE_ADMIN_UIDS secret): `docs/LAUNCH_TODO.md` §19.

The callables, the trigger and the email are tested against an in-memory
Firestore with Resend mocked at `fetch`; whether an email actually lands, and
how the sheets feel on a phone, need the real thing.

- [ ] **Report alert reaches the inbox.** After the first Deploy production
      run carrying this work, and with the moderation variables set on
      GitHub and deployed as §19 says: sign in as a second account,
      report someone's comment with a note. Within a minute an email titled
      "New report: …" arrives at `MODERATION_ALERT_EMAIL`
      (`support@troposfit.com` when unset), carrying the reason, what was
      reported, the note, and an "Open the moderation queue" link that opens
      `/admin/moderation` with the report on it. If nothing arrives, Cloud
      Logging for `createReport` has a `createReport.alert_failed` line with
      Resend's answer; with no `RESEND_FROM` the sender is
      `onboarding@resend.dev`, which Resend only delivers to its own
      account owner's address.
- [ ] **Deployed source.** `scripts/verify-deployed-functions-source.py`
      now reads back `createReport` and `onSpacePostWritten` (and the
      word filter's module on both comment callables) after every
      functions deploy. Confirm the first Deploy production run after this
      work logs "Verified deployed source" for each.
- [ ] **Hide content on each kind.** From the queue, hide a reported Space
      comment, an activity comment and a Space post. Each is gone for a
      third account, and the comment counts on the post or activity drop by
      one.
- [ ] **Report and Block user from a comment, on a phone.** The ⋯ on
      someone else's comment opens its options inside the sheet; the report
      form fits and scrolls on a small phone (SE) with Submit reachable;
      Block user removes their comments from the list. Delete on your own
      comment now confirms in the sheet and deletes on the first tap of
      Delete (the old confirm dialog closed the sheet on the first tap).
- [ ] **A Space post that trips the filter is removed.** A clean post edited
      to objectionable text with a direct SDK write is gone from the space
      within seconds (the app itself refuses the text first).
- [ ] **The Terms line on sign-in and sign-up** wraps cleanly on a small
      phone, and its two links open the Terms and the Privacy Policy while
      signed out. `public/legal/terms.html` carries the same October 2026
      Terms as `TermsOfService.tsx`.

## iOS 15.4 is the minimum (2026-10-06)

Affects: `ios/App/App.xcodeproj/project.pbxproj` (every
`IPHONEOS_DEPLOYMENT_TARGET`), pinned by `iosDeploymentTarget.test.ts`,
whose header has the reason: Safari before 15.4 drops the stylesheet's
`@layer` blocks and the app opens unstyled.

- [ ] **App Store Connect shows iOS 15.4.** After the next TestFlight
      upload, the build's minimum OS version reads 15.4, and the App
      Store listing's compatibility line says "Requires iOS 15.4 or
      later".
- [ ] **An iOS 15 phone, if one is to hand** (iPhone 6s, 7 or first SE
      on 15.8): the app installs and opens styled. Container queries
      start at iOS 16, so it shows each screen's designed layout at every
      text size, which is expected.

## Phone platform layer: taps, field zoom, status bar (2026-10-05)

Affects: `src/index.css` (tap flash, control touch rules, the 16px
field floor), `src/lib/systemChrome.ts` (status bar and browser bar
follow the theme), `src/main.tsx`.

`mobileNative.test.ts` and `systemChrome.test.ts` pin the rules, and the
built CSS was measured in Chromium with a touch screen emulated (14px
fields compute 16px, 18px fields keep 18px, FoodRow keeps `pan-y`).
Emulation reproduces none of the behaviours themselves, so these need
the iPhone app.

- [ ] **No zoom into a field.** Tap Train → add exercise → the search
      field, a Settings → Profile field, and a comment box. The page
      stays at its size; nothing drifts after the keyboard closes.
- [ ] **No grey flash on tap** on a food row, a Home card and a
      settings row.
- [ ] **Long-press a tab** in the tab bar: no link preview and no
      selected label. Long-press a post's text: it still selects.
- [ ] **Status bar in light theme.** Settings → Units & appearance →
      light: the clock and battery turn dark and stay readable. Back to
      dark: they turn light. Force-quit and reopen in light: the
      launch splash is dark with light text, and the text turns dark as
      the light page appears.
- [ ] **Swipe a food row** to delete: still horizontal, the page does
      not scroll with it.

## Text follows the phone's text size on iPhone (2026-10-05)

Affects: `src/lib/systemTextSize.ts` (reads `@capacitor/text-zoom`'s
`getPreferred()` and scales the root font size, held between 1× and
2×), `src/main.tsx`, `ios/App/CapApp-SPM/Package.swift` (the plugin,
added by `npx cap update ios`).

`systemTextSize.test.ts` pins the scaling and the limits, and the feed
and food diary capture specs measure both at double text. Nothing in a
browser reads Dynamic Type, so the reading itself needs the iPhone app.

- [ ] **Larger text reaches the app.** Settings → Display & Brightness
      → Text Size, drag to the largest standard size, return to Tropos:
      the text is about a third larger, and Home, the feed and Food
      still read with nothing cut off or overlapping.
- [ ] **An accessibility size stops at double.** Settings →
      Accessibility → Display & Text Size → Larger Text, turn it on and
      drag to the largest: the app grows to twice its size and no
      further.
- [ ] **Back to the default** restores the designed size, and a smaller
      setting does not shrink the app below it.
- [ ] **The main screens at large text.** Home, Train, History, Food
      and Settings were measured in a browser at 1.35× and 2× text
      (393, 375 and 320 px wide) and fixed to wrap, stack or drop a
      decorative icon rather than overlap. On the phone, at the largest
      standard size and at the largest accessibility size, scroll each
      and note anything cut off or overlapping. Known and accepted: the
      day names under Train's week, and segmented-control labels at 2× on
      a 320px screen (Display Zoom on an SE or mini), end in "…".
- [ ] **A workout and a run at large text** (2026-10-06). The lift
      screen, the run screen before and during a run, Train's exercise
      menu and Food's manual entry were measured the same way. At the
      largest accessibility size, log a set and run for a minute. The set
      table drops its "Previous" column under the set's figures ("Last
      80 × 8"); the done tick, set badge and run controls stay their
      designed size; a missing map says "Map unavailable" at the top
      right. Known and accepted: at 2× on a 320px screen the "kg" and
      "Reps" column headers run a little past their columns.
- [ ] **Sign-up, setup and Pro at large text** (2026-10-06). The welcome
      screen, sign-in, sign-up, every setup step and the Pro offer and
      plans were measured the same way, down to 320px at 2×. With Larger
      Text at its largest, make a new account: the answer cards drop their
      pictures rather than cutting a word, Continue goes above Back when
      the two don't fit side by side, and each plan's price stays whole.
      Headings now grow by as much as body text rather than in proportion,
      so check that page titles still read as titles at every size.

## The first-visit guide (2026-10-04)

Affects: `src/components/guide/GuideWalk.tsx`, `GuideHint.tsx`,
`src/pages/Home.tsx`, `src/pages/Onboarding.tsx` (Continue now lands on
Home), the hints on Train, the workout screen, Food and the run screen.

The walk's stops, the hints' rules and the row actions are pinned by unit
tests; jsdom draws no layout, so where the card sits and how the mark
moves need a phone.

- [ ] **The walk on a new account.** Sign up, finish setup, Continue with
      Free: Home opens and dims around the first card, and the mark lifts
      out of the header into the card. Next: the card disappears, the
      light moves, and the card fades in beside the next stop, never
      mid-scroll. The third stop scrolls the Food card into view (it is
      below the fold on every phone); Done scrolls back up and the mark
      goes back into the header.
- [ ] **A small phone (SE).** No card hides under the tab bar or the
      Dynamic Island's status bar, and the Food hint turns above the
      composer rather than lie across the tab bar.
- [ ] **VoiceOver** reads each stop's title and words as the walk moves
      on, and focus starts on Next and stays there.
- [ ] **Reduce Motion:** no flight, the cards fade.
- [ ] **The hints**, each once: Train's lift tab, the first set of the
      first workout (it sits above the workout screen), Food's composer,
      the run screen before a first run. Tapping the thing a hint points
      at closes it and still does what it does.
- [ ] **Health steps prompt** (native only): on a new account it opens
      after the walk, not over it.
- [ ] **The Health steps prompt doesn't flash** (native only, FV2): an
      account that already answered it, either way, sees no "Count your
      steps" open and close as Home loads, on a cold start and on coming
      back to Home from another tab.
- [ ] **Food's first visit on a free account** (FV2): the guide's
      "Logging food" hint shows on its own; "Photo logging is part of Pro"
      appears under the food box once it is closed.

## Run recording: pauses, each fix's own time, smoothed climb (2026-10-04)

Affects: `src/lib/gps.ts` (`pausedMs`, `movingClockMs`, `segmentMetres`,
`fixTimestamp`, `readingVerdict`, `climbBySegment`), `src/hooks/useGPS.ts`
(`pause` / `resume`), `src/pages/Run.tsx`.

Splits, best efforts, the live pace and the ghost now count moving time:
nothing is recorded while the run's clock is stopped. A point is stamped
with when its fix was taken, not when it arrived. Unit and property tests
cover the rules; these need a phone outside.

- [ ] **A backgrounded run on iOS.** Lock the phone for a kilometre or
      two. Back in the app, the route should have no straight-line jump
      and the split for that stretch a believable pace. iOS hands fixes
      over in a batch; before, the batch after its first fix was thrown
      away as a teleport.
- [ ] **Auto-pause at a crossing.** Stand for a minute with auto-pause on:
      the run's time stops, the distance does not creep, and the split
      that contains the stop reads at running pace. Then the same with
      Pause pressed while auto-paused, which used to count the time since
      the last resume twice.
- [ ] **Standing with auto-pause off.** Twenty seconds still should leave
      the route quality "good" on the finish screen, not "poor".
- [ ] **Climb on a known hill.** A run with a known climb should read
      close to it; a flat run should read a few metres, not hundreds.

## The new logo, icon and launch animation (2026-10-01)

Affects: `src/assets/brand/app-icon.svg`, the iOS AppIcon set (default,
dark, tinted), the launch image, `public/icons/*`, `index.html`
(`#boot-splash`), `public/init.js`, `src/components/LaunchSplash.tsx`,
`src/pages/Login.tsx`.

The geometry and the four copies of the launch frame are pinned by tests;
what they cannot see is a phone.

- [ ] **The icon on the home screen**, in default, dark and tinted modes
      (long-press the home screen → Edit → Customize). The dark and tinted
      versions are new entries in `AppIcon.appiconset/Contents.json`.
- [ ] **The handover from the launch image.** Cold-start the app: the
      purple hexagon should not move or resize when the web layer takes
      over, then the chevron rises into it. A jump means the web view's
      `100vh` is not the launch image's screen height (the overlay sizes
      by `max(100vw, 100vh)`), which `contentInset: "automatic"` could do.
- [ ] **The landing.** On Home, the mark shrinks onto the small mark
      before the date and the page shows; there should be one mark at
      the end, never two.
- [ ] **Reduce Motion on the phone:** the whole mark, then a fade.
- [ ] **Light mode** (Settings → Units & appearance): the launch stays
      dark and Home is light as it shows, with no flash of either in
      between.

## The Privacy Policy's claim about Google's retention (F3d pin 2)

`PrivacyPolicy.tsx` section 7 tells users two things about the food-scan
photo once it reaches Google: that it is _"temporarily processed and not
permanently retained by Google"_, and that _"we do not use your food
photos for AI model training"_. Both are statements about someone else's
system. Nothing in this repo enforces or verifies either, and F3d pin 2
— "configure Vertex AI to disable retention, document in
`docs/privacy.md`, verify on every release" — was never ticked.
`docs/privacy.md` does not exist.

**Checked 2026-08-19, and the picture is better than that history
suggests.** The endpoint is the one thing that decides most of this, and
it was worth reading before assuming the worst:

```
functions/index.js:1236, :1444
  https://us-central1-aiplatform.googleapis.com/v1/projects/…
    /locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent
```

That is **Vertex AI** (`aiplatform.googleapis.com`), the GCP enterprise
endpoint — NOT the consumer Gemini Developer API
(`generativelanguage.googleapis.com`). The distinction is the whole
ballgame for the training half of the claim: the Developer API's free
tier may use submitted data to improve Google's products, whereas Vertex
AI customer data is contractually excluded from training Google's
foundation models under the Cloud terms. So _"we do not use your food
photos for AI model training"_ rests on a contract rather than on a
setting somebody forgot to flip.

Nothing in `functions/` enables request logging either — grepped for
prompt/response-logging configuration and there is none, which is the
default and the one we want.

What is genuinely left, and it is narrower than the row implied:

- [x] **Confirm the abuse-monitoring retention window — DONE 2026-08-22,
      with one caveat recorded in the doc.** Every Google-side route is
      temporary and bounded (≤24h serving cache by default; conditional
      abuse-flagged prompt logging for a bounded window, with invoiced
      accounts exempt by default), so the policy sentence stands as
      written — no rewording needed. Caveat: the sandbox egress proxy
      blocks the canonical doc host, so the facts were triangulated from
      two independent search syntheses (which disagreed 30-vs-90 days on
      the flagged-prompt window — immaterial to the sentence, but settle
      it from a browser). Full detail in `docs/privacy.md`.
- [ ] **Confirm no prompt logging is enabled at the project level**
      (Cloud console). Absent from the code is necessary, not
      sufficient — it can be switched on outside the repo.
- [x] **Write `docs/privacy.md` — DONE 2026-08-22.** It records what
      holds each policy sentence up (the Vertex endpoint as the
      load-bearing fact, Google's retention posture with dated caveats,
      the repo's own Food9 guarantees), the residual operator-only
      checks, and a per-release re-verification procedure with a dated
      pass ledger — so "verify on every release" finally has something
      to diff against.

Do this before an App Store reviewer or a data-subject request reads
section 7. The claim is probably true; "probably" is the problem.

## Meal photos moved to the device (Food9, 2026-08-18)

Affects: `src/lib/foodPhotoStore.ts` (new), `src/lib/foodPhotoUpload.ts`
(deleted), `src/hooks/useFoodPhotoUrls.ts` (new), `FoodAnalyzer.tsx`,
`FoodTimeline.tsx`, `FoodRow.tsx`, `useMeals.ts`, `AccountSection.tsx`,
`PrivacyPolicy.tsx`.

The retention policy is pure and fully pinned (`planEviction`, 29 tests,
three mutations checked). What follows is the half no suite in this repo
can reach — the same device-only residue the Storage implementation had,
plus two new ones the platform change introduces.

- [ ] **The ≤1280px downscale.** `toStorableJpeg` needs `<img>` + canvas;
      jsdom has neither. Scan a meal on a device and confirm the stored
      file is ≤1280px on its longest edge. (Inherited unchanged from the
      Storage implementation — it was never covered there either.)
- [ ] **`Directory.LibraryNoCloud` behaves as its docstring claims.**
      Two separate checks, both iOS: the photo must NOT appear in the
      Files app or in Photos, and it must NOT ride the device's iCloud
      backup. The Swift package that implements it (`IONFilesystemLib`)
      is fetched by SPM at build time and is not vendored, so nothing
      about this is confirmable off-device.
- [ ] **A photo survives an app restart** (native and web PWA). This is
      the whole point of choosing a filesystem over memory; on web it
      additionally proves the plugin's IndexedDB backend persists.
- [ ] **Multi-device is now a TEXT ROW, by design.** Scan on the phone,
      open the same day on the web build: macros present, no photo. Not
      a bug — confirm it reads as an ordinary log rather than as
      breakage, which is what `FoodRow`'s degrade is for.
- [ ] **Account deletion.** Delete a test account on device and confirm
      `food-photos/<uid>/` is gone from app storage. Known and accepted
      narrowing: a second device the user never reopens keeps its copies,
      because no server process can reach a device.

**Follow-up, NOT done in this change — legacy Storage blobs.** New
writes stopped; the blobs already under `food-photos/{uid}/` were left
in place so pre-Food9 diary rows keep rendering, and the `storage.rules`
block stays (changing it was blocked behind `STORAGE_XSERVICE_APPROVED`
until 2026-09-15; a change now deploys with the next release). Sweeping
them is a separate piece of work. Until it happens, "Tropos stores no
meal photos" is true of everything written from 2026-08-18 onward and
NOT of what came before — do not read the Food9 lock as meaning the
bucket is empty.

## Scan failure beat + no-food prompt contract (2026-08-18, PR #2066)

Affects: `functions/index.js` (analyzeFood prompt), `src/components/FoodCameraModal.tsx`, `src/components/FoodAnalyzer.tsx`.

The analyzeFood prompt now instructs the model: no food visible → return
foodName "No food detected" with empty items. That exact name is a CONTRACT
with the client's `GENERIC_AI_NAMES` filter — pinned cross-repo by
`aiFoodIdentification.test.ts` (promptContract), so reword both ends together.
Client-side, every scan failure now resolves IN the modal (no-food / error /
offline beats with Retake + Type-it-instead) instead of silently closing;
pre-fix the parent's catch/toast was dead code because the hook returns null
rather than throwing.

- [x] **Deployed-source spot-check — CLOSED from the deploy log, 2026-08-18.**
      No console visit needed: run 32141732273 (merge commit `e41f4d9`) shows
      the whole chain rather than just a green tick — the build-marker step
      injected `// CI build: e41f4d96…` (so the bundle hash was unique and
      the dedup could not skip the upload), then `functions: functions source
uploaded successfully`, then explicitly
      `✔ functions[analyzeFood(us-central1)] Successful update operation.`
      That is what the standing gotcha asks the console to prove, proven
      upstream of it — same shape as the `askGeminiText` row, which was also
      closed from a deploy log rather than a console visit. Reach for the
      console only when a deploy log LACKS the per-function update line.
- [ ] **Real non-food photo on device.** Scan a bookshelf / a person: the
      modal must resolve to "No food detected" with Retake + Type it instead
      — no silent close, no result card with hallucinated macros.
- [ ] **A nutrition LABEL still scans.** The packaging exemption is the
      other half of the no-food sentence (the server never sees the tab, so
      without it a label photo — which contains no literal food — could
      answer "No food detected"). Scan a packet on the Food label tab and
      confirm macros come back.
- [ ] **Airplane mode.** Shutter → instant "You're offline" (no burned wait),
      with Type it instead as the PRIMARY action — and typing must work
      end-to-end offline (local NL parse + queued write). Same for the
      Barcode tab: honest copy, never a raw "Failed to fetch".
- [ ] **Slow-scan escape.** Start a scan on weak signal and tap the X during
      the sweep — it must close immediately (pre-fix the X sat under the
      overlay and iOS users were trapped until the request resolved), and
      the abandoned scan must NOT park a failure the next session opens onto.
- [ ] **Rate-limit copy.** Burn the 10-per-10-min limiter with repeated
      retakes: the beat must read the server's own "wait a moment", not the
      generic connection line (the copy existed but rendered nowhere).
- [ ] **A busy multi-item plate.** The output cap went 1024 → 2048 because a
      crowded plate could truncate mid-JSON and 500 while still charging
      quota. Scan something with 6+ components and confirm a full item list.
- [ ] **VoiceOver over the whole journey.** Shutter → "Analyzing food"
      announced (pre-fix the wait was SILENT), failure verdict announced,
      and the camera chrome under the overlay unreachable by swipe (it was
      focusable, and Enter on the invisible shutter fired a blind capture).

## Nutrition/TDEE sweep 2026-08-12 — one finding left, and the shape of the rest

Five defects shipped from one sweep of the calorie/macro path (#1994-#1998).
Four shared a single shape, worth naming because it is not the mirror-parity
rule and keeps being mistaken for it: **a number computed in one place and
DISPLAYED from another**. Not two copies of a formula drifting — one correct
value, and a reader pointed at a different, staler field.

Home's protein nudge quoted `profile.targetProtein` beneath rings
showing `useEffectiveTargets().protein` — 16-32 g
apart, on the same card.
History's target line quoted an onboarding-day snapshot nothing had
updated since.
Settings' "Adapting" printed the formula figure under a line saying the
number was adapted.
The PI scorer was handed `profile.goal`, a field nothing writes.

In every case the codebase had ALREADY solved it for the neighbouring field
and the fix was pointing the stray reader at the existing source.
HOME-TARGET-01 ("one target everywhere") did exactly this for calories and
missed protein; `calorieTargetResolution.js` did it server-side for the
scoring target. When you find one of these, check the siblings — the fix is
usually a one-line repoint, and the miss is usually a field that was added
after the sweep that fixed its neighbours.

**RESOLVED — `goalCalorieOffset` trusted the sign of `weeklyRateKg`.**
`useAdaptiveTdee` read the field raw; its sibling `goalReachedOffer` has
cross-checked the sign against `program.goal` since NUTR-M2, because
pre-NUTR-M2 profiles stored the rate UNSIGNED. A legacy cutter therefore got
a +550 kcal SURPLUS where -550 was intended, walked up 150/week by
`applyWeeklyCap` — slow enough to look like the engine working.

Shipped as `attestedWeeklyRateKg`, called by both consumers. The open
question ("do unsigned-rate profiles exist in production?") was NOT the
blocker it looked like: the check is a no-op for every correctly-signed
profile, so the cost of being wrong about their existence is zero one way
and a silent surplus the other. When a defence is free for the healthy case,
the prevalence question is not worth answering first.

**The stored/displayed protein split stays — and holds by ONE DECIMAL PLACE.**
Stored `targetProtein` splits by GOAL; the displayed daily target splits by
lift PHASE. Consolidating them needs either a server-side phase mirror or an
obligation to rewrite the profile on every phase change, both larger than
the gap they close. Declined.

That is only safe because the PI protein factor is `ratio >= 0.9 ? 100 :
ratio * 111` — so over-eating is never penalised — and across every
reachable (goal, phase) pair the shown/stored ratio bottoms out at EXACTLY
0.90. Zero margin. `PHASE_PROTEIN.race_prep` is 1.6 and would give 0.8, i.e.
88.8 points for eating exactly what the app asked; it is unreachable only
because `LiftPhase` has no such member.

Nothing was holding that. It is now pinned by
`proteinTargetDivergence.test.ts`, with the multiplier tables asserted as
literals. Before changing ANY protein multiplier, or adding a phase to
`LiftPhase`, read that file — the invariant is not local to either table.

**Deploy verification owed for the three `functions/` changes** (#1991 delete
triggers, #1993 cold-start badges, #1994 PI goal wiring). CI-green is
necessary-not-sufficient per the standing dedup gotcha; all three are `.js`
changes so dedup should not bite, but the Console spot-check is the only
proof. Neither #1993 nor #1994 repairs history: badges already dropped stay
dropped (the trigger is `onCreate`), and stored PIs are rewritten only for
the current week by the next rollup.

## Unwired seams — half-built features that read as shipped (2026-08-12)

Found while adjudicating the orphaned hook-return properties behind PRs
#1980/#1981. Recording them because both are the shape that stays invisible:
the code exists, so a reader assumes the feature does. Neither is dead code —
deleting either would destroy the half that IS built.

**A user cannot delete a mis-logged workout or run.** RESOLVED
2026-08-12 — built end to end, server first, per ADR-0012 and its two
amendments.

Server: `onWorkoutDeleted` / `onRunDeleted` reverse challenge progress and
lifetime totals. Client: `lib/sessionDelete` + `DeleteSessionAction`, wired
into `/workout/:id` and `/run/:runId`. `useWorkouts.deleteWorkout` is gone —
it was the unwired duplicate of a now-wired path, and keeping both is what
`hookSurfaceReachability` exists to catch.

Three things the original framing above got wrong, all of them the kind that
only surfaces once you write the code — the amendments carry the detail:

- The challenge marker DOES record its `incrementBy`. The plan to "re-derive
  from the deleted snapshot" was built on the premise that neither marker
  carries a delta; only the lifetime one doesn't.
- Re-derivation is not always correct even when it is available. Session ids
  are deterministic, so a resumed programme Finish re-`set`s the same workout
  doc — an overwrite that accrues nothing, leaving the counter and the
  document disagreeing. The lifetime marker now stamps `appliedValue`.
- `fastest_effort` cannot be reversed at all (MIN semantics, and its marker
  records the run's time rather than the best it displaced). It joins partner
  streaks — and milestone badges, which the ADR never mentioned — on the
  "history, not an accumulator" side.

- [ ] **Deploy verification.** Confirm `onWorkoutDeleted` / `onRunDeleted`
      appear in the Console function list and that `onWorkoutCreated`'s
      deployed source contains `appliedValue`. Then delete a real session on
      device and watch a joined challenge's `currentValue` drop by that
      session's contribution.
- [ ] **A shared run's feed post is unreachable from the run.** Workouts carry
      `sharedActivityId`, so deleting one removes its post; the run share path
      (`ShareComposerSheet` → `postActivity`) writes no marker back, so a
      shared run's post survives the run. The confirmation copy says so rather
      than pretending otherwise — closing it means writing the marker on the
      run side first. Related: nothing in the app deletes a feed post on its
      own, for any post.

**The food-favourite graduation coachmark was never built.** RESOLVED
2026-08-12 — `graduationToken` deleted. It was speculative state, not a
deliberate seam: no coachmark was ever specced (no design, no reserved key,
nothing in the plan file), and the rest of graduation ships and works without
it — the `food_pantry_graduated` event, the funnel splits by entry path, the
useCount>=2 filtering in `Food.tsx` all remain. The detection block that fed
it stays; only the state and its return entry went, so the analytics are
untouched. Deleted rather than annotated, per `mirrorCrossTestGate`'s rule
about code nobody calls and nobody intends to call.

**Gate gap that hid all of the above.** `mirrorCrossTestGate` sees a dead MODULE;
`symbolReachability` sees a dead EXPORT inside a live module. Neither sees a dead
PROPERTY on a live hook's return object. A scan of the 134 such properties across
70 hook files found the set; after #1980/#1981 five remain, and the three above are
judgement calls rather than deletions. Extending the gate is tractable and matches
the house pattern of each orphan instance producing a new gate — but it needs those
five classified first, and `useWorkouts.saveWorkout` is already a documented pinned
orphan, so the list is genuinely mixed.

- [x] RESOLVED 2026-08-12. The gate shipped as
      `src/lib/__tests__/hookSurfaceReachability.test.ts`, and the five
      classified out: `graduationToken` deleted as speculative state,
      `deleteWorkout` deleted once its real path landed, `saveWorkout` stays a
      documented pinned orphan, and `baseTarget` / `isRunDay` stay pinned as
      documented fields of an exported interface three components take as a
      prop type.

## Supplied form-card frames — origin ANSWERED, two things still open

Affects: `public/form-frames/dips/*.webp`, `scripts/extract-form-frames.mjs`,
the `FORM_BEATS` placard for `dips`.

The dips form demo animates six frames cut from a form card. **Origin,
owner-stated 2026-09-03: generated by the owner with ChatGPT.** Not
lifted from another app, which was the risk worth asking about — it is
the one that would have forced removal.

What that settles and what it does not:

- **Use is permitted.** OpenAI's terms assign the user the rights in
  output and allow commercial use. Re-read them at submission time
  rather than trusting this line; terms change and this one is dated.
- **It is probably not OURS to defend.** Work without human authorship
  is generally not copyrightable in the US, so Tropos can ship these and
  most likely cannot stop anyone else from copying them. That is a
  business fact to know, not a blocker.
- **Removing the art needs no code change.** Delete the files and the
  rig figure takes over — every beat keeps the `t` it falls back to.

Still open:

- [ ] **The six panels are not one scene.** Each was generated
      separately, so the dip station is drawn at a different position,
      size and angle in all six; animated, the equipment drifts under
      the lifter. Measured, not eyeballed: mean station overlap between
      frames is ~9%, and a translation-registration pass made it
      slightly WORSE (9.3% → 8.7%) because aligning the bar pulls the
      posts apart. The fix is upstream — generate one image and EDIT the
      pose for the other five, rather than generating six — not in the
      extraction script. Judge it on the animated preview before
      deciding whether it matters.
- [ ] **Sanity-check the depicted form against a coach's eye.** A
      generated figure can be confidently wrong about anatomy, and this
      is a fitness app: the demo teaches. The 03t captions already
      caught the rig claiming a locked arm at 152 degrees; nothing has
      checked the pictures to the same standard.
- [ ] **Decide the scale question before cutting more cards.** Corrected
      2026-09-04 — the earlier figures here ("~72 KB per exercise",
      "~18 MB of precached assets") were both wrong, and the second one
      wrong in the way that mattered: **nothing precaches these.**
      `public/sw.js`'s `STATIC_ASSETS` is the three-entry app shell, and
      `.webp` falls into the stale-while-revalidate IMAGE branch — so a
      user downloads a set only when they open that exercise's Form tab,
      and it is runtime-cached after that. No user ever pays for the
      whole library.
      The real numbers, measured: ~500 KB per exercise at current
      quality (424 / 468 / 632 KB for bench-press / dips /
      rope-tricep-pushdown), so 1.5 MB for three and ~76 MB if all 152
      were cut. That cost lands on the REPO and on every deploy
      artifact, not on the client — which is a different and easier
      conversation than a bundle-size one, and points at moving the
      frames to Storage and fetching on demand rather than at cutting
      fewer of them.
      The other half is unchanged: generating 151 more cards is the
      larger cost, and it is human-in-the-loop.

## Cost & margin operator setup (unit economics)

Modelled 2026-07-05. Apple's cut dwarfs all infra: at £3.99/mo, Apple takes £0.60 (15% — Small Business Program, accepted 2026-08-18; it was £1.20 at the standard 30%); combined Gemini + Firebase + storage + ORS run ~15–20p/Pro user/mo (Gemini Flash food scan ≈ ½p; only Pro users hit the AI gate). ORS routing is ~free at ~5k users (occasional route-plans, ~2–5 calls each, under the 2,500/day free tier); on quota-exceed it degrades to the existing straight-line planner (no lockout), and true scale = self-host ORS on a ~£25/mo VM (fixed, not per-request). `maxInstances` caps are already in every Cloud Function (runaway-cost guard).

- [x] **Apple Small Business Program — ACCEPTED 2026-08-18.** Apple's
      commission on Tropos is now **15%**, not 30%, for as long as the
      under-$1M/yr condition holds. Net per £3.99 subscription goes
      £2.79 → £3.39. Treat 15% as the live number in any margin
      arithmetic from here; the 30% figure above is historical. Worth
      ~£0.60/user/mo — still more than the entire infra bill (~15-20p),
      which is why this was the highest-leverage item on the list.
      Re-check enrolment annually: Apple requires it and drops you back
      to 30% if the renewal lapses or revenue crosses the threshold.
- [ ] **Set a Google Cloud budget alert** (GCP Console → Billing → Budgets & alerts): email at, e.g., >£50/mo. Single smoke-detector across Gemini/Vertex, Firebase, and the future ORS proxy. Optionally set a hard Vertex/Gemini quota ceiling.
- [ ] When Run11 (ORS) ships: wire per-user quota in the proxy (one user can't drain the daily 2,500), log quota-exceeded, and confirm the straight-line fallback fires on 429.
- [ ] **Confirm the AI food calls log their token counts** (shipped in
      #2558, 2026-10-02). After a Pro photo scan or a Pro typed meal,
      open Google Cloud console → Logging → Logs Explorer for
      `adaptive-fitness-af8bb` and search
      `"analyzeFood.usage" OR "analyzeFoodText.usage"`. Each entry should
      carry `promptTokens`, `outputTokens` and `totalTokens` as numbers.
      `null` in all three means Vertex replied without its usage block,
      and the counts have to come from somewhere else. The entries hold
      no prompt, image or reply (`vertexUsage` in
      `functions/lib/vertexLogRedaction.js` reads only the counts). They
      are what a prompt or model change gets measured against.

## App Store listing — public Terms/Privacy URLs (launch gate)

The app's real domain is **`troposfit.com`** (owned + Cloudflare-managed;
`tropos.app` is NOT owned — do not use it anywhere). The App Store listing
(Description footer + the Support URL field) must point at
`https://troposfit.com/terms`, `https://troposfit.com/privacy`, and
`https://troposfit.com/support`. Apple's reviewer clicks these from the public
web _outside_ the app, so in-app routes alone don't satisfy the check, and a
dead legal/Support URL is a common first-submission rejection.

**CORRECTED 2026-08-18 — this row was substantially wrong, and being wrong
made the remaining work look bigger than it is.** Three fixes:

1. **The pages all exist and are already deployed.** `PrivacyPolicy.tsx`,
   `TermsOfService.tsx` and `Support.tsx` are real routes, declared in ALL
   THREE of App.tsx's route sets including the signed-out one, so they open
   with no login. `Support.tsx` carries `support@troposfit.com`. This row
   claimed the Support page still needed building; it did not.
2. **`deploy-hosting.yml` already publishes them at a root path.** It builds
   with `HOSTING_TARGET=firebase` → `base: "/"` and deploys to the live
   Firebase Hosting channel on every push to main (last run: `99413966`,
   2026-08-18, success). So `/privacy`, `/terms` and `/support` resolve at
   the Hosting origin **today**.
3. **The suggested "point GitHub Pages at troposfit.com via CNAME" does not
   work** and would have produced exactly the dead links this row warns
   about. The Pages build uses `base: "/Maiin/"` (`vite.config.ts:57`), so a
   CNAME alone serves the app at `troposfit.com/Maiin/privacy` —
   `troposfit.com/privacy` would 404. **Use Firebase Hosting**, which is
   already root-based, already wired, and same-origin with the auth handler.

What is genuinely left is operator-only — there is no code change pending:

- [ ] **Add `troposfit.com` as a custom domain** in Firebase Console →
      Hosting → Add custom domain, for the `adaptive-fitness-af8bb` project.
- [ ] **Add the DNS records Firebase issues, in Cloudflare.** Set those
      records to **DNS-only (grey cloud), not proxied** — Cloudflare's proxy
      intercepts the ACME challenge and Firebase's certificate provisioning
      stalls. You can re-enable proxying after the cert is issued if wanted.
- [ ] **Confirm all three URLs load signed-out in a private window** before
      touching App Store Connect. `src/lib/__tests__/publicLegalRoutes.test.ts`
      pins that the ROUTES exist in the signed-out set; it cannot pin DNS.
- [ ] **Then update App Store Connect** to the real URLs: the two links in
      the **Description** footer and the **Support URL** field. Do NOT submit
      with placeholder links.

## Stripe stays DORMANT — web storefront steer at launch (Sub4, locked 2026-07-05)

Distribution decision: Tropos ships **App Store now + Google Play later; no web billing is sold**. The working Stripe backend (checkout → webhook → tier, hardened in #822) is **kept dormant, NOT torn out** — Apple takes 15–30% vs Stripe's ~3%, so web billing is the single biggest future margin lever and pre-launch is the wrong moment to foreclose it. Do NOT build `createStripeBillingPortal` (the web Manage button's never-defined callable — it never fires on iOS, where the native branch redirects to Apple's subscriptions page) and do NOT start the ~46-file teardown; revisit removal only if still App-Store-only well after real revenue. Two known costs of dormancy, accepted: functions deploys require `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` to stay provisioned (closing the Stripe account needs a code change first), and billing-adjacent PRs keep threading Stripe branches.

- [ ] **Launch gate:** add the web App-Store steer — signed-in web visitors on `/upgrade` (and the ProModal paywall) see "Get the iOS app" instead of Stripe checkout tiles. One component change, NOT a backend migration. Deliberately not built pre-launch: the web build is the active dev/preview surface and the operator still exercises the checkout/trial flows there.
- [ ] At that point also confirm no other web surface deep-links into Stripe checkout (`useProCheckout` call sites).

## Legacy meal photos in Storage (uploaded before Food9)

Affects: `storage.rules` (`food-photos/{uid}/` block), `functions/accountDeletion.js` (prefix sweep). New meal photos stay on the device ("Meal photos moved to the device (Food9)" above); these checks cover the photos uploaded before that. The agent sandbox runs the Storage emulator (`npm run test:rules:storage`).

- [x] Signed-out and cross-uid reads of a food-photos path are denied — covered by `storage.rules.test.ts` against the emulator. Note the rules block itself IS deployed: the ungated `a990d4bb` run (2026-07-12) shipped it. The later account-deletion write freeze (`779ca7ba`) was held back by the packet-11 gate until 2026-09-15; that row has the permission it still needs confirmed.
- [ ] Account deletion (test account): confirm the executor logs the `food-photos/<uid>/` prefix sweep alongside progress/profile photos.

## Tooltip + Coachmark primitive (`claude/tooltip-primitive`)

Affects: `src/components/ui/Tooltip.tsx`, `src/components/ui/Coachmark.tsx`, plus the LIVE wire-ups — as of 2026-08-08 these are: Performance Index tooltip in `PerformanceTab.tsx`, Trajectory delta chip in `social/TrajectoryCard.tsx`, and the `social-find-invite` Coachmark in `social/views/PeopleView.tsx`.

**STATUS 2026-10-04 (FV2):** `Coachmark` and its one live wire-up (`social-find-invite`) are removed, and `e2e/coachmark.auth.spec.ts` with them. The rig showed the bubble had never been seen: it portalled at z-40 under the People overlay's z-50 and saved itself as seen after six seconds, while that spec's `toBeVisible()` passed throughout, because visibility does not check what is painted on top. The Tooltip rows below still apply; the Coachmark row is moot.

Wire-up history (rows below referenced surfaces that no longer exist): the Nutrition HealthScore wire-up was removed by PI2; the Programme running-icon coachmark's successor (`extras-pill-v1` in `HybridWeekRail`) was orphaned by the `2b4e07b8` navigation unification and deleted in #1882.

PR #606 added automated coverage for the earliest [x] items; #1882's `e2e/coachmark.auth.spec.ts` and the tooltip capture spec closed most of the rest against the real emulator rig.

- [x] Light + dark mode visibility — filmed for the Performance Index wire-up (`tooltip.screens.capture.spec.ts`, both themes, body + arrow registering). The TrajectoryCard delta chip stays a manual check — it needs trajectory data the shared seeds don't stage.
- [x] 375px viewport — body wraps at `max-w-[280px]`, never overflows the screen — PR #606 pins the class
- [x] Vaul-drawer occlusion (z-50 > z-40) — closed by architecture, not by test: tooltips dismiss on any outside interaction and no LIVE surface auto-opens a drawer while a tooltip/coachmark can be showing (the last pairing died with the extras coachmark, #1882). The #606 z-class pin remains the guard; revisit only if a new wire-up lands on a surface with auto-opening sheets.
- [x] VoiceOver: body content is announced when the anchor receives focus (via `aria-describedby`) — PR #606 pins the wiring (screen-reader announcement itself stays manual)
- [x] Keyboard flow: Tab to anchor → Enter opens → Escape closes → focus returns to anchor — PR #606
- [ ] iOS Safari + Capacitor build: rubber-band scroll doesn't drift the portal
- [x] `prefers-reduced-motion: reduce` set at OS level — the slide animation is suppressed; fade still plays — PR #606
- [x] First-use Coachmark dismissal matrix + reload persistence — automated end-to-end on the live wire-up by `e2e/coachmark.auth.spec.ts` (#1882): outside tap + reload persistence, Escape, 6s auto-timer, each asserting the persisted key, driven as a brand-new signup-form account. Anchor-tap stays manual (it triggers the share flow, which headless CI lacks).

## Bottom-sheet keyboard lift (#2040, #2044) — the one genuinely device-level claim

Affects: `src/components/ui/BottomSheet.tsx`, `src/hooks/useKeyboardInset.ts`.

A soft keyboard covered the sheet's CTA (surfaced from a device screenshot:
the Start-a-circle sheet's button stranded off-screen). The fix anchors the
sheet with `bottom: keyboardInset` rather than growing `paddingBottom`,
which on a `bottom-0` element pushed content upward — the wrong lever.

**Do not add a Chromium e2e test for this**, and don't re-derive why: the
reasoning is recorded at the tail of `useKeyboardInset.test.ts`, measured
rather than argued. Headless Chromium has no soft keyboard, so focusing an
input does not shrink the visual viewport under ANY device emulation — the
condition the hook responds to cannot be produced there at all. Such a test
could only synthesise the divergence itself, which is what the unit tests
already do, while reading as browser-verified.

What that probe DID earn is pinned: real Chromium reports a SUB-PIXEL gap
between `innerHeight` and `visualViewport.height` with no keyboard open
(0.487px on iPhone 13 emulation, 0.125px on Pixel 5). `Math.round` absorbs
it; `Math.ceil` would hand every Chrome-based device a permanent 1px inset.
Both mutations now fail.

- [ ] iOS Safari (and the Capacitor build): open the Start-a-circle sheet,
      focus the name field, confirm the CTA sits directly above the keyboard
      rather than off the top or behind it. Dismiss the keyboard and confirm
      the sheet settles back with no leftover gap. This is the half no
      automated suite in this repo can reach.
- [ ] Same flow on a real Android device — the resize-model side of the
      arithmetic, where a double-lift would show as the sheet jumping a
      keyboard height too far.

## PR-L server-side reconciliation Cloud Functions

Affects: `functions/index.js` — three new/extended functions shipped in #807-#811.

Needs a 24h + 1-week observation cycle in production to see each trigger fire at least once with real user data. Until that happens, the deploy is "code in place" but the behaviour is unverified.

- [ ] `dailyRaceReconciliationSweep` (Pub/Sub, 04:00 UTC daily) — confirm first natural firing in Cloud Functions logs: should log `starting` → `evaluating N users` → `done — noShow=X, recoveryCleared=Y`. No `fatal error:` lines. Spot-check one race-prep user whose race date passed >3 days ago with no logged race: their `runDay.status` should flip to `race_no_show` within 24h.
- [ ] `onRunCreated` recovery-entry extension — log a real race-templated saved run matching the user's `raceGoal.targetDate` at ≥95% planned distance. Confirm `onRunCreated` logs include `recovery-entry written for {uid}` and the user's `programState.runPlan.phase` flips to `"recovery"` with `completedRaces[]` containing the race-day runDay id.
- [ ] `weeklyFellBehindCheck` (Pub/Sub, Mondays 05:00 UTC) — confirm first natural firing (next Monday after deploy). Logs should read `evaluating week YYYY-MM-DD (Sun..Sat)` → `done — set=X, clear=Y`. Spot-check a user who ran <50% of their weekly target the prior week — their `programState.pendingFellBehindPrompt` should be present.
- [ ] L4 client UI — once any user has `pendingFellBehindPrompt` set, log in as them, confirm the `FellBehindSheet` auto-opens on Home with the correct copy ("X of N runs (Y%)") and that all three buttons (shift / compress / skip) write the expected programState change.

## Run9 3b — server recovery-exit materialization (PR #901)

Affects: `functions/index.js` (`dailyRaceReconciliationSweep` L3) + new `functions/lib/runModeResolution.js`. Merged + deployed 2026-05-29. Mirrors, server-side, the client's `resolveRecoveryExit` materialization invariant. Deploy was merged from a web session that **cannot** verify the deployed source — these checks are the conclusive proof CI-green can't give (the dedup/bundle-hash gotcha means a green workflow does not prove the new bundle actually uploaded).

- [ ] **Deployed-source spot-check (do this first).** In the Console (`console.cloud.google.com/functions/details/us-central1/dailyRaceReconciliationSweep/source`), confirm the deployed bundle contains `_recoveryEndDateForRace` and the `require("./lib/runModeResolution")`. If absent, the dedup logic skipped the upload — re-run Deploy production (`deploy-production.yml`) via `workflow_dispatch`.
- [ ] **First natural firing materializes.** At the next 04:00 UTC sweep, spot-check a race-prep user whose recovery ended >7 days ago (`runPlan.phase === "recovery"`, `today >= recoveryEndDate + 7d`) with **no** successor race: their profile should flip to `runMode: "freeform"` + `raceGoal: null`, and `programState.runPlan` should have `phase: null`, `recoveryEndDate: null`, `raceGoal: null`. Logs show `done — noShow=X, recoveryCleared=Y` with no `fatal error:`.
- [ ] **Newer-race case preserved.** A user who set a new FUTURE race during recovery (anchor mismatch) must stay `runMode: "race_prep"` with that raceGoal intact after the sweep — only `phase`/`recoveryEndDate` cleared. Confirm the sweep does NOT delete the successor race.

## `askGeminiText` retirement — DONE 2026-07-26, confirmed from the deploy log

**RESOLVED 2026-08-02.** The endpoint is gone from production. The deploy that
shipped the retirement (`da7c1ce`, run 30213576939) pruned it in the same run:

```
17:58:05  i functions: deleting Node.js 20 (1st Gen) function askGeminiText(us-central1)...
17:58:09  ✔ functions[askGeminiText(us-central1)] Successful delete operation.
```

**The risk this row warned about did not exist, and the reason is worth
keeping.** It said "Firebase usually prunes removed exports on deploy, but it
prompts for confirmation, and a non-interactive CI deploy can skip the prune."
`deploy-functions.yml` passes **`--force`**, which suppresses that prompt and
lets the prune run unattended. So a removed export IS reliably deleted by this
pipeline — no manual `functions:delete` is needed after retiring one.

Same shape as the `STORAGE_XSERVICE_APPROVED` correction below: a plausible
hazard written into the runbook, never checked against the pipeline that would
have to exhibit it, and left steering people wrong for a week. When a row
predicts a tool will misbehave, read the flags the workflow actually passes.

- [x] Deleted from the Cloud Functions list — proven by the delete lines above,
      and corroborated by later deploys (through `127ac38`) listing neither an
      update nor a delete for it.
- [x] No client change needed — there were zero call sites. `rateLimits/{uid}_askGemini`
      docs stop being written; existing ones are swept by the account-deletion
      range filter covered in `accountDeletionRateLimitsRange.test.ts`.

## Node runtime — bumped to 22 (2026-08-02); watch the first deploy

The `127ac38` deploy log warned that Node 20 "will be decommissioned on
2026-10-30, after which you will not be able to deploy without upgrading" —
a hard blocker on **every** future deploy, including an emergency fix.
Confirmed against firebase-tools' own runtime metadata rather than the warning
text alone: `nodejs20.decommissionDate = "2026-10-30"`.

**Bumped to `nodejs22`.** THREE places pin the runtime and they must agree —
missing one leaves the deploy resolving a version you did not choose:

| File                          | Field                                               |
| ----------------------------- | --------------------------------------------------- |
| `firebase.json`               | `functions.runtime` — the authoritative declaration |
| `functions/package.json`      | `engines.node`                                      |
| `functions/package-lock.json` | mirrors `engines` (regenerate, don't hand-edit)     |

`deploy-functions.yml`'s `node-version` was also moved 20 → 22. That one is the
CI RUNNER's node, not the functions runtime — unrelated to this deadline (its
own deprecation notice is about Actions) — but it should not trail the runtime
it deploys.

**Why 22 and not 24, given both are GA:** they share a decommission date
(2028-10-31), so 24 buys no extra deploy runway — only a later deprecation
_warning_ (2028-04-30 vs 2027-04-30). 22 is what the CI runners and the agent
sandbox actually run, so the test evidence is against the real target rather
than a version nothing here exercises.

Evidence before merge: full functions suite green on Node v22.22.2 with the
Firestore emulator up — 1156 tests, 76 files, none skipped.

- [ ] **Watch the first deploy after this merges.** The runtime switch
      redeploys every function at once, so a runtime-level incompatibility
      shows up everywhere simultaneously rather than in one endpoint. Expect
      the Node 20 deprecation warning to disappear from the log.
- [ ] Spot-check one callable and one Firestore trigger in the Console
      afterwards (the `// CI build: <sha>` marker at the top of the deployed
      source confirms which commit is live).
- [ ] Native/transitive deps are the residual risk the test run cannot cover —
      the suite exercises the code, not the deployed container image.

## `functions/` dependency advisories — the bump was TRIED and declined

**STATUS 2026-10-03 — the last moderates are cleared by a `uuid` override,
not by v14.** After the 2026-09-07 pass, `npm audit` still reported 8 moderate
advisories in `functions/` and 10 at the root. Eight in each were one
advisory, GHSA-w5hq-g745-h8pq (`uuid` below 11.1.1: no bounds check when v3,
v5 or v6 write into a buffer the caller passes), reaching firebase-admin
through `gaxios`, `google-gax` and `teeny-request`. The root's other two were
vitest's `@vitest/mocker` (GHSA-82fw-gwwq-j7x9, fixed in 4.1.11). Measured
before choosing:

- firebase-admin 14.5.0, the newest, clears 6 of the 8 and leaves 2: the
  storage client it bundles still depends on `gaxios` 6, which asks for
  `uuid` ^9. The migration this section describes would not reach zero.
- Each of the three consumers calls `uuid.v4()` with no buffer, so the code
  the advisory names never ran here, and `uuid` 11 keeps `v4()` and its
  CommonJS build.

Both `package.json` files now carry `"overrides": { "uuid": "^11.1.1" }`, and
the root's vitest floor is ^4.1.11. Both audits report 0. Checked on the
change: the functions suite against the emulators (1,586 tests, none
skipped), the full root suite, and the whole capture seed chain against the
emulators, which drives the root's firebase-admin. Remove the override once
`npm ls uuid` in `functions/` shows firebase-admin's own tree asking for
11.1.1 or later.

npm 10.9.7 crashes resolving vitest 4.1.11's optional peers in the root tree
("Cannot read properties of null (reading 'edgesOut')"). The root lockfile was
regenerated with npm 11 (`npx npm@11 install --package-lock-only`), changing
only the vitest family and `uuid`, and npm 10's `npm ci` installs it cleanly.
A later bump that hits the same crash can take the same route.

**STATUS 2026-09-07 — high/critical hold superseded by a fresh measurement.**
Compatible transitive updates (including grpc-js, protobufjs, websocket-driver,
form-data and fast-xml-builder) now clear the high and critical advisories
without changing firebase-admin's major version or its namespaced API. The
security audit updates the lockfile and makes the Functions CI audit fail on
high/critical advisories. The old counts and "no in-range fix" conclusion below
are historical, not permission to skip a fresh audit. The Admin SDK v14 migration
warning still applies. See `docs/agents/security-audit-2026-09-07.md` for this
pass's measured dependency state and residual limits.

`npm audit --omit=dev` in `functions/` reports 18 (1 low, 12 moderate, 4 high,
1 critical). The obvious move — bump `firebase-admin`, the only DIRECT
dependency implicated — was attempted on 2026-08-02, measured, and reverted.
Recorded here so nobody re-runs the investigation to reach the same answer.

**There is no in-range fix.** `13.10.0` is already the newest 13.x, so `^13`
cannot be updated into a clean tree. The only path is the 14.x major.

**14.2.0 helps, but not with the one that matters.** Measured, not assumed:

|          | before | after 14.2.0     |
| -------- | ------ | ---------------- |
| total    | 18     | 14               |
| critical | 1      | **1 — survives** |

It clears `firebase-admin` itself plus `@google-cloud/firestore`,
`@grpc/grpc-js` and `google-gax`. The four survivors are all transitive under
`firebase-admin@14.2.0`, the newest that exists, so they are upstream's to fix
and no bump here reaches them.

**The cost is a migration, not a version bump.** v14 removes the ENTIRE
namespaced API: `admin.firestore`, `admin.auth`, `admin.messaging`,
`admin.storage`, `admin.credential` and `admin.apps` are all `undefined`.
`index.js` + `lib/` use `admin.firestore` **115 times**, and 13 test files use
`admin.apps`. Shipped naively it throws at `index.js:27` — module load, every
function, backend down. The functions suite caught it on the first run.

**The critical advisory is not reachable.** `websocket-driver` hangs off
`@firebase/database` (Realtime Database) via `faye-websocket`. Nothing in
`functions/` uses RTDB — checked, no `admin.database()` / `getDatabase` call
sites. It is present in the dependency tree and absent from every execution
path.

**v14 requires `node >= 22`** (13.x wanted `>= 18`), so this only became
possible at all with the runtime bump above. Worth knowing if the order ever
matters again.

- [ ] Revisit when upstream clears the transitives, or if the
      namespaced → modular migration becomes wanted for its own reasons
      (`getFirestore()`, `Timestamp`, `FieldValue`, `getAuth()`,
      `getMessaging()`). It is largely mechanical and the 1156-test functions
      suite is a real safety net — but it is a single-purpose PR, not an
      advisory fix, and ~130 sites of churn to clear 4 of 18 is a bad trade on
      its own.

## Client `firebase` stays on 12.14 — the minor costs 62 kB gzip

Measured 2026-09-14 against dependabot #2085, which proposes
`firebase` ^12.14.0 -> ^12.19.0. **Do not merge it, and do not run
`check-dist-size.mjs --update` to make the gate green** — the gate is
right.

The growth is a step, not a drift, and it lands entirely on one release:

| `firebase` | `firebase-db` raw | gzip         |
| ---------- | ----------------- | ------------ |
| 12.14.0    | 392.6 kB          | **120.9 kB** |
| 12.15.0    | 610.3 kB          | **182.9 kB** |
| 12.17.0    | 583.6 kB          | 172.8 kB     |
| 12.19.0    | 584.7 kB          | 173.1 kB     |

That is **+62 kB gzip on the chunk every signed-in user downloads**, and
it is new code rather than chunk redistribution: the whole-`dist` total
moves by the same ~205 kB raw (5658.0 -> 5862.7 kB), so the manual-chunk
boundary is not the cause. The tell for WHAT arrived is the symbol count
— `Pipeline` goes from 2 occurrences to 26 across 12.14 -> 12.15, i.e.
Firestore's Pipelines API entering the `firebase/firestore` entry and
not tree-shaking out. Tropos uses none of it.

`npm audit --omit=dev` reports **0 vulnerabilities** on 12.14, so nothing
is being traded for the saving.

Revisit when either a later release tree-shakes Pipelines back out (re-run
the bisect above — it is four installs and four builds), or a Firestore
fix we actually need lands in 12.15+. Deliberately NOT pinned to
`~12.14`: that would refuse the minors carrying real fixes too.

**The size gate DOES block a Dependabot minor — this paragraph said it
did not, and everything it concluded followed from that.** Corrected
2026-09-18. `unit` is a required status check on main. Measured from the
API rather than the settings page: a squash-merge attempted while the
checks were still running was refused with `405 Repository rule
violations found / Required status check "unit" is queued.`

`check-dist-size` is the last step of `unit`, so a bundle regression
fails the required check and the merge is refused. GitHub's auto-merge
waits on every required check, not only the ones
`dependabot-auto-merge.yml` names in its own gating — so a `firebase`
minor carrying the +62 kB cannot land silently. Nothing needs excluding
from auto-merge, and no one needs to re-check `firebase` in
`package.json` after a Dependabot merge.

The shape of the error is worth keeping. Every claim was reasonable from
inside the repo — `ci.yml`'s header said `unit` "does not block
auto-merge", and two operator checklists in `docs/agents/` carried "mark
CI / unit a required status check" as outstanding. All four agreed,
which reads as corroboration and was only repetition: three of them cite
the fourth. None could see the setting, and nothing records when it was
turned on, so it may well have been in force the whole time. A repo
cannot observe its own branch protection. Treat every claim of that
shape as dated hearsay and re-verify it the same way — attempt a merge
on a PR whose checks have not finished, and read the refusal.

What IS observable is which steps sit inside the required job, and
`src/lib/__tests__/requiredCheckComposition.test.ts` pins that — move
the ratchet, the suite or lint out of `unit` and the gate is gone with
nothing else to say so. It deliberately does not pin the ruleset, which
no test here can read.

## The client SDK's `@grpc/grpc-js` is overridden to 1.14.5

Root `package.json` carries one `overrides` entry. `@firebase/firestore`
pins `@grpc/grpc-js` to `~1.9.0`, and no 1.9.x release fixes
GHSA-m9gg-hp2v-232j or GHSA-f596-whhp-79r4 (both fixed in 1.14.5). When
they were published, the `audit` job went red on every branch. grpc-js
runs only in the SDK's Node build, which here means the rules tests; the
web bundle talks to Firestore over WebChannel and ships none of it. The
override passed both rules suites and the functions suite.

- [ ] Remove the override once `@firebase/firestore` depends on a fixed
      grpc-js. Without it, `npm ls @grpc/grpc-js` shows what the SDK
      resolves.

## Race-day completion predicate (PR #1775)

Affects: `functions/lib/raceDayCompletion.js`, new `functions/lib/raceTemplateIds.js` — both reached from `dailyRaceReconciliationSweep` and `onRunCreated`. Merged 2026-07-26 from a web session that cannot view the deployed source.

**This is the highest-value deploy check in the backlog**, because the bug it fixes was silent and total: `isStrictRaceRun` compared `savedRun.actualTemplateId` against the literal `"race"`, which no document ever carries (RunSummary writes the template id, and the race ids are `5k_race` … `marathon_race`). The predicate was therefore **always false** — every completed race read as a no-show, and the post-race recovery entry never fired for anyone. Its own golden fixtures hid it by using `"race"` on the accept path and real ids on the rejects, so the rejections were honest and the acceptance was fiction. Fixing the predicate broke 14 tests, all on the accept path — the proof the whole server race path had been verified against a value production never writes.

- [ ] **Deployed-source spot-check (do this first).** In the Console (`console.cloud.google.com/functions/details/us-central1/dailyRaceReconciliationSweep/source`, then `…/onRunCreated/source`), confirm the bundle contains `require("./raceTemplateIds")` and the string `marathon_race`. This is a `.js` change so the bundle-hash dedup should not bite, but green CI is still not proof — re-run Deploy production (`deploy-production.yml`) via `workflow_dispatch` if absent.
- [ ] **A completed race now clears the no-show.** Log a race-templated run on a race-prep user's race date at ≥95% of planned distance. `onRunCreated` logs should include `recovery-entry written for {uid}`, and `programState.runPlan.phase` should flip to `"recovery"` with the race-day runDay id appended to `completedRaces[]`. Pre-fix this never happened for any user.
- [ ] **Past races are not retroactively repaired — and there is a 14-day point of no return.** Verified mechanism, not a guess: `_needsRaceNoShowEvaluation` bails on `raceDayRunDay.status !== "planned"`, so once a slot is `race_no_show` the sweep never re-evaluates it. The predicate fix therefore does NOT self-heal past races. Two windows:
  - **Within 14 days of the race** the state is recoverable by the user: PR-D locked `race_no_show` as a soft-terminal status (`LEGAL_TRANSITIONS.race_no_show: ["planned"]`), surfaced as the **Restore** action on the locked day in `DayActionSheet`. Nothing automatic clears it — the lock deliberately made recovery a user action.
  - **Past 14 days** the sweep's L4 auto-exit (`NO_SHOW_EXIT_GRACE_DAYS = 14`) returns the user to `runMode: "freeform"` and nulls `raceGoal` on both the profile and the runPlan. Restoring the runDay after that does NOT bring the race goal back — the user has to re-declare the race. So any user whose race passed >14 days before the fix deployed has silently lost their race goal.

  Decide whether to backfill. With one pre-launch user this is likely a manual repair rather than a migration, but it is a real user-visible residue of the original bug, not a deploy failure — don't read a clean sweep log as "nobody was affected".

## Race started outside the plan — the second half of the same bug

Affects: `functions/lib/raceDayCompletion.js` (`isStrictRaceRun`), reached from `dailyRaceReconciliationSweep` and `onRunCreated`. Client counterpart shipped separately in `src/lib/scheduledRunCompletion.ts`.

PR #1775 (above) fixed `isStrictRaceRun` comparing `actualTemplateId` to the literal `"race"`. It did not fix the conjunct that comparison sat in: the predicate still required the tag AND the ≥95% distance. But `actualTemplateId` is only written when the run was launched from the scheduled slot — `freeformPlanMetadata` writes `null` — so **a user who taps Start Run on the start line saves their race untemplated**, which is ordinary race-morning behaviour rather than an edge case.

For those users the post-#1775 behaviour was the pre-#1775 behaviour: no recovery entry, a `race_no_show` written by the sweep, and at `NO_SHOW_EXIT_GRACE_DAYS = 14` the L4 auto-exit strips `raceGoal` entirely. The tag and the distance are two forms of the same evidence; requiring both meant requiring the one that is absent exactly when it matters. Distance now stands alone, and the tag still carries the zero-planned branch where there is nothing to measure.

- [ ] **Deployed-source spot-check (do this first).** Console → `dailyRaceReconciliationSweep/source` and `onRunCreated/source`: `isStrictRaceRun` should read `typeof savedRun.distance !== "number"` BEFORE any `isRaceTemplateId` call, and the `isRaceTemplateId` call should sit inside the `plannedDistanceMeters <= 0` branch. `.js` change so the bundle-hash dedup shouldn't bite — verify anyway.
- [ ] **An untemplated race clears the no-show.** On a race-prep test account, log a run on the race date at ≥95% of the planned distance WITHOUT starting it from the scheduled slot. `onRunCreated` logs should include `recovery-entry written for {uid}`; `programState.runPlan.phase` flips to `"recovery"`. Pre-fix this never happened for a freeform start.
- [ ] **The distance bar is still live.** Same account, a run at ~90% of planned on race date must NOT enter recovery and must still read as a no-show — the fix removed the tag gate, not the ≥95% one.
- [ ] **Same backfill question as #1775, now wider.** That row's 14-day point of no return applies to this population too, and it is the larger one: pre-fix, only races launched from the slot were ever recognised. Any user whose race passed >14 days before this deploys has silently lost their race goal and must re-declare it. A clean sweep log is not evidence nobody was affected.

## PR-L bugfix verification (PR #815)

Affects: `functions/index.js`, `src/pages/RunSummary.tsx`. Eight verified bugs in the PR-L arc fixed; the production-impact ones below need post-deploy spot-checks because the bugs were silently-broken-not-loud.

- [ ] Real race-templated saved run on race date has the new top-level `date: "YYYY-MM-DD"` field — confirm via Firestore console
- [ ] `dailyRaceReconciliationSweep` logs no longer report false `race_no_show` for users who completed their race
- [ ] `weeklyFellBehindCheck` Monday log line shows realistic `set=N` count (pre-fix it would have been every-active-user every Monday because the runs query returned 0 docs)
- [ ] Recovery-entry path writes `phase: 'recovery'` on the first race-templated save after race date — check `programState/current` doc for the affected user
- [ ] L3 clear writes `phase: null` and `recoveryEndDate: null` (not omitted) — the user actually exits recovery
- [ ] On a BST day, `weeklyPerformanceRollup` and `dailyPerformanceRefresh` log timestamps confirm the timezone fix landed (23:15 UTC and 02:10 UTC respectively — was 22:15 / 01:10 pre-fix due to Europe/London)
- [ ] On a real workout save, `onWorkoutCreated` logs include challenge-progress increments (pre-fix this silently TypeErrored on `participantSnap.exists()` and was swallowed)

## Public profile uid binding (PR #818) — AUTOMATED 2026-08-02

Affects: `firestore.rules` (the `users/{uid}/public/{doc}` block).

This was listed as a manual "from the client SDK, attempt…" check. It is a
rules test, and the Firestore emulator runs in the agent sandbox — so it is
now eight of them in `firestore.profile.rules.test.ts`, run by
`npm run test:rules`.

The gap was real, not theoretical: the rule carries a detailed comment about
the impersonation it prevents, and **nothing executed it**. The only tests
touching `public/profile` asserted that a badgeSummary write SUCCEEDS. A
security rule no test exercises is a comment.

Mutation-checked — deleting the uid identity gate from `firestore.rules`
fails the new test.

- [x] Body `uid` naming another user is refused; owner's own uid and
      field-absent both accepted (the paired positives keep the rejection
      from passing for the wrong reason).
- [x] Another user writing your public profile is refused outright.
- [x] The other two value gates on the same document, previously untested:
      `trainingForSpaceId` closed vocabulary, and `hasOnly` so the
      cross-user-readable projection cannot silently grow a field.

## Subscription expiresAt client-side guard (PR #818) — CLOSED 2026-08-02

The row asked for a real client roundtrip "because `Date.parse` of the stored
string is locale-sensitive". **It is not, for the only format ever written.**
`Date.parse` is implementation-defined for arbitrary strings, but ECMA-262
mandates deterministic parsing of ISO 8601 — and the sole writer of this field
is `functions/applePurchase.js`, which stores `expiresAt.toISOString()`. A
UTC-designated ISO string denotes one absolute instant regardless of the
reader's zone.

Two tests in `subscription.test.ts` now pin the contract instead: the format
the server writes, and the verdict's independence from the reader's timezone
(checked across a full day of offset either side of UTC). If a future writer
stores something non-ISO, the format test fails and the concern becomes real
again.

Third instance this session of a runbook hazard that did not survive contact
with the code — see the `askGeminiText` prune and the
`STORAGE_XSERVICE_APPROVED` dispatch note. The pattern is worth naming: a
plausible-sounding risk gets written into the backlog, nobody checks it
against the thing that would have to exhibit it, and it keeps work manual for
months.

## Offline + share queue uid scoping (PR #820)

Affects: `src/lib/offlineQueue.ts`, `src/lib/shareComposer.ts`.

- [x] Two-account device test — automated end-to-end by
      `e2e/offlineQueueIsolation.auth.spec.ts` against the real emulator rig:
      A logs while offline (queue entry tagged `uid: <A>`), signs out while
      still offline via the app's own Sign Out (queue survives), B signs in
      on the same context, B's flush pass leaves A's entry queued and
      `users/A/logs` empty, then A returns and the flush lands the exact
      queued docId with `_offlineCreatedAt` (flush-only provenance) and
      empties the queue. Two findings recorded in the spec header: (1) no
      WORKOUT surface routes through the offline queue — programme completion
      is a `writeBatch` (offline it rides the Firestore SDK's own
      pending-mutation queue + session draft) and `useWorkouts.saveWorkout`
      is a pinned orphan — so the vehicle is the Food page's daily-log write
      (`saveLog` → `safeMerge`), the one queue-routed UI journey; the
      uid-isolation contract is collection-agnostic. (2) "Offline" is driven
      by overriding `navigator.onLine` — the app's own gate on both enqueue
      and flush — because Playwright's `context.setOffline` permanently
      wedges the Firestore SDK's WebChannel WRITE stream in the emulator rig
      (Listen recovers, Write never re-establishes). Real airplane-mode
      remains a device check, but the queue contract itself is pinned here.
- [x] Same flow for the share composer queue (`tropos.share.queue`) —
      drain-side automated in the same spec: pending shares seeded for BOTH
      accounts (the exact `PendingShare` shape `enqueueShare` writes), B's
      drain posts B's share while keeping A's queued with zero A-authored
      `activities` docs, A's return posts A's share and empties the queue.
      The ENQUEUE half is driven for real too, via the run-save journey
      (RunSummary hydrates from router state — no GPS rig needed): still
      offline, A saves a synthetic run, answers the finish screen's
      one-time share question, and the pre-gated offline branch queues
      the post, with the finish screen's "Will share … when you're back
      online" line asserted. That path only became reachable with the #1887 fix (same
      PR): every `enqueueShare` site used to sit behind an awaited
      Firestore write that parks offline (never rejects) — the saves are
      now pre-gated on `navigator.onLine` and proceed on the durable
      IndexedDB commit, which also un-hangs offline run/workout saving
      itself. Residue: a real-device airplane-mode pass of the run-save
      journey, plus one behavior the spec deliberately tolerates — each
      offline remount of /food re-queues the same date-keyed daily-log
      merge write (duplicates converge on one doc; queue counts inflate
      until flush).
- [x] Legacy pre-deploy items dropped on first read — covered by
      `offlineQueue.test.ts` ("drops legacy items missing a uid field"), which
      seeds one untagged and one tagged entry and asserts the untagged one is
      filtered out of both the global and per-uid counts. This was never a
      device check; the migration is a pure filter in `getQueue`.
- [x] Release-note line — PAID. `CHANGELOG.md` `[Unreleased]` now carries
      "Offline changes queued by an older version are discarded when you
      update" with the sync-before-updating guidance; fold it into the next
      versioned entry (and the App Store "What's New") at release time. The
      behaviour itself is intended and pinned by `offlineQueue.test.ts`
      ("drops legacy items missing a uid field").

## RevenueCat server side — webhook and sync-on-purchase (IAP slice 3 backend)

Affects: `functions/revenueCat.js` (`revenueCatWebhook`,
`syncRevenueCatEntitlement`), `functions/lib/revenueCatEntitlement.js`. The
client half shipped in #1454 and called a webhook and a callable that did
not exist. It stays a no-op until the RevenueCat key is set, so nobody was
charged against the missing server.

**Merge only after both secrets exist.** A deploy that binds an
unprovisioned secret fails, and it fails the whole functions deploy, not
just these two:

```bash
firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
firebase functions:secrets:set REVENUECAT_REST_KEY
```

How it decides: every webhook event and every sync re-reads the subscriber
from RevenueCat's REST API (`GET /v1/subscribers/{uid}`) and writes what it
says; the event body grants nothing. An older snapshot never overwrites a
newer one (`revenueCat.syncedAtMs`). A lapsed entitlement takes away only
Pro that RevenueCat granted: Pro from Stripe, the legacy Apple path, a
lifetime purchase or a hand grant is left alone. Billing grace keeps Pro
until the grace period ends.

**Sandbox purchases grant Pro only to the uids in `REVENUECAT_SANDBOX_UIDS`**
(the owner's account and App Review's demo login). A sandbox purchase
(TestFlight, StoreKit testing) costs nothing, and anyone with a test build
can attach one to any App User ID, so the legacy Apple path refuses them in
production and this one lists who may use them. For anyone else a sandbox
purchase counts as no entitlement: it grants nothing, it takes away only Pro
that RevenueCat granted (as a lapse does), and the function logs
`revenueCat.sandbox_refused` with the uid. An unset or empty list grants
sandbox Pro to nobody. Production purchases are unaffected.

- [x] **Secrets provisioned, then merge.** Both stored and #2496 merged,
      2026-09-29.
- [x] **The functions can read both secrets.** The first deploy failed on
      the accessor grant (see the Cloud Functions deploy gotchas). Tick this
      when a Deploy production run on or after #2496 logs a successful
      create operation for both `revenueCatWebhook` and
      `syncRevenueCatEntitlement`. Done 2026-09-30, once the owner granted
      the role on `REVENUECAT_WEBHOOK_AUTH`: run 36695765626 (the #2539
      merge) created both.
- [x] **Webhook answers.** RevenueCat → Integrations → the webhook → Send
      test event returns 200. It did on 2026-09-30.
- [ ] **`REVENUECAT_SANDBOX_UIDS` set on both functions**: your uid and App
      Review's demo account uid, comma-separated. It is a plain setting,
      set the way `ADMIN_UIDS` is: a repository variable on GitHub, which
      the functions deploy writes into `functions/.env`, then a Deploy
      production run. **App Review's demo uid must be on it before
      submission**, or the reviewer's test purchase will not unlock Pro.
      Confirm it in the Cloud console. Steps:
      `docs/iap/revenuecat-setup.md` Part C.
- [x] **Webhook configured** in RevenueCat → Integrations → Webhooks: URL
      `https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/revenueCatWebhook`,
      Authorization header = the secret, bare or as `Bearer <secret>`. The
      dashboard's test event gets a 200. Configured for both production
      and sandbox, all apps and all events; 200 on 2026-09-30.
- [x] **Deploy verification.** The functions deploy log reports a
      successful create operation for both functions. Run 36695765626.
- [ ] **Sandbox purchase on a listed account.** `users/{uid}` shows
      `subscriptionTier: "pro"`, `subscriptionSource: "ios_iap"`, a future
      `subscriptionExpiresAt` and a `revenueCat` map, and an AI scan works
      as soon as the purchase sheet closes.
- [ ] **Sandbox purchase on an account not on the list.** The purchase
      sheet completes but the user stays free: `revenueCat.entitlementActive`
      is `false`, and the function log has `revenueCat.sandbox_refused` with
      that uid.
- [ ] **Sandbox expiry.** On the listed account, let the sandbox
      subscription lapse (a sandbox month is a few minutes): the user reads
      as free again.
- [ ] **Not built, decide later.** Account deletion leaves the RevenueCat
      subscriber record (purchase history keyed by the uid) in place, and a
      RevenueCat promotional grant does not grant Pro. Comps are written in
      Firestore directly.

## Purchases on iPad, iPhone-only, the paywall's prices (2026-10-04)

Affects: `src/lib/purchaseProvider.ts` (`isNativeIOS` reads the native
shell, not the user agent), `ios/App/App.xcodeproj/project.pbxproj`
(`TARGETED_DEVICE_FAMILY = 1`), `ios/App/App/Info.plist` (no iPad
orientation list), `src/lib/proPlans.ts`, `src/hooks/useProPlanPrices.ts`,
`src/pages/Upgrade.tsx`, `src/components/ProModal.tsx`,
`src/components/TrialTimeline.tsx`, `src/components/paywall/`.

Unit tests pin the routing with an iPad's desktop user agent, every price
line, and the currency arithmetic against a simulated storefront. What no
test reaches is a real iPad, a real storefront and App Store Connect.

- [ ] **An iPad running the TestFlight build.** It opens as an iPhone app.
      The paywall shows "Already purchased? Restore" and "Manage or cancel
      in your Apple Account subscriptions"; Start opens Apple's purchase
      sheet, never Stripe; once subscribed, Manage subscription (Settings →
      Subscription) opens Apple's subscriptions page.
- [ ] **A storefront not in pounds** (a US sandbox account). The offer's
      lead line, the plan cards, the per-week figures, the "Save N%" on the
      yearly card, the CTA, the line under it and the timeline's Day 7 are
      all in dollars, and nothing on either beat or in ProModal shows £.
      The prices match Apple's purchase sheet.
- [ ] **The trial copy against Apple's sheet.** The paywall decides whether
      to show the trial from the account's `hasUsedTrial`; Apple grants the
      introductory offer per Apple Account. On a sandbox account that has
      already used the intro offer, check what the sheet says against the
      paywall's "7 days free, then …". If they disagree, the paywall needs
      RevenueCat's intro-eligibility check (not built).
- [ ] **App Store Connect after the first iPhone-only upload**: the build
      lists iPhone only, and the version page asks for iPhone screenshots
      only. Nothing has been released with iPad support, which is the only
      time dropping it is allowed.

## Apple subscription uniqueness binding (PR #822)

Affects: `functions/applePurchase.js`, new `appleSubscriptions/{originalTransactionId}` collection.

- [ ] First real iOS purchase post-deploy — confirm a new `appleSubscriptions/<originalTransactionId>` doc is created with `uid` matching the purchaser, plus `productId` and `expiresAt`.
- [ ] Restore-purchase flow on the same Apple ID under the same Tropos account — confirm the lookup doc updates in-place (timestamp changes, uid stays).
- [ ] Negative test: attempt to call `restoreApplePurchases` from a second test account using the first user's `originalTransactionId` (intercept via debug). Expect the function to throw `"different account"` and no user-doc write to land.

## Stripe webhook transactional dedup (PR #822)

Affects: `functions/index.js` `stripeWebhook` handler, `stripeEvents/{event.id}` doc shape.

- [ ] Post-deploy, on the next real Stripe webhook delivery, confirm the `stripeEvents/<event.id>` doc has a `claimedAt` field (new) AND a `processedAt` field (existing). Pre-fix only `processedAt` was set.
- [ ] If a webhook handler crashes mid-process (force via stripe-cli test event), confirm the `stripeEvents/<event.id>` doc is DELETED so Stripe's retry can re-attempt. Pre-fix the partial claim would persist and the retry would silently skip.

## Blocking is now server-enforced (kudos + comments)

Affects: `functions/index.js` (`toggleKudosCallable`, `addCommentCallable`),
new `functions/lib/blockGuard.js`. Deploys via `deploy-functions.yml`.

Blocking was CLIENT-side suppression only — `blocks/{blocker}/users/{target}`
was written and read by the client and nothing in `functions/` or
`firestore.rules` consulted it. A blocked user could still kudos and comment;
the callable wrote the counter, sub-doc AND notification, and the recipient's
app then hid the feed row while the tray row and push had already landed. The
guard refuses in BOTH directions and fails CLOSED on a read error.

- [ ] **Deployed-source spot-check (do first).** Console →
      `toggleKudosCallable` and `addCommentCallable` source contains
      `require("./lib/blockGuard")`.
- [ ] **A blocked user is refused.** With two test accounts: A blocks B, then
      B kudos A's activity. Expect `permission-denied` client-side, NO kudos
      counter change, and NO tray row for A. Repeat for a comment.
- [ ] **Ordinary interaction is unaffected.** Two accounts with no block
      between them: kudos and comment still work. This is the regression to
      watch — a guard that refused everything would look identical in the logs
      to one that works.
- [ ] **Every other surface is covered by a backstop inside
      `createNotification`** — space post likes/comments, follows and circle
      events all pass through it, so a blocked notification is skipped
      wherever it originates. The underlying write (the like itself) still
      lands for those surfaces; only the notification is suppressed. Spot-check
      one: with A blocking B, have B like A's space post — the like counts, A
      gets NO tray row and NO push.

## Deload offered on discipline-specific load (single-discipline weeks)

Affects: `functions/lib/perfScoring.js`, `functions/performanceEngine.js`,
`src/lib/performanceEngine.ts`. Deploys via `deploy-functions.yml`. New
persisted field `performance/{date}.deloadIndex`.

A week with only ONE discipline capped the composite PI at 68 (recomp) / 58
(lean bulk), and every deload trigger gates at 80+ — so a marathon peak-block
athlete could never be offered a deload, by construction. The deload question
is now asked against `deloadIndex`, which takes the load half from the
discipline actually trained when exactly one was. The DISPLAYED PI is
deliberately unchanged.

- [ ] **Deployed-source spot-check (do first).** Console →
      `weeklyPerformanceRollup` source contains `deloadLoadScore` and
      `priorDeloadIndex`.
- [ ] **New docs carry the field.** After the next rollup, a perf doc has
      `deloadIndex`. For a both-disciplines week it must EQUAL
      `performanceIndex`; only a single-discipline week may differ.
- [ ] **No new nag.** The sustained trigger compares against the prior two
      weeks' `deloadIndex`, falling back to `performanceIndex` on legacy docs.
      Watch a single-discipline user for 2-3 weeks: a deload should be offered
      on the transition, NOT every week. (The #1955 nag-loop defect, on the
      other trigger, is the failure mode to watch for.)

## Adherence scored against the learned calorie target

Affects: `functions/performanceEngine.js`, new
`functions/lib/calorieTargetResolution.js`. Deploys via
`deploy-functions.yml`.

The adherence factor scored `profile.targetCalories`, which for a Pro user on
an engaged adaptive-TDEE target is not the number the app shows — the learned
value lives in `adaptiveCapState.lastApplied` and `targetCalories`
deliberately never moves (the estimator reads it as its own anchor). The step
cap is 150 kcal per 7-day window with no cumulative bound, so the two drift
apart indefinitely; a compliant Pro cutter four windows in scored 45.5 on the
calorie factor instead of 100. The server now resolves the target through the
same precedence the client uses.

- [ ] **Deployed-source spot-check (do first).** Console →
      `weeklyPerformanceRollup` and `dailyPerformanceRefresh` source contains
      `require("./lib/calorieTargetResolution")`. A `.js` change, so the
      bundle-hash dedup should not bite — verify anyway (CI-green is
      necessary-not-sufficient).
- [ ] **A Pro user on a learned target scores against it.** Spot-check a user
      whose `adaptiveCapState.lastAppliedAt` is real (not the epoch anchor)
      and whose `lastApplied` differs from `targetCalories` by >10%: after the
      next rollup their `adherenceScore` should reflect intake measured
      against `lastApplied`. Pre-fix, eating the displayed target read as a
      miss.
- [ ] **Free and manual-override users are unchanged.** The overwhelming
      majority. A free user (or one with `customCalorieTarget` set) must still
      score against `targetCalories` even when a stale `adaptiveCapState`
      survives on their profile from a lapsed Pro period.
- [ ] **Residue, not yet fixed:** `targetProtein` is still the stored
      bodyweight figure. It agrees with the adaptive split except when the
      learned target moves DOWN far enough to trigger the protein cap — a
      narrower case than the calorie gap, and left rather than half-mirroring
      the macro splitter into `functions/`.

## Partner-streak server persist (SOCIAL S3 Soc7, PR5a)

Affects: `functions/index.js` (`onWorkoutCreated` / `onRunCreated` now call `applyPartnerActivity`), new `functions/lib/partnerStreakEngine.js` + `functions/lib/partnerStreakPersist.js`. Deploys via `deploy-functions.yml`. The server is now the SOLE writer of `partnerBonds` streak state.

- [ ] **Deployed-source spot-check (do first).** In the Console (`console.cloud.google.com/functions/details/us-central1/onWorkoutCreated/source` and `…/onRunCreated/source`), confirm the deployed bundle contains `applyPartnerActivity` and the `require("./lib/partnerStreakPersist")`. CI-green is necessary-not-sufficient (the dedup/bundle-hash gotcha) — though this is a `.js` change so dedup shouldn't bite, verify anyway.
- [ ] **First real shared day counts.** With two test accounts that mutually follow + have a bond, log a workout (or run) as A, then as B on the same local day. Confirm the `partnerBonds/<id>` doc flips `streak: 0 → 1` and `lastSharedDay` to today, and `onWorkoutCreated`/`onRunCreated` logs show no `applyPartnerActivity: error`.
- [ ] **Same-day re-log is a no-op write.** Log a SECOND workout as A on the same day; confirm the bond doc's `updateTime` does NOT change (the engine's MAX-idempotency + the changed-guard skip the write).
- [ ] **Ineligible run doesn't count.** Save an `isInvalid` / `savedAnyway` / sub-threshold run; confirm the bond's `lastActive` does NOT update (gated on the same eligibility predicate as challenges).
- [x] **Freeze ledger uses Monday weeks** — covered, by composition rather
      than by one test, which is why it did not look covered. Three links,
      each pinned: `engineMirror.test.ts` asserts Monday-anchoring against a
      LITERAL (`weekKey("2026-06-14") === "2026-06-08"`, Sunday → prior
      Monday), so a Sunday regression is loud; `streakEngine.test.ts` asserts
      the consumed freeze stores `weekKey`'s output; and
      `partnerStreakPersist.js` never references a week function at all — it
      passes `next.freezeWeek` straight through, so there is no site at which
      the Sunday `getWeekKey` could substitute itself.
      Worth noting the near-miss: `streakEngine.test.ts` computes its expected
      value by calling `weekKey`, so on its own it pins nothing about Monday.
      The literal pin in the mirror test is what makes the chain real.

## Social context arc — coach prompts + space engagement (2026-07-26, PRs #1776-#1793)

Affects: `functions/lib/coachPrompts.js` + `weeklyCoachPrompts` (scheduled Mon 06:00 UTC), `functions/lib/spacePostEngagement.js` + three callables (`toggleSpacePostLikeCallable`, `addSpacePostCommentCallable`, `deleteSpacePostCommentCallable`), firestore.rules (space likes/comments read blocks, public-profile `trainingForSpaceId` value gate). Eighteen PRs shipped in one day from a design-panel roadmap (Runna's context-over-graph model); client behaviour is test-pinned, but the server half needs the standard deploy proofs.

**STATUS 2026-09-27 — the weekly coach posts are retired (owner call: a
question every Monday read as low-effort engagement; a space carries its
members' posts). `weeklyCoachPrompts` and `lib/coachPrompts.js` are
deleted, and the deploy's `--force` prunes the function. The posts it
already wrote stay in Firestore; clients hide them (`isMemberFacing`), and
the like and comment callables still never notify their author. The two
coach rows below are superseded — replace them with:**

- [x] **The prune landed.** The first functions deploy after the
      retirement logs `Successful delete operation` for
      `weeklyCoachPrompts`, and no coach post dated after it exists.
      Confirmed from the deploy log: run 36310769458 deleted it at
      10:00 UTC on 2026-09-27. It was the only writer of coach posts, so
      none can be dated after that.
- [ ] **Old coach posts are gone from new builds.** Open a space that had
      them, and Feed → My communities: no "Tropos Coach" post, no Coach
      badge. An older build still shows them until it updates.
- [ ] **The reworked Space page on a device.** Join and Joined read on
      every cover photo and on a space without one; Leave asks first; an
      empty space's "Share your last session" opens the composer with that
      session attached.
- [ ] ~~**Deployed-source spot-check (do first).** Console → `weeklyCoachPrompts` source contains `require("./lib/coachPrompts")`; `toggleSpacePostLikeCallable` source contains `spacePostEngagement`.~~ Superseded; the `spacePostEngagement` half still applies.
- [ ] ~~**First Monday firing (04:00-07:00 UTC window).**~~ Superseded: the job no longer exists.
- [ ] **Like round-trip on device.** Tap the flame on a space post → fills coral + count bumps instantly; kill the app, reopen → state persisted (server txn landed). Re-tap → count returns. A second account liking YOUR post lands a coral `space_post_like` tray row that deep-links to the space.
- [ ] **Comment round-trip on device.** Comment on another account's post → author gets the `space_post_comment` tray row → tapping it opens the space. Delete your own comment → count decrements. (A comment on a retired COACH post, reachable only from an older build, must still produce NO notification.)
- [ ] **Race identity opt-in.** With a race goal set, the bound race space shows the "Show on your profile" toggle (and ONLY there — other race spaces must not). Toggle on → your profile shows "Training for {race} · N wks" in coral, linking to the space. Toggle off → chip gone. After race day passes, the chip must disappear ON ITS OWN (display gate) even if the toggle was left on.
- [ ] **Communities feed source.** Feed → source sheet → "My communities": joined-space posts newest-first under space-name eyebrows; empty states are the join prompt (no spaces) or the quiet-week line (spaces joined, nothing posted) — never a blank column. Pull-to-refresh refetches this stream while active.
- [ ] **Rules deploys landed.** Firebase Console → Firestore Rules contains `match /likes/{likeUid}`, `match /comments/{commentId}` (both read-only), and the `trainingForSpaceId` value gate on the public profile. Three rules deploys shipped today — verify the LAST one is live.

## A removed post leaves every feed (`onActivityDeleted`, 2026-09-28)

Affects: `functions/index.js` (`onActivityDeleted`, new, and
`onActivityCreated`'s re-read after its fan-out),
`functions/lib/socialFanout.js` (`removeActivityFromFeeds`),
`firestore.indexes.json` (a collection-group index on `items.activityId`),
`src/lib/socialApi.ts` and `src/hooks/useSocialFeed.ts`.

Undo on the finish screen (Soc11) and deleting a shared session removed
only `activities/{id}`. The copies in `feeds/{uid}/items` stayed, and since
the activities read rule refuses a post that is gone, one such copy failed
the whole Following page for the author and every follower. The trigger
now deletes the copies; the client leaves out a copy whose post it cannot
read, so the feed loads, and draws nothing for it.

- [x] **Deployed-source spot-check (do first).** `onActivityDeleted` is in
      the Console's function list, and `onActivityCreated`'s deployed
      source contains `removeActivityFromFeeds`. Closed from the deploy
      log of run 36610165567 (#2515's merge, 2026-09-29): the bundle
      carried the `// CI build: 04300f9a…` marker, and the log shows a
      successful create operation for `onActivityDeleted` and a successful
      update operation for `onActivityCreated`.
- [x] **The index is built.** Firestore → Indexes → Single field:
      `items` · `activityId`, collection group, ascending, Enabled. Until
      it is, the trigger's query fails, it logs `onActivityDeleted.error`,
      and the copies stay (the client still hides them). Closed from the
      same run: the readiness step waited on the `items/fields/activityId`
      indexes, the collection-group one included, then logged
      `Verified: all configured indexes READY`.
- [ ] **Undo on a device, with a follower.** Share a session from one
      account and tap Undo on the finish screen. On a second account that
      follows it, Following loads and the post is not there, and the
      `feeds/<follower>/items/<activityId>` document is gone.
- [ ] **Copies from before this deploy stay.** Posts undone or deleted
      before the trigger existed left their copies. Nothing draws them,
      and the unread badge counts one only if it is newer than the last
      time Social was opened. Delete them by hand if they matter.

## The share answer lives on the account (Soc11, 2026-09-28)

Affects: `src/lib/shareDefaults.ts` (new), `src/lib/auth.tsx`
(`updateShareDefaults`, and the move of a device's own answers),
`SessionShareRow`, `ShareDefaultsRow`, `ShareComposerSheet`,
`firestore.rules` (`shareDefaultsValid`), `functions/profileSanitizer.js`.

The answer to "Share sessions automatically?" was kept in each device's
local storage, so Never set on the web left a phone that had answered
Share publicly posting publicly. It is now `shareDefaults` on
`users/{uid}`, and a device's own answers move to the account once at
sign-in, the more private answer winning.

- [x] **Rules first.** A build that writes `shareDefaults` needs the rules
      that allow it. Deploy production releases rules before Hosting, but a
      TestFlight build made from a branch before the merge sees its saves
      refused (put back, with a toast) and keeps its answers on the device.
      Released by run 36610165567 (2026-09-29); the live ruleset matched
      `firestore.rules` by SHA-256.
- [ ] **One answer on every device.** Set Runs to Never in Settings on the
      web, then finish a run on a phone that had the app open since before:
      nothing is posted, and the finish screen offers its one-off share
      button instead.
- [ ] **A phone's old answer moves.** On a phone that answered on an older
      build, open the app online after updating: Settings on the web shows
      that answer, or the account's own where it was more private.

## Global hybrid challenge + hybrid_score sync (SOCIAL S4 Soc8, PR2)

Affects: `functions/lib/challengeDefs.js` (new `global-monthly-*` hybrid definition), `functions/index.js` (`onWorkoutCreated` / `onRunCreated` now sync `hybrid_score`). Deploys via `deploy-functions.yml`. The daily `rolloverChallenges` cron materialises the new challenge doc; the trigger sync feeds it.

- [ ] **Deployed-source spot-check (do first).** In the Console (`…/onRunCreated/source`), confirm the bundle contains `"hybrid_score"` in a `syncChallengeProgress` call. Per the dedup gotcha — `.js` change, dedup shouldn't bite, but verify.
- [ ] **Rollover materialises it.** After the next 00:05 UTC `rolloverChallenges`, confirm `challenges/global-monthly-<YYYY-MM-01>` exists with `metric: "hybrid_score"`, `participantCount: 0`.
- [ ] **Hybrid accrues from BOTH disciplines.** Join the global challenge, log a run (≥threshold) and a workout with volume; confirm the participant `currentValue` increases by ≈`km×100` (run) + `kg×0.1` (workout). Two separate sessions → two increments (different `applied/<sourceId>` markers).
- [ ] **Autumn Push revival (Sep–Nov only).** The seasonal `hybrid_score` challenge that previously never progressed should now accrue identically — spot-check during its window.

## Solo-first Social feed (SOCIAL S4 Soc8, PR3)

**STATUS 2026-10-01 — retired by the owner (the Social pass below).**
`SoloFirstFeed` and `PartnerStreakHero` are deleted: a new person sees
Explore's posts. `solo-feed.screens.capture.spec.ts` became
`new-user-feed.screens.capture.spec.ts`. The rows below are history.

Affects: `src/pages/Social.tsx` (renders `SoloFirstFeed` for cold-start users), new `src/components/social/SoloFirstFeed.tsx` + `src/features/partnerStreak/PartnerStreakHero.tsx`. The state 100% of launch users see — must look DESIGNED, not gated.

- [x] **Light + dark capture of the solo state.** Re-read 2026-08-08 against the current surface and filmed (`solo-feed.screens.capture.spec.ts`, fresh signup-form account = 0 follows): the CURRENT stack is PartnerStreak hero → challenge slot → Spaces-for-you rail → Share-your-training → spaces empty-state hexagon (the original row's "Crews unlock…" row died with crews, #1700). Asserted before shooting: no "Your feed is empty" copy, and the cold-start Share card shows NO create button. Both frames eyeballed.
- [x] **Challenge slot before rollover.** Covered by the same capture, structurally: the rig's emulator has no challenge docs at all (no rollover cron runs there), and the slot collapses cleanly — no broken/empty card between the hero and the share card, both frames.
- [x] **Sub-tab default interaction.** Automated in the same spec's second test: switching the feed source to Following keeps the solo stack leading (the 0-follow gate outranks the source selection) and never shows "Your feed is empty".
- [x] **Share cold-start vs preloaded.** Both halves automated: the cold-start assertion above, and the preloaded half via a REST-seeded workout — after reload the card offers "Create a share card" and the composer opens preloaded (filmed: 3×8×60 kg renders as 1.4t total volume). The stat labels are invariant uppercase by design ("1 EXERCISES" is the stat-label convention, not a plural bug).

## The Social pass (owner, 2026-10-01)

Affects: `FeedView.tsx`, `Social.tsx`, `UserProfile.tsx`,
`useUserProfileData`, `useFollowState`, `FollowButton`, `InlineFollow`,
`PeopleToFollowRow`, `SpacesDirectory` + `RaceFilterChips`,
`CirclesSection`, `WeeklyReview.tsx`, `useSpacesDirectory`,
`useSuggestedPeople`, `CommentSheet`, `NotificationsSheet`.

The feed opens on posts (the recap card, Spaces row and points card left
the top: "Share your week" is on the weekly recap's first card, Spaces
lead Together, the points card sits under the third post). Someone who
follows nobody sees Explore's posts under one line, not the solo-first
stack. Posts from people you don't follow carry Follow, and a People to
follow row sits after the second post while you follow fewer than three.
Profiles show this week's shared sessions, badge art and the feed's own
cards. Together filters races with chips, and Circles is one short card
whose goal choices open from Start a circle. Two bugs went with it:
"Suggested people" re-read the database in a loop for as long as People
was open (since #2311, 2026-09-14), and a profile with no document spun
forever. A third surfaced on the way: the profile asked for public and
followers-only posts in one query, which the rules refuse for a
non-follower, so every profile opened from Explore said it had nothing
shared (pinned by the "profile:" cases in `firestore.rules.test.ts`).

- [ ] **People on a phone:** open it and watch "Suggested people" finish
      loading. It never did in production after 14 September.
- [ ] **A profile you don't follow** shows its public sessions; follow
      them and reopen it: followers-only sessions appear too.
- [ ] **Follow from a post** on Explore: the link turns to "Following",
      the line over the feed counts the follow, and the person's other
      posts lose their Follow link at the same moment.
- [ ] **Race chips:** the country sheet, the distance chips, and "Clear
      filters" from no matches.
- [ ] **Share your week** from the recap's first card exports a card with
      last week's numbers.
- [ ] **Comments with no signal:** open a post's comments in airplane
      mode. It says "Couldn't load comments" with Try again, never "No
      comments yet" (which it also used to show while comments loaded).

## The Settings pass (owner, 2026-10-01)

Affects: `SettingsIndex.tsx`, `settings/SettingsList.tsx` (new),
`settings/SettingsData.tsx` (new, `/settings/data`),
`UnitsAppearanceSection`, `AccountSection`, `SecuritySection`,
`DataExportSection`, `ShareDefaultsRow`, `SettingsProfile` +
`ProfileInfoSection`, `ProgrammeSettings` (`variant="overview"`),
`ActivityNotificationsGroup` (new), `functions/lib/notificationPreferences.js`
(new), `createNotification`, `onFollowerCreated` (new), `firestore.rules`
(`notificationPreferencesValid`).

The list is three groups under your photo. Programme is a short page (the
setup, where each part is set, the reset), and Lift plan and Run plan left
the list: Programme and Train open them. Exports and recently deleted meals
moved to Your data, and Delete account is red text at the foot of Account,
as Set1 locked it. Notifications gained the switch per kind S3 locked in
June: props, comments, circles and spaces on, new followers off. The server
reads them, so a kind that is off is never written. New followers had no
sender at all ("follow" was an allowed type nothing wrote), so
`onFollowerCreated` is new, and it writes only for someone who turned the
switch on. Profile shows weight and height in the chosen units; it showed
kg and cm whatever was chosen.

- [x] **Rules before the client.** The switches write
      `notificationPreferences`, which the rules must allow. Deploy
      production releases rules before Hosting, but a TestFlight build made
      from the branch before the merge is refused on every switch ("Couldn't
      save your settings"). Released by run 36916879108 (2026-10-01): the
      live ruleset matched `firestore.rules` by SHA-256 at 19:49 UTC, nine
      minutes before Hosting deployed.
- [x] **Deploy verification.** The functions deploy log shows a successful
      create operation for `onFollowerCreated`. The gate itself lives in
      `lib/socialFanout.js`, so the callables and triggers that send
      notifications show update operations in the same run. Closed from the
      deploy log of run 36916879108 (#2550's merge): the bundle carried the
      `// CI build: af48ad95…` marker, the log shows a successful create
      operation for `onFollowerCreated`, and successful update operations for
      the senders (`toggleKudosCallable`, `addCommentCallable`, the two
      space-post callables, `onGoalSpaceEventCreated`).
- [ ] **A switch stops its kind.** With two accounts: A turns Props off and
      B gives one of A's posts props; nothing new under A's bell. A turns it
      back on and B gives props on another post; it arrives.
- [ ] **New followers.** A turns New followers on and B follows A: "B
      started following you" under A's bell, in one row however often B
      unfollows and follows again. With the switch off (the default),
      nothing.
- [ ] **Pounds and feet on Profile.** With lb and ft chosen, Profile shows
      the weight in pounds and the height in feet and inches. Change both
      and check the calorie target moves as it does for a kg edit.

## The onboarding pass (owner, 2026-10-01)

Affects: `Login.tsx` (a welcome screen on a first visit), `Onboarding.tsx`
(the plan in the open, an optional goal weight, the start weight kept),
`BodyInputs`, `bodyMetrics.ts`, `Home.tsx` with `StackedCTACards` (the first
workout on a rest day, a run for a free runner), `VerifyEmailBanner` (new),
`App.tsx` (no verify wall), `auth.tsx` (the link sent at sign-up), `Upgrade.tsx`
("Your plan is ready" after onboarding), `SettingsAccount`,
`lifecycleAnalytics` (`auth_screen_viewed`, `email_verified`,
`onboarding_abandoned`), and on the server `completeOnboarding` (no verified-
email check) and `profileSanitizer.js` (keeps "unspecified").

Five bugs went with it. Google and Apple photos were erased from the public
profile by onboarding's last write. Heights of 100-119 and 231-250 cm passed
on the phone and failed the save as "Check your connection". "Prefer not to
say" was dropped by the server. The review showed cm to a feet-and-inches
user. The plan's start weight was overwritten.

- [ ] **Functions before the client.** `completeOnboarding` must drop its
      verified-email check before a build without the verify screen reaches
      anyone, or an unverified email account cannot finish setup. Deploy
      production releases Functions before Hosting; a TestFlight build made
      from the branch before the merge is the case to avoid.
- [ ] **Deploy verification.** The functions deploy log shows a successful
      update operation for `completeOnboarding`.
- [ ] **An email sign-up on a phone:** no wall before the questions, the
      link arrives during onboarding, and after tapping it in Mail and
      coming back, Home's "Verify your email" notice has gone.
- [ ] **The first screen:** a fresh install opens on the welcome screen;
      after signing out, the same phone opens on Sign in.
- [ ] **A Google sign-up's photo** is still on their profile, seen from a
      second account, after onboarding.
- [ ] **Lose fat with a goal weight:** the plan's target is below
      maintenance, and Settings → Nutrition shows the goal and pace.
- [ ] **The funnel in GA4 DebugView:** `auth_screen_viewed` for the welcome
      screen and each form, `email_verified` after tapping the link, and
      `onboarding_abandoned` after signing out of an unfinished setup.

## Backlog audit 2026-08-02 — what a skeptical pass found

Ran the remaining rows against the code rather than re-reading them, on the
theory that produced three corrections earlier the same day (the
`askGeminiText` prune, the `STORAGE_XSERVICE_APPROVED` dispatch note, and
`Date.parse` locale sensitivity). Four outcomes worth recording, because two
of them are "the row was right" and that is the part a re-audit would
otherwise redo.

**Two rows were already satisfied and are now ticked** — the offline-queue
legacy drop and the partner-streak Monday freeze ledger, both above. Neither
was ever a device check. The Monday one is the more interesting: it is held by
a COMPOSITION of three tests, none of which says "Monday freeze ledger", so it
reads as uncovered until you follow the chain. A grep for the item's own words
finds nothing.

**One row survived the scepticism, which is worth stating explicitly.** The
storage deletion write-freeze (below) asks for verification on a non-production
project. `storage.rules.test.ts` DOES contain the whole matrix — active
statuses × four prefixes, tombstone, and the negative case — but those 12 tests
**self-skip in the agent sandbox**, because cross-service Firestore reads are
not available to the Storage emulator here. The suite reports "17 passed | 12
skipped" and exits 0, with a `console.warn` naming the reason. So the row is
correct as written, the coverage exists for the day the environment supports
it, and the skip is honest rather than silent. Do not "close" it by pointing at
the test file.

**A near-miss worth internalising.** `streakEngine.test.ts` asserts
`freezeWeek.alice === weekKey(...)` — computing the expectation with the same
function under test, so on its own it pins nothing about Monday. It is saved by
a separate literal pin in the mirror test. That is the same shape as the
`moveRunDay` refusal tests (which asserted only "no document write" after the
writer stopped writing documents) and PR #1775's accept-path fixture: an
assertion that looks like a check and is actually a tautology. When a test's
expected value is computed by the code path it is testing, it is pinning
consistency, not behaviour.

## Storage deletion write-freeze — cross-service approval + first deploy (packet 11, operator-in-loop)

**STATUS 2026-09-27 — the freeze is live, and nothing shows the permission
it depends on was ever granted.** The gate opened on 2026-09-15: the
re-run of Deploy production run 34976838538 was the first release of the
freeze (`uploading rules storage.rules`, 14:22 UTC), and every backend
release since reads the live ruleset back and matches it to
`storage.rules` by SHA-256. That release came from CI, not from an owner's machine as step 1
says, and firebase-tools checks and grants the cross-service role only in
an interactive session (`checkStorageRulesIamPermissions` in its
`rulesDeploy.js` returns early otherwise). So it granted nothing, and no
earlier `storage.rules` read Firestore, so no earlier deploy did either.
If the role is missing, every photo upload and delete is refused —
progress photos, the profile photo, Space post photos — while reads still
work. Step 1 cannot fix it now: with the rules already live, `firebase
deploy --only storage` skips the upload, and the permission check only
runs on the upload path.

**STATUS 2026-09-28 — the role is in place; no grant is needed.** Deploy
production run 36443298145 (the #2495 merge) ran the new check, `Confirm
Storage rules can read Firestore`, before it released the rules, and the
check passed. It reads the live IAM policy, and it passes only when the
Storage service agent holds `roles/firebaserules.firestoreServiceAgent`
unconditionally, so photo uploads and deletes work. Nothing records when
or how the role was granted. Every backend release repeats the check.

- [x] **Confirm the role, or grant it.** Confirmed 2026-09-28 by the
      release check (STATUS above). The steps stay for the day a release
      stops at that check again. Quickest check: change the
      profile photo in the production app — the toast "Upload not
      permitted…" means the role is missing. Or, in GCP Console → IAM
      with "Include Google-provided role grants" ticked, look for
      `service-<project-number>@gcp-sa-firebasestorage.iam.gserviceaccount.com`
      holding **Firebase Rules Firestore Service Agent**. To grant it:

      ```bash
      gcloud projects add-iam-policy-binding adaptive-fitness-af8bb \
        --member="serviceAccount:service-$(gcloud projects describe adaptive-fitness-af8bb --format='value(projectNumber)')@gcp-sa-firebasestorage.iam.gserviceaccount.com" \
        --role="roles/firebaserules.firestoreServiceAgent"
      ```

- [x] **A release now stops instead of shipping this again.** The Storage
      deploy runs `scripts/verify_storage_rules_iam.py` before it releases
      rules that read Firestore, and fails the release if the Storage
      service agent lacks the role, or if the deploy identity cannot read
      the project's IAM policy. Unconfirmed counts as a failure, as it
      does for the source read-back. When the policy can't be read, the
      job summary says why and what to do, and names a role only when
      Google answered 403: read access to IAM policies for the deploy
      service account (for example `roles/iam.securityReviewer`). It gives
      the command that enables the Cloud Resource Manager API when that is
      off, says to re-run after a network failure or a busy or failing
      Google API, and points at the deploy credentials when the token is
      missing or rejected. Until the role is in place, every backend release
      stops at this step, and Hosting and Pages wait with it. To confirm
      a grant without waiting for a release, run Actions → Verify Active
      Production Rules, which runs the same check. Where it runs is
      pinned by `storageDeployIamCheck.test.ts`; what it decides by
      `scripts/test_verify_storage_rules_iam.py`.

Affects: `storage.rules` (the account-deletion write freeze), `.github/workflows/deploy-storage.yml`. Code is landed and tested; **it is deliberately NOT deployed yet** — the deploy job is gated so nothing reaches production until the operator does the two steps below.

Why gated: `storage.rules` now reads Firestore (`accountDeletionRequests` / `deletedAccounts`) to freeze photo uploads/deletes during and after an account deletion — the same freeze Firestore already enforces. That **cross-service** read requires a one-time interactive approval in the Firebase Console. If the rule deploys **before** that approval exists, the predicate errors → denies → **all photo uploads are blocked app-wide**. The `deploy-storage.yml` `deploy` job therefore stays skipped until the operator opts in.

Rollout sequence (operator, not agent) — do these in order, ideally after packet 10's Functions deploy:

- [ ] ~~**Grant cross-service access.** Run `firebase deploy --only storage --project adaptive-fitness-af8bb` **from a project-owner machine** and approve the Firebase prompt that lets Storage Rules read Firestore. (This first deploy is intentionally a human action — do not try to route the approval through the CI service account.)~~ Superseded by the STATUS above: CI released the rules first, so this command no longer prompts.
- [ ] **Verify the freeze on a NON-production project first:** seed an `accountDeletionRequests/<uid>` doc with `status: "running"` (or a `deletedAccounts/<uid>` tombstone) and confirm an owner upload/delete to `progress-photos/<uid>/…` is denied, while reads still succeed and a user with no deletion record can still upload.
- [x] **(Optional) re-enable CI auto-deploy** — set 2026-09-15, between the first attempt of run 34976838538 (deploy skipped) and its re-run (deployed). For future storage.rules changes: set the repo variable `STORAGE_XSERVICE_APPROVED=true` (GitHub → Settings → Secrets and variables → Actions → Variables). Until then the ONLY way to ship a storage-rules change is the manual `firebase deploy` above — **re-running Deploy production (`workflow_dispatch`) does not work as an escape hatch here**, unlike for functions. The `deploy` job's `if: vars.STORAGE_XSERVICE_APPROVED == 'true'` is evaluated for dispatch runs too, so a manual re-run skips the deploy and still reports green. (This doc line claimed the opposite until 2026-07-26; an operator following it in an incident would have believed the rules shipped when nothing had.) The `report-not-deployed` job now fails on any gated run so the skip is legible instead of silent.
- [x] Spot-check the deployed rule in the Firebase Console (Storage → Rules) contains `isDeletionWriteFrozen`. Automated: each backend release's `Verify active Storage Rules source` step matches the live ruleset to `storage.rules`, which carries it.

## App Check enforcement rollout — operator-in-loop

Affects: every callable in `functions/`. NOT a code change — a Firebase Console + monitoring exercise.

Client-side App Check is already initialised via `src/lib/appCheck.ts` (reCAPTCHA v3 on web, no-op on native until the Capacitor plugin lands). Server-side enforcement is OFF. Flipping enforcement without first verifying token flow would lock out web users whose reCAPTCHA fetch fails and break all native traffic.

Rollout sequence (operator, not agent):

- [ ] Verify `VITE_RECAPTCHA_V3_SITE_KEY` is set in the Vite prod env AND the matching site key is registered in **Firebase Console → App Check → Apps**. Without this the web client never initialises App Check and the APIs tab shows 0% verified.
- [ ] Wait 24–48h post-deploy for telemetry to populate.
- [ ] Open **Firebase Console → App Check → APIs tab → Cloud Functions for Firebase**. Look for "Verified requests %". Target: ≥99% sustained for ≥7 days before any per-callable flip.
- [ ] If verified % is low and the cause isn't obvious, query Cloud Logging: `resource.type="cloud_function" jsonPayload.appCheck.status=("MISSING" OR "INVALID")` to see exactly which callables would reject and which uids are missing tokens. Usual culprits: ad-blockers killing reCAPTCHA (rare, swallowed) or native iOS (all `MISSING` until the Capacitor App Check plugin is wired).
- [ ] Flip enforcement per-callable in `functions/index.js` by adding `.runWith({ enforceAppCheck: true })`. Start with low-risk endpoints that the client **actually calls** — `sendTestPush`, `backfillMyActivityCategories`. (This line named `askGeminiText` until 2026-07-26; it had no client caller, so flipping it would have produced no telemetry and no rejection signal. It has since been retired. `docs/app-check-rollout.md` carries the full tier table and the traffic check.) Keep destructive ones (`deleteMyAccount`, `verifyApplePurchase`) until last. Don't bulk-flip.

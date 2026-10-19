# TestFlight script — what's left before 1.0

Made on 17 October 2026 from a full triage of `docs/qa/pre-launch-backlog.md`.
That file is still the record: tick its row when a step here passes. Of its 225
open checks, 61 were already proven by tests, deploy logs or later work, or no
longer apply. They are ticked there now, each with its evidence. What's left is
below, in the order to do it.

Each step says what to do and what you should see. If you see something else,
note the step and what happened. That's a bug report.

## 1. Before the first build (consoles, about an hour)

These need a person signed in to a console. Most unblock later steps.

1. **Turn on Google Cloud Vision.** Google Cloud console → project
   `adaptive-fitness-af8bb` → APIs & Services → Enable APIs → "Cloud Vision
   API" → Enable. _Until this is on, every Space photo post and profile photo
   is refused_, because the nudity screen calls it. You should see "API Enabled".
   _(Owner reports this done, 17 October. It can't be checked from outside the
   console; confirm by setting a profile photo in Settings → Profile, which
   should save.)_
2. **Let the iPhone app use the Firebase key.** Google Cloud console → project
   `adaptive-fitness-af8bb` → APIs & Services → Credentials → the API key
   starting `AIzaSyB-` → Website restrictions → Add `capacitor://localhost/*`,
   then `https://troposfit.com/*` and `https://www.troposfit.com/*` → Save.
   _Until this is done, sign-in most likely fails in the app_: on 17 October
   the key refused sign-in requests from `capacitor://localhost` and from
   troposfit.com ("Requests from referer … are blocked") and allowed only the
   web.app, firebaseapp.com, GitHub Pages and localhost addresses. Afterwards,
   signing in on https://troposfit.com should work, and so should step 9 on
   the phone.
3. **Set the server's settings as GitHub variables.** GitHub → the repo →
   Settings → Secrets and variables → Actions → **Variables**. Add:
   - `ADMIN_UIDS`: your account's uid. This opens the moderation queue to you.
   - `MODERATION_ALERT_EMAIL`: where report alerts go.
   - `RESEND_FROM`: `Tropos <no-reply@troposfit.com>`. First check Resend →
     Domains shows troposfit.com as Verified.
   - `REVENUECAT_SANDBOX_UIDS`: your uid and the App Review demo account's uid.
   - the rest listed in `docs/LAUNCH_TODO.md` §19.

   Then Actions → **Deploy production** → Run workflow. Its "Write
   functions/.env" step should list those names. Today's deploy logged none of
   them set.

4. **Check Vertex AI keeps no copy of food photos.** Google Cloud console →
   Vertex AI: request-response logging for the Gemini model in us-central1 is
   off. The Privacy Policy (section 7) says Google keeps nothing.
5. **Let Apple's private relay reach Hide My Email users.** Apple Developer →
   Certificates, Identifiers & Profiles → Services → Sign in with Apple for
   Email Communication: register `troposfit.com` and `send.troposfit.com`.

## 2. The first build

6. **Run "Deploy iOS to TestFlight" once.** Add the five secrets from
   `docs/ios-release.md`, then GitHub → Actions → Deploy iOS to TestFlight → Run
   workflow. It has never run, and every phone step below needs its build. You
   should see the run go green and the build appear in TestFlight. Run it a
   second time: Apple Developer → Certificates should show one Apple
   Distribution certificate, not two.
7. **No tracking warnings.** After the upload, App Store Connect's build page
   and Apple's email should show no ITMS-91053 warning and no request for
   NSUserTrackingUsageDescription.

> **Purchases need a second step.** The CI build leaves out
> `VITE_REVENUECAT_IOS_KEY` on purpose, so it can't sell Pro until RevenueCat
> is fully set up (`docs/iap/revenuecat-setup.md`, issue #1097). The purchase
> steps in section 4 need a build made after that.

## 3. Launch blockers on the phone

Do these on the first TestFlight build. Each one, if it fails, means a broken
core flow, an App Review rejection, or wrong data.

8. **Screens clear the notch.** Open a workout and its finish screen, Social's
   people search, the food camera, run setup, the countdown and live map, the
   run summary, and the Privacy, Terms and Support pages. Each top row (close
   and back buttons, titles) should sit fully below the clock and Dynamic
   Island.
9. **Email sign-up.** Sign up with a fresh email address you can open on the
   phone. Setup should start straight away. The verification email should
   arrive while you answer. Tap its link in Mail, switch back, and Home's
   "Verify your email" notice should be gone.
10. **The AI question.** On a Pro or trial account that has never been asked,
    open Food and take a meal photo. "Send food to Google for analysis?" should
    appear over the scanner. Tap Allow, and that photo is analysed. On a second
    fresh account, tap Not now, and the photo tabs should say "AI analysis is off".
11. **Food scan and typed meal.** On a Pro account that said yes, scan a plate,
    then type "2 eggs and toast". Each should return foods and macros within a
    few seconds. If you see "AI service error", note the time; the server log
    has the reason.
12. **A crowded plate.** Photograph a plate with six or more foods (a full
    English). Every component should be listed with calories. The model
    changed on 13 October and its reply now shares a length cap with its own
    reasoning, so a long answer could be cut off.
13. **Offline food.** Turn on Airplane Mode, open Food → camera, tap the
    shutter. It should say you're offline, with "Type it instead". Type "2 eggs
    and toast" and save. Turn Airplane Mode off and reopen the app: the meal
    should still be there, once.
14. **Meal photos stay on the phone.** Scan a meal, then check the Files app
    and Photos: the picture should be in neither. In Settings → [your name] →
    iCloud → Manage Storage → Backups → this iPhone, Tropos's size should not
    grow by the photo.
15. **The week turns over in the background.** Open Train on Sunday evening and
    leave the app in the background. On Monday morning, open it again. Train
    should show the new week with nothing ticked, and Home should match.
16. **Locked-phone run.** Start a run outdoors, lock the phone and run 1–2 km,
    then unlock and finish. The route should have no straight-line jump across
    the locked stretch, and that split's pace should look right. With audio
    cues on, listen too: the kilometre cue should be spoken while the phone is
    locked. Cues use the web view's speech, and the app's only background mode
    is location, so silence here is the thing to report.
17. **Auto-pause.** With auto-pause on, stand still for a minute at a
    crossing. The time should stop and the distance shouldn't creep. Then tap
    Pause while auto-paused, and resume: no time should be counted twice.
18. **Report and block on a small phone.** On an SE-size phone, open a post's
    comments and tap ⋯ on someone else's comment. The options should open
    inside the sheet. Report's form should scroll to Submit, and Block should
    remove their comments.
19. **The sheet above the keyboard.** Social → Start a circle → tap the name
    field. The sheet's button should sit just above the keyboard. Close the
    keyboard and the sheet should drop back with no gap.
20. **Report alert email** (after step 3). From a second account, report a
    comment with a note. Within a minute, an email "New report: …" should reach
    the moderation address, with a link that opens the moderation queue.

21. **Race times on the keypad** (fixed in #2870). In Settings → Your running
    fitness → Finish time, type a 5K time with the keypad that opens, such as
    "22.30". It should save as 22:30. Do the same for the run plan's Goal time.

### Purchases (on a build with the RevenueCat key)

22. **Sandbox purchase.** Signed in as an account on the sandbox list, with a
    sandbox Apple ID: Pro → Start → complete Apple's sheet, then take a food
    photo. The scan should work straight away.
23. **Trial on the Upgrade page.** With a fresh sandbox Apple ID, start the free
    trial. The Pro card should show "Free trial until …", the last day to
    cancel, and "Remind me before the trial ends".
24. **Prices in dollars.** Sign into a US sandbox Apple ID, then open Pro and
    the Pro sheet. Every price should be in $, with no £ anywhere, and match
    Apple's sheet.
25. **Trial only for those who can have it.** With a sandbox ID that has used
    the intro offer, no "7 days free" should appear. A fresh ID should see it.
    Both should match Apple's sheet.
26. **iPad.** On an iPad, the app should run in an iPhone-sized window. The Pro
    page should show Restore and "Manage or cancel in your Apple Account
    subscriptions", and Start should open Apple's sheet, never a web page.

## 4. App Store Connect, before submitting

27. **App Review notes:** the moderation paragraph should match
    `docs/app-store/listing.md` line 284 ("…restricting the account so it can't
    post, comment or follow anyone").
28. **App Privacy:** enter each data type from
    `ios/App/App/PrivacyInfo.xcprivacy` as linked to the user and not used for
    tracking. The published label should mark nothing "Used to Track You".
29. **Links:** set the Support URL to https://troposfit.com/support, and the
    privacy policy URL and the description's footer links to /privacy and
    /terms. Each should open from the listing preview.

## 5. The rest on the phone

Not launch blockers. Worth one pass on the TestFlight build, a section at a time.

### The plan moves on with the day while the app stays open

- [ ] On an iPhone with a running-only race plan, leave the app on Home and in the background from Sunday to Monday. On reopening, Home's run card and week strip should show the new week's runs without visiting Train.
- [ ] Use a race-prep account with a Saturday race and an unfinished lift that week. Leave the app in the background from Wednesday to Thursday. On Thursday that session should show as skipped under the 'Race week' banner ('No lifting in the two days before your race…').

### The polish round on a phone

- [ ] On an iPhone, start a workout and tick a working set. Nothing above the set table should move, and the rest card should rise above 'Complete set' and the home indicator with its ring sweeping smoothly. Tick a set that is a new best and the gold card should appear above the rest card.
- [ ] On an iPhone, tick a set: the box should pop and the check draw once. Go back to an earlier exercise and the tick should not replay. Turn on Settings → Accessibility → Reduce Motion and repeat: nothing should animate.
- [ ] On an iPhone, finish a workout that earns a new best or a badge. On the finish screen, Done should stay pinned above the home indicator while the page scrolls under it. With VoiceOver on, saving should put focus on Done.
- [ ] On an iPhone, open Food on a day with a scanned meal. That row should show a small photo of the meal and the other rows their meal tile. Swipe the photo row to delete it and it should fold away smoothly.
- [ ] Force-quit the app, turn on Low Data Mode or a weak signal, reopen, and go straight to Analytics. The grey placeholder should have the page's shape, and nothing should jump as the score and range card load. Repeat with a larger text size.

### The run screen in the training-engine pass

- [ ] On an iPhone with audio cues on, start a planned tempo run. There should be no pace alert during the warm-up. The pace bar should appear only during tempo blocks, and pace alerts should speak only inside a block.
- [ ] On an iPhone, start a planned interval session. The pace bar and alerts should appear only during the fast reps, never in the recoveries.
- [ ] On an iPhone, start a planned Easy 40. The screen should count down from 40:00 and say 'Easy running for 40 minutes. Keep it conversational.' At 40 minutes it should mark the target and keep running without saving by itself.
- [ ] On an account with no running benchmark, open a planned tempo. The launch card should say 'Comfortably hard' where a pace would be. During the run there should be no pace bar and no spoken pace alert.
- [ ] On a new runner's account with a race, start the week's run-walk and lock the phone. Each run and walk should be announced on time ('Run 1 of 8. 1 minute, easy enough to talk.') for the whole 29 minutes. There should be no pace alerts, and the summary should not mention pace.

### After race day, the race's own ending

- [ ] Use a test account whose race passed with no run logged. From day 4 after the race, the Run tab should show the no-show banner and not 'All runs done this week'. After day 14, Train should show free running.

### Setup's recent race

- [ ] On an iPhone, during setup's optional recent 5K/10K question, tap the minutes and seconds boxes. A number pad should appear, and the time you type should show on the review screen.

### A restriction stops what reaches other people

- [ ] With two test accounts, report the second from the first. Then, as an admin, tap Restrict user on /admin/moderation. On the second account, without signing out: posting, commenting, props, likes, reactions, Follow, joining a Space, challenge or Circle, a Circle check-in and a partner streak should each say 'Your account is restricted'. Unfollowing, removing props and leaving should still work.
- [ ] On /admin/moderation → Restricted accounts, tap Lift for the second account. Within a minute, without signing out, everything on that account should work again. The report in the Firebase console should show restrictionLiftedBy.

### The lifting system, Lift4

- [ ] In the iOS app, at normal text size and again at the largest: open the rules sheet from the ⓘ next to Train's week label and from 'Why this session'. Then use an exercise's menu: Swap for today and Skip. On Finish, answer the keep-the-swap question. Also check 'Ease back in' after two weeks away, and setup's 'What do you have?' screen. Nothing should be cut off or overlap.
- [ ] Use an account with a real race plan. From two days before the race, any unfinished lift session that week should show as skipped. Train's banner should read 'No lifting in the two days before your race, or on the day, so your legs are fresh for it.'

### Privacy and consent for App Review

- [ ] Record a short run that crosses one of your privacy zones. Turn on Airplane mode once the finish screen has loaded, then tap Save: it saves. On another run, turn on Airplane mode before you tap Finish: the banner says the privacy zones couldn't be checked. Turn Airplane mode off and tap Retry: the run saves once, and its map shows the zone cut out.
- [ ] On a fresh install, open the food scanner, use a share card's Save Image, and start your first run. Each permission prompt (camera, add to Photos, location) should show the new wording from Info.plist.

### Credits, weather, push and exports for the App Store

- [ ] In both light and dark theme, open a live run, a saved run, the finish screen and the route planner. The map draws each time. The OpenFreeMap credit shows and shrinks to an (i) after 5 seconds; tapping (i) shows it again, and its links open outside the app. On the live run the credit sits top-right, clear of the GPS pill and the sheet. On a saved run it sits bottom-left, clear of Replay.
- [ ] On the iPhone app, open Settings > Your data > Export workouts. The share sheet opens. Save to Files, open the .csv in Numbers, and the 'Workouts exported' toast shows. Closing the sheet shows nothing. Export GPX on the run finish screen and on a saved run opens the sheet with a .gpx file.

### Photos other people see are screened for nudity

- [ ] After Vision is enabled, post a Space photo of yourself in gym kit and set it as your profile photo. Both appear, with no 'couldn't check' or refusal message.

### iOS 15.4 is the minimum

- [ ] On an iPhone 6s, 7 or first-generation SE running iOS 15.8, install the TestFlight build and open it. The app is styled, not plain black-on-white text.

### Phone platform layer: taps, field zoom, status bar

- [ ] On the iPhone app, tap the search field in Train > add exercise, a field in Settings > Profile, and a comment box. The page does not zoom in, and nothing has shifted after the keyboard closes.
- [ ] Tap a food row, a Home card and a Settings row. None of them flashes grey.
- [ ] Long-press a tab in the bottom bar: no link preview pops up and the label is not selected. Long-press a post's text: the text gets selected.
- [ ] Open Settings > Units & appearance and pick Light: the clock and battery turn dark. Pick Dark: they turn light. Switch back to Light, force-quit and reopen: the launch splash is dark with light status text, and the text turns dark when the light page appears.
- [ ] Swipe a food row left to delete. The row moves sideways and the page does not scroll up or down with it.

### Text follows the phone's text size on iPhone

- [ ] On the iPhone open Settings → Display & Brightness → Text Size, drag to the largest standard size, go back to Tropos: text is about a third bigger and Home, the feed and Food show nothing cut off or overlapping.
- [ ] Settings → Accessibility → Display & Text Size → Larger Text, turn it on and drag to the far right, return to Tropos: the app is twice its normal size and no bigger.
- [ ] Set Text Size back to the middle (default): Tropos returns to normal size. Then drag it smaller: Tropos stays at normal size, not smaller.
- [ ] At the largest standard size and again at the largest accessibility size, scroll Home, Train, History, Food and Settings and note anything cut off or overlapping (Train's day names and segmented labels ending in '…' on a small phone are expected).
- [ ] With Larger Text at its largest, start a workout and log one set, then start a run and run a minute: the 'Previous' figures sit under the set ('Last 80 × 8'), the tick, set badge and run buttons stay normal size, and a missing map says 'Map unavailable'.
- [ ] With Larger Text at its largest, create a new account through every setup step to the Pro plans: answer cards drop their pictures rather than cut words, Continue sits above Back when they don't fit, each plan price is whole, and page titles still look like titles.

### The first-visit guide

- [ ] On the iPhone sign up a new account, finish setup and tap Continue with Free: Home dims around the first card, the logo lifts into the card; each Next moves the light and the card fades in beside the next stop; the third stop scrolls to the Food card; Done scrolls back up and the logo returns to the header.
- [ ] On an iPhone SE (or a mini with Display Zoom) run the walk on a new account: no card sits under the tab bar or the status bar, and on Food the hint sits above the food box, not over the tab bar.
- [ ] Turn VoiceOver on and run the walk on a new account: at each stop VoiceOver reads the stop's title and text, and focus starts on Next and stays on it.
- [ ] Turn on Settings → Accessibility → Motion → Reduce Motion and run the walk: the logo does not fly, the cards just fade.
- [ ] On an account that already answered 'Count your steps' (either way), force-quit and reopen Tropos, then switch to another tab and back to Home: the steps prompt never appears, even for a moment.

### Run recording: pauses, each fix's own time, smoothed climb

- [ ] With auto-pause off, during a run stand still for 20 seconds, then finish: the finish screen's route quality says 'good', not 'poor'.
- [ ] Run a route with a climb you know (e.g. from Strava or a map): the summary's climb is close to it; a flat run shows only a few metres.
- [ ] After a steady-pace run, look at the route on the finish screen: it is mostly amber; any surge, hill or walk shows as one green or coral stretch, not speckles.

### The new logo, icon and launch animation

- [ ] Long-press the home screen → Edit → Customize, switch between Light, Dark and Tinted: the Tropos icon shows correctly in each (no blank or white square).
- [ ] Force-quit and reopen Tropos: the purple hexagon doesn't jump or resize when the app takes over, then the chevron rises into it.
- [ ] Cold-start Tropos signed in: the big logo shrinks onto the small logo beside the date as Home appears, and only one logo is left at the end.
- [ ] With Reduce Motion on, cold-start Tropos: the chevron fades in in place, then the screen fades to Home; nothing moves or pulses.
- [ ] Set Settings → Units & appearance to Light, cold-start Tropos: the launch screen is dark, Home appears light, with no flash of white or dark in between.

### The launch animation's second pass

- [ ] On a recent iPhone cold-start Tropos: the chevron climbs from low in the hexagon in full view (never appears half-risen), and the hexagon's rounded edge stays whole while it rises.
- [ ] Cold-start Tropos several times: the rise, the gentle pulse and the flight to the header play smoothly with no hitch.
- [ ] With a poor connection (or Developer → Network Link Conditioner → 3G), cold-start Tropos: the logo pulses gently while waiting, then lands on the header without a jump.
- [ ] Signed in, cold-start Tropos: when the logo lands, today's session card and food ring are filled in, not grey placeholders; on a slow connection it waits about a second at most, then lands anyway.

### Meal photos moved to the device

- [ ] Scan a meal so its photo shows on today's Food diary row, swipe Tropos away in the app switcher, reopen it: the same row still shows the photo. Repeat once in the installed web app (Add to Home Screen) after closing it.
- [ ] With a test account that has scanned 2+ meals with photos, delete the account in Settings > Account, then sign up again on the same phone with a new account and open Food for those dates: no old photos appear. (For proof of the folder itself: Xcode > Devices > Download Container and check Library/NoCloud/food-photos/<old uid> is gone.)

### Scan failure beat + no-food prompt contract

- [ ] On a Pro account, open Food > camera > Meal, photograph a bookshelf: the scan ends in the camera saying no food was found, with Retake and Type it instead buttons, and no result card with calories.
- [ ] On a Pro account, open Food > camera > Label, photograph the nutrition panel on a food packet: calories and macros come back (not 'No food detected').
- [ ] Turn on VoiceOver, open Food > camera, double-tap the shutter: VoiceOver says it is analysing the food; when it fails (e.g. a bookshelf photo) it reads the verdict; swiping during the wait never lands on the hidden shutter or mode buttons.

### Unwired seams — half-built features that read as shipped

- [ ] Join a workouts challenge, log a workout, note the challenge's count, then open that workout (History > the session) and delete it: within a minute the challenge count is one lower.

### The exercise pictures in the build

- [ ] On the iPhone, open three exercises' form guides (e.g. squat, bench press, barbell row) and let each animation play: no blur, colour banding or blocky edges around the figure on the dark background.

### Tooltip + Coachmark primitive

- [ ] On the iPhone, open History, find Performance Index and tap its info icon so its tooltip opens, then pull the page down past the top and let it bounce: the tooltip stays attached to its icon.

### Bottom-sheet keyboard lift (#2040, #2044) — the one genuinely device-level claim

- [ ] On an Android phone, open Social > Start a circle and tap the name field: the sheet's button sits just above the keyboard and does not jump a keyboard-height too high.

### RevenueCat server side — webhook and sync-on-purchase

- [ ] Same build, signed in to a Tropos account NOT on the sandbox list. Buy Pro with a sandbox Apple ID. Pass: Apple's sheet completes but the app stays Free (no AI scan), Firestore shows revenueCat.entitlementActive false, and Cloud Logging shows 'revenueCat.sandbox_refused' with that uid.
- [ ] After the purchase on the listed account (line 1658), leave the phone alone for about 15 minutes (a sandbox month lasts a few minutes, and auto-renew stops after a few cycles; cancelling in Settings > Apple Account > Subscriptions makes it lapse sooner). Then reopen Tropos. Pass: the account reads Free again and an AI scan asks for Pro.

### Blocking is now server-enforced

- [ ] With two test accounts that have not blocked each other (web or iPhone), give props to the other account's post and leave a comment. Expect the props count to go up, the comment to appear, and the other account to get a tray row for each.

### Partner-streak server persist

- [ ] Use two test accounts that follow each other. Open the other person's profile and start a partner streak. Log a workout on account A, then one on account B the same day. Expect the partner streak card to show a 1-day streak on both profiles.

### Social context arc — coach prompts + space engagement

- [ ] On the iPhone, open three spaces with cover photos and one without. Check that the Join/Joined button is easy to read on each. Tap Leave and confirm it asks first. In an empty space, tap 'Share your last session' and check the composer opens with that session attached.
- [ ] On the iPhone, tap the flame on a space post: it should fill coral and the count go up at once. Close the app fully and reopen: still liked. Tap again: count goes back. Then like a post of yours from a second account: you should get a tray row that opens that space.
- [ ] From account B, comment on account A's space post. On A, expect a 'commented on your space post' tray row that opens the space. On B, delete the comment and check the comment count drops by one.

### A removed post leaves every feed

- [ ] Share a session from account A and tap Undo on the finish screen. On account B, which follows A, open Social → Following. Expect the feed to load normally and A's post not to appear.

### Global hybrid challenge + hybrid_score sync

- [ ] On a test account, join 'October Hybrid Hero' in Social → challenges. Log a 3 km run, then a workout. Expect progress to rise by about 300 after the run, then again by about a tenth of the workout's total kg.
- [ ] Before 30 Nov, on a test account, join Autumn Push and log a run. Expect its progress to go up by the same amount as the Hybrid Hero challenge.

### The Social pass

- [ ] On the iPhone app, open Social, then People. Within a few seconds the Suggested people list (or its empty message) should replace the loading placeholder and stay put, with no flicker or reload.
- [ ] On the iPhone, with an account that trained last week, open the Weekly review (Home > This week > review link) and tap the share icon on the first card. The iOS share sheet should open with an image showing last week's numbers, the same ones the card shows.

### The onboarding pass

- [ ] Delete Tropos from the iPhone, reinstall it from TestFlight and open it. It should open on the welcome screen ("Your training and food, planned together"). Sign in, sign out, and the app should open on "Welcome back" (Sign in).
- [ ] On the iPhone, sign up with a Google account that has a profile photo and finish setup. Then, signed in as a second account, open that person's profile: their Google photo should show, not initials.

## 6. The rest in consoles

Not launch blockers.

### The food scan's model

- [ ] After one successful scan, open Google Cloud Console → Logging and search for analyzeFood.usage. You should see a line with prompt and output token counts. Multiply them by Vertex's 3.8 Flash prices and check the cost per scan is acceptable.

### Race plans the rollover dropped end on the server

- [ ] In Google Cloud Console → Logging, filter on dailyRaceReconciliationSweep around 04:00 UTC after Oct 10. The summary line should end in orphanedGoalCleared=N. For any counted uid, Firestore users/{uid} should show runMode 'freeform' and no raceGoal.
- [ ] In the Firebase console, open the profile of a race-prep account whose race is still ahead, the day after a sweep. It should still have runMode 'race_prep' and its raceGoal.

### After race day, the race's own ending

- [ ] Set a test account's race to last week. After the next Monday's weeklyFellBehindCheck run, its users/{uid} doc in the Firebase console should have no fell-behind flag, and the phone should get no 'fell behind' recap push.
- [ ] Create a test account on a Thursday with runs on Tuesday, Thursday and Saturday, and log one. After its first Monday, its users/{uid} doc should have no fell-behind flag.

### The trial reminder

- [ ] After the first real trial starts, check that the customer's email arrives at 10:00 local time on day 4 with the right price, dates and cancel link. Their profile in the Firebase console should have subscriptionTrial.reminderEmailedAt, and the trialReminderSweep log should count it as 'emailed'.

### The lifting system, Lift4

- [ ] After opening the new build on the owner's account, open the Firebase console at users/{uid}/programState. It should show programSchemaVersion 5. Every weight should be on a real plate step (no 101 kg or 9.25 kg), miss counts should be 0, and a bodyweight lift should carry no load.

### Credits, weather, push and exports for the App Store

- [ ] Open run setup on the app with location allowed: the strip shows the weather and 'Weather data from MET Norway'. Then in Google Cloud > Logging, filter on the getCurrentWeather function. Success: no weather.failed with status 403 and no weather.met_deprecated entries.

### Photos other people see are screened for nudity

- [ ] Right after the gym-photo test, open Google Cloud > Logging, filter on screenPhoto and screenUploadedPhoto. Success: screenPhoto ran once per photo with no screenPhoto.failed, and screenUploadedPhoto ran for the same file.
- [ ] In App Store Connect > App Privacy, check that Photos is declared as linked to the user and not used for tracking. Success: no change is needed for Cloud Vision.

### iOS 15.4 is the minimum

- [ ] After the first TestFlight upload, open the build in App Store Connect. Success: Minimum OS Version reads 15.4, and the listing's compatibility line says 'Requires iOS 15.4 or later'.

### The exercise pictures in the build

- [ ] After the first TestFlight upload, open App Store Connect > Tropos > TestFlight > the build > Build Metadata > App File Sizes: the iPhone download/install size is in the tens of MB (under ~100 MB), not 300+ MB.

### Cost & margin operator setup

- [ ] Google Cloud console > Billing > Budgets & alerts > Create budget for the billing account behind adaptive-fitness-af8bb, amount £50/month, email alerts at 50/90/100%: the budget appears in the list with your email as recipient.
- [ ] After one Pro photo scan, open Google Cloud console > Logging > Logs Explorer for adaptive-fitness-af8bb, search "analyzeFood.usage": the entry shows promptTokens, outputTokens and totalTokens as numbers, not null.

### PR-L server-side reconciliation Cloud Functions

- [ ] Google Cloud console > Logging > Logs Explorer, project adaptive-fitness-af8bb, filter resource.labels.function_name="dailyRaceReconciliationSweep", last 7 days. Pass: one run a day around 04:00 UTC logging 'starting', 'evaluating N users' and 'done — noShow=X, recoveryCleared=Y', with no 'fatal error:' line.
- [ ] Google Cloud console > Logging > Logs Explorer, filter resource.labels.function_name="weeklyFellBehindCheck", last 14 days. Pass: one run each Monday around 05:00 UTC logging 'evaluating week YYYY-MM-DD (Sun..Sat)' then 'done — set=X, clear=Y', with no fatal error.

### Race-day completion predicate

- [ ] Firebase console > Firestore > users > (each real account) > programState > current > runDays. Look for any entry with status "race_no_show" for a race that was actually run. If there is one, re-declare that race in the app (Settings > Run plan) or tell the owner. If there is none, tick the row with 'nobody affected'.

### Race started outside the plan — the second half of the same bug

- [ ] Do the same Firestore check as line 1463, covering races run without starting from the plan's slot too: any runDays entry with status "race_no_show" for a race that was actually run means a lost race goal. Re-declare the race, or record 'nobody affected'.

### PR-L bugfix verification

- [ ] Google Cloud console > Cloud Scheduler, project adaptive-fitness-af8bb. Pass: the jobs for weeklyPerformanceRollup and dailyPerformanceRefresh show timezone Etc/UTC, with frequencies '15 23 \* _ 0' and '10 2 _ \* \*', and their last run times read 23:15 and 02:10 UTC.

### Purchases on iPad, iPhone-only, the paywall's prices

- [ ] App Store Connect > Tropos > TestFlight > the newest build > Build Metadata, then the version page under App Store. Pass: Device Family reads iPhone only, the version page asks only for iPhone screenshots (no iPad section), and no released version ever listed iPad.

### A removed post leaves every feed

- [ ] Optional. In Firebase Console → Firestore → feeds → <your uid> → items, delete any item whose activityId has no matching document in activities. Done when no such orphan items remain.

### Global hybrid challenge + hybrid_score sync

- [ ] In Firebase Console → Firestore → challenges, open global-monthly-2026-10-01. It should exist with metric "hybrid_score" and name 'October Hybrid Hero'.

### The onboarding pass

- [ ] In GA4 (Admin > DebugView, or Reports > Realtime), run through a fresh email sign-up on the web build with the Google Analytics Debugger extension on. Expected: auth_screen_viewed events for the welcome screen and each form, email_verified after tapping the link, and onboarding_abandoned after signing out partway through setup.

### App Check enforcement rollout — operator-in-loop

- [ ] In the Google reCAPTCHA admin console create a v3 key for adaptive-fitness-af8bb.web.app (and the custom domain). Register it in Firebase Console > App Check > Apps > web app. Add it as the GitHub repo secret VITE_RECAPTCHA_V3_SITE_KEY, then re-run Deploy production. Success: the new Hosting bundle contains the 6L… key and App Check > APIs starts showing verified web requests.
- [ ] After the site key ships and a signed TestFlight build with App Attest is installed, wait 48 hours, then open Firebase Console > App Check > APIs. Success: request counts appear for Cloud Functions and Firestore.
- [ ] Firebase Console > App Check > APIs > Cloud Functions for Firebase: read "Verified requests". Success: 99% or more, held for 7 days in a row, before any callable is flipped.
- [ ] Only if verified % is under 99%: in Google Cloud Console > Logging, run resource.type="cloud_function" jsonPayload.appCheck.status=("MISSING" OR "INVALID") over the last 7 days. Success: the callables and uids missing tokens are listed, so the cause (native build, ad-blockers, wrong domain) can be named.

## 7. Mine to check from here

No phone or console needed; I'll work through these and tick them in the backlog.

- [ ] Open Food Facts credit under a barcode result, the search results: Playwright against the emulator at a 375x667 viewport: open Food, search for a food and open its portion sheet. Pass: 'Food data from Open Food Facts' and the sheet's confirm button are both inside the viewport, with no horizontal overflow.
- [ ] Hide content on each kind. From the queue, hide a reported Space: Against the Firestore and Auth emulators: seed a Space post, a Space comment and an activity comment, each with a pending report. Call resolveReport's real handler (e2e/helpers/realCallables.ts) to hide each one, then read as a third signed-in account. Pass: all three are gone, and commentCount on t
- [ ] A Space post that trips the filter is removed: Start the Functions and Firestore emulators (firebase emulators:start --only functions,firestore,auth). Create a clean spaces/{id}/posts doc, then update its body with a word from functions/lib/objectionableText.js using the SDK directly. Pass: the doc and its likes and comments are gone within a fe
- [ ] The Terms line on sign-in and sign-up wraps cleanly: Playwright, signed out, at 320x568: open sign-in and sign-up. Pass: the 'By continuing, you agree to the Terms and Privacy Policy.' line wraps inside the screen with no overflow (or run `npx playwright test e2e/screenshots/largeText.capture.spec.ts -g sign-up --project=auth-emulator` against the emu
- [ ] The hints, each once: Train's lift tab, first set, Food's composer, run screen: Extend e2e/screenshots/guide.capture.spec.ts (localStorage tropos-guide-under-automation=on) to open /run on the same new account and run `firebase emulators:exec --only auth,firestore --project demo-tropos 'npx playwright test e2e/screenshots/guide.capture.spec.ts --project=auth-emulator'`: the fir
- [ ] The ≤1280px downscale. toStorableJpeg needs <img> + canvas: In a Playwright page (real Chromium, after `npx playwright install chromium` — the container has no browser yet) import toStorableJpeg via the Vite dev server, feed it a 4000x3000 base64 JPEG, decode the returned base64 into an Image: passing = naturalWidth 1280, naturalHeight 960 (and a 800px input
- [ ] Slow-scan escape. Tap the X during the sweep: Signed-in Playwright spec on the emulator rig with a Pro seed: route the analyzeFood request to never resolve, upload a photo in the Meal tab, click the X during the sweep. Passing = the modal is gone within 1 s (click not intercepted by the overlay), and reopening the camera shows the live viewfind
- [ ] Confirm all three URLs load signed-out in a private window: `npx playwright install chromium`, then load https://troposfit.com/privacy, /terms and /support in a fresh context (no sign-in): passing = each shows its own heading (Privacy Policy / Terms of Service / Support with support@troposfit.com) and no login screen.
- [ ] `dailyRaceReconciliationSweep` logs no longer report false `race_no_show` for users who: Add a case to functions/**tests**/integration/dailyRaceReconciliation.test.js that seeds a race_prep user whose race was 10 days ago, plus users/{uid}/runs/{id} built like runDocument (date = raceDate, distance >= 95% of planned in metres, actualTemplateId null). Then run \_runDailyRaceReconciliation
- [ ] `weeklyFellBehindCheck` Monday log line shows realistic `set=N` count (pre-fix it: Add an emulator integration test (functions/**tests**/integration/) that seeds a race_prep user with weeklyRunDaysTarget 3 and 3 app-shaped runs dated inside the prior Mon..Sun, calls \_runWeeklyFellBehindCheckForUser(uid, \_priorWeekUtcRange(monday)) and reads programState. Pass: no pendingFellBehind
- [ ] Post-deploy, on the next real Stripe webhook delivery, confirm claimedAt AND processedAt: Add a functions vitest that calls exports.stripeWebhook(req,res) with Stripe.constructEvent stubbed and a Firestore stub; send one checkout.session.completed event. Pass = stripeEvents/<id> ends with both claimedAt and processedAt, and a second delivery of the same id is skipped.
- [ ] If a webhook handler crashes mid-process, confirm stripeEvents doc is DELETED: In the same handler test, make the user lookup throw after the claim. Pass = response 500 and stripeEvents/<id> no longer exists, so a retry with the same id gets processed.
- [ ] No new nag: single-discipline user offered a deload on transition, not weekly: Add a case to deloadNagLoop.test.ts that feeds 26 run-only weeks at 3-8% growth through scorePerformance, carrying deloadIndex forward as the priors (both engines). Pass = a deload is recommended at most once per sustained block, not every week.
- [ ] Ineligible run doesn't count toward bond lastActive: Add a source-level test to functions/**tests** (the pattern performanceEngine.test.js uses) asserting that applyPartnerActivity in onRunCreated sits inside the isVolumeEligibleRun block. Pass = the test fails if the call is moved outside the gate.
- [ ] Old coach posts are gone from new builds: Add a useCommunitiesFeed hook test that seeds a joined space with a tropos-coach post and a member post through seedFirestore. Pass = only the member post is returned.
- [ ] Race identity opt-in: toggle only on bound race space; chip self-heals: Add a Space.test.tsx case (or an emulator capture) with a profile whose raceGoal.eventSpaceId is space X. Pass = 'Show on your profile' renders on X and not on another race space, and switching it on writes public/profile.trainingForSpaceId = X and shows the 'Training for' chip on the profile.
- [ ] Communities feed source: newest-first, eyebrows, empty states, pull-to-refresh: Add FeedView/useCommunitiesFeed tests: two joined spaces with posts at different times (pass = newest first); joined spaces with no posts (pass = quiet-week line, not the join prompt); and a refresh that refetches the communities stream.
- [ ] A profile you don't follow shows its public sessions; follow them: Write a throwaway \*.auth.spec.ts on the emulator rig (docs/agents/capture-rig.md). Seed account B with one public and one followers-only activity, sign in as A, open /user/<B>, follow, then reopen. Pass: before the follow only the public post shows, after it both show, and the console has no permiss
- [ ] Follow from a post on Explore: the link turns to "Following": Emulator Playwright: seed B with two public posts, sign in as A (following nobody), open Social > Explore and tap Follow on B's first post. Pass: that link reads Following, B's second post loses its Follow link without a reload, and the line over the feed counts 1 person followed.
- [ ] Comments with no signal: open a post's comments in airplane mode: Emulator Playwright: sign in, open a post that has comments and has never been opened, run context.setOffline(true), then open its comments. Pass: "Couldn't load comments" with Try again, never "No comments yet". If it shows "No comments yet", file it: getComments needs to treat a fromCache-only emp
- [ ] Lose fat with a goal weight: the plan's target is below maintenance: Emulator Playwright (onboarding capture rig): sign up, pick Lose fat, set goal weight 70 kg and 0.25 kg a week, Start my plan, then open /settings/nutrition. Pass: the daily target is below the maintenance figure the review showed, and Nutrition shows goal 70 kg at 0.25 kg a week.

## 8. Still open, not a check

Real engineering or owner items, kept in the backlog as they are.

- Who the "trader" is. Before the UK rules start in: This is a legal question for a qualified adviser: who is the trader under the UK subscription rules when Apple sells as commissionaire. No test or console can answer it. Its deadline is January 2027, not 1.0.
- No tracking framework in the binary: otool -L on the built app: The owner has no Mac, and deploy-ios.yml has no otool step (grep finds none) and uploads no artifact. As things stand, nothing can run this check.
- The six panels are not one scene (dips station drifts): Still live: public/form-frames/dips/1-6.webp unchanged since 3c8793f3 (2026-09-04), and src/lib/formArtwork.ts:235 still serves them as existing('dips') with status 'existing-needs-review'. Fix is regenerating the art (owner/art pipeline), not a device or console check.
- Sanity-check the depicted form against a coach's eye: Needs a human expert review, not a device. Dips art is still the 2026-09 'existing-needs-review' set (formArtwork.ts:235); the other 151 sets went through docs/exercise-art/releases review records, dips did not.
- When #2866 builds the website, confirm no web surface but its checkout reaches Stripe: Conditional on future work (#2866 open). Nothing to verify until that website exists.
- Revisit when upstream clears the transitives, or if the namespaced → modular migration: Still deferred on purpose: functions/package.json pins firebase-admin ^13.10.0, and the 2026-10-03 STATUS clears the moderate advisories with a uuid override instead. It is an engineering follow-up with no device or console step and does not block launch.
- Remove the override once `@firebase/firestore` depends on a fixed grpc-js: Still needed: node_modules/@firebase/firestore/package.json (4.15.0, under firebase 12.14.0) still asks for '@grpc/grpc-js': '~1.9.0', and `npm ls @grpc/grpc-js` shows '1.14.5 overridden'. Root package.json overrides still carries it. Revisit when the client firebase upgrade happens.
- Not built, decide later. Account deletion leaves the RevenueCat subscriber record (purchase history: Still not built: no account-deletion module calls RevenueCat; only accountDeletionMinimisation.js names 'revenuecat' as a provider value. This is an owner decision with a privacy angle: a pseudonymous purchase history keyed by uid is left at a processor, and RevenueCat offers DELETE /v1/subscribers/
- Residue, not yet fixed: targetProtein is still the stored bodyweight figure: Still true on main: functions/performanceEngine.js:715 passes profile.targetProtein, and calorieTargetResolution.js has no protein logic. A known, narrow open engineering item (only when the learned target drops far enough to trigger the protein cap).
- Flip enforcement per-callable in functions/index.js by adding .runWith: A real code change, still open and gated on the metrics in lines 2203-2204. functions/index.js on main has no enforceAppCheck: true. docs/app-check-rollout.md Phase 4b carries the tier table. Note: this section's intro ("no-op on native until the Capacitor plugin lands") is stale, since PR #2212 wir

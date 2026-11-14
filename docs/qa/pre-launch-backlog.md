# Pre-launch QA backlog

**Start with `docs/qa/testflight-script.md`.** It orders what is left here into
steps, with the launch blockers first (triaged 2026-10-17). Tick the row here
when a step passes.

Moved here from CLAUDE.md, which points at this file. Sections it names
without a file ("the Cloud Functions deploy gotchas", "the Food9 lock",
"the plan-file lock rule") are in CLAUDE.md.

Manual checks deferred from work that already shipped to a feature branch. Burn down before launch — automated tests + tsc + lint cover the basics, but these need eyes on a real device or production-like environment.

## A purchase the store has, before Pro is on (2026-11-10)

A purchase that Apple's sheet finished without RevenueCat granting Pro, and
a payment Apple is holding for approval, no longer read "Purchase failed.
Try again.": the paywall shows a note and no error (`rcPurchase`'s
`pending`, `useProCheckout`'s `notice`). The unit tests feed the plugin's
answers by hand; only the sandbox shows what the plugin really sends.

- [ ] **Ask to Buy.** On a TestFlight build, signed in to a sandbox Apple
      account that has Ask to Buy on (a child in a Family Sharing group),
      start Pro. Passing: after Apple's "Ask permission" sheet the paywall
      reads "Your purchase is waiting for approval. Pro switches on once
      it's approved.", with no red error and no toast. Approve it from the
      organiser's device: Pro switches on without another tap.
- [ ] **The pending code.** In that run, Xcode's console shows the
      rejection's code. Passing: it is "20". If it is anything else, the
      paywall said "Purchase failed. Try again." above: change
      `PAYMENT_PENDING_CODE` in `src/lib/revenuecat.ts` to match.

## Setup asks for the public name (2026-11-01)

Setup no longer makes the public name from the email address: an email
account's name field on the review starts empty, and Start my plan with no
name scrolls to the field, focuses it and says "Enter a name first."
(`onboardingName.ts`, `Onboarding.tsx`). jsdom draws no layout and opens
no keyboard; only a phone shows where the field lands.

- [ ] **The field comes up above the keyboard.** On a TestFlight build,
      sign up with an email address and answer setup. On the review, tap
      Start my plan without scrolling. Passing: the page moves to the name
      field, the keyboard opens, and the field and "Enter a name first."
      are both visible above it. Type a name and tap Start my plan: Home
      opens, and from a second account Social's Search finds it by that
      name, not by the address.
- [ ] **A Google or Apple name still arrives.** Make an account with Sign
      in with Apple (sharing the name) and one with Google. Passing: the
      review's name field holds that name, and Start my plan goes straight
      on.

## A distance goal: a race entered, or on your own (Run9 STATUS 2026-11-01)

Setup and Settings → Run plan ask "A race I've entered / On my own" of a
distance goal, nothing chosen, and store it as `raceGoal.entry`; a goal
run on your own calls its last day "Your 10K", not "Race day". The answer
reaches the profile only through `configurePlan` and `completeOnboarding`,
whose sanitizer keeps it from this release's Functions deploy; the rules
gate (`raceGoalValid`) takes it from the Firestore deploy.

- [ ] **It survives the server.** After Deploy production has run the
      Functions and Firestore steps, on a TestFlight build set a 10K goal
      On my own in Settings → Run plan and save. Passing: reopening Run
      plan shows On my own still chosen (a sanitizer that dropped it would
      read back as A race I've entered), and on the goal's date the run
      tab says "Your 10K" and "Start your 10K".

## The one ask for notifications (owner, Q66, 13 November 2026)

The section below is the first-week offer this widened. Since 13 November
every account is asked, once, on the finish screen of its first saved
session with no answer on file (`ReminderOffer`), and one Remind me turns
on the training-day reminder AND the server's pushes (streak nudge, weekly
recap, badge): one iPhone permission covers both, and push had been asked
for only from a switch in Settings. Setup's reminder row and the finish
screen's evening-reminder switch are gone.

- [ ] **One prompt, both channels.** On a TestFlight build, a new account,
      save a first workout and answer the share question. Passing: Remind
      me shows the iOS permission prompt once; after Allow, Settings →
      Notifications shows training-day reminders on and Push on, and
      Diagnostics shows this device's push token registered.
- [ ] **An older account is asked too.** On an account set up before
      this build that never answered the offer, save a session. Passing:
      the offer shows once, and not again after either answer.

## A v2 account's one first-week reminder ask (XB1 call 8, 2026-10-31)

After a v2 account's first saved session in its first week, and once the
share question is answered, the finish screen offers the training-day
reminder by naming the next session ("Remind you before Pull B?", with
when it would first go off) and Not now (`FirstWeekReturnOffer`, now `ReminderOffer`). Remind
me asks the phone for notification permission and turns on the reminder
at setup's 07:30; a refusal says where to allow it. It asks nothing when
setup's reminder row already turned it on, and a v2 account is no longer
offered the streak-style evening nudge or push. The unit suite fakes the
permission; only a phone shows the system prompt and the reminder.

- [ ] **Allowed.** On a TestFlight build, make a new account (skip setup's
      reminder row), save a first workout and answer the share question.
      Passing: the offer names the next workout; Remind me shows the iOS
      permission prompt once; after Allow, Settings → Notifications has
      training-day reminders on at 07:30, the next training morning's
      notification names that workout, and the offer does not come back.
- [ ] **Denied.** As above, but tap Don't Allow. Passing: the card says
      notifications are off and where to allow them, and reminders stay
      off.
- [ ] **Asked in setup.** Make a new account with setup's reminder row on,
      then save a first workout. Passing: no reminder offer on the finish
      screen, and no steps question on Home until the app is next opened.

## Standard and pilot iOS builds (XB1 calls 4 and 5, 2026-10-31)

Affects: `ios/App/App.xcodeproj/project.pbxproj` (the Watch app is embedded
only when `WATCH_RUN_RELEASE_ENABLED` is `YES`; the Health usage text follows
the same setting), `ios/App/App/Info.plist`, `scripts/verify_ios_watch.py`,
`ios-native-compile.yml`, `deploy-ios.yml` and Settings → Apple Health.
The unit suites resolve both kinds of build from the project file and the
verifier is tested offline; only a Mac, App Store Connect and a phone show
the builds themselves.

- [ ] **The pull request compile builds both kinds.** On the first pull
      request after this, `iOS native compile` passes its two checks:
      "Check the standard build carries no Watch app" and "Check the pilot
      build embeds the Watch app". If the standard check finds
      `App.app/Watch`, Xcode did not apply `EXCLUDED_SOURCE_FILE_NAMES` to
      the embed phase; say so on the XB1 row before trying another way.
- [ ] **A standard TestFlight build has no Watch app.** Run Deploy iOS to
      TestFlight with the pilot box unchecked. Passing: the archive check
      finds `App.app` alone, the verifier reports a standard build, and on
      an iPhone paired with a Watch the Watch app's list offers no Tropos.
      Settings → Apple Health shows Steps only, and the first steps prompt
      reads "Tropos reads your step count from Health to show today's steps
      on Home."
- [ ] **A pilot build embeds it.** The same with the pilot box checked.
      Passing: the Watch app installs from the iPhone's Watch app, Settings
      → Apple Health shows Apple Watch runs and Save workouts, and the
      Health prompts name Watch heart rate and workout export.
- [ ] **The pilot's group, set once.** In App Store Connect → TestFlight,
      make an internal group for the pilot testers and set its id as the
      repository variable `TESTFLIGHT_PILOT_GROUP_ID` (docs/ios-release.md,
      "Pilot builds on TestFlight"). Turn off automatic distribution on the
      other internal groups, and set `TESTFLIGHT_STANDARD_GROUP_ID` if
      standard builds should reach a group on their own. Passing: a pilot
      run's "Check the TestFlight tester group" step names the pilot group.
- [ ] **A pilot is marked and reaches its group alone.** After a pilot run,
      the build's "What to Test" in App Store Connect and in the TestFlight
      app starts "Connected training pilot. Not for App Store release.",
      followed by the dispatch's note, and the build is listed under the
      pilot group and under no other group.
- [ ] **A standard build's note.** A standard run with a What to Test note
      shows that note in TestFlight, and with `TESTFLIGHT_STANDARD_GROUP_ID`
      set the build appears in that group.
- [ ] **Signing follows the project's targets.** On the first run, "List
      the targets to sign" names `com.tropos.app` and
      `com.tropos.app.watchkitapp`, the API key makes `Tropos CI <serial>`
      and `Tropos CI <serial> watchkitapp`, and the export's map names only
      the bundles the archive holds (no Watch profile in a standard build).
      After the Live Activity widget is added (`docs/run-live-activity.md`),
      the next run also signs `com.tropos.app.LiveActivities` with
      `Tropos CI <serial> LiveActivities` and archives without a workflow
      change, and the widget links `LiveActivitiesKit` through Swift
      Package Manager.

## Before Watch runs and Health export reach anyone (review, 2026-11-10)

A review of #3002 and #3003 found four gaps in the connected-training path.
It is closed to everyone (`CONNECTED_TRAINING_RELEASED`), so no one meets
them yet; each needs native code that only a Mac, an iPhone and a Watch can
confirm. Fix them before the first pilot build, and tick a row when a
paired-device run proves it.

- [ ] **A failed Health save can block that run's export for good.** The
      export reserves its server receipt (`attempted`) before native checks
      write access (`healthWorkoutExport.ts` around `reserveHealthWorkoutExport`,
      `HealthWorkoutStore.swift`'s `permissionRequired`). With write access
      off, or the app killed or the phone locked between the two, every
      later try finds the workout "absent" with a receipt that isn't fresh
      and throws: Settings shows a pending update forever. Fix: check
      `getWorkoutWriteAuthorization()` before reserving, and let native
      report an empty lookup with write access as verified absent, which
      may retry an `attempted` receipt. Passing: turn write access off,
      save a run, turn it on, Try again: the workout appears in Health.
      Code (2026-11-14): both halves are in; with write access native
      reports an empty lookup as a verified absence and the export writes
      once. Kit row K18 proves it.
- [ ] **Deleting a run whose workout was removed in Health gets stuck.**
      Native delete with write access and an empty lookup fails with
      `permissionRequired` while its local map still names the run
      (`HealthWorkoutStore.swift`, `delete`), so the run stays
      `pending-delete` on every foreground. Fix: with write access and no
      workout found, forget the run and report it deleted. Passing: export
      a run, delete the workout in Health, delete the run in Tropos: no
      pending update is left. Code (2026-11-14): in, as a verified absence
      the reconciler accepts. Kit row K19 proves it.
- [ ] **After sign-out and sign-in, the Watch is off for runs until
      Settings is opened.** Signing out clears the native session, which
      sets the native switch off; only Settings → Apple Health
      (`HealthSection.tsx`) turns it back on, while the Run page goes by
      the account's choice alone (`Run.tsx`, `watchEligible`), so every
      snapshot is refused natively. Fix: apply the account's choice to the
      native switch where the account is bound, not only on that page.
      Passing: sign out and in, start a run without opening Settings: the
      Watch shows it.
- [ ] **The Watch app may need the workout-processing background mode.**
      `TroposWatch/Info.plist` has no `WKBackgroundModes`, and the live
      heart rate comes from an `HKWorkoutSession` with an anchored query
      (`WatchRunModel.swift`). Apple's workout-session guide asks for the
      Workout Processing mode to keep the app running with the wrist down.
      Passing: run with the wrist down for a minute: the phone's heart rate
      keeps updating. If it stops, add `workout-processing` and check it in
      `scripts/verify_ios_watch.py`.

## A lift's rest outside the app (Mob2 call 1, 2026-10-28)

While a rest runs, the page's title counts it down ("1:23 rest", then
"Rest over") on its own clock, so a browser tab and the app switcher show
it, and the title goes back when the rest ends (`src/lib/restOutside.ts`).
A rest that ended while the app was away no longer chimes again on the way
back. On the phone the rest has a Live Activity of its own
(`src/lib/restLiveActivity.ts`): a card with the system's own countdown to
the rest's end and the next exercise, and the Dynamic Island's dumbbell
and countdown. Its native half is the widget extension the run's card
uses (`docs/run-live-activity.md`), in the project since 2026-11-10 and
built without a Mac. On iOS before 16.2 `startActivity` rejects and the
app shows nothing there; the rest-end notification is separate and works
already. The unit suites pin the title, the plugin calls and a rest made
longer replacing itself; only a phone shows the card.

- [ ] **The tab's title.** In the web app, tick a working set and switch
      to another tab. Passing: the tab reads "1:29 rest" and counts down
      while you are away, reads "Rest over" when it ends, and goes back to
      "Tropos" after End rest or the next set.
- [ ] **No second chime.** On an iPhone, tick a set, lock the phone and
      wait past the rest. Passing: the rest-end notification arrives, and
      unlocking back into the workout shows the finished ring without a
      chime or a buzz.
- [ ] **The lock screen.** On a TestFlight build with the widget
      extension (2026-11-10 or later), on iOS 16.2 or later, tick a set and
      lock the phone. Passing: the card shows "Rest" and a countdown that
      reaches 0:00 on time with the app asleep and stays there (it doesn't
      count back up), "Next:" and the exercise under it; +15 s in the app
      moves the countdown on; End rest or the next set takes the card away
      at once. After the lift, no ended rest cards are left on the Lock
      Screen.
- [ ] **A run on the lock screen.** On a build with the runner's drawing
      (Wid2, 2026-11-12 or later), start an outdoor run and lock the phone.
      Passing: a dark card with the runner drawn on the left in a coral
      light, the session's name in capitals ("EASY 30" for a planned easy
      run, "FREE RUN" for one with no plan), the distance large and the
      pace and time under it, updating while locked; the runner changes pose about every four
      seconds; Pause reads "PAUSED" and the runner dims and holds still;
      Finish or Discard takes the card away at once, leaving no blank card;
      on an iPhone with a Dynamic Island, the run's distance shows there,
      and a long press shows the runner with the distance and pace. Failing
      in a way to report: a grey photo icon where the runner should be (the
      image did not load), no card at all (ActivityKit refused the image's
      size), or a dark box with a lighter band round it. The rest of
      `docs/run-live-activity.md`'s device checklist goes with it.
- [ ] **A card a closed app left.** On the same build, swipe the app
      away during a rest, open it again and tick the next set. Passing:
      one rest card, the new one; the one left from before is gone. The
      same for a run: swipe it away while recording, open the app and
      resume the run, and one run card shows.

## A photo and a few words (Mob2 call 3, 2026-10-28)

A photo's result has "Add a detail": a line of up to 200 characters sent
with the same photo to `analyzeFood` for a second read. The server takes
it as `detail` (`functions/lib/foodPhotoDetail.js`): tidied, refused past
200 characters or when it is not text, and passed to the model as its own
part after the image, with a fixed instruction saying it is data. A
request without one is the request it was. The unit suites drive the
handler's refusal and the request's shape; only the deployed function and
a real scan show the model using it.

- [ ] **Functions deployed.** The deployed `analyzeFood` source contains
      `foodPhotoDetail.readFoodDetail` and `withFoodDetail`, read back from
      the Deploy production run that ships it.
- [ ] **A detail changes the estimate.** On a Pro account, scan a plate,
      open Add a detail, type "cooked in two tablespoons of butter" and
      tap Try again with this. Passing: the result comes back with more
      fat and calories than the first, the photo still shows, Log saves
      the new figures, and the scan counter in Settings went up by one
      for the second read. With the network off, the first result stays
      and the toast says so.

## The Monday review notification (Mob2 call 10, 2026-10-28)

A local notification at 09:00 on Monday, "Your week, reviewed", scheduled
only when a review will be waiting and has not been read, and opening
`/review` when tapped. Its switch is Settings → Notifications → Weekly
review, on unless turned off; it reaches only someone who has allowed
notifications. When the web's push and its Weekly recap switch are both
on, the server's Monday recap push says it instead. The unit suites run
the rules, the schedule and the switch against fakes; only a phone shows
the notification and its tap.

- [ ] **It comes on Monday and opens the review.** On an iPhone with
      notifications allowed and a session logged last week, open the app
      on Sunday evening and leave it. Passing: at 09:00 on Monday the
      notification reads "Your week, reviewed"; tapping it with the app
      closed opens the app on the review, not Home.
- [ ] **A read review is not announced.** Open the review on Monday
      before 09:00, then close the app. Passing: no notification at 09:00.
- [ ] **The test opens the review too.** Settings → Notifications →
      Weekly review → Send test. Passing: the test notification arrives in
      a few seconds, and tapping it opens the review.

## The GPS warms on the run setup screen (Mob2, 2026-10-28)

While the run setup screen (the tile picker or a planned run's launch
card) is open, the app asks for a one-shot fix at once and every 15
seconds, and shows the signal in the header: "Finding GPS", then "GPS
ready" or "Weak GPS". It never asks for location: on the web it waits for
location to be allowed already, and in the app the one-shot asks the
plugin with permission requests off. The unit suites drive the timing and
the gates against fakes; only a phone shows the fix time and the battery.

- [ ] **Start finds a fix waiting.** On an iPhone outdoors, open Run, wait
      for "GPS ready", then tap a tile. Passing: the acquiring rings show
      for under a couple of seconds, or not at all, before the countdown.
- [ ] **Setup asks nothing.** On a new install with location not yet
      decided, open Run. Passing: no location prompt and no signal shown
      until a tile is tapped; the prompt comes with the tap.
- [ ] **Battery and the background.** Leave the setup screen open for ten
      minutes, then lock the phone for ten. Passing: battery use in
      Settings → Battery is in line with a screen left on, and no location
      arrow shows while the phone is locked on the setup screen.

## A run asks for location, and says when it is off (2026-11-10)

On the TestFlight build a run sat on "Finding GPS" and never asked for
location. The location plugin was handed back through a promise, which a
Capacitor plugin never settles, so no watcher was added: iOS never asked,
and no refusal came back to show "Location is off for Tropos". The plugin is
now taken directly; the unit suite fakes it as the bridge makes it, and only
a phone shows the prompt.

- [ ] **The first run asks.** On a new install, open Run and tap a tile.
      Passing: iOS asks to use your location; once allowed, the rings find
      a fix and the countdown starts.
- [ ] **Location off says so.** In Settings → Tropos → Location choose
      Never, then open Run and tap a tile. Passing: "Location is off for
      Tropos" with Open settings, which opens Tropos's page in Settings, and
      a run can still be tracked without GPS.
- [ ] **Location Services off for the phone.** Turn off Settings → Privacy
      & Security → Location Services, then tap a tile. Passing: the same
      words show, not "Acquiring GPS..." with no end.
- [ ] **Location goes off when you leave without a fix.** Somewhere a fix
      is slow (deep indoors), open Run, tap a tile, and back out before
      the rings find one. Passing: the location arrow in the status bar
      goes within about 10 seconds. The one-off fixes the run screen polls
      for while acquiring now give up at their timeout, as the web's do;
      before, each waited for a fix, one more every 3 seconds.

## A pause while the run is already paused (2026-11-10)

The run timer refuses a second pause and a resume while running
(`useRunTimer`): a Pause tapped during an auto-pause added that stretch to
the duration twice, and four of the pause sites had no guard of their own.
The unit suite drives the timer; only a run shows auto-pause and the
buttons together.

- [ ] **Pause during an auto-pause.** On an iPhone, start a run and stop
      at a crossing until auto-pause shows. Tap Pause, wait ten seconds,
      tap Resume and run on. Passing: the duration does not jump, and the
      saved run's time is the moving time, with the stop counted once.

## A flat run counts no climb from its first fixes (2026-11-10)

On a phone an altitude iOS has not measured comes through as 0 with a
negative vertical accuracy, and the run keeps fixes up to 150 m, so a run
that began on Wi-Fi fixes counted the climb from 0 to the street. The
native source now reads it as no altitude, as the web's Geolocation does
(`nativeLocationSource.ts`). The unit suite feeds the plugin's shape; only
a phone gives a Wi-Fi fix. Needs a build with the location fix (#3163).

- [ ] **A run started indoors.** On an iPhone, start a run inside, walk
      out and run a flat kilometre. Passing: the summary's elevation is a
      few metres at most, not the street's height above sea level.

## The streak's days, from the flame (Mob1 call 4, 2026-10-27)

Home's flame opens a sheet: the month's logged days filled in purple,
covered days ringed, "Yesterday's rest day is covered" after one, and See
your badges. Each day carries words for a screen reader ("Monday 26
October, covered"). The unit suites read those words and the large-text
spec measures the sheet at 2× on 320 px; only a phone shows VoiceOver
reading it.

- [ ] **VoiceOver reads the month.** On an iPhone with VoiceOver on, tap
      the flame and swipe through the days. Passing: each day is read once
      as its date and logged, covered or nothing logged, today says
      today, and a day still to come is its date alone.

## A reminder asked in setup, naming the next lift (Mob1 call 3, 2026-10-27)

Setup's review has an optional "Remind me on training days" row, 07:30 by
default, previewing the first reminder ("Upper A tomorrow at 07:30"). It
asks for notification permission only when turned on, and writes
`settings/workoutReminders` only then. A lift day's reminder now names the
programme's next workout ("Upper A today"); a run day says "Time to run".
The unit suites run the permission and the schedule against fakes; only a
phone shows the system prompt and the notification itself. On the web the
reminder is a timer in the open page, and the row says so.

- [ ] **Turn it on in setup on an iPhone.** A new account, at the review:
      the row is off and nothing has been asked. Turning it on brings up
      the iOS notification prompt; Allow leaves it on with a time field.
      Passing: after Start my plan, Settings → Notifications shows
      Workouts on at the chosen time, and its Next line counts down to the
      first training day.
- [ ] **The reminder names the session.** With reminders on and the time
      a minute or two ahead on a lift day, lock the phone. Passing: the
      notification reads the next workout as Home's card names it
      ("Upper A today"); after logging that workout and reopening the app,
      the next lift day's reminder names the one after it.
- [ ] **Refusing in setup leaves it off.** Don't Allow at the prompt.
      Passing: the switch stays off with the note on where to allow
      notifications, and Settings → Notifications shows Workouts off.

## Space post notices open the post (2026-10-25)

Props and a comment on someone's Space post now open that post at
`/space/{spaceId}/post/{postId}`, with the comments showing for a comment,
instead of the Space's list. The page reads the one post, draws it with the
Space page's own card and comment sheet, and opens the Space when the post
is gone, refused, or someone else's across a block. Client only: the
callables already store both ids on the notification. The unit suites drive
the tray and the page against the Firestore fake; only two real accounts
show the round trip.

- [ ] **Open a props and a comment notice on a Space post.** On two phones
      (or a phone and the web build), A posts in a Space; B gives the post
      props and comments on it. Passing, on A: the props row opens the post,
      with the Space's name above it opening the Space and A's flame state
      as A left it; the comment row opens it with the comments showing and
      B's comment in the list, and a reply from A there raises the card's
      count. A deletes the post from its menu and lands on the Space; the
      comment row then opens the Space too.

## A routine's workout under way (2026-10-25)

A saved routine's workout left with a set done is offered on Home and
Train ("In progress · Arms · 3 sets · 12:40", Resume), and Resume opens
the routine's page carrying on without asking. It is offered only while
the routine still builds the same session, which the app learns by
following that routine's document. The unit suite covers the rules and
the page; these need a phone and a second device.

- [ ] **Resume from Home, on an iPhone.** Start a routine from Train,
      tick a set, close it. Passing: Home shows the strip with the
      routine's name, the sets done and the time; Resume opens the
      routine with the set ticked and no "Resume workout?" question;
      Train's lift tab shows the same strip at its top.
- [ ] **Deleted on another device.** With a routine's workout kept on
      phone A, delete the routine on device B. Passing: within a few
      seconds, A's Home and Train stop offering it, without reopening
      the app.
- [ ] **Offline in the gym.** In airplane mode, close a routine's workout
      with a set done and open Home. Passing: the strip shows (the
      routine was read on this phone when it was started), and Resume
      opens the workout.

## Leaving a workout says it was kept (2026-10-25)

Every way out of a workout with a set done says "Workout kept" once, as
the workout screen goes: Close, the browser's Back, Android's back button
and leaving a routine's page. The unit suite drives each of those
(`WorkoutSessionDraftRecovery.test.tsx`); the gestures only a phone has
are below.

- [ ] **The edge swipe in the iPhone app.** Capacitor's web view leaves
      back and forward swipes off, and the app does not turn them on, so
      swiping in from the left edge during a workout with a set done
      should do nothing. Passing: nothing happens; or, if the swipe does
      go back, "Workout kept" shows once and Home's In progress strip
      offers the workout.
- [ ] **The edge swipe in Safari on an iPhone.** In the web build, on
      Train with a set done, swipe back from the left edge. Passing: the
      workout closes to Train, "Workout kept · Resume it from Home or
      Train." shows once, and the day's card offers Resume. Tap Close on
      another workout instead: one toast, not two.
- [ ] **Android's back button**, once the Android app exists. Passing:
      Back during a workout with a set done closes it to Train with one
      "Workout kept", and Back on a routine's workout leaves the page with
      one too.

## A runner's welcome back (survey item 49, 2026-10-25)

Home greets a runner coming back: a free runner two weeks or more since
their last run is offered an easy run (`RunReturnSheet`), and a race plan
three weeks or more since opens the fell-behind sheet in its welcome-back
register (`run-return`, ADR-0004's amendment). The rule, the read and both
sheets are covered by unit suites against the Firestore fake; only a phone
can confirm the run starts with its voice, and only a real account with
real history can confirm the timing.

- [ ] **Free runner, on the phone.** An account whose athlete type is
      Runner or Hybrid, free running, whose last saved run is 15 or more
      days old (the emulator's seed, or a real account left alone).
      Passing: Home opens "Welcome back · It's been about 2 weeks since
      your last run" once, alone, after the launch animation. Start with
      an easy run lands on the Run page and starts Easy 20 with the GPS
      search and its voice cue, with no second Start. Back on Home, the
      sheet does not open again, then or after the app is closed and
      reopened.
- [ ] **Race plan, three weeks out.** A race-prep account, race still
      ahead, whose last run and last workout are both more than 30 days
      old: the weekly check sweeps only accounts active in the last 30
      days, so no weekly prompt is pending. Passing: Home
      opens "Welcome back · It's been a while between runs" with Rebuild
      my plan, My race moved and Not now, and no runs-of-target line;
      Rebuild re-plans with easy running first and toasts the plan's
      length; the sheet does not come back.
- [ ] **Offline.** With the phone in airplane mode, the same accounts
      open Home and see no welcome back (the absence is measured only from
      a server-confirmed read).

## A new name reaches the notifications already sent (2026-10-25)

`onPublicProfileIdentityChanged` now carries a new public name to the
notifications the person sent in the last 90 days: `fromName`, and the
sentence the tray shows, which starts with it. It reads them through a new
`items` (fromUserId, createdAt newest first) collection-group index, which
the emulator does not enforce. Notifications store no photo. A rename from
before the deploy is not carried back; those notifications expire within
90 days. The unit and emulator suites cover it; only a deploy confirms the
index and the trigger in production.

- [ ] **Rename, then read the other tray.** After Deploy production has
      shipped (the Firestore step waits for the new index to be READY), on
      account A give B props and comment on B's session, then change A's
      name in Settings → Profile. Passing, on B within a minute: the rows
      read "{new name} gave you props" and "{new name} commented on your
      activity". The log line `onPublicProfileIdentityChanged.resynced`
      counts `notification` and names no one, and Cloud Logging has no
      "requires an index" error from the function.

## Partner streaks, retired (Trim1 call 3(b), 2026-11-12)

Partner streaks are gone: the card on a mutual follow's profile, the
"Streak ready" chip on People's rows, the `startPartnerStreak` callable,
the two session triggers' streak step and the bond's rule. Two people who
train together use a Circle, which keeps no streak. The rows this file
held for partner streaks went with them. These need the release and the
Firebase console.

- [ ] **The release removes the callable and the rule.** Passing: the
      Deploy production run's Firestore and Functions stages are green,
      Firebase console → Functions no longer lists `startPartnerStreak`,
      and the deployed rules have no `partnerBonds` match.
- [ ] **Stored bonds are cleared.** After that release, from the repo
      root with operator credentials:
      `DRY_RUN=true node functions/scripts/purgePartnerBondDocs.js`, read
      the count, then run it without `DRY_RUN`. Passing: a second dry run
      reports 0 bonds, and Firestore console shows no `partnerBonds`
      collection. Once this is ticked, account deletion's own delete of a
      member's bonds (step 3b) and its inventory entry
      (`partnerBondsMember`) can go.
- [ ] **The profile and People.** On two TestFlight accounts that follow
      each other. Passing: the other's profile has no streak card, People
      has no "Streak ready" chip, and a session saved by each on the same
      day writes nothing under `partnerBonds`.
- [ ] **An older build.** A TestFlight build from before this change, on
      two accounts that follow each other. Passing: the other's profile
      shows no streak card (its read of the bond is refused), and nothing
      else on it changes.
- [ ] **Deleting a session.** Open a saved workout or run and tap
      Delete. Passing: the confirmation's second sentence reads "Badges
      you’ve already earned stay." and says nothing about a streak. It
      named streaks while partner streaks existed; your own streak can
      get shorter when a day's only log is deleted.

## Circle invite codes expire (2026-10-25)

A Circle's invite code works for seven days after it is made, and
`joinGoalSpace` refuses it after that; the owner makes a new one from the
Circle's sheet (`renewGoalSpaceInviteCode`), which stops the old one at
once. A code made before this deploy is as old as its Circle, so a Circle
more than a week old needs a new code before anyone else can join; nobody
already in one is affected. The unit suites hold the rule on both sides;
only a deploy can confirm the callables run it.

- [ ] **A new code, a replaced code, an old Circle's code.** After Deploy
      production has shipped (`joinGoalSpace` and
      `renewGoalSpaceInviteCode` are on the deployed-source list), on
      account A start a Circle. Passing: the invite sheet shows the code
      and "Works until HH:MM on Ddd D Mmm", seven days on. In the Circle's
      sheet tap New code, then on account B join with the first code:
      "That invite code has expired. Ask whoever invited you for a new
      one." Join with the new code: B is in. A Circle A made more than a
      week before the deploy shows "This code has expired." and Make a new
      code, and everyone already in it still opens it.

## Names that follow you, and notices that open the post (survey items 57 and 58, 2026-10-24)

A new public name or photo is carried to the person's recent posts,
comments, memberships and challenge places by
`onPublicProfileIdentityChanged`, which reads activity comments through a
new `items` (authorId, text) collection-group index. Accepting a follow
request tells the person who asked; a props or comment notice opens the
post. The unit and emulator suites cover each; only a deploy and real
accounts can confirm them in production.

- [ ] **Rename, then look from another account.** After Deploy production
      has shipped (the Firestore step waits for the new index to be READY;
      `onPublicProfileIdentityChanged` is on the deployed-source list), on
      account A change the name and the photo in Settings → Profile.
      Passing, from account B within a minute: A's recent post in the feed,
      A's comment on B's post, A's Space post and comment, A in a shared
      Circle and on a challenge leaderboard all show the new name and
      photo. The function's log line `onPublicProfileIdentityChanged.resynced`
      shows the counts and no name. A post older than 90 days keeps the old
      name, by design.
- [ ] **Accept a request on one phone, read it on the other.** B asks to
      follow A (A approves followers); A accepts from the tray. Passing: B's
      tray shows "A accepted your follow request" and the row opens A's
      profile, which now shows A's followers-only sessions.
- [ ] **Open a props and a comment notice.** B gives props on and comments
      on A's session. Passing, on A: the props row opens the session, the
      comment row opens it with the comments showing. Delete the session
      and tap the comment row again: it opens B's profile.

## Cold start: what loads before the first paint (step 8, 2026-10-24)

Login paints without framer, Home without its closed sheets, the composers
without the word lists; a returning device starts Firestore and the
signed-in shell with the app's own code; `dist/index.html` preloads the two
first-paint fonts; and the diary row reads a 160 px thumbnail of a meal
photo instead of the 1280 px photo. The dist checks and unit tests cover
what ships; these need a browser's Network panel or an iPhone.

- [ ] **The meal photo thumbnail, on an iPhone.** Scan a meal: the diary
      row shows its photo, sharp at 52 pt. Delete the meal and both files
      go (`food-photos/{uid}/{mealId}.jpg` and `.thumb.jpg`). A photo scanned
      before this build still shows in its row, read from the photo itself.
- [ ] **The fonts, on a first web visit.** In a private window, open the
      app: the Network panel shows both Latin woff2 files requested from
      the HTML (initiator: preload), the text never swaps face, and the
      console has no "preloaded but not used" warning on Home.
      STATUS 2026-10-25: on the live Hosting build in Chromium, both files
      were requested from the HTML at the entry's moment and once each (so
      `crossorigin` matches). The Welcome screen draws no Archivo, so that
      preload waits there for the first figure; headless Chromium logged
      no warning for it within 7 s. Home still needs an account.
      STATUS 2026-10-25 (emulator): Home's half, on the e2e build against
      the Auth and Firestore emulators, served by `vite preview` on
      localhost, NOT on production. Signed in as the seeded account,
      Home reloaded eight times in headless Chromium (five with the cache,
      three with it disabled) with CDP's Network and Log domains on: both
      woff2 files were requested from the HTML (initiator: parser) at the
      entry's moment, once each, and no "preloaded but not used" warning
      reached `Log.entryAdded` or the console within 7 s of any reload.
      The face swap was not checked. Production with an account remains.
- [ ] **A returning launch.** Signed in, reload with the Network panel
      open: the firebase-db, Home and Layout chunks start alongside the
      entry, not after Auth's requests; signed out with the device never
      signed in, none of them load on Login.
      STATUS 2026-10-25: checked on the live Hosting build in Chromium. A
      first visit's Welcome screen preloaded both fonts from the HTML, each
      fetched once, and loaded no Home, Layout or motion code, but it did
      load firebase-db: `MinVersionGate` imported Firestore before seeing
      that nobody was signed in. It now waits for Auth first
      (`MinVersionGate.test.tsx`), so recheck after that deploys. With the
      signed-in-before mark set, firebase-db, Home, Layout and the motion
      root started about 270 ms after the entry, ahead of Login and every
      Google request. The signed-in reload and Home's fonts still need an
      account.
      STATUS 2026-10-25 (later): with the gate's fix live, a first visit
      still loaded firebase-db. The share sheet and the one-time
      maintenance were mounted at the root for everyone, and both import
      Firestore; they now mount only for a signed-in person
      (`signedInRootOverlays.test.tsx`). Recheck after that deploys.
      STATUS 2026-10-25 (emulator): the signed-in reload, on the e2e build
      against the Auth and Firestore emulators, served by `vite preview`
      on localhost, NOT on production, so no network latency is in these
      figures. Signed in as the seeded account, Home reloaded eight times
      in headless Chromium (five with the cache, three with it disabled),
      timed from CDP `Network.requestWillBeSent`. The entry started 29 to
      37 ms after the document; firebase-db 26 to 61 ms after the entry,
      Layout 33 to 77 ms and Home 35 to 81 ms after it. Auth's first
      request (the emulator's `accounts:lookup`) came 170 to 308 ms after
      the document, so firebase-db started 104 to 215 ms before it, Layout
      93 to 199 ms and Home 88 to 195 ms before it. The three chunks start
      alongside the entry, not after Auth. Production with an account
      remains.
- [ ] **Analytics' config read, on the web.** Every web visit logs a 403
      from `firebase.googleapis.com/.../webConfig`: Google answers
      `API_KEY_SERVICE_BLOCKED`, because the web API key's API restrictions
      leave out the Firebase Management API, which Analytics calls for its
      config. Analytics falls back to the measurement ID in the app's
      config, so events still arrive; the cost is an error in every
      visit's console. In Google Cloud → APIs & Services → Credentials, add
      Firebase Management API to the browser key's allowed APIs. Passing:
      a private window shows no 403 and no "Failed to fetch this Firebase
      app's measurement ID" warning.

## Blocking both ways (Polish3 call 1, 2026-10-24)

A block now hides each person from the other. `onBlockWritten` writes the
person blocked's copy of each block (`blockedBy/{them}/users/{blocker}`),
`useBlockedUsers` merges it into the set the feed, Explore, Spaces,
comments, props, boards, search and the tray filter on, a blocker's profile
reads as not available, and the rules refuse a single read of the
blocker's public profile or of either's post. The unit, rules and emulator
suites cover each half; only a deploy and two real accounts can confirm the
trigger runs in production and the two apps agree.

- [x] **Backfill the blocks made before the deploy.** Once Deploy
      production has shipped `onBlockWritten` (check its deployed source),
      run the backfill with credentials that can write Firestore:
      `node functions/scripts/backfill-block-mirror.js adaptive-fitness-af8bb`,
      or let the Backfill block mirror workflow run it with the deploy's
      credentials: it runs by itself when the workflow, the backfill or
      `functions/lib/blockMirror.js` changes on main, and from the Actions
      tab on demand.
      Passing: it prints its totals, and a second run prints `mirrored: 0`
      and `removed: 0` (the workflow runs it twice and checks this).
      STATUS 2026-10-25: done by the workflow's first run, on the merge
      that made it run by itself. Both passes printed `checked: 0`,
      `mirrored: 0`, `removed: 0`: production had no blocks yet, so the
      trigger alone keeps the mirror from here.
- [ ] **Block from one account, look from the other.** On two phones (or
      a phone and the web build), account A follows B and both have shared
      a public session; A blocks B from B's profile. Passing, on B, without
      reopening the app: A's posts leave the feed, Explore and any Space;
      A's comments and props leave B's posts; A is gone from the friends
      board and challenge leaderboards; searching A's name finds nothing;
      opening a link to A's profile says "This profile isn't available"
      with no name or photo, the same words as a deleted account. On A:
      B's profile shows B's name, Unblock and nothing B shared. In the
      Firebase console, `blockedBy/{B}/users/{A}` exists. Unblock on A, and
      both ways come back (follows do not: blocking ended them).

## Apple's name, and the second account made visible (survey item 22, Polish2 call 3, 2026-10-21)

Native Apple sign-in now keeps the name Apple shares on the first
sign-in, setup never names a person from a Hide My Email address, Login
marks the way in this phone last used "Last used", and setup's first
screen says how the new account was made with a way to sign in another
way. The unit suite covers each with the plugin and Firebase faked; only
a phone and a real Apple ID can confirm what Apple sends.

- [ ] **The name Apple shares.** On a TestFlight build, delete the app's
      entry under Settings → Apple ID → Sign in with Apple, then sign in
      with Apple choosing Hide My Email. Passing: setup's name field and
      the public profile show the Apple ID's name, not a random string.
- [ ] **Last used.** Sign out and open Sign in. Passing: Continue with
      Apple reads "Last used", and nothing else does.
- [ ] **Sign in another way.** Sign in with Google on the same phone.
      Passing: setup's first screen says "Setting up a new account with
      Google (your address)", and "Used Tropos before? Sign in another
      way" returns to Sign in.

## A paywall with no store, portrait only (survey items 39 and 40, 2026-10-21)

An iPhone build without RevenueCat's key (the state `deploy-ios.yml` builds
until its activation order is done) can only refuse a purchase, so the
Upgrade page and ProModal now show no price, no checkout and no Restore
there, and say Pro isn't on sale in this version yet. The app turns with the
phone only to portrait. HealthKit, the run's location watcher and the
native reminders' permission and cancel paths are now unit-tested with
their plugins faked. These need a device.

- [ ] **The paywall in a build with no store.** On a TestFlight build made
      without `VITE_REVENUECAT_IOS_KEY`, open Pro from Home and from a
      Pro-gated feature. Passing: both say "Pro isn't on sale in this
      version of the app yet", with no price, no Continue, no Restore, and
      the sheet and page close.
- [ ] **Portrait only.** Turn the phone sideways on Home, a run and a
      workout. Passing: the app stays upright.

## Failed reads, loading and tap targets (survey items 52 to 57, 2026-10-21)

A read that fails now says so with Try again instead of an empty state
(an exercise's history, the Circle share sheet, the weekly review, who you
follow); Settings → Health and Home's steps tile wait for the first read;
eight controls under 44 px are full size; a weight changed in Settings is
today's weigh-in; a photo saves for an account with no public profile;
taking a drink back just after midnight takes it from the day it was drunk.
The unit and rules suites cover the logic; these need a device.

- [ ] **Settings → Health opens without a guess.** On a TestFlight build
      connected to Apple Health, open Settings → Health. Passing: a
      placeholder, then today's steps; never a 0 or "No steps yet" first.
- [ ] **A weight changed in Settings reaches Home.** Change the weight in
      Settings → Profile, then open Home. Passing: the weight tile shows the
      new weight dated today, and the weight chart has today's point.

## App cost rows (survey items 41, 42, 45 and 46, 2026-10-20)

Home reads this week's meals and 60 weigh-ins, the daily logs read covers
this month and week, the challenges listener reaches back eight days and
its reads follow the challenges' ids, the Spaces directory reads each Space
once for every copy open, the training-load curve reads only on the
Performance page (since Trim1 call 5, 2026-11-11: only while the score's
details are open on the Analytics overview), and a return to the app re-claims an unchanged push token
twice a day rather than every time. The unit suites cover the logic; these
need a device.

- [ ] **Push survives a day of returns, and sign-out still works.** On a
      TestFlight build with push on: leave and return to the app thirty or
      more times over a day, then sign out. Passing: sign-out completes, and
      a test push sent after signing back in arrives.
- [ ] **A new account's first-meal prompt and first-week card.** On a new
      account, log one meal, then open Home the next day. Passing: the
      first-meal prompt is gone. On a legacy account the first-week card
      shows the meal done; a v2 account's card has no meal row, only its
      first workout and first run (`firstWeek.ts`, `trainingOnly`).

## Server cost rows (survey items 43 to 46, 2026-10-20)

A post reaches its followers a page of 100 at a time, with five minutes
to do it; the scheduled sweeps reach the most recently active first and
stop before their time runs out; the hourly nudge reads nothing more for a
user outside their send hours; the fastest-effort scan reads only open
challenges; feed copies and notifications expire. The unit and emulator
suites cover the logic. Feed copies and notifications written before this
release carry no `expiresAt` and are kept: at today's size that is too
little to be worth a backfill script.

- [ ] **The release carries the TTL policy and the trigger's timeout.**
      Passing: Firestore console → TTL policies lists `items.expiresAt`
      as active (the Firestore stage's readiness check waits for it), and
      Functions → `onActivityCreated` → Details shows a 300 s timeout.
- [ ] **A sweep's run record says when it was cut short.** Passing: the
      latest `weeklyPerformanceRollup` and `hourlyStreakNudge` run records
      in `jobRuns/{name}` carry `lastSummary.stoppedAtTimeLimit: false`.
      A `true` is the sign the sweep needs splitting, not a failure.

## Restriction and identity rows (survey items 18 and 20, 2026-10-20)

A restriction now outlives deleting the account (S4e, STATUS 2026-10-20),
a public name the filter refuses is taken back on the server, and a
member's Circle events are held to twenty an hour. The unit, rules and
emulator suites cover the logic; these need the release and real sign-ins.

- [ ] **The release carries the two triggers and the bound secret.**
      Passing: the Deploy production run's Functions stage is green, and
      Firebase console → Functions lists `onAuthUserCreated` and
      `onPublicProfileWritten`, each with `BILLING_HMAC_SECRET` bound where
      the trigger metadata test says (`onAuthUserCreated`, `liftRestriction`),
      and Firestore console → TTL policies lists
      `restrictedIdentities.expiresAt`.
- [ ] **A restriction follows the same Google account.** On a TestFlight
      account signed in with Google: restrict it from the moderation page,
      delete it from Settings → Account, then sign in again with the same
      Google account. Passing: Firestore console shows
      `globalRestrictedUids/{new uid}` with `carriedFromDeletedAccount:
true`, the app shows the restricted notice before a post, and
      `restrictedIdentities` holds two documents with only `reason`,
      `createdAt` and `expiresAt`.
- [ ] **Lift clears it for good.** Lift that account's restriction, delete
      it again and sign in with the same Google account. Passing: no
      `globalRestrictedUids` document for the newest uid.
- [ ] **A name past the filter comes back to none.** Passing: a name the
      filter refuses, written to `users/{uid}/public/profile` from the
      Firestore console, reads null within a minute and the profile shows
      the person unnamed.

## Friends board, retired (Trim1 call 3(a), 2026-11-12)

The friends board is gone: its card on the feed, its full list, the Show
my week switch, the `setBoardSharing` callable and the tally the server
kept (`friendsBoard/{uid}`). The league is the one weekly ranking. The
five device rows this section held went with it. These need the release
and the Firebase console.

- [ ] **The release removes the callable and the rule.** Passing: the
      Deploy production run's Firestore and Functions stages are green,
      Firebase console → Functions no longer lists `setBoardSharing`, and
      the deployed rules have no `friendsBoard` match.
- [ ] **Stored weeks are cleared.** After that release, from the repo
      root with operator credentials:
      `DRY_RUN=true node functions/scripts/purgeFriendsBoardDocs.js`,
      read the two counts, then run it without `DRY_RUN`. Passing: a
      second dry run reports 0 weeks and 0 answers, and Firestore console
      shows no `friendsBoard` collection. Once this is ticked, account
      deletion's own delete of `friendsBoard/{uid}` and its inventory
      entry (`friendsBoardOwn`) can go.
- [ ] **The feed's week card.** On a TestFlight account following two or
      more people, with a session this week. Passing: Following shows
      "Your trajectory" under the third post where the board was, and no
      board.
- [ ] **The weekly challenge's leaders.** Joined, with one lift this
      week. Passing: the card on Together lists up to three people under
      "Leading this week", with "You" picked out if you are one of them;
      before joining, and with no session yet, it lists nobody.
- [ ] **An older build.** A TestFlight build from before this change,
      on an account following two or more people. Passing: its feed's
      board reads "Nothing to compare yet" (its reads are refused), and
      its Show my week switch answers "Couldn’t change who sees your
      week. Try again." Nothing else on it changes.

## Follow approval (Polish2, 2026-10-20)

An account approves each follower unless it turns that off (Settings →
Social & privacy → Approve followers). The rules suite
(`firestore.followRequests.rules.test.ts`) and the emulator trigger tests
cover the logic; these need two real accounts.

- [ ] **The release carries the rules and the trigger.** Passing: the
      Deploy production run's Firestore and Functions stages are green, and
      Firebase console → Functions lists `onFollowRequestCreated`.
- [ ] **A follow to someone who never chose is a request.** On two
      TestFlight accounts, A (never touched the switch) and B: B taps Follow
      on A's profile and it reads Requested; A's bell shows "B asked to
      follow you" and People lists B under Follow requests. Passing: Accept
      makes B's button read Following on B's next look, and a followers-only
      session A shares then shows on A's profile for B.
- [ ] **Declining, cancelling and the switch.** Passing: a declined request
      leaves B's button at Follow; B tapping Requested cancels it and A's
      list no longer shows it; with A's switch off, B's Follow is immediate
      and reads Following at once.

## Follow counts kept by the server (2026-11-10)

A profile reads someone else's follower and following numbers from
`followCounts/{uid}`, which two new triggers recount from the follow lists
(`functions/lib/followCounts.js`). It is step 1 of closing the follow
lists: until now any signed-in account could list anyone's followers and
following, because the counts were read from those lists. Only production
shows the triggers deployed and the counts landing.

- [ ] **The triggers deployed.** After Deploy production runs for this
      change, `onFollowerEdgeWritten` and `onFollowingEdgeWritten` are in
      the Firebase console's function list, and the release's source
      read-back passed for both.
- [ ] **A follow lands in the count.** From a second account, follow the
      first. Passing: within a few seconds `followCounts/{first uid}` has
      `followers` one higher and `followCounts/{second uid}` has
      `following` one higher, and the first account's profile, opened from
      the second, shows the new number. Unfollow: both go back.
- [ ] **Every account counted.** Run the "Backfill follow counts" workflow
      (Actions → Run workflow, or a dated line in
      `.github/backfill-follow-counts.request` on main) only after the
      row above passes. Passing: the first pass prints the accounts it
      counted and the second pass ends with `changed: 0`.
- [ ] **Then close the lists.** Merge the rules change that lets only the
      two people on a follow read it, and only the owner list their own
      (its pull request names this row). Not before the backfill: an
      account nobody has counted reads as 0 once the lists are closed.
      And not before every installed iPhone build reads the server's
      count: a build from before it counts other people's lists itself,
      and once the rules refuse that its profiles say the counts could
      not be loaded. Upload a TestFlight build first.
- [ ] **The lists are closed.** After Deploy production runs for the
      rules change, from a second account open the first account's
      profile. Passing: its two numbers still show, and your own
      Followers and Following pages still list. In the browser console
      on the web build, `getDocs` on `followers/{first uid}/users` from
      the second account is refused with permission-denied.

## What a deletion used to leave behind (2026-10-20)

Four records outlived the account they named, and the password-reset
limiter kept every address anyone typed. The executor and
`firestore.indexes.json` now handle them, and
`accountDeletionCollections.test.ts` fails on the next unlisted collection.
Two steps happen only in production.

- [ ] **The address-keyed reset records are gone.** Once the functions
      deploy carrying the hashed key is live, run
      `DRY_RUN=true node functions/scripts/purgeLegacyResetLimiterDocs.js`
      from the repo root, then again without `DRY_RUN`. Passing: the second
      run's report shows `deleted` equal to the dry run's `legacy`, and a
      third dry run shows `legacy: 0`. It prints counts only, never an id.
- [ ] **Rate-limit records expire.** Passing: the Deploy production run's
      Firestore readiness gate (`scripts/verify-firestore-readiness.py`,
      which fails while any TTL policy in `firestore.indexes.json` is not
      active) is green, and Firestore console → Time-to-live lists
      `rateLimits` / `expiresAt` as Serving.

## What says a server job failed (2026-10-20)

- [ ] **Every scheduled job leaves its last run.** Passing: a day after the
      release, Firestore console → `jobRuns` holds a document for each of
      the nine scheduled jobs, each with `lastOutcome: "ok"`, a
      `lastFinishedAt` after its `lastStartedAt`, and the sweeps'
      `lastSummary` counts. A `running: true` older than nine minutes is a
      run that was killed (`functions/lib/jobRuns.js`).

## Crash reports from the phone (Crashlytics, 2026-10-20)

The owner chose Crashlytics for the iPhone app; the web keeps its Firestore
reports (`src/lib/crashReporting.ts` says why). The tests mock the plugin, and
no build has compiled it yet, so this needs the first TestFlight run.

- [ ] **The release run uploads the symbol files.** Passing: the "Upload
      Crashlytics symbol files" step in Deploy iOS is green (it runs after
      the TestFlight upload, so it cannot hold the build back).
- [ ] **A crash arrives, readable, under the account.** Passing: on the
      TestFlight build, `/diagnostics` shows Crashlytics `active`; tap "Send a
      test crash", open the app again, and Firebase console → Crashlytics
      shows the crash with its frames named (no "missing dSYM" banner) and a
      user ID equal to the UID row on `/diagnostics`.
- [ ] **A JavaScript error arrives as a non-fatal.** Passing: an error the app
      catches (for one, a card that fails to load) shows in Crashlytics as a
      non-fatal event titled `[component in …]`, under the same user ID.
- [ ] **The App Store label says it.** When filing the privacy label (the row
      under "Privacy and consent for App Review"), Crash Data is collected,
      linked to the user, for app functionality, and not used for tracking
      (`docs/app-store/listing.md`).

## Triggers that retry, and saves that will not land (2026-10-20)

Group 5 of the 20 October list. The emulator tests drive the run trigger
and the follower trigger through a failure and its retry; only the console
shows what the deploy set.

- [ ] **The seven triggers that never retried now do.** After the release
      that carries this, Cloud console → Functions shows "Retry on failure"
      on onActivityCreated, onActivityDeleted, onCommentCreated,
      onSpacePostWritten, onGoalSpaceEventCreated, onFollowerCreated and
      onChallengeParticipantDeleted (`functions/__tests__/triggerMetadata.test.js`
      pins every Firestore trigger as retried). Passing: all seven read
      enabled, and onRunCreated's deployed source contains `triggerSteps`.
- [ ] **A retry storm would show in the logs.** A step that fails every time
      is retried for a day, then dropped with a `retry window closed` line
      (`functions/lib/triggerRetry.js`). Passing: a week after the release,
      Logs Explorer shows no `will be retried` line repeating for one event,
      and no `retry window closed` line.
- [ ] **A deleted session's reversal retries too (2026-10-25).** The delete
      triggers caught their reversal's failure, so a contended transaction
      left the deleted session's challenge credit and lifetime total standing
      for good; they now fail the event and are retried for a day
      (`functions/__tests__/sessionDeleteRetry.test.js`). Passing: after the
      release, the deployed source of onWorkoutDeleted and onRunDeleted
      contains `triggerSteps`, and of `lib/activityReversal.js` contains
      `not reversed for` (Deploy production reads both back).

## Reminders, sign-in and posting on the phone (2026-10-20)

Fixed with tests that mock the plugins (lemmonchess333/Maiin#2900, group 1);
only a phone shows the OS doing its part.

- [ ] **A repeating reminder fires at its time, once a day.** Repeating
      reminders are now calendar triggers (`nativeSchedule` in
      `src/lib/notifications.ts`); they were `{ at, every, repeats }`, which
      the iOS plugin armed as an interval from the moment of scheduling.
      Passing: a breakfast reminder at 08:00, set at 05:00, fires at 08:00
      and next at 08:00 the following day (not at 11:00); a workout reminder
      fires on its weekday only; Settings → Notifications shows each next
      reminder's time (it read none on iOS: the plugin returns `at` as a
      string).
- [ ] **Signing out stops the account's reminders.** Passing: with meal
      reminders on, sign out; no reminder arrives at the next set time.
- [ ] **Closing the Google or Apple sheet says nothing.** Passing: tap
      Continue with Google, close the sheet: no red line on Login; the same
      for Continue with Apple. A sign-in that fails for a reason (airplane
      mode) still shows its line.
- [ ] **The evening reminder comes the evening after a rest day.** The
      streak shows 0 that morning (the today/yesterday rule), and both the
      push and the on-device reminder read the streak a log today keeps
      (`savableStreak`), not the 0. Passing: with a streak of 3 or more, log
      nothing for a day; the next evening the reminder arrives, and logging
      then shows the streak with the rest day counted. A day later still with
      nothing logged, no reminder comes.
- [ ] **Verifying with the app closed lets you post at once.** Passing: sign
      up with email, close the app, tap the link in Mail, open the app and
      share a session to the feed straight away: it posts, rather than being
      refused for up to an hour.

## What `docs/LAUNCH_TODO.md` still held (2026-10-19)

`docs/LAUNCH_TODO.md` is retired: it now only says where each of its
sections went. These are its checks that no other list carried. The
TestFlight script names each one.

- [ ] **Sign in with Apple and with Google on the phone.** On the
      TestFlight build, sign out, then sign in with Apple, then with Google,
      each with an account that has never signed in. Passing: each reaches
      setup with no error, and GA4 DebugView shows `signup_completed` for
      each. The native flow (`src/lib/nativeAuth.ts`) has only run against
      mocks, and the Google button needs the `REVERSED_CLIENT_ID` URL scheme
      that only CI's build adds (`deploy-ios.yml`). A launch blocker: App
      Review tries every sign-in button. (Script step 9.)
- [ ] **Push reaches the iPhone.** First the one-time setup in
      `docs/ios-push-notifications.md` (Push Notifications on the
      `com.tropos.app` App ID, the APNs key in Firebase); the iOS build stops
      without the first. Then that doc's "Device acceptance check". Passing:
      its five steps. (Script steps 6 and the "Push on the iPhone" section.)
- [ ] **Haptics on a real iPhone.** Tick a set in a workout, then follow
      someone. Passing: a tap is felt each time. `src/lib/haptic.ts`
      calls `@capacitor/haptics` on native, which no test can feel.
- [ ] **Change the password and the email.** Settings → Account → Sign-in &
      security, on an email account. Change the password, sign out and sign
      in with the new one. Then change the email and tap the link sent to the
      new address. Passing: only the new password works; the sign-in email
      changes only once the link is tapped; after the app's next start,
      Firestore `users/{uid}` shows the new `email`.
- [ ] **The minimum-version gate.** Firestore console → `config/client` →
      string field `minSupportedVersion` = `"99.0.0"`. Open the app, then
      delete the field and reopen. Passing: an update screen first (the
      iPhone app names the App Store, the web offers Reload), then the app
      as normal. This blocks every installed app while it is set, so delete
      it straight away.
- [ ] **The scheduled sweeps finish well inside their 540 s.** After
      launch, once there are real users. Cloud Logging, one run each of
      `weeklyPerformanceRollup`, `dailyPerformanceRefresh`,
      `dailyRaceReconciliationSweep`, `hourlyStreakNudge` and
      `hourlyChallengeAnnouncements`. Passing: each run's first and last
      lines are well under 540 s apart. One near the limit is cut off with no
      error and the rest of its users left as they were: shard it by
      `lastActiveAt` rather than raising its memory.
- [ ] **A lawyer reads the Privacy Policy and the Terms.** Not a check:
      every claim in them was verified against the code, and that is not a
      legal review.
- [ ] **The run's lock-screen card needs its widget extension.** Not a
      check: the app's half and the plugin are in
      (`src/lib/runLiveActivity.ts`), but the Xcode target in
      `docs/run-live-activity.md` was never added, so `startActivity`
      rejects and nothing shows on the lock screen. That doc's device table
      is the test once it exists. After 1.0.

## The Firebase key lets the iPhone app and troposfit.com sign in (2026-10-17)

The web API key (`AIzaSyB-…`, in every build) is restricted to listed web
addresses. On 2026-10-17 it allowed `adaptive-fitness-af8bb.web.app`,
`adaptive-fitness-af8bb.firebaseapp.com`, `lemmonchess333.github.io/Maiin/`
and `localhost`. Sign-in requests (identitytoolkit) from `capacitor://localhost`,
the address the iOS app's web view sends, and from `troposfit.com` came back
403 "Requests from referer … are blocked".

- [ ] **Add the app's and the site's addresses** (Google Cloud console →
      APIs & Services → Credentials → the `AIzaSyB-` key → Website
      restrictions): `capacitor://localhost/*`, `https://troposfit.com/*`,
      `https://www.troposfit.com/*`. Passing: a sign-in request sent with each
      of those referrers no longer returns "Requests from referer … are
      blocked", and the TestFlight build signs in (script step 9). A launch
      blocker.

## The food scan's model (Ship1, 2026-10-13)

Affects: `analyzeFood` (a meal photo) and `analyzeFoodText` (a Pro typed
meal), which now share `functions/lib/foodModel.js`. Both called
`gemini-2.0-flash` by name, and Vertex AI retired it on 2026-06-01 (Google's
model versions page lists it under retired models, replacement
`gemini-3.1-flash-lite`), so both have likely answered "AI service error"
since then. They now call `gemini-3.8-flash` in us-central1, with the
settings a thinking model needs: thinking at LOW, the temperature at its
default, a JSON answer and a cap with room for the thinking. Nothing here
could call Vertex, so the first real request is the test.

- [ ] **One photo scan and one typed meal, after the deploy.** On a Pro
      account, scan a plate and type a meal: each comes back with foods and
      macros in a few seconds. "AI service error" means Vertex refused the
      request: the function's log has the status (`Vertex AI error:`); a
      404 means the model isn't served in us-central1, a 400 names the
      setting it refused.
- [ ] **The usage log.** `analyzeFood.usage` in the functions log shows
      the prompt and output tokens per scan; check one against the price
      of 3.8 Flash before launch.

**2026-11-09: us-central1 was the wrong place to ask.** The first TestFlight
scans (build 13) reached the server and each came back "Couldn't analyse
this. Try again." without "didn't use a scan", so the model had answered a
4xx other than 429. Google's page for 3.8 Flash lists the global endpoint
and the `us` and `eu` multi-regions only. Both analyses now call
`aiplatform.us.rep.googleapis.com`, location `us`; a 401, 403 or 404 from
the model gives the scan back; and the server sends the model's status as
`modelStatus`, which the scan's Details shows as "Scan: the AI model
answered N". The two checks above stand, now against the `us` endpoint:

- [ ] **After the deploy, one scan on the iPhone.** It comes back with
      foods. If it fails, Details names the model's status: a 404 means
      3.8 Flash is not served in `us` either (try `global`), a 403 that
      the functions' account lacks Vertex AI User, a 400 the setting it
      refused (the log's `Vertex AI error:` line has `errorStatus`).

## The plan moves on with the day while the app stays open (2026-10-10)

Affects: `useProgram` (`src/features/program/useProgram.ts`) and Home's
`useHomeProgram`. The lift and run weeks' rollover, the runner's
recent-running read and the race's rest days now re-run when the day
changes (`useLocalDateKey`: a check every 30 seconds, and on focus and
`visibilitychange`), not only on a reload. Home loads that engine only when
its plan needs it, and now asks again on each new day. On a phone the app
is resumed far more often than it is started, so before this a plan stayed
on last week until the app was killed and reopened.

The hook tests (`useProgramResume.test.ts`, `useHomeProgram.test.tsx`) fire
the resume in jsdom. WKWebView's own resume events need a device.

- [ ] **Monday, from the background.** On Sunday evening open Train, then
      leave the app in the background (don't close it). Open it again on
      Monday morning: within a few seconds Train shows the new week, its
      sessions not done and the week number one on, and Home's week strip
      and today's card agree with it. No relaunch, no pull to refresh.
- [ ] **Monday, from the background, on Home.** The same with a
      running-only race plan, left on Home rather than Train: on Monday's
      return Home's run card and week strip show the new week's runs
      without a visit to Train.
- [ ] **Race week's rest days.** On a race-prep account with the race on a
      Saturday and a lift session not done that week, leave the app in
      the background from Wednesday to Thursday. On Thursday's return the
      session shows as skipped, under the "Race week" banner ("No lifting
      in the two days before your race…").

## The polish round on a phone (Pol1, 2026-10-11)

Affects: the workout screen's rest timer and set ticks
(`WorkoutSession.tsx`, `CompactRestTimer.tsx`, `SetCheck.tsx`), the
finish screen (`SessionCompleteScreen.tsx`, `SessionBadge.tsx`), the Food
diary's rows (`FoodRow.tsx`, `FoodTimeline.tsx`), the Pro scan demo's
diary (`ScanDemo.tsx`) and Analytics while it loads (`HistorySkeleton`,
`PerformanceCardSkeleton`, `PeriodSummarySkeleton`). The unit tests and
the emulator captures cover order, placement and the fallbacks; these
need an iPhone.

- [ ] **The rest card by the thumb.** Tick a working set: nothing above
      the set table moves, the rest card rises above Complete set and the
      home indicator, and its ring sweeps rather than stepping. A set
      that is also a new best shows the gold card above the rest card.
- [ ] **The tick.** A tick pops its box and draws its check once; going
      back to an earlier exercise does not replay it. With Reduce Motion
      on, neither moves.
- [ ] **Done in thumb reach.** Save a workout whose finish screen
      scrolls (a new best, a badge, the sharing question): Done stays
      pinned above the home indicator while the page scrolls under it,
      and comes last at the end. With VoiceOver, saving lands focus on
      Done.
- [ ] **Meal photos as thumbnails.** On a day with a scanned meal, its
      photo is a 52 px thumbnail read from the device, the other rows
      carry their slot's tile, and swiping a photo row to delete folds it
      away. A photo past the 90-day sweep falls back to the tile.
- [ ] **Analytics on a cold open.** Open Analytics first after a fresh
      launch on a slow connection: the placeholder is the page's shape,
      and nothing moves as the score and the range card arrive, at the
      default text size and at a larger one.

## Race plans the rollover dropped end on the server (2026-10-10)

Affects: `dailyRaceReconciliationSweep`, the orphaned race goal in
`_decideReconciliationActions` (`functions/index.js`). A profile left in
`race_prep` on a finished race after the rollover dropped its plan (before
the plan was kept until its race ends) returns to free running once the
race is past both exits the sweep would have taken: day 15, 21, 28 or 35
after a 5K, 10K, half or marathon.

The decision tests and the emulator case cover the rule and its
profile-only write; these need the deployed function.

- [x] **The deployed source.** The deploy's read-back prints
      `Verified deployed source: dailyRaceReconciliationSweep`. Deploy
      production run 253 (2026-10-10, #2667) printed it, version 183.
- [ ] **The first sweep.** The 04:00 UTC log line after the deploy ends
      `orphanedGoalCleared=N`. Every stuck active account goes in that one
      sweep, so N may be more than one; most days after, 0. Open one
      profile it counted: `runMode` is `freeform`, `raceGoal` is gone, and
      Train shows free running, not "Race day has passed".
- [ ] **A race ahead stays.** A race-prep account whose race is still
      ahead, or whose plan is still there, is not counted and keeps its
      race.

## The run screen in the training-engine pass (2026-10-08)

Affects: the Run screen's pace bar and pace alerts on a tempo or an interval
session, which now judge only the work segments
(lemmonchess333/Maiin#2633), a planned easy run's time target, countdown and
finish cue (lemmonchess333/Maiin#2639), a tempo or intervals with no pace
to give (lemmonchess333/Maiin#2643), and a new runner's run-walk sessions
(lemmonchess333/Maiin#2655). The unit tests cover which segment is judged
and what each run is set for; these need a phone's speaker and screen.

- [ ] **A tempo's alerts.** On an iPhone with audio cues on, start a planned
      tempo: no pace alert in the warm-up; the pace bar appears with the
      first tempo block and goes in the float and the cool-down; alerts speak
      only in a block.
- [ ] **An interval session.** The same for reps and recoveries: the bar and
      the alerts in the reps only.
- [ ] **A planned easy run.** Start a planned Easy 40: the screen counts down
      from 40 minutes, says "Easy running for 40 minutes. Keep it
      conversational." as it starts, and marks the 40 minutes without saving
      the run by itself.
- [ ] **A tempo with no pace yet.** On an account with no benchmark, open a
      planned tempo: the launch card says "Comfortably hard" where a pace
      would be, and the run shows no pace bar and speaks no pace alert.
- [ ] **A run-walk.** On a new runner's account with a race, start the
      week's planned run-walk and lock the screen: each walk and run is
      announced as it starts ("Run 1 of 8. 1 minute, easy enough to talk."),
      on time, for the whole 29 minutes, with no pace bar or pace alert; the
      summary says nothing about pace.

## After race day, the race's own ending (F6, 2026-10-08)

Affects: the client's rollover after race day, which now leaves the run plan
and race week's days for the race's own ending, and `weeklyFellBehindCheck`'s
skip of a week that began after the race (`functions/lib/fellBehindWeek.js`),
both in lemmonchess333/Maiin#2646. The unit tests cover the rollover and the
skip; these need the deployed functions and a test account a week past its
race.

- [ ] **No "fell behind" after the race.** After the deploy, a test account
      whose race was the week before gets no fell-behind flag from the next
      Monday's `weeklyFellBehindCheck`, and no recap push saying so.
- [ ] **A no-show ends race prep.** A test account that skips its race: the
      Run tab shows the no-show banner from the fourth day, without "All
      runs done this week", and `dailyRaceReconciliationSweep` returns it to
      free running after the fourteenth.
- [ ] **A first week begun on a Thursday** (F16b,
      lemmonchess333/Maiin#2651). A test account made on a Thursday with
      runs on Tuesday, Thursday and Saturday, one of them done: no
      fell-behind flag on its first Monday.

## Setup's recent race (R11, 2026-10-08)

Affects: setup's optional recent 5K or 10K, typed as minutes and seconds,
and the typed-time reader it shares with Settings → Your running fitness
(lemmonchess333/Maiin#2653). The unit tests cover the reading and the save;
these need a phone's keyboard.

- [ ] **The number pad.** On an iPhone, setup's minutes and seconds boxes
      bring up the number pad, and a time typed there is on the review.
- [ ] **A colon on the number pad.** On an iPhone, Settings → Your running
      fitness's finish time and the run plan editor's goal time are one box
      each that asks for the number pad. Check whether "22:30" can be typed
      in either; if not, they need setup's minutes-and-seconds boxes.

## A restriction stops what reaches other people (S4e, 2026-10-06)

Affects: `firestore.rules` (`isRestricted()` on feed and Space posts,
follows, Space and challenge joins and Circle events), the props, comment, like, reaction and Circle callables
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
      challenge and Circle joins and a Circle check-in each say "Your
      account is restricted" and nothing goes out; taking
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
days, Settings → Account. The email goes at 10:00 local, two days
before the last moment to cancel (a day before the trial ends).

Unit tests cover the timing in every zone, the record and the email's
words; these need the operator, a device, or a real trial.

- [x] **The sender.** troposfit.com verified in Resend and `RESEND_FROM`
      set (owner steps 2.1, `docs/launch/owner-steps-2026-10-14.md`; until
      then every email reaches only the Resend account's owner).
      STATUS 2026-11-07: done. Every Resend record Verified, `RESEND_FROM`
      deployed, and a Forgot password email arrived in a Gmail inbox (not
      spam) from Tropos <no-reply@troposfit.com>.
- [ ] **Apple's relay.** troposfit.com and Resend's `send.troposfit.com`
      registered under Certificates, Identifiers & Profiles → Services →
      Sign in with Apple for Email Communication. Then, from the sign-in
      screen, ask for a password reset for an account that signed in with
      Apple and Hide My Email: the email must arrive in that iCloud inbox.
      Same sender as the reminder; a bounce there is a bounce here.
      Passing this unlocks the paywall's reminder step (Sub1, the PR after
      this one).
      STATUS 2026-11-07: half done. troposfit.com, send.troposfit.com and
      no-reply@troposfit.com registered, each passing Apple's SPF check.
      The Hide My Email reset itself is not yet tried.
- [ ] **The subscriptions' review screenshot shows today's paywall.**
      App Store Connect → Tropos → Subscriptions → Tropos Pro → each of
      Tropos Pro Yearly and Tropos Pro Monthly → Review Information →
      Screenshot. Apple's reviewer compares it with the paywall in the
      build, so replace it whenever the Upgrade sheet changes, and before
      the build that first submits the subscriptions. As of 2026-11-07 it
      is an older Food-tab paywall ("Unlock AI food logging", Monthly
      £3.99, Yearly £34.99, "Start your 7-day free trial"), on both
      subscriptions. It still says "Unlimited AI food photo logging",
      which the app no longer claims (Pro caps scans at 100 a day,
      `DAILY_AI_LIMITS`), so a reviewer could read it as a mismatch. A capture of
      the current sheet comes from the capture rig
      (`docs/agents/capture-rig.md`).
- [ ] **The Upgrade page on the iOS app.** After a sandbox trial purchase
      (TestFlight, a uid on `REVENUECAT_SANDBOX_UIDS`), the Pro card shows
      "Free trial until …", the price line with the last moment to cancel,
      and "Remind me before the trial ends"; tapping it brings the system
      prompt once, and Diagnostics lists the pending reminder (id 3003).
      Sandbox trials last minutes, so check the screens, not the date.
      STATUS 2026-11-08: the card, the trial line, the price line and the
      Remind me button all showed on build 12 after the owner's sandbox
      purchase. The tap, the system prompt and Diagnostics' id 3003 are
      still to check.
- [ ] **The first real reminder.** The first App Store trial after launch:
      the email arrives at 10:00 local on day 4 with the price, the dates
      and the cancel link right, and the console shows
      `subscriptionTrial.reminderEmailedAt` on that profile. The
      `trialReminderSweep` log line counts it as `emailed`.
- [ ] **Who the "trader" is.** Before the UK rules start in January 2027,
      someone qualified confirms whether Tropos counts as the trader for
      App Store subscriptions sold through Apple as commissionaire. The
      build assumes it does.
- [x] _(No longer applies, 2026-10-17: Line 205 replaces it ('This replaces the trial reminder section's notes row'). docs/app-store/listing.md:284 now reads 'restricting the account…', not '…disabling the account'.)_ **App Review notes.** If the notes are already in App Store Connect,
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
- [x] _(Proven 2026-10-17: functions/lib/programStateSanitizer.js:99 and :103 have 'easingBack' and 'raceWeek' in PROGRAM_STATE_KEYS, so the sanitiser does not drop them and the command is not refused. functions/**tests**/programStateKeyParity.test.js and programStateSanitizer.test.js both passed (13 tests, run today). programCommands.test.js 'rejects one in the first week back after a break (Lift4 (11))' accepts a lighter week with easingBack {weeksLeft:1}. The deployed source was read back in Deploy production run 39063239262 (Oct 17): 'Verified deployed source: applyProgramCommand, version 153'.)_ **A plan carrying the new fields takes a command.** With
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

- [x] **The first TestFlight run signs from the API key.** With only the
      five secrets `docs/ios-release.md` asks for, Deploy iOS to
      TestFlight makes a certificate and a profile named
      `Tropos CI <serial>`, passes the import step's checks, archives and
      uploads. A second run deletes the first run's profile and revokes
      its certificate (Apple Developer → Certificates shows one Apple
      Distribution certificate from these runs), and the first build
      stays installable in TestFlight.
      STATUS 2026-11-08: proven. Runs 7–12 each signed from the API key,
      archived and uploaded; each revoked the previous run's certificate
      (Apple emailed "certificate revoked" per run) and every earlier
      build stayed installable. Run 12's only failure was the Crashlytics
      symbol upload crashing (segmentation fault), after the upload.
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
      Dynamic Island, with no doubled gap above it. Pages and these
      screens pad by the same `--safe-top`, so a gap on one is a gap on
      all. A recording of the TestFlight build on 10 Nov 2026 showed the
      doubled gap on every page: the shell set
      `ios.contentInset: "automatic"` while the page padded as well. The
      shell sets `"never"` now; check this row on the first build that has
      it, with the section below.

## One inset for the notch and the home bar (2026-11-10)

Affects: `capacitor.config.ts` (`ios.contentInset`, pinned by
`src/lib/__tests__/iosContentInset.test.ts`) and so the top and bottom of
every screen on a phone. Needs a TestFlight build made after the change;
the web build never showed any of it. Measured on an iPhone with a notch,
where the bars were 47 pt and 34 pt.

- [ ] **No black bar above a page.** Open each tab and stay at its top:
      the clock sits on the page's own background, and the title is in
      the same place before a scroll and after one.
- [ ] **No black bar under the tab bar.** Scroll each tab to its end and
      keep pulling: the tab bar stays where it is.
- [ ] **A screen that does not scroll fills the phone.** The run's setup,
      "Acquiring GPS", its Customise page and the Weekly Review have no
      bar above or below.
- [ ] **The first row still clears the clock** on the screens the row
      above lists, and a sheet's handle is never under it.
- [ ] **The keyboard.** In Food's search and in a set's weight field, the
      field stays in view above the keyboard.
- [ ] **The launch mark holds still** as the web layer takes over from
      the launch image ("The handover from the launch image" names this
      setting as a cause of a jump).

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

- [x] _(Proven 2026-10-17: Deploy production run 39063239262 (head 0b6e7b98, 2026-10-17), job 117489508070: analyzeFood and analyzeFoodText 'Successful update operation' from main, where functions/index.js:1309 and :1535 call aiConsent.refuseUnlessAiAllowed. In the same run, the verify step read back index.js from that one shared upload ('Verified deployed source' x21). The behaviour is pinned by functions/**tests**/aiConsent.test.js, 'refuses an account that has turned AI analysis off, before anything is counted': it runs the real handler for both functions, expects a 400 with reason ai-analysis-disabled and no rate-limit or scan writes.)_ **Functions deployed.** The deployed `analyzeFood` and
      `analyzeFoodText` contain `refuseUnlessAiAllowed`. An account with
      `aiAnalysisEnabled: false` gets 400 with reason
      `ai-analysis-disabled` and no scan counted.
- [ ] **The question over the scanner** (iPhone, Pro or trial account,
      never asked): the first Meal photo opens "Send food to Google for
      analysis?" above the scanner, not under it, with the camera still
      running. Allow analyses the photo just taken. Not now leaves the
      photo tabs saying "AI analysis is off", and Turn on asks again.
- [x] _(Proven 2026-10-17: src/pages/**tests**/Food.aiConsent.test.tsx (isPro mocked true) covers 'asks before anything is sent; Allow stores the yes and sends the meal to Gemini' and 'Not now stores the no, sends nothing, and logs the meal read on the phone'. It is a web-layer sheet with no native API involved.)_ **A typed meal** on a fresh Pro or trial account asks first; Not
      now logs it from the on-device parser.
- [x] _(Proven 2026-10-17: src/components/settings/**tests**/PrivacySection.aiSwitch.test.tsx, 'an account not asked yet shows aria-checked false': the switch is checked only when aiAnalysisEnabled === true (PrivacySection.tsx). It renders in SettingsPrivacy, which is the 'Social & privacy' row in SettingsIndex.tsx:127.)_ **Settings → Social & privacy → AI food analysis** shows off for an
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
      both themes. The credit starts folded to its (i) on each map; the
      (i) opens it, a tap on the map folds it again, and its links open
      outside the app. On the live run it sits top-right, clear of the
      GPS pill and the sheet; on RunDetail bottom-left, clear of Replay.
- [ ] **Weather after the deploy.** `getCurrentWeather` is a new function
      with no secret. Open run setup with location allowed: the strip
      shows the weather and "Weather data from MET Norway". The function
      logs show no `weather.failed` with status 403 (MET refusing the
      User-Agent) and no `weather.met_deprecated`.
- [x] _(Proven 2026-10-17: src/components/settings/**tests**/NotificationsSection.push.test.tsx, 'keeps the reminders on the native app and offers no push there' (and the web case). src/pages/**tests**/settingsNotificationsRow.test.tsx, 'does not name push on the native app' (expects 'Reminders, activity'). Both branches are pinned against the native-platform flag.)_ **No push on the iPhone app.** Settings > Notifications shows the
      meal, workout and streak reminders and no push switch; the Settings
      list says "Reminders, activity". The web build still has the switch.
- [ ] **Exports on the iPhone app.** Settings > Account > Export
      workouts opens the share sheet; Save to Files saves a .csv that
      opens in Numbers, then "Workouts exported" shows. Closing the sheet
      says nothing. On a slow connection a "Workouts export ready" toast
      may come instead: its Share opens the sheet. Export GPX on the
      finish screen and on a saved run opens the sheet with a .gpx.
- [x] _(Proven 2026-10-18, after a fix: `e2e/offCreditSmallPhone.auth.spec.ts` at 375x667 found ServingSizeDrawer capped at half the screen with no scroll, so the credit ran off the bottom and, for a per-100 g food, Log food sat out of reach. The cap is gone (the sheet takes BottomSheet's default 85vh) and the spec passes for both kinds of food.)_ **Open Food Facts credit** under a barcode result, the search
      results and the portion sheet, which still fits on an SE.

## Photos other people see are screened for nudity (Ship1, 2026-10-13)

Affects: a Space post's photo and a profile photo. Right after the upload
the app calls `screenPhoto`, which runs Google Cloud Vision's SafeSearch;
a photo rated LIKELY or VERY_LIKELY "adult" is refused and its file
deleted, and "racy" passes (the owner's call: shirtless and sports-bra gym
photos are fine). The `screenUploadedPhoto` Storage trigger checks every
such upload again, for a client that skips the callable
(`functions/lib/photoScreen.js`).

- [ ] **Turn on the Cloud Vision API** (Google Cloud console → APIs &
      Services → Enable APIs → "Cloud Vision API", project
      `adaptive-fitness-af8bb`). Until it is on, every photo post and
      profile photo is refused as "couldn't check" — the safe way round,
      but photo posts stop. About $1.50 per 1,000 photos after the first
      1,000 each month.
- [ ] **A gym photo goes through.** Post a Space photo of yourself in gym
      kit, and set a profile photo: both appear.
- [ ] **The log shows the checks.** In the functions log,
      `screenPhoto` runs once per photo with no `screenPhoto.failed`, and
      `screenUploadedPhoto` runs for the same file.
- [ ] **The privacy label.** App Store Connect's privacy answers already
      list photos; confirm Google Cloud Vision needs no change there (it
      processes them for the app, not for tracking).

## User content moderation for App Review 1.2 (2026-10-04)

Affects: `src/pages/Login.tsx` (the Terms line), `src/pages/TermsOfService.tsx`,
`src/components/social/CommentSheet.tsx`, `CommentPanels.tsx`, `ReportForm.tsx`,
`src/features/spaces/SpaceCommentSheet.tsx`, `src/pages/AdminModeration.tsx`;
`functions/index.js` (`createReport`, `listPendingReports`, `resolveReport`,
the two comment callables, `completeOnboarding`, `configurePlan`, the new
`onSpacePostWritten` trigger), `functions/lib/reportTargets.js`,
`reportAlert.js`, `objectionableText.js`, `spacePostModeration.js`.
Operator setup (ADMIN_UIDS, MODERATION_ALERT_EMAIL, RESEND_FROM, the
VITE_ADMIN_UIDS secret): `docs/launch/owner-steps-2026-10-14.md` Part 1.

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
- [x] _(Proven 2026-10-17: Deploy production run 39063239262 (head 0b6e7b98, 2026-10-17), job 117489508070 logs 'Verified deployed source: createReport, version 153', 'onSpacePostWritten, version 33', 'addCommentCallable' and 'addSpacePostCommentCallable'. Lines 62-66 of scripts/verify-deployed-functions-source.py include lib/objectionableText.js for both comment callables.)_ **Deployed source.** `scripts/verify-deployed-functions-source.py`
      now reads back `createReport` and `onSpacePostWritten` (and the
      word filter's module on both comment callables) after every
      functions deploy. Confirm the first Deploy production run after this
      work logs "Verified deployed source" for each.
- [x] _(Proven 2026-10-18: `functions/__tests__/integration/reportHide.test.js`, on the Auth and Firestore emulators. resolveReport's real handler hides each kind, from a report seeded as createReport commits it. A third signed-in account then reads over the emulator's REST API with the rules on (an unauthenticated read gets 403). The Space comment, the activity comment, and the Space post with its likes and comments are gone, and commentCount on the post and on the activity each went from 2 to 1.)_ **Hide content on each kind.** From the queue, hide a reported Space
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
- [x] _(Proven 2026-10-18: e2e/legal-pages.spec.ts, "Login's agreement line on a small phone" (4 tests, signed out at 320x568 on the chromium project that CI's signed-out job runs): on sign-in and on sign-up the line, its text and both links sit inside the screen with no sideways scroll, and Terms and Privacy Policy each open their page (h1 Terms of Service / Privacy Policy) with no login form. A no-wrap style on the line fails the wrap tests. Also e2e/screenshots/largeText.capture.spec.ts 'sign-up, setup and Pro' at 393 and 320 px, 1.35x and 2x text, 2 passed with no findings on sign-in or sign-up; scripts/legal-pages.test.ts 6/6, so terms.html still matches TermsOfService.tsx.)_ **The Terms line on sign-in and sign-up** wraps cleanly on a small
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
- [x] _(Proven 2026-10-18: e2e/screenshots/guide.capture.spec.ts 'a new account meets the guide: the walk, a first-week row and the hints' now goes on to /run on the same new account: "Your first run" shows over the run tiles; tapping a tile closes it and starts the run ("Acquiring GPS..."); the seen mark is stored; and it does not come back after Cancel or on a fresh visit to /run. 1 passed on the emulator rig, and a build that ignores the seen mark fails it on the revisit. The Food, Train and first-set hints were already asserted there, and GuideHint.test.tsx pins 'shows once' and the tap-through.)_ **The hints**, each once: Train's lift tab, the first set of the
      first workout (it sits above the workout screen), Food's composer,
      the run screen before a first run. Tapping the thing a hint points
      at closes it and still does what it does.
- [x] _(Proven 2026-10-17: src/pages/**tests**/Home.firstVisitGuide.test.tsx 'the Health steps prompt waits until the walk is over' (prompt stays closed while the walk dialog is up, opens after Skip). The ordering is Home's own gate; native only decides whether the prompt is eligible.)_ **Health steps prompt** (native only): on a new account it opens
      after the walk, not over it.
- [ ] **The Health steps prompt doesn't flash** (native only, FV2): an
      account that already answered it, either way, sees no "Count your
      steps" open and close as Home loads, on a cold start and on coming
      back to Home from another tab.
- [x] _(Proven 2026-10-17: src/pages/**tests**/Food.guideHold.test.tsx 'holds the Pro line while the hint is up, and shows it once the hint is closed'; e2e/screenshots/guide.capture.spec.ts asserts 'Photo logging is part of Pro' has count 0 under the hint and is visible after Got it, run in the blocking capture-specs job (emulator-tests run 39071633129, success, main 3912a8c3).)_ **Food's first visit on a free account** (FV2): the guide's
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
- [ ] **Route colours after a run** (2026-10-10). On a steady run the
      route on the finish screen should be mostly amber, not speckled
      green and coral. A surge, a hill or a walk should show as one green
      or coral stretch where it happened. The colours are now measured
      over 200 m of route (`routePaceRatios` in
      `src/components/run/routePace.ts`); measured between each pair of
      fixes, GPS wobble alone changed them.

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
      (Since 2026-10-10: the chevron fades in where it stays, then the
      fade; nothing breathes and nothing moves.)
- [ ] **Light mode** (Settings → Units & appearance): the launch stays
      dark and Home is light as it shows, with no flash of either in
      between.

### The launch animation's second pass (2026-10-10)

Affects: `src/components/LaunchSplash.tsx`, `src/lib/launchSplash.ts`,
`src/lib/nativeLaunchImage.ts`, `src/pages/Home.tsx` (`data-page-ready`),
`capacitor.config.ts` (comment only). Filmed frame by frame in Chromium
with the emulator rig, normal and at 4× CPU throttling; what the films
cannot show is WKWebView and the native launch image.

- [ ] **The rise is seen from its start.** Cold-start on a quick phone:
      the native launch image now goes as soon as the web layer has drawn
      the same frame, so the chevron should climb from low in the hexagon
      in full view, never appear half-risen through the native image's
      fade, and the hexagon's rounded rim should stay whole as it comes
      up (the chevron is cut out only inside a CSS clip-path while it
      moves). A visible change at the moment the native image goes means
      the two frames differ (see the handover row above).
- [ ] **No stutter while the app starts.** The rise, the breath and the
      flight are compositor animations now (Web Animations API, transform
      and opacity); none should hitch while the app loads underneath.
      The framer version visibly stalled mid-flight in Chromium.
- [ ] **A slow start breathes.** With a slow network (Developer →
      Network Link Conditioner, or poor signal), the mark should breathe
      gently while it waits, and still land on the header without a jump.
- [ ] **The landing shows a loaded Home.** Signed in, the mark should
      land on today's session card and the food ring, not their grey
      placeholders. On a slow network it waits at most a second for them,
      then lands on what Home has drawn.

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

- [x] _(Proven 2026-10-18: a one-off Playwright script, `node a6-downscale.mjs http://localhost:5199`, imported the real `toStorableJpeg` from src/lib/foodPhotoStore.ts through the Vite dev server into Chromium 141 and decoded what it returned: 4000x3000 in → 1280x960 out, 3000x4000 → 960x1280, 800x600 and 1280x960 unchanged, each bare base64 (exit 0). Not a committed spec: CI's projects run the built bundle, which exposes no module to import. `saveFoodPhoto` writes exactly that output (foodPhotoStore.ts:154), and WKWebView runs the same `<img>` + canvas APIs.)_ **The ≤1280px downscale.** `toStorableJpeg` needs `<img>` + canvas;
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
- [x] _(Proven 2026-10-17: Pinned by src/components/food/**tests**/FoodRow.test.tsx: 'keeps a row without a photo compact on a day without photos', 'gives a row without a photo its slot's tile on a day with photos', 'falls back to the slot's tile when the photo cannot be read'. A second device has no local file, so readFoodPhotoSrc returns null and the row renders exactly like a typed log.)_ **Multi-device is now a TEXT ROW, by design.** Scan on the phone,
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

STATUS 2026-10-25 — `storage.rules` now refuses every upload under
`food-photos/` (`allow write: if false`), so even a client that tried could
not add to the legacy set; read and delete stay for the owner. The sweep of
what is already there is still not done.

- [ ] **Public photos can be fetched, not listed (2026-10-25).** Space-post
      and profile photos grant `get`, not `read`, so nobody can list a
      person's folder; a deleted Space post's photo is now deleted with it
      (`functions/lib/spacePostPhoto.js`, run by onSpacePostWritten). Passing:
      after the release, post a Space photo from a test account, delete the
      post, and the file is gone from Storage within a minute; a post photo
      and an avatar still load in the feed and on a profile, on web and on
      the phone. Photos from posts deleted before the release stay until
      their account is deleted.

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
- [ ] **A big photo from the library scans.** Pick the largest photo on
      the phone (the main camera's 24 or 48 megapixels, HEIC) on the Meal
      tab, on the iPhone app and on the web: the frame shows the photo and
      the analysis answers. Sent as the file itself it was over the
      server's image limit, and past the request limit in front of it the
      refusal had no CORS headers, so the app read "Couldn't reach the
      server"; `FoodCameraModal` now draws a library photo down to 1280 px
      first (`FoodCameraModal.libraryPhoto.test.tsx`), and the live frame
      is drawn down the same way. jsdom has no canvas, so that WKWebView
      decodes the HEIC and draws it is a device fact; a web view that
      cannot (a HEIC picked in Chrome) says "Couldn't read that photo".
      Barcode's upload is unchanged and reads the file as taken.
- [ ] **Airplane mode.** Shutter → instant "You're offline" (no burned wait),
      with Type it instead as the PRIMARY action — and typing must work
      end-to-end offline (local NL parse + queued write). Same for the
      Barcode tab: honest copy, never a raw "Failed to fetch".
- [x] _(Proven 2026-10-18: e2e/slowScanEscape.auth.spec.ts 'the X closes the scanner mid-sweep, and a late failure is not kept for the next scan' (emulator rig, Chromium's fake camera, a Pro account, the analyzeFood request held unanswered): with the sweep up, Playwright's click reaches the X within 1 s and the scanner is gone within 1 s; the held request then fails with a 500, the page shows no "Couldn't identify food." card, and the next Scan opens on the live viewfinder (frames playing, Capture enabled) with no failure beat. The top bar put back at z-10 fails the click ("subtree intercepts pointer events"), and removing FoodAnalyzer's closed-scanner guard fails the page check.)_ **Slow-scan escape.** Start a scan on weak signal and tap the X during
      the sweep — it must close immediately (pre-fix the X sat under the
      overlay and iOS users were trapped until the request resolved), and
      the abandoned scan must NOT park a failure the next session opens onto.
- [x] _(Proven 2026-10-17: Whole chain pinned: src/hooks/**tests**/useFoodAnalysis.test.ts 'the server's own reason travels to the caller, verbatim' (429 body → errorMessage) and the bare-429 fallback ('wait a moment'); FoodAnalyzer.scanFailure.test.tsx 'request failure → failure beat error' asserts dataset.detail equals the server text; FoodCameraModal.loading.test.tsx 'an error failure shows the SPECIFIC reason, not a generic connection line'. Server returns 429 {error:'Rate limit reached. Please wait before analyzing more food.'} (functions/index.js ~1338).)_ **Rate-limit copy.** Burn the 10-per-10-min limiter with repeated
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
- [x] _(Proven 2026-10-17: Fixed by f8d045a7 'A shared run's post can now be deleted with the run (#2055)': src/lib/sessionDelete.ts recordSharedActivity writes sharedActivityId onto runs as well as workouts (shareComposer queue carries source), RunDetail.tsx passes run.sharedActivityId to DeleteSessionAction, deleteLoggedSession deletes activities/{id}. Pinned in src/lib/**tests**/sessionDelete.test.ts (recordSharedActivity with {kind:'run'}).)_ **A shared run's feed post is unreachable from the run.** Workouts carry
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

## The exercise pictures in the build (Ship1, 2026-10-13)

Affects: every production build (`vite.config.ts`'s
`shrinkFormFramesPlugin`, `scripts/art/shrink-form-frames.ts`). The 756
reviewed frames in `public/form-frames` are mostly lossless WebP, 335 MB in
all, and the iPhone app copies the build whole: the measured build was
336 MB. A build now re-saves each lossless frame in its output as lossy
WebP at quality 85 on the same canvas (32 MB; the build 51 MB). The
reviewed files in `public/` are untouched, so their review records still
match, and new art keeps arriving through the same review. The owner
compared three frames before and after at 2× zoom on 2026-10-13.

- [ ] **The App Store size.** After the first TestFlight upload, App Store
      Connect's build size for an iPhone is in the tens of MB, not the
      hundreds. Hundreds means the pictures went in as they are: check
      that the iOS build ran `vite build`, whose log says
      `form frames: N of M re-saved`.
- [ ] **The pictures on a phone.** Play three exercises' form demos on
      the phone: no blur, banding or blocky edges against the dark stage.

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
- [x] _(No longer applies, 2026-10-17: Overtaken: the cards were cut — public/form-frames now holds 152 exercise folders (912 frames per the build log), and Ship1 (2026-10-13) settled the size question with the build-time lossy re-save (vite.config.ts shrinkFormFramesPlugin, 389.6 MB → 38.2 MB in run 39063239262) rather than Storage-on-demand.)_ **Decide the scale question before cutting more cards.** Corrected
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
- [x] _(No longer applies, 2026-10-17: ORS was never built: route planning shipped on Mapbox Directions instead (80e1dd6c, #1657, planRunningRoute in functions/index.js ~7521). It is Pro-gated, has per-user limits (isRateLimited 15 aligns / 4 loops per 10 min) and logs provider failures with their HTTP status (routePlanning.failed), which covers the row's intent.)_ _(Retired 2026-11-01: road routing is removed entirely. The owner decided it will not come back on Mapbox; planRunningRoute, functions/lib/routePlanning.js, the MAPBOX_DIRECTIONS_TOKEN binding and the client road actions were deleted, so there is no provider quota left to guard.)_ When Run11 (ORS) ships: wire per-user quota in the proxy (one user can't drain the daily 2,500), log quota-exceeded, and confirm the straight-line fallback fires on 429.
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

- [x] _(Proven 2026-10-17: Checked 2026-10-17: https://troposfit.com/ answers HTTP/2 200 with the firebase.json security headers (frame-ancestors 'none' CSP, HSTS, X-Frame-Options DENY, Permissions-Policy), x-served-by Fastly cache (Firebase Hosting's CDN), last-modified matching today's Hosting deploy.)_ **Add `troposfit.com` as a custom domain** in Firebase Console →
      Hosting → Add custom domain, for the `adaptive-fitness-af8bb` project.
- [x] _(Proven 2026-10-17: Same check: the domain resolves to Firebase Hosting over valid TLS, and responses carry no cf-ray/server: cloudflare header, so the records are DNS-only and the certificate was issued.)_ **Add the DNS records Firebase issues, in Cloudflare.** Set those
      records to **DNS-only (grey cloud), not proxied** — Cloudflare's proxy
      intercepts the ACME challenge and Firebase's certificate provisioning
      stalls. You can re-enable proxying after the cert is issued if wanted.
- [x] _(Proven 2026-10-18: curl: https://troposfit.com/privacy, /terms and /support each 200 text/html, and the same on adaptive-fitness-af8bb.web.app and adaptive-fitness-af8bb.firebaseapp.com. Rendered in Chromium 141 by Playwright, each URL in a fresh context with no sign-in: all nine show their own h1 (Privacy Policy, Terms of Service, Support, the last with support@troposfit.com), stay on their path, and show no welcome or sign-in screen; the same check finds "Get started" on the signed-out root.)_ **Confirm all three URLs load signed-out in a private window** before
      touching App Store Connect. `src/lib/__tests__/publicLegalRoutes.test.ts`
      pins that the ROUTES exist in the signed-out set; it cannot pin DNS.
- [ ] **Then update App Store Connect** to the real URLs: the two links in
      the **Description** footer and the **Support URL** field. Do NOT submit
      with placeholder links.

## Stripe stays DORMANT — web storefront steer at launch (Sub4, locked 2026-07-05)

Distribution decision: Tropos ships **App Store now + Google Play later; no web billing is sold**. The working Stripe backend (checkout → webhook → tier, hardened in #822) is **kept dormant, NOT torn out** — Apple takes 15–30% vs Stripe's ~3%, so web billing is the single biggest future margin lever and pre-launch is the wrong moment to foreclose it. Do NOT build `createStripeBillingPortal` (the web Manage button's never-defined callable — it never fires on iOS, where the native branch redirects to Apple's subscriptions page) and do NOT start the ~46-file teardown; revisit removal only if still App-Store-only well after real revenue. Two known costs of dormancy, accepted: functions deploys require `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` to stay provisioned (closing the Stripe account needs a code change first), and billing-adjacent PRs keep threading Stripe branches.

- [x] ~~**Launch gate:** add the web App-Store steer~~ Not built, by the owner's call (17 October): the web build is not a sales surface, and web Pro comes later through a Stripe website (#2866). Was: — signed-in web visitors on `/upgrade` (and the ProModal paywall) see "Get the iOS app" instead of Stripe checkout tiles. One component change, NOT a backend migration. Deliberately not built pre-launch: the web build is the active dev/preview surface and the operator still exercises the checkout/trial flows there.
- [ ] When #2866 builds the website, confirm no web surface but its checkout reaches Stripe (`useProCheckout` call sites).

### The website sells through RevenueCat Billing on Stripe (owner, 13 November 2026)

The whole-app grill (Q77) moved web sales to RevenueCat Billing, on Tropos's own Stripe account, replacing this section's dormant Stripe Checkout. Until then no web checkout could have started: the app sent no sign-in token to `createCheckoutSession`, which requires one. The web now opens RevenueCat's hosted Web Purchase Link as the signed-in account, Manage subscription opens RevenueCat's management link (`getSubscriptionManagementUrl`), and a web trial (`rc_billing`) gets the reminder email naming Tropos and Account. The setup is `docs/iap/revenuecat-setup.md`, Part W.

- [ ] RevenueCat: the Web Billing app on the Stripe account, the two products with the App Store's identifiers, the offering's `$rc_monthly` and `$rc_annual` packages, a Purchase Link redirecting to `https://troposfit.com/upgrade?checkout=success`, and the repository variable `REVENUECAT_WEB_PURCHASE_TOKEN` (production token). Then re-run Deploy production.
- [ ] With the sandbox link, signed in as a uid on `REVENUECAT_SANDBOX_UIDS`, a Stripe test card: back on Upgrade, "Payment received" and Pro on; Settings, Account, Manage subscription opens the portal; cancelling there turns the trial reminder off.
- [ ] Whether RevenueCat fills `management_url` for a web purchase: if Manage subscription says there is nothing to manage for a web subscriber, the portal link has to come another way.
- [ ] Once the above has worked: retire `createCheckoutSession`, `stripeWebhook` and the Stripe secrets they bind (Sub4's note lists what the removal touches).
- [ ] Selling to the EU and the US (owner, 13 November): either Paddle as the engine (it handles VAT and sales tax; approve the domain, give its API key Customer portal sessions (Write)), or on Stripe: register for EU VAT (non-Union OSS) before the first EU sale, turn on Stripe Tax, and watch US state thresholds. Prices in GBP, EUR and USD in whichever engine is chosen.

## Legacy meal photos in Storage (uploaded before Food9)

Affects: `storage.rules` (`food-photos/{uid}/` block), `functions/accountDeletion.js` (prefix sweep). New meal photos stay on the device ("Meal photos moved to the device (Food9)" above); these checks cover the photos uploaded before that. The agent sandbox runs the Storage emulator (`npm run test:rules:storage`).

- [x] Signed-out and cross-uid reads of a food-photos path are denied — covered by `storage.rules.test.ts` against the emulator. Note the rules block itself IS deployed: the ungated `a990d4bb` run (2026-07-12) shipped it. The later account-deletion write freeze (`779ca7ba`) was held back by the packet-11 gate until 2026-09-15; that row has the permission it still needs confirmed.
- [x] _(Proven 2026-10-17: functions/accountDeletion.js STORAGE_PREFIX_TEMPLATES includes food-photos/**UID**/; functions/**tests**/accountDeletion.test.js 'continues to next storage prefix when one prefix throws' asserts the 4 prefixes incl. food-photos in order and 'returns the scoped prefixes for the uid'. A failed sweep throws storage-cleanup-incomplete before the Auth delete, so a completed deletion proves it ran. Deployed source verified: run 39063239262 'Verified deployed source: deleteMyAccount, version 250' (accountDeletion.js byte-compared). Note: the executor logs only FAILED prefixes, so the row's 'logs the sweep' line will never appear.)_ Account deletion (test account): confirm the executor logs the `food-photos/<uid>/` prefix sweep alongside progress/profile photos.

## Tooltip + Coachmark primitive (`claude/tooltip-primitive`)

Affects: `src/components/ui/Tooltip.tsx`, `src/components/ui/Coachmark.tsx`, plus the LIVE wire-ups — as of 2026-08-08 these are: Performance Index tooltip in `PerformanceSection.tsx` (beside the Performance heading on the Analytics overview since Trim1 call 5, 2026-11-11; it was in `PerformanceTab.tsx`), Trajectory delta chip in `social/TrajectoryCard.tsx`, and the `social-find-invite` Coachmark in `social/views/PeopleView.tsx`.

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
- [x] _(Proven 2026-10-17: e2e/journeys/marathon-with-lifting.auth.spec.ts saves the race run on race day with a document built as the app builds it (journeyRunDoc.ts, held field for field to runDocument by src/lib/**tests**/journeyRunDoc.test.ts). It then runs onRunCreated's real step (\_maybeWriteRecoveryEntryForRun, via e2e/helpers/serverSteps.ts) and asserts the next week is recovery. The journeys job passed on main 4fdf5a12 (Firebase Emulator Tests run 39073527575). Gate cases are in functions/**tests**/recoveryEntry.test.js. The trigger's deployed source is byte-verified in run 39063239262.)_ `onRunCreated` recovery-entry extension — log a real race-templated saved run matching the user's `raceGoal.targetDate` at ≥95% planned distance. Confirm `onRunCreated` logs include `recovery-entry written for {uid}` and the user's `programState.runPlan.phase` flips to `"recovery"` with `completedRaces[]` containing the race-day runDay id.
- [ ] `weeklyFellBehindCheck` (Pub/Sub, Mondays 05:00 UTC) — confirm first natural firing (next Monday after deploy). Logs should read `evaluating week YYYY-MM-DD (Sun..Sat)` → `done — set=X, clear=Y`. Spot-check a user who ran <50% of their weekly target the prior week — their `programState.pendingFellBehindPrompt` should be present.
- [x] _(Proven 2026-10-17: The flow was redesigned: the buttons are now Realign / My race moved / Not now, not shift/compress/skip. On the emulator, e2e/screenshots/fellbehind-detrained.screens.capture.spec.ts (seeded by seed:fellbehind and run by the capture-specs job, green in run 39073527575) signs in a user who has pendingFellBehindPrompt set and asserts the sheet opens on Home by itself. src/components/program/**tests**/FellBehindSheet.test.tsx pins the 'real runs / target / percent' summary and each button's writer ('tapping Realign calls realignRacePlan', 'tapping Not now calls dismissFellBehindPrompt', and so on).)_ L4 client UI — once any user has `pendingFellBehindPrompt` set, log in as them, confirm the `FellBehindSheet` auto-opens on Home with the correct copy ("X of N runs (Y%)") and that all three buttons (shift / compress / skip) write the expected programState change.

## Run9 3b — server recovery-exit materialization (PR #901)

Affects: `functions/index.js` (`dailyRaceReconciliationSweep` L3) + new `functions/lib/runModeResolution.js`. Merged + deployed 2026-05-29. Mirrors, server-side, the client's `resolveRecoveryExit` materialization invariant. Deploy was merged from a web session that **cannot** verify the deployed source — these checks are the conclusive proof CI-green can't give (the dedup/bundle-hash gotcha means a green workflow does not prove the new bundle actually uploaded).

- [x] _(Proven 2026-10-17: Deploy production run 39063239262 (0b6e7b98, 2026-10-17), functions/deploy job 117489508070: scripts/verify-deployed-functions-source.py byte-compares the deployed zip with the uploaded source and logged 'Verified deployed source: dailyRaceReconciliationSweep, version 202' and 'onRunCreated, version 262'. The sweep's comparison list covers index.js (which defines \_recoveryEndDateForRace at line 3475), lib/raceReconciliation.js (whose line 17 requires ./runModeResolution, moved there from index.js) and lib/runModeResolution.js. The check runs on every functions deploy and fails the release on any mismatch.)_ **Deployed-source spot-check (do this first).** In the Console (`console.cloud.google.com/functions/details/us-central1/dailyRaceReconciliationSweep/source`), confirm the deployed bundle contains `_recoveryEndDateForRace` and the `require("./lib/runModeResolution")`. If absent, the dedup logic skipped the upload — re-run Deploy production (`deploy-production.yml`) via `workflow_dispatch`.
- [x] _(Proven 2026-10-17: On the emulator, functions/**tests**/integration/dailyRaceReconciliation.test.js 'L3 recovery-exit: materializes runMode=freeform + raceGoal=null on BOTH docs' runs the real \_runDailyRaceReconciliationForUser and asserts profile.runMode freeform, a null raceGoal, and runPlan.phase, recoveryEndDate and raceGoal all null. The deployed source is byte-verified (run 39063239262). The production log-read part of this row is covered by line 1207.)_ **First natural firing materializes.** At the next 04:00 UTC sweep, spot-check a race-prep user whose recovery ended >7 days ago (`runPlan.phase === "recovery"`, `today >= recoveryEndDate + 7d`) with **no** successor race: their profile should flip to `runMode: "freeform"` + `raceGoal: null`, and `programState.runPlan` should have `phase: null`, `recoveryEndDate: null`, `raceGoal: null`. Logs show `done — noShow=X, recoveryCleared=Y` with no `fatal error:`.
- [x] _(Proven 2026-10-17: functions/**tests**/integration/dailyRaceReconciliation.test.js 'recovery-exit with a NEWER future race: writes runPlan but NOT the profile clear' asserts runMode race_prep and the new raceGoal kept, with phase null. Unit tests in functions/**tests**/dailyRaceReconciliationSweep.test.js also cover it, including the stale runPlan.raceGoal regression (line 493).)_ **Newer-race case preserved.** A user who set a new FUTURE race during recovery (anchor mismatch) must stay `runMode: "race_prep"` with that raceGoal intact after the sweep — only `phase`/`recoveryEndDate` cleared. Confirm the sweep does NOT delete the successor race.

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

- [x] _(Proven 2026-10-17: #1838 (a2467845) merged 2026-08-02. Every functions deploy since runs on Node 22: the log of run 39063239262 shows 65 'updating Node.js 22 (1st Gen) function' lines and 65 'Successful update operation' lines, with no failure. Its only Node 20 warning is GitHub Actions' notice about the runner, not the functions runtime.)_ **Watch the first deploy after this merges.** The runtime switch
      redeploys every function at once, so a runtime-level incompatibility
      shows up everywhere simultaneously rather than in one endpoint. Expect
      the Node 20 deprecation warning to disappear from the log.
- [x] _(Proven 2026-10-17: Automated on every deploy. In run 39063239262, verify-deployed-functions-source.py read back the deployed zip of 21 functions, among them callables (completeOnboarding, configurePlan, addCommentCallable) and Firestore triggers (onRunCreated, onWorkoutCreated). It byte-compared index.js, which carries the injected '// CI build: 0b6e7b98…' marker, and checked each function's status is ACTIVE.)_ Spot-check one callable and one Firestore trigger in the Console
      afterwards (the `// CI build: <sha>` marker at the top of the deployed
      source confirms which commit is live).
- [x] _(Proven 2026-10-17: The functions have run on Node 22 in production for about 2.5 months. revenueCatWebhook, deployed on Node 22, answered RevenueCat's test event with 200 on 2026-09-30 (backlog line ~1655, run 36695765626), and the latest deploy reports every function updated and the 21 read-back functions ACTIVE. This row is a risk note, not a separate check.)_ Native/transitive deps are the residual risk the test run cannot cover —
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

- [x] _(Proven 2026-10-17: Deploy production run 39063239262 (0b6e7b98, 2026-10-17), functions/deploy job 117489508070: scripts/verify-deployed-functions-source.py byte-compares the deployed zip with the uploaded source and logged 'Verified deployed source: dailyRaceReconciliationSweep, version 202' and 'onRunCreated, version 262'. onRunCreated's comparison includes lib/raceDayCompletion.js, which requires ./raceTemplateIds at line 43, and lib/raceTemplateIds.js lists marathon_race. Caveat: in the script's targets dict, the key dailyRaceReconciliationSweep appears twice, so its second entry (index.js, raceReconciliation.js, runModeResolution.js, dateUtils.js) replaces the first, which listed raceDayCompletion.js. raceTemplateIds.js is not compared for any function. One deploy uploads one source archive, so this is not a real risk, but it is worth a one-line fix (merge the two entries).)_ **Deployed-source spot-check (do this first).** In the Console (`console.cloud.google.com/functions/details/us-central1/dailyRaceReconciliationSweep/source`, then `…/onRunCreated/source`), confirm the bundle contains `require("./raceTemplateIds")` and the string `marathon_race`. This is a `.js` change so the bundle-hash dedup should not bite, but green CI is still not proof — re-run Deploy production (`deploy-production.yml`) via `workflow_dispatch` if absent.
- [x] _(Proven 2026-10-17: Same evidence as line 1208. The marathon-with-lifting journey saves an app-shaped templated race run on race day, runs onRunCreated's real recovery-entry step and asserts recovery follows. The journeys job is green on main (run 39073527575).)_ **A completed race now clears the no-show.** Log a race-templated run on a race-prep user's race date at ≥95% of planned distance. `onRunCreated` logs should include `recovery-entry written for {uid}`, and `programState.runPlan.phase` should flip to `"recovery"` with the race-day runDay id appended to `completedRaces[]`. Pre-fix this never happened for any user.
- [ ] **Past races are not retroactively repaired — and there is a 14-day point of no return.** Verified mechanism, not a guess: `_needsRaceNoShowEvaluation` bails on `raceDayRunDay.status !== "planned"`, so once a slot is `race_no_show` the sweep never re-evaluates it. The predicate fix therefore does NOT self-heal past races. Two windows:
  - **Within 14 days of the race** the state is recoverable by the user: PR-D locked `race_no_show` as a soft-terminal status (`LEGAL_TRANSITIONS.race_no_show: ["planned"]`), surfaced as the **Restore** action on the locked day in `DayActionSheet`. Nothing automatic clears it — the lock deliberately made recovery a user action.
  - **Past 14 days** the sweep's L4 auto-exit (`NO_SHOW_EXIT_GRACE_DAYS = 14`) returns the user to `runMode: "freeform"` and nulls `raceGoal` on both the profile and the runPlan. Restoring the runDay after that does NOT bring the race goal back — the user has to re-declare the race. So any user whose race passed >14 days before the fix deployed has silently lost their race goal.

  Decide whether to backfill. With one pre-launch user this is likely a manual repair rather than a migration, but it is a real user-visible residue of the original bug, not a deploy failure — don't read a clean sweep log as "nobody was affected".

## Race started outside the plan — the second half of the same bug

Affects: `functions/lib/raceDayCompletion.js` (`isStrictRaceRun`), reached from `dailyRaceReconciliationSweep` and `onRunCreated`. Client counterpart shipped separately in `src/lib/scheduledRunCompletion.ts`.

PR #1775 (above) fixed `isStrictRaceRun` comparing `actualTemplateId` to the literal `"race"`. It did not fix the conjunct that comparison sat in: the predicate still required the tag AND the ≥95% distance. But `actualTemplateId` is only written when the run was launched from the scheduled slot — `freeformPlanMetadata` writes `null` — so **a user who taps Start Run on the start line saves their race untemplated**, which is ordinary race-morning behaviour rather than an edge case.

For those users the post-#1775 behaviour was the pre-#1775 behaviour: no recovery entry, a `race_no_show` written by the sweep, and at `NO_SHOW_EXIT_GRACE_DAYS = 14` the L4 auto-exit strips `raceGoal` entirely. The tag and the distance are two forms of the same evidence; requiring both meant requiring the one that is absent exactly when it matters. Distance now stands alone, and the tag still carries the zero-planned branch where there is nothing to measure.

- [x] _(Proven 2026-10-17: Deploy production run 39063239262 (0b6e7b98, 2026-10-17), functions/deploy job 117489508070: scripts/verify-deployed-functions-source.py byte-compares the deployed zip with the uploaded source and logged 'Verified deployed source: dailyRaceReconciliationSweep, version 202' and 'onRunCreated, version 262'. Current functions/lib/raceDayCompletion.js has `typeof savedRun.distance !== "number"` at line 137, ahead of the isRaceTemplateId call at line 145 inside the `plannedDistanceMeters <= 0` branch (line 138), and onRunCreated's byte comparison includes that file. The sweep reaches it through lib/raceReconciliation.js, which is byte-verified (same caveat as line 1461).)_ **Deployed-source spot-check (do this first).** Console → `dailyRaceReconciliationSweep/source` and `onRunCreated/source`: `isStrictRaceRun` should read `typeof savedRun.distance !== "number"` BEFORE any `isRaceTemplateId` call, and the `isRaceTemplateId` call should sit inside the `plannedDistanceMeters <= 0` branch. `.js` change so the bundle-hash dedup shouldn't bite — verify anyway.
- [x] _(Proven 2026-10-17: Pinned in functions/**tests**/recoveryEntry.test.js 'DOES write for a full-distance race started outside the plan' and in raceDayCompletion.test.js 'accepts an UNTEMPLATED run that went the distance' (actualTemplateId: null). The sweep side is in dailyRaceReconciliationSweep.test.js '\_hasStrictRaceMatch returns TRUE for a full-distance run whatever template it carries'. The deployed source matches (run 39063239262).)_ **An untemplated race clears the no-show.** On a race-prep test account, log a run on the race date at ≥95% of the planned distance WITHOUT starting it from the scheduled slot. `onRunCreated` logs should include `recovery-entry written for {uid}`; `programState.runPlan.phase` flips to `"recovery"`. Pre-fix this never happened for a freeform start.
- [x] _(Proven 2026-10-17: Pinned in functions/**tests**/recoveryEntry.test.js 'does not write when the saved run is short of the ≥95% bar', raceDayCompletion.test.js 'still refuses an untemplated run that did NOT go the distance' and 'rejects below 95%' (9000/10000), and dailyRaceReconciliationSweep.test.js 'returns false for an untemplated run that is short of the bar'.)_ **The distance bar is still live.** Same account, a run at ~90% of planned on race date must NOT enter recovery and must still read as a no-show — the fix removed the tag gate, not the ≥95% one.
- [ ] **Same backfill question as #1775, now wider.** That row's 14-day point of no return applies to this population too, and it is the larger one: pre-fix, only races launched from the slot were ever recognised. Any user whose race passed >14 days before this deploys has silently lost their race goal and must re-declare it. A clean sweep log is not evidence nobody was affected.

## PR-L bugfix verification (PR #815)

Affects: `functions/index.js`, `src/pages/RunSummary.tsx`. Eight verified bugs in the PR-L arc fixed; the production-impact ones below need post-deploy spot-checks because the bugs were silently-broken-not-loud.

- [x] _(Proven 2026-10-17: src/lib/runCompletion.ts runDocument writes `date: localDateString(startedAt)` (line 93). It is pinned by src/lib/**tests**/runCompletion.test.ts 'files the run under the day it started, not the day it was saved' and 'dates a run with no trace by when it was saved'. All three server run queries (index.js lines 3150, 3505, 7026) read `date`.)_ Real race-templated saved run on race date has the new top-level `date: "YYYY-MM-DD"` field — confirm via Firestore console
- [x] _(Proven 2026-10-18: `functions/__tests__/integration/dailyRaceReconciliation.test.js` 'L1 leaves a race the runner finished: the app's saved run on race day clears it', on the Firestore emulator. A race_prep user is 10 days past a 10K, with a run carrying `runDocument`'s fields: date = race date, 9,960 m, actualTemplateId null. The sweep's own `date == raceDate` query finds it, so noShowWritten is false and the race-day runDay stays 'planned'. Querying `createdAt` instead turns the test red.)_ `dailyRaceReconciliationSweep` logs no longer report false `race_no_show` for users who completed their race
- [x] _(Proven 2026-10-18: `functions/__tests__/integration/weeklyFellBehindCheck.test.js`, on the Firestore emulator. A race_prep user with weeklyRunDaysTarget 3 and three runs carrying `runDocument`'s fields in the prior Mon..Sun gets no pendingFellBehindPrompt ('finds the week's three saved runs and sets no prompt'). With no runs, the prompt is set at 0 of 3. Runs on the Sunday before and the Monday after are not counted. Pointing the query at a field saved runs lack turns the first and third tests red.)_ `weeklyFellBehindCheck` Monday log line shows realistic `set=N` count (pre-fix it would have been every-active-user every Monday because the runs query returned 0 docs)
- [x] _(Proven 2026-10-17: Same evidence as line 1208: the marathon-with-lifting journey (green in run 39073527575) runs the real recovery-entry step on an app-shaped race-day run and sees runPlan.phase 'recovery'. functions/**tests**/recoveryEntry.test.js 'writes recovery + completedRaces when all gates pass (10K)' pins it too.)_ Recovery-entry path writes `phase: 'recovery'` on the first race-templated save after race date — check `programState/current` doc for the affected user
- [x] _(Proven 2026-10-17: On the emulator, functions/**tests**/integration/dailyRaceReconciliation.test.js 'L3 recovery-exit: materializes…' reads the persisted programState and asserts runPlan.phase and recoveryEndDate toBeNull, which fails if the fields are omitted. The unit tests in dailyRaceReconciliationSweep.test.js (lines 401-402) pin the payload too.)_ L3 clear writes `phase: null` and `recoveryEndDate: null` (not omitted) — the user actually exits recovery
- [ ] On a BST day, `weeklyPerformanceRollup` and `dailyPerformanceRefresh` log timestamps confirm the timezone fix landed (23:15 UTC and 02:10 UTC respectively — was 22:15 / 01:10 pre-fix due to Europe/London)
- [x] _(Proven 2026-10-17: functions/index.js uses `participantSnap.exists` as a property (lines 3995, 4172). On the emulator, functions/**tests**/integration/challengeActivityWindow.integration.test.js 'credits the challenge whose window contains the workout's date' runs onWorkoutCreated.run and asserts the participant's value goes to 1. onWorkoutCreated's deployed source is byte-verified (run 39063239262).)_ On a real workout save, `onWorkoutCreated` logs include challenge-progress increments (pre-fix this silently TypeErrored on `participantSnap.exists()` and was swallowed)

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
- [ ] **The trial copy against Apple's sheet.** Apple grants the
      introductory offer per Apple Account, so the paywall now also asks
      RevenueCat's intro-eligibility check (`useStoreTrialEligibility`,
      2026-10-17) and drops the trial copy when Apple says no; when
      RevenueCat can't tell, the account's `hasUsedTrial` decides. On a
      sandbox account that has already used the intro offer, the Pro page,
      the Pro sheet and Home's strip show the price, not "7 days free";
      on a fresh one they show the trial. Both agree with Apple's sheet.
- [ ] **App Store Connect after the first iPhone-only upload**: the build
      lists iPhone only, and the version page asks for iPhone screenshots
      only. Nothing has been released with iPad support, which is the only
      time dropping it is allowed.

## Apple subscription uniqueness binding (PR #822)

Affects: `functions/applePurchase.js`, new `appleSubscriptions/{originalTransactionId}` collection.

STATUS 2026-11-01: `applePurchase.js`, `appleIAP.js` and the three
functions they served (`restoreApplePurchases`, `verifyApplePurchase`,
`appleIAPWebhook`) are deleted; purchases go through RevenueCat. The rows
below are history. The checks that replace them are under "Security review
fixes" at the end of this file.

- [x] _(No longer applies, 2026-10-17: #2434 (0130e705, 2026-09-19) removed the client's direct StoreKit path (purchaseWithAppleIAP, cordova-plugin-purchase), and iOS purchases now go through RevenueCat. Nothing in src/ calls verifyApplePurchase or restoreApplePurchases, so a real purchase no longer creates appleSubscriptions docs. The server binding is still pinned by functions/**tests**/applePurchase.test.js 'claims the lookup doc on a brand-new transaction id'. ADR-0006 retires these functions at slice 8.)_ First real iOS purchase post-deploy — confirm a new `appleSubscriptions/<originalTransactionId>` doc is created with `uid` matching the purchaser, plus `productId` and `expiresAt`.
- [x] _(No longer applies, 2026-10-17: Restore now calls RevenueCat (purchaseProvider.ts restorePurchases → rcRestore), not restoreApplePurchases (removed from the client in #2434 / 0130e705). Same-uid renewal on the legacy callable is pinned by applePurchase.test.js 'accepts when the transaction id is already bound to the SAME uid (legit renewal)'.)_ Restore-purchase flow on the same Apple ID under the same Tropos account — confirm the lookup doc updates in-place (timestamp changes, uid stays).
- [x] _(Proven 2026-10-17: functions/**tests**/applePurchase.test.js 'rejects when the transaction id is already bound to a different uid' asserts the call rejects with /different account/ (line 656). The callable is still deployed (restoreApplePurchases updated in run 39063239262) but has no client caller.)_ Negative test: attempt to call `restoreApplePurchases` from a second test account using the first user's `originalTransactionId` (intercept via debug). Expect the function to throw `"different account"` and no user-doc write to land.

## Stripe webhook transactional dedup (PR #822)

Affects: `functions/index.js` `stripeWebhook` handler, `stripeEvents/{event.id}` doc shape.

- [x] _(Proven 2026-10-18: `functions/__tests__/stripeWebhookDedup.test.js` 'claims the event, processes it, and records both claimedAt and processedAt' and 'skips a second delivery of the same event id, writing nothing'. They drive the real handler with a payload signed by the Stripe SDK's test helper, on the in-memory Firestore. No real delivery will come while Stripe is dormant (#2866).)_ Post-deploy, on the next real Stripe webhook delivery, confirm the `stripeEvents/<event.id>` doc has a `claimedAt` field (new) AND a `processedAt` field (existing). Pre-fix only `processedAt` was set.
- [x] _(Proven 2026-10-18: `functions/__tests__/stripeWebhookDedup.test.js` 'releases the claim when processing fails, so Stripe's retry is processed'. The user read fails after the claim and the handler answers 500. `stripeEvents/{id}` is set, then deleted, and the same id redelivered is processed.)_ If a webhook handler crashes mid-process (force via stripe-cli test event), confirm the `stripeEvents/<event.id>` doc is DELETED so Stripe's retry can re-attempt. Pre-fix the partial claim would persist and the retry would silently skip.
- [ ] **The endpoint sends `invoice.paid`.** The activation report's first
      paid period from Stripe is read from `invoice.paid` (and a paid
      Checkout session), and a Stripe endpoint receives only the events it
      is subscribed to. When Stripe is woken (#2866), in the Stripe
      dashboard → Developers → Webhooks → the production endpoint, confirm
      `invoice.paid` is among its events alongside
      `checkout.session.completed` and the `customer.subscription.*`
      events. Passing: a live renewal's event shows on the endpoint's log
      with a 200, and that account's `activationBillingFirsts.paid` is set.
      A measurement that fails to save is logged
      (`activationBilling.record_failed`) and never answers Stripe 500.

## Blocking is now server-enforced (kudos + comments)

Affects: `functions/index.js` (`toggleKudosCallable`, `addCommentCallable`),
new `functions/lib/blockGuard.js`. Deploys via `deploy-functions.yml`.

Blocking was CLIENT-side suppression only — `blocks/{blocker}/users/{target}`
was written and read by the client and nothing in `functions/` or
`firestore.rules` consulted it. A blocked user could still kudos and comment;
the callable wrote the counter, sub-doc AND notification, and the recipient's
app then hid the feed row while the tray row and push had already landed. The
guard refuses in BOTH directions and fails CLOSED on a read error.

- [x] _(Proven 2026-10-17: Deploy production run 39063239262 (2026-10-17, commit 0b6e7b98): 'Verify deployed function source' step logged 'Verified deployed source: toggleKudosCallable' and 'addCommentCallable'. That means deployed index.js is byte-identical to main's, and main's index.js:48 has require("./lib/blockGuard"). No functions/ diff from 0b6e7b98 to HEAD.)_ **Deployed-source spot-check (do first).** Console →
      `toggleKudosCallable` and `addCommentCallable` source contains
      `require("./lib/blockGuard")`.
- [x] _(Proven 2026-10-17: functions/**tests**/blockGuard.test.js: 'refuses when the OWNER blocked the actor', 'refuses when the ACTOR blocked the owner', 'kudos checks the block before any write', 'comments check the block before any write', 'is permission-denied, and does not confirm the block'. The deployed source matches main (run 39063239262).)_ **A blocked user is refused.** With two test accounts: A blocks B, then
      B kudos A's activity. Expect `permission-denied` client-side, NO kudos
      counter change, and NO tray row for A. Repeat for a comment.
- [ ] **Ordinary interaction is unaffected.** Two accounts with no block
      between them: kudos and comment still work. This is the regression to
      watch — a guard that refused everything would look identical in the logs
      to one that works.
- [x] _(Proven 2026-10-17: functions/lib/socialFanout.js createNotification calls blockGuard.isBlockedBetween before any write. functions/**tests**/socialFanout.test.js 'createNotification — block backstop': 'skips a notification to someone who blocked the sender', 'skips when the SENDER blocked the recipient', 'still delivers when there is no block'. toggleSpacePostLikeCallable notifies through socialFanout.createNotification (index.js ~6448). Deployed in run 39063239262.)_ **Every other surface is covered by a backstop inside
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

- [x] _(Proven 2026-10-17: Run 39063239262 uploaded one source archive (commit 0b6e7b98). Its log shows 'functions[weeklyPerformanceRollup] Successful update operation'. In that commit, deloadLoadScore is in functions/lib/perfScoring.js and priorDeloadIndex is in functions/performanceEngine.js. The verify script does not byte-check this one function, but every function deployed from the same upload.)_ **Deployed-source spot-check (do first).** Console →
      `weeklyPerformanceRollup` source contains `deloadLoadScore` and
      `priorDeloadIndex`.
- [x] _(Proven 2026-10-17: src/lib/**tests**/singleDisciplineWeek.test.ts 'changes nothing for a week that trained both, or neither' runs on the server perfScoring.js and the client copy. functions/**tests**/performanceEngine.test.js 'persists deloadIndex so next week can compare like with like' pins deloadIndex in perfDoc. Deployed (run 39063239262).)_ **New docs carry the field.** After the next rollup, a perf doc has
      `deloadIndex`. For a both-disciplines week it must EQUAL
      `performanceIndex`; only a single-discipline week may differ.
- [x] _(Proven 2026-10-18: src/lib/**tests**/deloadNagLoop.test.ts, 'deload trigger — a run-only athlete is told on the transition', on both engines: 26 run-only weeks at 3, 5 and 8% growth, each week's deloadIndex carried forward as the priors the way priorDeloadIndex reads them, are offered a deload once (week 5), while the deload index sits at 88-94 every week and the displayed PI at 62-65. A history of legacy docs is offered once, after the first new doc; a second block after an easy fortnight is offered once more; priors read in mixed units would offer it 25 weeks of 26. Removing the server's transition guard, or asking the client's question against the PI, fails it.)_ **No new nag.** The sustained trigger compares against the prior two
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

- [x] _(Proven 2026-10-17: In commit 0b6e7b98, functions/performanceEngine.js has require("./lib/calorieTargetResolution"), pinned by performanceEngine.test.js 'resolves the scoring target from the profile and its effective tier'. Run 39063239262 logged a successful update for weeklyPerformanceRollup and dailyPerformanceRefresh from that one upload.)_ **Deployed-source spot-check (do first).** Console →
      `weeklyPerformanceRollup` and `dailyPerformanceRefresh` source contains
      `require("./lib/calorieTargetResolution")`. A `.js` change, so the
      bundle-hash dedup should not bite — verify anyway (CI-green is
      necessary-not-sufficient).
- [x] _(Proven 2026-10-17: src/lib/**tests**/adaptiveTargetMirror.cross.test.ts: 'a Pro user on the learned target is scored against it', 'rejects the epoch seed anchor, which means never applied', 'a compliant Pro cutter scored 64 against the stale target, 100 against the shown one'. The wiring is pinned in performanceEngine.test.js. Deployed.)_ **A Pro user on a learned target scores against it.** Spot-check a user
      whose `adaptiveCapState.lastAppliedAt` is real (not the epoch anchor)
      and whose `lastApplied` differs from `targetCalories` by >10%: after the
      next rollup their `adherenceScore` should reflect intake measured
      against `lastApplied`. Pre-fix, eating the displayed target read as a
      miss.
- [x] _(Proven 2026-10-17: adaptiveTargetMirror.cross.test.ts: 'a free user is scored against the formula target' (covers a lapsed Pro with a surviving capState), 'a manual override outranks a learned value', 'nothing changes for the users who were never on a learned target'.)_ **Free and manual-override users are unchanged.** The overwhelming
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

- [x] _(Proven 2026-10-17: Run 39063239262 logged 'Verified deployed source: onWorkoutCreated' and 'onRunCreated' (index.js byte-identical). main's index.js:57-59 requires ./lib/partnerStreakPersist, and lines 4574 and 4699 call applyPartnerActivity.)_ **Deployed-source spot-check (do first).** In the Console (`console.cloud.google.com/functions/details/us-central1/onWorkoutCreated/source` and `…/onRunCreated/source`), confirm the deployed bundle contains `applyPartnerActivity` and the `require("./lib/partnerStreakPersist")`. CI-green is necessary-not-sufficient (the dedup/bundle-hash gotcha) — though this is a `.js` change so dedup shouldn't bite, verify anyway.
- [x] _(Retired 2026-11-12: partner streaks went with Trim1 call 3(b), so there is no shared day to count. See "Partner streaks, retired".)_ **First real shared day counts.**
- [x] _(Proven 2026-10-17: functions/**tests**/partnerStreakPersist.test.js 'is idempotent on a same-day re-log (no second write)'. Deployed source verified (run 39063239262).)_ **Same-day re-log is a no-op write.** Log a SECOND workout as A on the same day; confirm the bond doc's `updateTime` does NOT change (the engine's MAX-idempotency + the changed-guard skip the write).
- [x] _(Proven 2026-10-18: `functions/__tests__/partnerStreakPersist.test.js` 'onRunCreated — an ineligible run does not count'. index.js's onRunCreated decides with `isVolumeEligibleRun(data)` and calls applyPartnerActivity once, inside the `if (isCountable)` block. Moving the call above the gate, or into its else branch, turns the test red.)_ **Ineligible run doesn't count.** Save an `isInvalid` / `savedAnyway` / sub-threshold run; confirm the bond's `lastActive` does NOT update (gated on the same eligibility predicate as challenges).
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
- [x] _(Proven 2026-10-18: My communities: `src/features/spaces/__tests__/useCommunitiesFeed.test.ts` "leaves out the old coach posts and keeps the members' posts" seeds a joined space with a tropos-coach post and a member's post on the Firestore fake, and only the member's post comes back. The Space page: `src/pages/__tests__/Space.test.tsx` "hides the retired coach posts and puts the pinned team note above the members". No Coach badge: `src/features/spaces/__tests__/SpacePostCard.test.tsx` "shows a member's post with no badge and no reply prompt" and "retired coach posts". All passed today.)_ **Old coach posts are gone from new builds.** Open a space that had
      them, and Feed → My communities: no "Tropos Coach" post, no Coach
      badge. An older build still shows them until it updates.
- [ ] **The reworked Space page on a device.** Join and Joined read on
      every cover photo and on a space without one; Leave asks first; an
      empty space's "Share your last session" opens the composer with that
      session attached.
- [x] _(Proven 2026-10-17: The coach half is obsolete (weeklyCoachPrompts deleted). For the spacePostEngagement half, run 39063239262 logged 'Verified deployed source: addSpacePostCommentCallable', which byte-checks lib/spacePostEngagement.js and index.js, and 'functions[toggleSpacePostLikeCallable] Successful update operation' from the same upload.)_ ~~**Deployed-source spot-check (do first).** Console → `weeklyCoachPrompts` source contains `require("./lib/coachPrompts")`; `toggleSpacePostLikeCallable` source contains `spacePostEngagement`.~~ Superseded; the `spacePostEngagement` half still applies.
- [x] _(No longer applies, 2026-10-17: weeklyCoachPrompts no longer exists on main (no match in functions/). The prune was confirmed in deploy run 36310769458 (2026-09-27), and the backlog's own [x] row records it.)_ ~~**First Monday firing (04:00-07:00 UTC window).**~~ Superseded: the job no longer exists.
- [ ] **Like round-trip on device.** Tap the flame on a space post → fills coral + count bumps instantly; kill the app, reopen → state persisted (server txn landed). Re-tap → count returns. A second account liking YOUR post lands a coral `space_post_like` tray row that deep-links to the space.
- [ ] **Comment round-trip on device.** Comment on another account's post → author gets the `space_post_comment` tray row → tapping it opens the space. Delete your own comment → count decrements. (A comment on a retired COACH post, reachable only from an older build, must still produce NO notification.)
- [x] _(Proven 2026-10-18: `src/pages/__tests__/Space.test.tsx`, "race identity (SOC-P2f)", with a goal whose eventSpaceId is london-marathon: "offers the switch on your race's space and on no other race" (none on Manchester) and "switching it on puts the race on your public profile, and off takes it away" (users/{uid}/public/profile.trainingForSpaceId set to london-marathon by a merge, then null). `src/pages/__tests__/UserProfile.test.tsx` "shows the race they chose to show on their profile, and none otherwise" hands that field to TrainingForChip, whose coral "Training for {race} · N wks", link to the space and self-heal after race day are pinned in `src/features/spaces/__tests__/TrainingForChip.test.tsx`. The rules' value gate is in `firestore.profile.rules.test.ts`, green on the emulator today.)_ **Race identity opt-in.** With a race goal set, the bound race space shows the "Show on your profile" toggle (and ONLY there — other race spaces must not). Toggle on → your profile shows "Training for {race} · N wks" in coral, linking to the space. Toggle off → chip gone. After race day passes, the chip must disappear ON ITS OWN (display gate) even if the toggle was left on.
- [x] _(Proven 2026-10-18: `src/features/spaces/__tests__/useCommunitiesFeed.test.ts`: "puts two spaces' posts in one stream, newest first", "with spaces joined and nothing posted, settles on an empty stream" and "refresh reads the stream again and shows what was posted since". `src/components/social/views/__tests__/FeedView.test.tsx`: "renders joined-space posts" (the space-name eyebrow links to the space), "with no space joined, the empty stream asks you to join one", "empty stream shows the honest join prompt, never a blank column" (the quiet line once spaces are joined) and "pull-to-refresh refreshes My communities while it is the source shown". `src/pages/__tests__/Social.feed.test.tsx` "pulling the page down reads the joined spaces' posts again" runs the real shell, FeedView and hook on the Firestore fake.)_ **Communities feed source.** Feed → source sheet → "My communities": joined-space posts newest-first under space-name eyebrows; empty states are the join prompt (no spaces) or the quiet-week line (spaces joined, nothing posted) — never a blank column. Pull-to-refresh refetches this stream while active.
- [x] _(Proven 2026-10-17: Run 39063239262 'firestore / deploy' passed 'Verify active Firestore Rules source' (scripts/verify_deployed_rules.py compares the live ruleset to firestore.rules). main's firestore.rules has match /likes/{likeUid} (l.1316), match /comments/{commentId} (l.1326) and the trainingForSpaceId value gate (l.590-599). No rules diff since.)_ **Rules deploys landed.** Firebase Console → Firestore Rules contains `match /likes/{likeUid}`, `match /comments/{commentId}` (both read-only), and the `trainingForSpaceId` value gate on the public profile. Three rules deploys shipped today — verify the LAST one is live.

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
- [x] _(Proven 2026-10-17: src/lib/**tests**/shareDefaultsAccount.test.tsx: 'Settings saves it on users/{uid}, one field per type, and a device that had 'public' saved no longer auto-posts', and 'a finish screen acts on a change another device made while this one kept the app open'. The rules allowing it are live (row 1921 [x], and the run 39063239262 rules verify).)_ **One answer on every device.** Set Runs to Never in Settings on the
      web, then finish a run on a phone that had the app open since before:
      nothing is posted, and the finish screen offers its one-off share
      button instead.
- [x] _(Proven 2026-10-17: shareDefaultsAccount.test.tsx 'moving a device's own answers to the account': 'moves an answer the account does not have, then forgets it', 'keeps the account's answer when the device's is less private', 'moves the device's answer when it is more private', 'offline, applies the device's answer without moving it, and moves it once online'.)_ **A phone's old answer moves.** On a phone that answered on an older
      build, open the app online after updating: Settings on the web shows
      that answer, or the account's own where it was more private.

## Global hybrid challenge + hybrid_score sync (SOCIAL S4 Soc8, PR2)

Affects: `functions/lib/challengeDefs.js` (new `global-monthly-*` hybrid definition), `functions/index.js` (`onWorkoutCreated` / `onRunCreated` now sync `hybrid_score`). Deploys via `deploy-functions.yml`. The daily `rolloverChallenges` cron materialises the new challenge doc; the trigger sync feeds it.

- [x] _(Proven 2026-10-17: The literal check is outdated: hybrid_score moved into functions/lib/challengeBackfill.js runChallengeIncrements/workoutChallengeIncrements, which index.js loops over (pinned by challengeBackfill.test.js 'onWorkoutCreated and onRunCreated iterate the increments helpers'). Run 39063239262 verified the deployed onRunCreated/onWorkoutCreated index.js byte-identical.)_ **Deployed-source spot-check (do first).** In the Console (`…/onRunCreated/source`), confirm the bundle contains `"hybrid_score"` in a `syncChallengeProgress` call. Per the dedup gotcha — `.js` change, dedup shouldn't bite, but verify.
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
- [x] _(Proven 2026-10-18: `firestore.rules.test.ts` "profile: a stranger sees the public post, follows, and on reopening sees the followers-only one too", run against the Firestore emulator (all eight rules suites, 367 passed). As a non-follower, the profile's public query lists the public post and its followers-only query is refused; the follow is written as followUser writes it; then both queries list their post. `src/hooks/__tests__/useUserProfileData.test.ts` "lists the public posts when the rules refuse a non-follower the followers-only query" shows the refusal is quiet and the public post still lists. The emulator does not check indexes; authorId + visibility + createdAt is in `firestore.indexes.json`.)_ **A profile you don't follow** shows its public sessions; follow
      them and reopen it: followers-only sessions appear too.
- [x] _(Proven 2026-10-18: a person following nobody opens on Explore by default, and the first follow used to switch the screen to Following, which fills only with posts made after a follow, so the posts vanished under the tap. A visit now stays on the source it opened on: `src/pages/__tests__/Social.followUpdates.test.tsx` 'stays on Explore when the first follow arrives during the visit' (red before the fix). The card side is `src/pages/__tests__/Social.feed.test.tsx` 'the link says Following, Bea's other post loses its link, and the line counts the follow' (#2882).)_ **Follow from a post** on Explore: the link turns to "Following",
      the line over the feed counts the follow, and the person's other
      posts lose their Follow link at the same moment.
- [x] _(Proven 2026-10-17: src/features/spaces/**tests**/SpacesDirectory.test.tsx "keeps filters visible through no matches and recovers across countries" on main. It opens the Country sheet, picks Germany, checks the sheet closes, picks the Half distance chip, reaches "No matching races" and then "Clear filters" restores both races.)_ **Race chips:** the country sheet, the distance chips, and "Clear
      filters" from no matches.
- [ ] **Share your week** from the recap's first card exports a card with
      last week's numbers.
- [x] _(Proven 2026-10-18: on the real Firestore SDK with the backend unreachable, getComments resolved an empty page from the cache instead of failing, so the sheet said "No comments yet". It now treats an empty answer from the cache as a failed read: `src/lib/__tests__/socialApi.test.ts` 'fails when there is no connection and nothing cached, rather than reading as empty' (red before the fix), and CommentSheet.test.tsx 'says a failed read failed, and Try again reads again' shows the rejection as "Couldn't load comments". A thread read before still shows its cached comments.)_ **Comments with no signal:** open a post's comments in airplane
      mode. It says "Couldn't load comments" with Try again, never "No
      comments yet" (which it also used to show while comments loaded).

## The Together copy pass (owner, 2026-10-26)

Affects: `ChallengeList`, `ChallengeCard`, the new `ChallengeRow`,
`challengeEditions.ts`, `challengeFormat.ts` (`challengeGoal`),
`CollectivePulse`, `SpacesDirectory`, and the descriptions in
`functions/lib/challengeDefs.js` (deploys with the functions; the daily
`rolloverChallenges` rewrites a running challenge's description).

The intro paragraph went; joining confirms the edition and when the next
one opens. Time left is said once for the month. Cards say their goal
from the target in the reader's units, the "See N more" list is compact
rows, no founding or "New space" line stands in for a count, the
collective card shows "0 of 1,000 km", and an unjoined Weekly Warrior in
its last day offers no Join.

- [ ] **The new words reach the running challenges.** After the functions
      deploy and the next 00:05 UTC `rolloverChallenges`, read
      `challenges/strength-monthly-<YYYY-MM-01>`: its description is
      "Everything you lift this month adds up.", and
      `global-monthly-<YYYY-MM-01>`'s is "Running and lifting both count,
      toward one score." (The cards show the goal either way.)
- [ ] **On a phone:** join a monthly challenge from the "See N more" rows
      and read the toast ("You're in for … opens on 1 …"); on a Sunday,
      with Weekly Warrior not joined, the card says "Ends tonight. The
      next one starts Monday." and offers no Join.

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
- [x] _(Proven 2026-10-17: Proven link by link. (1) Client write: ActivityNotificationsGroup.test.tsx plus notificationPreferences.cross.test.ts pin the client keys to the server's. (2) Rules: ticked row above, run 36916879108. (3) Server gate: functions/**tests**/socialFanout.test.js "skips each kind whose switch is off, and only that kind" (kudos->kudos, with a matching delivery for each case). toggleKudosCallable sends type "kudos" through socialFanout.createNotification (functions/index.js ~6328). (4) Deployed: ticked deploy row, run 36916879108, update op for toggleKudosCallable.)_ **A switch stops its kind.** With two accounts: A turns Props off and
      B gives one of A's posts props; nothing new under A's bell. A turns it
      back on and B gives props on another post; it arrives.
- [x] _(Proven 2026-10-17: functions/**tests**/integration/followerNotification.test.js runs the real onFollowerCreated trigger against the emulator. All 3 cases passed in emulator-tests run 39073527575 (2026-10-17): off by default, off when the switch is off, and one row (id follow_<uid>) however often the trigger runs. The trigger path followers/{uid}/users/{followerUid} matches the client write in socialApi.ts. NotificationsSheet.test.tsx renders "Robin started following you". The create op was deployed in run 36916879108.)\_ **New followers.** A turns New followers on and B follows A: "B
      started following you" under A's bell, in one row however often B
      unfollows and follows again. With the switch off (the default),
      nothing.
- [x] _(Proven 2026-10-17: src/components/settings/**tests**/ProfileInfoSection.test.tsx, "weight and height in the chosen units" block: "shows pounds, and saves what is typed in pounds as kg" (weightKg 72.57), "shows feet and inches, and saves them as cm" (heightCm 182.9), plus no-rounding and range cases. A lb/ft edit writes the same weightKg/heightCm through the same updateProfile call as a kg edit, so the calorie target follows the same path.)_ **Pounds and feet on Profile.** With lb and ft chosen, Profile shows
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

- [x] _(Proven 2026-10-17: Deploy production run 36984078331 (#2553 merge a81a37db, 2026-10-02). functions/deploy logged "completeOnboarding Successful update operation" at 08:34:02Z and "Verified deployed source: completeOnboarding" at 08:35:40Z. Hosting started at 08:35:47Z, after both. The check is gone on main (functions/index.js ~712, comment in its place). `gh run list -w deploy-ios.yml` returns no runs, so CI never made a TestFlight build from the branch.)_ **Functions before the client.** `completeOnboarding` must drop its
      verified-email check before a build without the verify screen reaches
      anyone, or an unverified email account cannot finish setup. Deploy
      production releases Functions before Hosting; a TestFlight build made
      from the branch before the merge is the case to avoid.
- [x] _(Proven 2026-10-17: Run 36984078331, job 110766224059 (functions / deploy): "✔ functions[completeOnboarding(us-central1)] Successful update operation." at 2026-10-02T08:34:02Z. The bundle marker is "// CI build: a81a37db…" and the source read-back passed.)_ **Deploy verification.** The functions deploy log shows a successful
      update operation for `completeOnboarding`.
- [ ] **An email sign-up on a phone:** no wall before the questions, the
      link arrives during onboarding, and after tapping it in Mail and
      coming back, Home's "Verify your email" notice has gone.
- [ ] **The first screen:** a fresh install opens on the welcome screen;
      after signing out, the same phone opens on Sign in.
- [ ] **A Google sign-up's photo** is still on their profile, seen from a
      second account, after onboarding.
- [x] _(Proven 2026-10-18: e2e/loseFatGoalWeight.auth.spec.ts 'the plan's target is under maintenance, and Nutrition shows the goal and pace' (emulator rig, Start my plan answered by the real completeOnboarding handler): sign up, Lose fat, 80 kg with a goal of 70 kg at 0.25 kg a week. The review shows 2,470 kcal; the saved profile has goalWeightKg 70 and weeklyRateKg -0.25; Settings → Nutrition shows 70.0 kg, Relaxed, "Losing → Cut", Base TDEE 2,740 and Daily target 2,470 cal (the review's figure), with the Cut offset the difference.)_ **Lose fat with a goal weight:** the plan's target is below
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

- [x] _(No longer applies, 2026-10-17: Struck through in the row itself and superseded by the STATUS 2026-09-27/28 notes. CI released the rules first (run 34976838538), and Deploy production run 36443298145's "Confirm Storage rules can read Firestore" check found the role in place. Every backend release re-runs scripts/verify_storage_rules_iam.py.)_ ~~**Grant cross-service access.** Run `firebase deploy --only storage --project adaptive-fitness-af8bb` **from a project-owner machine** and approve the Firebase prompt that lets Storage Rules read Firestore. (This first deploy is intentionally a human action — do not try to route the approval through the CI service account.)~~ Superseded by the STATUS above: CI released the rules first, so this command no longer prompts.
- [x] _(Proven 2026-10-17: These 12 cases no longer skip. Firebase Emulator Tests run 39073527575 (main 4fdf5a12, 2026-10-17) ran storage.rules.test.ts with REQUIRE_STORAGE_EMULATOR=1 and REQUIRE_FIRESTORE_EMULATOR=1 on demo-tropos: "account-deletion write freeze (12)" passed, 29/29, none skipped. The 12 are 4 prefixes × (active deletion denies write/delete but read works; tombstone freezes; requested/cancelled/no-tombstone keep write access). The 2026-08-02 audit's objection was that they self-skipped, which no longer happens in CI.)_ **Verify the freeze on a NON-production project first:** seed an `accountDeletionRequests/<uid>` doc with `status: "running"` (or a `deletedAccounts/<uid>` tombstone) and confirm an owner upload/delete to `progress-photos/<uid>/…` is denied, while reads still succeed and a user with no deletion record can still upload.
- [x] **(Optional) re-enable CI auto-deploy** — set 2026-09-15, between the first attempt of run 34976838538 (deploy skipped) and its re-run (deployed). For future storage.rules changes: set the repo variable `STORAGE_XSERVICE_APPROVED=true` (GitHub → Settings → Secrets and variables → Actions → Variables). Until then the ONLY way to ship a storage-rules change is the manual `firebase deploy` above — **re-running Deploy production (`workflow_dispatch`) does not work as an escape hatch here**, unlike for functions. The `deploy` job's `if: vars.STORAGE_XSERVICE_APPROVED == 'true'` is evaluated for dispatch runs too, so a manual re-run skips the deploy and still reports green. (This doc line claimed the opposite until 2026-07-26; an operator following it in an incident would have believed the rules shipped when nothing had.) The `report-not-deployed` job now fails on any gated run so the skip is legible instead of silent.
- [x] Spot-check the deployed rule in the Firebase Console (Storage → Rules) contains `isDeletionWriteFrozen`. Automated: each backend release's `Verify active Storage Rules source` step matches the live ruleset to `storage.rules`, which carries it.

## Console checks a fix depends on (2026-10-25)

- [ ] **Email Enumeration Protection is on.** Firebase console →
      Authentication → Settings → User actions. A failed password sign-in
      asks `fetchSignInMethods` for the address and, for a Google- or
      Apple-only account, says which button to use (`src/pages/Login.tsx`,
      `authErrors.ts`). With protection on, that call answers nothing for
      any address, so Login cannot be used to learn whether an account
      exists. With it off, typing any email reveals that, and the provider.
      Passing: the switch reads enabled, and a wrong password for a
      Google-only test account shows "Invalid email or password", not the
      Google hint.

## App Check enforcement rollout — operator-in-loop

Affects: every callable in `functions/`. NOT a code change — a Firebase Console + monitoring exercise.

Client-side App Check is already initialised via `src/lib/appCheck.ts` (reCAPTCHA v3 on web, no-op on native until the Capacitor plugin lands). Server-side enforcement is OFF. Flipping enforcement without first verifying token flow would lock out web users whose reCAPTCHA fetch fails and break all native traffic.

Rollout sequence (operator, not agent):

- [ ] Verify `VITE_RECAPTCHA_V3_SITE_KEY` is set in the Vite prod env AND the matching site key is registered in **Firebase Console → App Check → Apps**. Without this the web client never initialises App Check and the APIs tab shows 0% verified.
- [ ] Wait 24–48h post-deploy for telemetry to populate.
- [ ] Open **Firebase Console → App Check → APIs tab → Cloud Functions for Firebase**. Look for "Verified requests %". Target: ≥99% sustained for ≥7 days before any per-callable flip.
- [ ] If verified % is low and the cause isn't obvious, query Cloud Logging: `resource.type="cloud_function" jsonPayload.appCheck.status=("MISSING" OR "INVALID")` to see exactly which callables would reject and which uids are missing tokens. Usual culprits: ad-blockers killing reCAPTCHA (rare, swallowed) or native iOS (all `MISSING` until the Capacitor App Check plugin is wired).
- [ ] Flip enforcement per-callable in `functions/index.js` by adding `.runWith({ enforceAppCheck: true })`. Start with low-risk endpoints that the client **actually calls** — `sendTestPush`, `backfillMyActivityCategories`. (This line named `askGeminiText` until 2026-07-26; it had no client caller, so flipping it would have produced no telemetry and no rejection signal. It has since been retired. `docs/app-check-rollout.md` carries the full tier table and the traffic check.) Keep destructive ones (`deleteMyAccount`, `verifyApplePurchase`) until last. Don't bulk-flip.

## Follow edges, photo URLs and profile fields, held by the rules (2026-10-25)

Rules-tested on the emulator; only the deployed rules and real profiles
show whether anything already stored falls outside them.

- [ ] **Every stored photo URL is in this project's bucket.** The photo
      gate (`isAllowedPhotoUrl`, and `functions/lib/publicPhotoUrl.js` on the
      server) now takes a Storage URL only from
      `adaptive-fitness-af8bb.firebasestorage.app` or `.appspot.com`. A
      profile whose stored `photoURL` names another bucket could not save
      any profile change until its photo is replaced. Before the release,
      in the Firestore console query `users/*/public/profile` (a collection
      group on `public`) for `photoURL` values starting
      `https://firebasestorage.googleapis.com/` and check each names this
      project's bucket. Passing: none names another.
- [ ] **Following still works after the release.** Follow an account that
      accepts followers, and accept a request on one that approves them.
      Passing: both land, and the accepted follower is told.

## Signing out clears the device's copy; sign-in avatars draw (2026-10-25)

Unit-tested with the Firestore fake and jsdom, which have no IndexedDB, no
reload and no CSP; only a browser and the phone show them doing their part.

- [ ] **A sign-out clears Firestore's copy on the web.** Sign in on the web
      build, open a few screens, sign out while online. Passing: the page
      reloads to Login, and DevTools → Application → IndexedDB has no
      `firestore/[DEFAULT]/…` database holding the account's documents (or
      it is empty). Sign out with the network off instead: no reload, the
      copy stays, and the account's offline changes go up on its next sign-in.
- [ ] **The same on the phone.** Sign out on the iOS build while online.
      Passing: the app reloads straight to Login, with no second Login flash
      and no error screen, and signing back in works.
- [ ] **Google and Apple avatars draw.** Sign in with Google on the web
      build and on the phone, with no photo uploaded. Passing: the feed,
      the profile and a comment show the Google photo, not an initial, and
      the console shows no CSP refusal for `lh3.googleusercontent.com`.

## Saving offline counts as saved (2026-10-25)

The SDK keeps an offline write on the device and sends it on reconnect,
but its promise waits for the server, so every profile save offline spun
until the connection came back (`src/lib/settleWrite.ts`). Unit-tested
with the fake; only the phone shows the SDK replaying the write.

- [ ] **A Settings change offline sticks.** On the phone, turn on Airplane
      Mode, change a Settings value (units, max heart rate, a toggle).
      Passing: it saves at once with no spinner left turning, and after
      turning the connection back on and reopening the app, the value is
      still the changed one.
- [ ] **Connecting Apple Health offline shows steps.** With Airplane Mode
      on, connect Apple Health from Settings → Health. Passing: today's
      steps appear without waiting for a connection.

## Security review fixes (2026-11-01)

Server and rules half of the November security review: the legacy Apple
purchase functions deleted, the password-reset and verification emails
capped and made to answer the same whether or not an account exists, AI
scans counted by the UTC day, callable ids held to one document, Circle
names and leaderboard names taken from the public profile, one props or
like notification per giver, a restricted account's email kept only once
verified, shared photo links held to screened uploads and real avatars,
the feed word filter run over everything a card shows, post sizes bounded,
and the `users/{uid}` document no longer deletable from the app. Unit,
rules and emulator tests cover each; these need the consoles or a phone.

- [ ] **The Apple functions are gone.** After the first Deploy production
      run carrying this work, its "Deploy functions" log shows
      `restoreApplePurchases`, `verifyApplePurchase` and `appleIAPWebhook`
      each with "Successful delete operation".
- [x] **App Store notifications go to RevenueCat.** App Store Connect →
      the app → App Information → App Store Server Notifications: the
      Production and Sandbox URLs are both RevenueCat's (Version 2), not a
      `cloudfunctions.net` address.
      STATUS 2026-11-07: both set to RevenueCat's Apple Server Notification
      URL; both were empty before. App Store Connect no longer offers a
      version choice, as Version 2 is the only one.
- [ ] **The Apple secrets are deleted.** Once the functions are gone,
      delete `APPLE_KEY_ID`, `APPLE_ISSUER_ID` and `APPLE_PRIVATE_KEY` in
      Secret Manager (`npm run secrets:check` in `functions/` lists none of
      them). Keep the In-App Purchase key itself in App Store Connect if
      RevenueCat uses it. The `ALLOW_SANDBOX_IAP` repository variable, if
      set, can go too: nothing reads it.
- [ ] **Stored photo links still pass.** Before or soon after the rules
      ship, look through `users/*/public/profile` `photoURL` values in the
      Firestore console for any that are not a `profile-photos%2F` or
      `space-photos%2F` download link, a Google `lh3…/a/` or `/a-/`
      avatar, or an Apple CDN link. Such a document still renders, but a
      new post, join or membership that copies its photo is refused.
- [ ] **Photos and avatars on a phone and the web.** A fresh Google
      sign-up writes its profile with the Google avatar; a profile photo
      upload saves; a Space post with a photo posts; a comment shows the
      commenter's profile photo; a Circle's member list shows each public
      name.
- [ ] **Challenge joins on an installed iOS build.** The rules now want a
      join's name to match the public profile. Ship a TestFlight build
      carrying this work soon after the deploy, then join a challenge on it:
      the board shows the public name. An older build can be refused a
      join for an account whose private and public names differ.
- [ ] **Props on and off leaves one row.** With two accounts on TestFlight,
      give props to the other's post, take it back and give it again a few
      times. Passing: their tray shows one row, which does not come back
      unread.
- [ ] **A size flag reads well in moderation.** A feed post the server
      makes private for its size carries `flaggedField: "size"`. If one
      reaches `/admin/moderation`, it should read sensibly there.
- [ ] **Resend's daily allowance fits.** The project sends at most 500
      reset emails a day. Check the Resend plan's daily limit is above that
      plus verification and alert mail, and consider a log alert on
      `sendPasswordResetLinkCallable` lines at error level and its
      `dailyCap` warning.

## The starter goal's engine (Run9 STATUS 2026-11-01, S3)

The engine runs a starter plan (30 minutes without stopping, nine weekly
stages) once one exists; nothing in the app begins one until S4. The
server refuses the starter run mode beside a plan of another kind
(`validatePlanPayload`), and builds from before the starter leave its plan
alone on a rollover, a schedule change or a reset (S2), so an installed
build cannot replace a starter's plan.

- [ ] **An older build leaves a starter alone.** Once S4 ships and this
      release's Functions deploy has run, sign in on a TestFlight build
      from before S2 with an account on the starter goal, save a lifting
      change in Settings → Programme, then open the app on a Monday.
      Passing: the save is refused with a message rather than saved, and
      the new build still shows the starter's week and stage afterwards.

## The starter goal's ways in (Run9 STATUS 2026-11-01, S4)

Setup starts someone new to running on 30 minutes without stopping, Train
offers it to a free runner new to running, and Settings → Run plan lists it
for runners and new runners. Setup sends the goal through
`completeOnboarding` and Settings through `configurePlan`, which write it
whole (`wholeStarterGoal`), from this release's Functions deploy.

- [ ] **A new runner's first weeks on a phone.** On a TestFlight build after
      Deploy production, set up a running-only account as New to running and
      keep the 30-minute goal. Passing: Train reads "Week 1 of 9 · about 9
      weeks to go" with that week's run-walks on the strip; after a week
      with one run, the Monday after shows "This week again"; after a week
      with two, Week 2.
- [ ] **A new goal after a finished one starts clean.** On an account whose
      starter goal is finished, choose 30 minutes without stopping again in
      Settings → Run plan and save. Passing: Train shows Week 1 of 9 (a
      merge that kept the old `finishedOn` would leave the account on free
      running with Done showing).

## Together, you first, and the community goal (Soc14, 2026-11-02)

The Together tab leads with the person's Circles and joined challenges,
then this week's challenge, then Discover. The community goal counts every
eligible saved run in its month, joined or not: `onRunCreated` adds the
run's metres to the goal's `collectiveMeters` and the runner once to
`collectiveRunners`, through a per-run credit in
`users/{uid}/communityGoal`, and `onRunDeleted` takes exactly that credit
back off. Unit, rules and emulator tests cover it; these need the console
or a phone.

- [ ] **The triggers carry the goal.** After the Deploy production run that
      ships this, its deployed-source check passes, and the source of
      `onRunCreated` names `creditRunToCommunityGoals`.
- [ ] **This month's goal is backfilled.** Only runs saved after the
      deploy count by themselves. The "Backfill community goal" workflow
      adds the earlier ones: it runs by itself once merged, and Run
      workflow repeats it (for another month's goal if one is named). Its
      second pass must credit nothing. It is safe to run again or beside
      the live triggers. Passing: the workflow is green, the goal's
      document shows a `collectiveMeters` and `collectiveRunners` that look
      right for the month, and Together's Discover shows the goal.
- [ ] **A run moves the goal, and its delete takes it back.** On a phone,
      save a short run: the goal's figure goes up by its distance and the
      runner count by one if it was your first this month. Delete the run:
      both go back.
- [ ] **Together on a phone.** Your Circles first (a Circle of one offers
      Invite someone), this week's challenge with the page's one filled
      button, then Discover. Scroll to the bottom: the last card clears the
      tab bar.

## Social capture fixes: invites, partner streaks, the route hero (2026-11-03)

Six fixes from capturing Social against the emulator rig. Unit and rules
tests cover them; these need a phone or the deployed rules.

- [ ] **An invite from the iPhone app opens the app.** On a phone, People →
      Share invite link, and a Circle's Share invite: the share sheet's
      link is `https://troposfit.com`, and it opens the web app from
      Messages. It was `capacitor://localhost`.
- [x] _(Retired 2026-11-12: partner streaks went with Trim1 call 3(b).)_
      **A partner streak is offered.**
- [ ] **The route keeps off the distance.** In the feed on a phone, at
      the phone's largest text size too, a run card's route sits above
      its distance, never on it.

## Following fills on follow, and the App Review account kept out of discovery (Soc15, 2026-11-03)

- [ ] **Set `DISCOVERY_HIDDEN_UIDS`.** Settings → Secrets and variables →
      Actions → Variables: a variable named `DISCOVERY_HIDDEN_UIDS` holding
      App Review's demo account uid (comma-separated if there is more
      than one), then run Deploy production. The step "Write
      functions/.env from repository variables" lists the name, and the
      Cloud Functions console shows the variable on `onActivityCreated`
      and `discoveryHiddenSweep`.
- [ ] **The demo account's posts leave Explore.** The day after that
      deploy (the sweep runs at 03:40 UTC), open Social → Explore as
      another account: none of the demo account's posts show, and it is
      not suggested as a recent poster (it can still be suggested to
      people in a Space it joined). A post the demo account makes now is
      followers-only (`discoveryHidden: true` on the activity).
- [ ] **Following shows a person's recent sessions at once.** Follow
      someone who shared sessions in the last 30 days and has not posted
      since: Following shows up to 10 of them, in date order, without
      waiting for their next session. Accepting a follow request does
      the same for the person who asked.

## Medals and a trophy case (Soc15, 2026-11-03)

A medal is a person's highest tier in one challenge edition. The new
`onChallengeParticipantWritten` trigger is its one writer
(`functions/lib/medals.js`): it keeps `users/{uid}/medals/{challengeId}`
and the public profile's `medalSummary` in step with the participant
document until the challenge settles (48 hours after its end), then leaves
them frozen. The profile shows the trophy case; Social reveals a new medal
once. Unit, rules and component tests cover it; these need the console, a
dispatch or a phone.

- [ ] **The trigger deploys and is read back.** After the Deploy
      production run that ships this, its deployed-source check lists
      `onChallengeParticipantWritten` (with `lib/medals.js`) and finds its
      retries on, and the Cloud Functions console shows it on
      `challenges/{challengeId}/participants/{uid}`, document write.
- [ ] **Backfill the medals earned before the deploy (owner step).** Only
      tiers reached after the deploy make medals by themselves. Once the
      trigger is deployed, Actions → "Backfill medals" → Run workflow,
      with the challenge id left empty (every challenge that ended in the
      last 13 months, and the running ones). A dated line added to
      `.github/backfill-medals.request` on main runs it the same way; the
      first was added on 4 November 2026, after Deploy production run 676
      shipped the trigger. Nothing else runs it. Passing: the workflow is green (its second pass must write nothing),
      the first pass prints a `written` count, and your own profile's
      Medals section shows a medal for each challenge you reached a tier
      in. Safe to run again, or beside the trigger.
- [ ] **No client can set the summary.** After the rules deploy, the
      rules check (verify-production-rules) is green, and from a signed-in
      browser console a `setDoc` of `medalSummary` on your own public
      profile is refused while a write of your display name still lands.
- [ ] **A medal on a phone.** Join this month's Mileage and save runs past
      10 km: the next visit to Social opens the reveal ("Bronze ·
      <Month> Mileage") once, with the medal swinging in, confetti and
      the figure in your units; Done closes it and it does not come back.
      Reach 25 km: Silver is revealed. Delete a run that drops you under
      25 km while the month is running: the trophy case shows Bronze
      again. Another account opening your profile sees the same case.
- [ ] **Illustrate the medals (owner step, needs a Gemini key).** The
      medals are drawn in code until their art exists. With
      `GEMINI_API_KEY` exported, run `python3
scripts/art/generate-medals.py` (33 images: 11 challenge
      definitions × bronze, silver, gold), review them as
      `docs/badges/MEDAL_ART_BRIEF.md` says, and add the good ones to
      `MEDAL_ART_KEYS` in `src/features/challenges/medalDefinitions.ts`. Passing:
      the trophy case and the reveal show the round black-enamel medals,
      with the goal and the edition still printed on them.
- [ ] **Share from the reveal on the iPhone app.** Share opens the share
      sheet with a square image of the medal; Save Image keeps it.
- [ ] **Reduce Motion and large text.** With Reduce Motion on, the reveal
      fades in without the swing, the rays and the confetti. At the
      phone's largest text size the trophy case steps to fewer columns
      with every name whole, and the reveal scrolls rather than cutting
      off Done.

## Maps on run cards (Soc15 call 5, 2026-11-04)

A run posted online gets a street map: the author's app draws the post's
shared route on the basemap in both themes (`src/lib/routeMapImage.ts`),
uploads them to `route-maps/{uid}/{activityId}/{light,dark}.jpg`, has
`screenPhoto` check them and names them on the post as `routeMap`
(`routeMapUpload.ts`). The card shows the one for the theme on screen
(`RouteMapHero`). storage.rules lets only the author write there, beside
a post of theirs that exists; firestore.rules lets only the author name
the post's own two files; `onActivityDeleted` empties the post's folder
(`functions/lib/routeMapFiles.js`) and the deletion executor sweeps
`route-maps/{uid}/`. Unit, rules and function tests cover each part, and
Chromium drew a map; WebGL on an iPhone, the deployed rules and the
console are left.

- [ ] **The map on an iPhone, in both themes.** On a TestFlight build,
      save an outdoor run of a kilometre or more, online, with sharing
      on. Passing: within a minute Social's card for it shows the route
      on the streets, coral with a hollow start ring and a solid finish
      dot, sharp rather than blurred, with "OpenFreeMap © OpenMapTiles
      Data from OpenStreetMap" legible in its bottom-right corner and the
      distance under the map. Switch Settings → Units and theme to the
      other theme: the card shows the other map. At the largest text size
      the map keeps its shape and the distance stays under it.
- [ ] **The map hides what the post hides.** With a privacy zone round
      home and route ends hidden (the default), run from home through
      the zone and back. Passing: the card's map starts and ends away
      from the door, and the line has a gap at the zone rather than a
      line across it. A run saved while the privacy settings would not
      load posts with no route and gets no map.
- [ ] **Storage refuses another person's path (after the Storage
      deploy).** Signed in as A in a browser console, upload a JPEG to
      `route-maps/{B's uid}/{B's post id}/light.jpg`, and to A's own uid
      with a post id A does not have. Passing: both are refused, and the
      same upload beside one of A's run posts lands. A `setDoc` merge of
      `routeMap` naming B's files on A's post is refused by the Firestore
      rules (verify-production-rules green first).
- [ ] **Deleting a post deletes its map.** After a run post's map has
      appeared, Undo it on the finish screen (or delete the run). Passing:
      within a minute `route-maps/{uid}/{activityId}/` is gone from the
      Storage console and the logs show
      `onActivityDeleted.route_map_removed`. Deleting a test account
      removes its whole `route-maps/{uid}/` folder.
- [ ] **The deploy reads back the cleanup and the screen.** After the
      Deploy production run that ships this, its deployed-source check
      lists `onActivityDeleted` with `lib/routeMapFiles.js`, and
      `screenPhoto` and `screenUploadedPhoto` with `lib/photoScreen.js`.
      Each map in the Storage console is under 150 KB.

## Invites that carry who sent them (Soc15 calls 4 and 5, 2026-11-04)

Each person has one invite code (`getInviteCode`, kept at
`inviteCodes/{code}` and on the user document as `inviteCode`). People's
Bring a friend shares `https://troposfit.com/?invite=<code>` and shows the
code; the web app keeps a link's code until setup (`pendingInvite.ts`),
and the welcome and sign-up screens name the inviter through the
signed-out `lookupInvite`. Setup's optional "Invited by a friend?" and
People's field for an account in its first 14 days use the code
(`redeemInvite`): the inviter follows the new person at once, and the new
person follows the inviter at once only when the inviter has Approve
followers off, otherwise asking with a request marked as from the invite
(Soc15 call 4, STATUS 2026-11-05). The inviter gets "X joined from your
invite" under a new Invites switch, or "X joined from your invite and
asked to follow you" under Follow requests. The rules refuse every client read and write of
`inviteCodes` and any client edge carrying `fromInvite`; deleting an
account deletes its code. Unit, rules and emulator tests cover each part;
these need a phone, the deployed rules or the console.

- [ ] **Sharing from the iPhone app.** On a TestFlight build, Social →
      Find people → Bring a friend shows "Your code" with an eight-character
      code within a second or two of opening, and Share invite link opens
      the share sheet with "...my invite code K7P4-9M2H..." and
      `https://troposfit.com/?invite=K7P49M2H` (your code). Copy code puts
      the grouped code on the clipboard. A restricted test account shows no
      code and the button is off.
- [ ] **The link names the inviter, signed out.** Open the shared link in
      a private browser window. Passing: the address bar loses
      `?invite=…`, and the welcome screen says "<first name> invited you to
      Tropos" (or "A friend invited you to Tropos" for a code that is not
      real), also on Get started's sign-up form, not on sign-in.
- [ ] **Typing a code during setup on a phone.** Install the TestFlight
      build fresh, sign up, and on setup's last step open "Invited by a
      friend?", type a friend's code (lower case and with or without the
      dash), then Start my plan. Passing, with the friend's Approve followers
      on (the default): Home shows the toast "<name> follows you now. Your
      request to follow them is waiting", the friend appears under your
      Followers but not your Following, and the friend has a request from
      you. With the friend's Approve followers off: "You and <name> now
      follow each other", and both profiles list the other under Followers
      and Following. A mistyped code says "Invite codes are
      8 letters and numbers…" when leaving the field, and an unknown one
      toasts where to try again.
- [ ] **The inviter is told.** On the inviter's phone, with Approve
      followers on, Social's bell shows "<name> joined from your invite and
      asked to follow you" with Accept beside it, and Accept makes the
      follow both ways; nobody new can see a followers-only post before
      that. With Approve followers off, it shows "<name> joined from your
      invite. You follow each other now"; tapping it opens their profile. With Settings → Notifications → Invites off,
      the next person to join adds no row. No "started following you" row
      arrives for an invite, even with New followers on.
- [ ] **People offers the code for 14 days.** An account under 14 days old
      that skipped the field sees "Invited by a friend?" at the top of Find
      people; using a code there shows the one line in its place, and the
      field does not come back. An account older than 14 days, or one that
      has joined from an invite, does not see it.
- [ ] **Deployed rules and functions.** After the Deploy production run
      that ships this: verify-production-rules is green; a browser-console
      `getDoc(doc(db, "inviteCodes", "<a real code>"))` signed in is
      refused; the deployed-source check lists `redeemInvite` and
      `getInviteCode` with `lib/inviteCodes.js`; the Cloud Functions console
      shows `getInviteCode`, `lookupInvite` and `redeemInvite` at max
      instances 100. Deleting a test account that made a code removes its
      `inviteCodes` document.

## Photos on posts (Soc15 call 2, 2026-11-05)

A shared session can carry one to four photos, added after the post
exists: from the finish screen's posted row (Add photos, under Undo) or
on the author's own `/activity/:activityId` page (`PostPhotosSheet`).
Each photo is re-encoded on the phone to a 1600 px longest edge at JPEG
0.82 (`src/lib/imageEncode.ts`, which leaves its EXIF behind), uploaded
to `post-photos/{uid}/{activityId}/{photoId}.jpg` under a random id,
checked by `screenPhoto`, and only then named on the post's `photos`
list in one update (`postPhotoUpload.ts`). storage.rules lets only the
author write there, a JPEG under 2 MB beside a post of theirs that
exists; firestore.rules lets only the author set `photos` alone, at most
four, each the post's own file, with a verified email (a restricted
account on its private posts only; taking photos off is always open);
`onActivityDeleted` empties the post's folder whatever it names
(`functions/lib/postPhotos.js`); the deletion executor sweeps
`post-photos/{uid}/`; and a report of the post shows its photos on
`/admin/moderation`. Unit, rules (Firestore and Storage, against the
emulators) and function tests cover each part, and Chromium drew the
card, the viewer and the sheet; these need a phone, the deployed rules
or the console.

- [ ] **Picking from the library and the camera on an iPhone.** On a
      TestFlight build, finish a run with sharing on, online. Passing: the
      posted row shows Add photos under Undo; tapping it and then Add
      photos offers Photo Library and Take Photo (taking one does not end
      the app, which it would without `NSCameraUsageDescription`). Pick
      three from the library, one of them a HEIC portrait: each tile
      spins, then shows, and "Added 3 photos." appears; Social's card shows
      one large on the left and two stacked on the right, the portrait the
      right way up. Turn on Airplane Mode: the button greys out with
      "Photos need a connection."
- [ ] **A downloaded post photo carries no location.** Take a photo with
      Location Services on for the Camera (so the original carries GPS),
      add it to a post, then download the photo from the Storage console
      (or open its URL on a Mac) and read it with `exiftool` or Preview →
      Show Inspector. Passing: no GPS block, no camera model, no original
      date; the longest side is 1600 px or less and the file is well under
      1 MB.
- [ ] **A refused photo never appears (needs Cloud Vision on).** Add a
      photo SafeSearch rates as nudity (a classical nude from a museum's
      public-domain collection usually rates LIKELY), with one ordinary
      photo in the same pick. Passing: the sheet says "This photo can't be used. Photos
      with nudity aren't allowed.", the card and the post's page never show
      it, its file is gone from `post-photos/{uid}/{activityId}/`, and the
      logs show `screenPhoto.refused`. The ordinary photo is on the post.
- [ ] **Deleting the post deletes its folder.** After photos are on a
      post, Undo it on the finish screen (or delete the session). Passing:
      within a minute `post-photos/{uid}/{activityId}/` is gone from the
      Storage console, a file uploaded and never named included, and the
      logs show `onActivityDeleted.post_photos_removed`. Deleting a test
      account removes its whole `post-photos/{uid}/` folder. Taking one
      photo off in the sheet removes its file.
- [ ] **Storage refuses another person's path (after the Storage
      deploy).** Signed in as A in a browser console, upload a JPEG to
      `post-photos/{B's uid}/{B's post id}/AbCdEf123456.jpg`, and to A's
      own uid with a post id A does not have, and as `1.jpg` beside A's
      own post. Passing: all three are refused, and the same upload under
      a random id beside one of A's posts lands. A `setDoc` merge of
      `photos` naming B's file on A's post, or a fifth photo, is refused by
      the Firestore rules (verify-production-rules green first).
- [ ] **The moderation page shows the photos.** Report a post with
      photos from a second account, then open `/admin/moderation` as an
      admin. Passing: the report's Target shows the photos as thumbnails,
      each opening the full photo; Hide content makes the post private, and
      the author still sees it and its photos.
- [ ] **The deploy reads back the changed functions.** After the Deploy
      production run that ships this, its deployed-source check lists
      `onActivityDeleted` with `lib/postPhotos.js` and
      `lib/routeMapFiles.js`, `createReport`, `listPendingReports` and
      `resolveReport` with `lib/reportTargets.js` and `lib/postPhotos.js`,
      and `screenPhoto` and `screenUploadedPhoto` with
      `lib/photoScreen.js`.

## Weekly leagues (Soc15 call 3, 2026-11-05)

Groups of about 20, scored on sessions done against each person's own
plan, opt-in through `setLeagueSharing`, formed and settled by
`weeklyLeagueTurn` every Monday at 12:15 UTC, and kept current by the
session triggers (`functions/lib/leagues.js`). The unit, rules
(`firestore.leagues.rules.test.ts`), cross (`leaguePlanned.cross.test.ts`,
`leagueRules.cross.test.ts`) and emulator (`integration/leagues.test.js`)
suites cover the logic; these need the release, the console and phones.

- [ ] **The release carries the rules, the index and the functions.**
      Passing: the Deploy production run's Firestore and Functions stages
      are green; the rules check (verify-production-rules) is green; the
      console's Indexes tab lists `users` (leagueOptIn, lastActiveAt) as
      enabled; and the deployed-source check lists `weeklyLeagueTurn` and
      `setLeagueSharing` with `lib/leagues.js`, `lib/leagueRules.js` and
      `lib/leaguePlanned.js`, and the six session triggers with
      `lib/leagues.js`. Cloud Scheduler shows `weeklyLeagueTurn` at
      `15 12 * * 1`, Etc/UTC.
- [ ] **No client writes a league.** From a signed-in browser console a
      `setDoc` on `leagueMembers/{you}`, on your own standing or on
      `leagueStatus/current`, and an `updateDoc` of `leagueOptIn` on your
      own user document, are each refused, while a write of your display
      name still lands.
- [ ] **The first real Monday turn, in the console (owner step).** On the
      first Monday after ten or more people have joined and trained in the
      last 14 days, after 12:15 UTC. Passing: Firestore shows
      `leagueWeeks/{that Monday}` with `formed.groups` above 0 and a
      `finishedAt`; `leagueStatus/current` reads `open: true` with that
      week; each group in `leagueGroups` has 10 to 30 `memberUids` and a
      standing per member; `jobRuns/weeklyLeagueTurn` records a success.
      Before ten, the same run leaves `open: false` with the `joined`
      count, and the card says "Leagues open when 10 people have joined."
      If it failed: Cloud Scheduler → Force run is safe (a second run does
      nothing twice).
- [ ] **The second Monday settles the first.** Passing: every member of
      last week's groups has `users/{uid}/leagueResults/{last Monday}`,
      the top quarter with points moved up, last week's groups are gone,
      and this week's are drawn from the new tiers.
- [ ] **The Monday notification on a phone.** On a TestFlight account in
      a league, after the second Monday's turn. Passing: Social's bell
      shows one new row, "You moved up to Silver" (or stayed, or moved
      down), naming nobody, with a medal icon; tapping it opens the league.
      With Settings → Notifications → Leagues off, the next Monday writes
      no row.
- [ ] **The reveal on an iPhone.** Open Social after the result. Passing:
      the full-screen result opens once, with the new tier's badge, its
      light, and for a rise the rays and confetti; Done closes it and it
      does not come back; See your league opens the page. With Reduce
      Motion on, the badge fades in and nothing is thrown. At the largest
      text size the reveal scrolls rather than cutting off Done.
- [ ] **A session moves the standing.** In a group, finish a workout.
      Passing: within a minute the card's sessions read one more and the
      page's row moves; deleting the workout takes it back.
- [ ] **Leaving is immediate.** Leave the league from the page. Passing:
      the confirmation names what happens; afterwards the group's other
      members no longer see your row, `leagueMembers/{you}` is gone, and
      the next Monday does not place you.

## Plan groups (Soc15, 2026-11-05)

How many people on Tropos are training for each race, `raceCohorts/{spaceId}`,
recounted (never incremented) by `onRaceGoalWritten`, on any write to
`users/{uid}` that sets, moves or clears a goal bound to a race space, and by
`dailyRaceCohortRecount` at 04:30 UTC for every race still ahead
(`functions/lib/raceCohorts.js`). The unit (`raceCohorts.test.js`,
`planGroup.test.ts`, `PlanGroupCard.test.tsx`, `SpacePlanGroup.test.tsx`),
rules (`firestore.spaces.rules.test.ts`) and emulator
(`integration/raceCohorts.test.js`) suites cover the logic; these need the
release, the console and a phone.

- [ ] **The release carries the rules, the index and the functions.**
      Passing: the Deploy production run's Firestore and Functions stages
      are green; the rules check (verify-production-rules) is green, and the
      deployed rules read back with `match /raceCohorts/{spaceId}` (read
      when signed in, no write); the readiness gate passes and the
      console's Indexes tab lists `users` (raceGoal.eventSpaceId,
      raceGoal.targetDate) as enabled; and the deployed-source check lists
      `onRaceGoalWritten`, with retries on, and `dailyRaceCohortRecount`,
      each with `lib/raceCohorts.js`. Cloud Scheduler shows
      `dailyRaceCohortRecount` at `30 4 * * *`, Etc/UTC.
- [ ] **The first night fills in every race.** The morning after the
      release, or straight away with Cloud Scheduler → Force run (safe to
      repeat: it counts again and stores the same numbers). Passing:
      `jobRuns/dailyRaceCohortRecount` records a success whose summary has
      `catalogue: true` and `races` equal to the races in
      `config/raceEvents` whose date is today or later; each of them has a
      `raceCohorts/{id}` document. Until this has run, a race nobody has
      changed a goal for since the release shows the cold-start line.
- [ ] **The count matches the console.** For one race people are training
      for: in the console, Firestore → `users`, filter
      `raceGoal.eventSpaceId == <id>` and `raceGoal.targetDate >=
<yesterday's date, UTC>`. Passing: the number of documents equals
      `raceCohorts/<id>.count`. Then, on a test account bound to that race,
      choose another listed race in the run-plan editor and save. Passing:
      within a minute the first race's count is one lower and the second's
      one higher, and both `updatedAt` values are newer.
- [ ] **No client writes a count.** From a signed-in browser console a
      `setDoc` on `raceCohorts/<id>` is refused, and a `getDoc` of it
      succeeds.
- [ ] **The card and the hero on an iPhone.** On a TestFlight account
      bound to a race with 3 or more people in its group. Passing: Social →
      Together → This week shows "You and N others are training for <race>"
      with the weeks to go and the race's photo, and opens the race's space,
      whose hero says "N people on Tropos are training for this race". At
      the largest text size the card's words drop under the photo, and the
      hero's words stay clear of Back.

## The live pulse (Soc15, 2026-11-05)

One line on Social's Feed, "Today: 14 sessions on Tropos", read live from
`pulse/{the viewer's local today}`. The count is written only by the
session create and delete triggers, once per session through
`users/{uid}/pulseCredits` (`functions/lib/pulse.js`), and both expire by
TTL eight days after the day starts. The unit (`pulse.test.js`,
`PulseLine.test.tsx`), rules (`firestore.pulse.rules.test.ts`) and
emulator (`integration/pulse.test.js`) suites cover the logic; these need
the release, the console and a phone.

- [ ] **The release carries the rules, the TTL policies and the
      functions.** Passing: the Deploy production run's Firestore stage is
      green, its "Wait for indexes and retention policies to be ready" step
      included; the console's Firestore → Time-to-live tab lists `pulse`
      and `pulseCredits` on `expiresAt` as Active; the rules check
      (verify-production-rules) is green; and the deployed-source check
      lists `lib/pulse.js` for `onWorkoutCreated`, `onRunCreated`,
      `onWorkoutDeleted` and `onRunDeleted`.
- [ ] **No client writes the pulse.** From a signed-in browser console a
      `setDoc` or `updateDoc` on `pulse/{today}` and a `getDoc` of your own
      `users/{you}/pulseCredits/{any}` are each refused, while a `getDoc`
      of `pulse/{today}` reads.
- [ ] **A session moves the count.** Finish a workout on a TestFlight
      build. Passing: within a minute the console shows `pulse/{today}`
      one higher, with `expiresAt` eight days after today's midnight UTC,
      and `users/{you}/pulseCredits/workout_{id}`; deleting the workout
      takes it back one and removes the credit.
- [ ] **The first day the line appears (owner step).** On the first day
      ten or more sessions are saved across Tropos. Passing: Social → Feed
      shows "Today: 10 sessions on Tropos" (or more) under the source
      control, the dot pulsing; with Reduce Motion on, the dot is still;
      Home shows nothing of it. Below ten the line is absent, not "Today:
      3 sessions". At the largest text size the line wraps under the dot
      rather than running off the screen.
- [ ] **Old days go.** Ten days after the first day with sessions (TTL
      deletes within about a day of `expiresAt`). Passing: that day's
      `pulse` document is gone, and so is every `pulseCredits` document
      whose `dateKey` is that day.

## The finish screens' reward and summary (DS4 call 3, 2026-11-07)

After a lift or a run, a first, a new best, a streak milestone or a
finished plan makes the finish screen the full-screen reward: the
session's drawing (or the run's map) in a light of the achievement's
colour, the session done, one figure in Archivo's wide heavy italic,
one sentence, Share and Done; confetti for a first, a best and a plan.
Every other session gets the same screen calm. The register is
`finishRegister` (`src/lib/finishMoment.ts`, unit-tested); the frames
are `finish-screens.capture.spec.ts`. These need a phone.

- [ ] **The display figure draws in the wide italic cut on the iPhone.**
      Finish a workout on a TestFlight build. Passing: the kg figure is
      the slanted wide Archivo of `built-finish-lift-*` in
      `docs/visual-audit/ds4-2026-11-07/`, not an upright or synthesised
      slant, and a five-figure total fits a 320 pt screen.
- [ ] **Confetti on a first and a best, none under Reduce Motion.** On a
      new account's first workout, and on a set heavier than a lift's
      best. Passing: confetti falls once as the screen opens, in purple
      for the first and gold for the best, and nothing falls with
      Settings → Accessibility → Motion → Reduce Motion on, or on a
      routine session.

## Train's layout and the one-row rule (DS4, 2026-11-08)

Train keeps its order (title, Lift/Run, the day strip, the session) with
the oversized blocks shrunk: the Lift/Run track is drawn 36 pt with its
44 pt tap area made of padding (`SegmentedControl size="sm"`), the day
strip is one 62 pt row, and the week's notices sit under the session card.
Home's hero picture shrinks by a third under a 20em hero width so Start
clears the tab bar on a 320 pt phone. Frames: `built-train-*` and
`built-home-320-*` in `docs/visual-audit/ds4-2026-11-07/`. These need a
phone.

- [ ] **The small Lift/Run switch is easy to hit.** On a TestFlight
      build, tap Lift and Run near their top and bottom edges, one-handed.
      Passing: every tap inside the 44 pt row switches the tab, and none
      lands on the day strip below it.
- [ ] **Start is on the first screen on a small iPhone.** On an iPhone SE
      (or another 320 pt-wide model), open Home and Train on a lifting
      day. Passing: the whole Start button shows above the tab bar
      without scrolling, in both themes, with the system text size at its
      default.

## Holding a post's photo full screen (2026-11-09)

The full-screen photo viewer follows the finger: a sideways swipe drags
the strip with the next photo beside it, a pull down closes it with the
stage fading, two fingers pinch (1× to 4×), a zoomed photo pans, and a
double tap zooms in to where it landed or back out. The rules are in
`src/lib/photoGesture.ts`. The unit suites and a touch-driven browser run
cover the logic; only a phone shows how it feels under a real finger.

- [ ] **Swipe, pull, pinch and pan on an iPhone.** On a TestFlight build,
      open a post with three photos. Passing: the photo moves with the
      finger and the next one slides in beside it; a short slow drag
      springs back; the first and last photos give a little and spring
      back; a pull down shrinks the photo and fades the stage, and letting
      go closes it, while a push up does not; a pinch zooms about the
      fingers and a zoomed photo pans without turning; a double tap zooms
      in where it landed and a second one zooms back out. Nothing behind
      the viewer scrolls, and the tab bar never changes tab.
- [ ] **Reduce Motion.** With Settings → Accessibility → Motion → Reduce
      Motion on, repeat the swipe and the pull. Passing: the photo still
      follows the finger, and a turn or a close happens at once, with
      nothing sliding by itself.

## Pull to refresh, drawn (2026-11-09)

Food, Analytics and Social share one pull-to-refresh indicator
(`PullToRefreshIndicator`, driven by `usePullToRefresh`'s `pull`): a round
chip comes down from under the status bar with the finger, turning as it
comes, turns the brand colour once a release would refresh (with one
light haptic), holds with a spinner while the refresh runs and springs
away after. The unit suites and a touch-driven browser run cover it; only
a phone shows the haptic and how it sits under the notch.

- [ ] **Pull on an iPhone.** On a TestFlight build, at the top of Food,
      Analytics and Social, pull down slowly. Passing: the chip follows
      the finger from under the status bar, never under the notch at rest;
      one light tap is felt as it turns purple; letting go there shows a
      spinner until the page has refreshed; letting go before it springs
      back with nothing refreshed; pulling while scrolled down scrolls the
      page as before; and on Food, a sideways swipe on a meal row never
      starts a pull.

## An exercise row's long press on Train (2026-11-09)

Holding an exercise row on Train opens its menu (Replace, Remove, Move).
It cancelled on any movement at all, so a finger's tremor often stopped
it, and when it did open, lifting the finger could also open the
exercise's history under the menu. It now allows 10 px of drift and
swallows the tap that follows a fired press (`useLongPress`, the Quick
Add rows' rules). Touch only, so a phone shows it.

- [ ] **Hold an exercise row.** On a TestFlight build, on Train's lift
      day, hold an exercise row for half a second without trying to keep
      perfectly still. Passing: one medium haptic and the menu opens, and
      the exercise's history does not open behind it; a quick tap still
      opens the history; starting a scroll on a row never opens the menu.

## The water tile on the compositor (2026-11-09)

Home's water tile no longer animates on the main thread: each wave is
drawn once and slid by `Element.animate`, the bubbles are `Element.animate`
of transform and opacity, and the fill rises by `translateY`. Measured in
headless Chromium at 6x CPU slowdown, the idle tile went from about
290 ms of main-thread work a second (30 layouts) to about 96 ms (none);
WebKit on a phone hands these animations to Core Animation, which only a
device shows.

- [ ] **The water still looks alive on an iPhone.** On a TestFlight build,
      log a drink from Home with three or more glasses already in. Passing:
      the surface stands up and settles as the fill rises, the two waves
      drift at different speeds with no visible seam or jump as they loop,
      bubbles rise and fade, and with Settings → Accessibility → Motion →
      Reduce Motion on the surface is still and there are no bubbles.
- [ ] **It costs nothing visible.** With Instruments' Core Animation (or
      Safari's Web Inspector Timelines over the device), sit on Home for
      10 seconds with the water tile on screen. Passing: no repeating
      layout or paint entries from the water tile.

## The league turn runs again until it finishes (2026-11-10)

`weeklyLeagueTurn` used to run once, at Monday 12:15 UTC. Cloud Functions do
not retry a scheduled function, so a run cut off part way (the 540 s
timeout, one failed write) left that week with no groups. It now runs at
quarter past every hour until the end of Monday UTC; a run after the week
has finished reads `leagueWeeks/{weekKey}.finishedAt` and stops. Only the
console shows the schedule that deployed.

- [ ] **The schedule deployed.** After the release that carries this, open
      Cloud Scheduler for `adaptive-fitness-af8bb` and find the
      `firebase-schedule-weeklyLeagueTurn-…` job. Passing: its frequency
      reads `15 12-23 * * 1` in `Etc/UTC`.
- [ ] **A Monday's later runs stop at once.** On the first Monday after
      that release, open `jobRuns/weeklyLeagueTurn` after 13:15 UTC.
      Passing: `lastOutcome` is `ok` and `lastSummary.alreadyFinished` is
      `true`, with `leagueWeeks/{that Monday}.finishedAt` set from the
      12:15 run.

## Touches that end early, or never end (2026-11-10)

#3131 fixed how a few gestures treat a finger that lets go early, stays
down, or is taken by the system: on a phone a released press fires
pointerup, then pointerleave, then click, and an incoming call or a
system gesture ends a touch with touchcancel instead of touchend. The
unit suites replay those orders; only a phone fires them for real.

- [ ] **Let go of Hold to finish halfway.** On a TestFlight build, during
      a run, press Hold to finish and let go before the ring fills.
      Passing: the ring empties and the run carries on; a full hold still
      finishes it.
- [ ] **A long press held on.** Hold an exercise row on Train for a full
      second before lifting, and hold a saved food under Food's Log again
      for a second. Passing: Train's menu opens and the exercise's history does
      not; the food is removed (with Undo) and nothing is logged.
- [ ] **Pinch, then tap.** Open a post's photo, pinch it bigger, lift one
      finger and then the other without moving it, then tap once. Passing:
      the photo stays zoomed; a second quick tap zooms it back out.
- [ ] **A touch the system takes.** Start a pull to refresh on Food, or a
      swipe on an exercise row in the programme editor, and with the finger
      still down pull Control Centre or take a call. Passing: the pull
      chip goes back up with nothing refreshed, and the row slides home.

## Together leads with your race; challenges show their medals (2026-11-10)

Soc16: Together opens on the person's race (`RaceHero`) when their goal is
bound to a race ahead, then This week, Circles and Discover. A challenge's
picture is its medal (`ChallengeMedalBand` on the weekly card and in a
challenge's sheet, `MedalArt` on every row), not a photograph. The medals
are SVG with an illustration inside; how WebKit draws them at row size is
for a phone to show.

- [ ] **The race leads.** On a TestFlight build, with a race goal bound to a
      race ahead (Settings → Run plan, a race picked from the list), open
      Social → Together. Passing: the race's photo fills the first card with
      its name, "Your race · N weeks to go", its date and place, and the
      words readable over the photo at Settings → Accessibility → Larger
      Text; tapping it opens the race's space. With no race goal, the
      weekly challenge's card is first.
- [ ] **The medals read.** On the same build, look at the weekly challenge
      and at a challenge row in This week and in Discover, then tap one.
      Passing: each shows a ribbon and a coin with its figure (not a blank
      or a broken image), sharp at its small size on the row and large in
      the sheet, in both light and dark mode.

## Lit edges, chips and cut tracks on a phone (DS6, 2026-11-10)

Affects: the dark theme's card edge (`--ds-shadow-card`), the pills'
(`chip-edge` on the muted and tinted buttons and the streak chip) and the
tracks cut into a card (`track-cut`: Home's week segments and This week
bars, the performance ring, and the bars on Train, History and Social).
The captures in `docs/visual-audit/ds6-2026-11-10/` are the real
components on a desktop Chrome; a hairline of light at 6 to 9% is the kind
of thing a phone's screen and WebKit decide.

- [ ] **The edges show.** On a TestFlight build in dark mode, open Home.
      Passing: each card has a thin lighter line along its top edge, the
      streak chip and the "Swap" style pills have one too, and no card has
      a doubled line. At the lowest screen brightness the cards still part
      from the page.
- [ ] **The tracks read as slots.** On Home, the week's rest days and the
      empty part of each This week bar are darker than the card, and a
      day's colour or a bar's fill stands out more than before. Tap a day:
      its white selection ring is drawn round the segment. Passing: an
      empty bar ("0 of 1") can still be seen end to end.
- [ ] **Focus is not lost.** With a keyboard attached (or on the web
      build), Tab to a "Swap" style pill in dark mode. Passing: the purple
      focus ring shows, with the pill's edge still under it.

## Motion 14 under every animation (2026-11-11)

Affects: every screen. `framer-motion` went from 12.40 to 14.6, two major
versions (#2965). Its upgrade guide lists nothing breaking for this app:
13.0 drops an optional dependency the app never installed, and 14.0 has
no breaking change. The unit suite passes on it. What no test here sees
is how a spring, a sheet or a layout change feels on a phone, so these
are checked on the first TestFlight build that carries it.

- [ ] **Sheets and drawers.** Open and drag shut a bottom sheet (the
      day's sheet from Home's week, the weight sheet, the share sheet).
      Passing: each follows the finger, settles without a jump, and
      closes on a flick as it did.
- [ ] **A workout's moving parts.** Start a lift, tick a set, let the
      rest timer run out, reorder two exercises by dragging, finish.
      Passing: the set's tick, the docked rest card, the reorder and the
      finish screen's entrance all play once and end where they should.
- [ ] **Home and the tab bar.** Switch tabs quickly, pull Home to
      refresh, tap a day on the week strip. Passing: no card flashes in
      from the wrong place, the day's card opens in place, and the tab
      bar's selection moves without a flicker.
- [ ] **Reduce Motion.** With Reduce Motion on in iOS Settings, repeat
      the first check. Passing: sheets and screens still appear and
      close, with a fade in place of the slide.

## Food leads with the calorie wheel (Food11, 2026-11-11)

Affects: the Food page (`Food.tsx`, `FoodHeroCard`, `CalorieRing`,
`FoodWeekStrip`, `FoodMacroRow`, `FoodComposerCard`,
`FoodLogFlight`) and Home's food card, which draws the same wheel. The
captures in `docs/visual-audit/food-2026-11-11/` are the real components
in a desktop Chrome on the emulator. A phone decides the rest: the
keyboard, the safe areas, Dynamic Type, and how the flight runs in
WKWebView.

- [ ] **The first screen.** On a TestFlight build, open Food on an iPhone
      13 mini or an SE in Display Zoom. Passing: the wheel, Details, the
      week's bars, the macros and the whole composer field (the camera at
      its end included) are above the tab bar without scrolling.
- [ ] **The wheel fills.** Log a food on a day with nothing logged.
      Passing: the wheel starts as a grey track and grows by what was
      logged, in both the "left" and the "logged" view (tap the wheel to
      switch); the number alone changes between the two. Home's food card
      shows the same arc.
- [ ] **Over the target.** On a day over its target, the second lap is a
      deeper orange and its head stands clear of the first lap by a thin
      line of the page's colour. Passing: the two laps can be told apart
      at arm's length, in light and in dark.
- [ ] **The flight.** Log a food by typing, and again from the Log again
      list. Passing: its drawing rises from the field to the end of the
      arc and the arc then grows, in about half a second, with no stutter
      and no jump of the page; the keyboard stays up and the next food
      can be typed straight away. Scroll the wheel off the screen and log
      again: nothing flies. Edit a meal, delete one, and log on
      yesterday: nothing flies.
- [ ] **Reduce Motion.** With Settings → Accessibility → Motion → Reduce
      Motion on, log a food. Passing: nothing flies, and the wheel and
      the macros are at their new figures at once.
- [ ] **The meal comes from the clock.** The field has no meal control
      (11 November 2026). Log a food before 10:00, another after 15:00
      and a third after 17:00. Passing: the rows read Breakfast, Snacks
      and Dinner. Leave Food open across 10:00 or 15:00, come back to
      the app and log: the row reads the meal for the time it is now,
      not the time Food was opened. Tap a row and move it to another
      meal: the row's caption follows, and nothing else changes.
- [ ] **The camera in the field.** Tap the camera at the end of the
      field. Passing: the scanner opens, growing out of the camera; a
      thumb finds it without looking (its tap area is 48 pt); the orange
      camera can be made out on the light field in daylight. Type a few
      words and tap the send arrow, then the camera: each does its own
      thing and neither fires the other.
- [ ] **The field while typing.** Type a long line ("200g chicken and
      rice with a side salad"). Passing: the pencil has gone, the text
      wraps inside the field, the field grows with it, and the send arrow
      and the camera stay level with the field's middle. On an SE in
      Display Zoom the field is still one row, and it does not change
      height when it is tapped.
- [ ] **Larger text.** At the largest standard text size and at the
      largest accessibility size, open Food. Passing: the header row, the
      wheel's label (it may wrap inside the ring), the week, the macros
      (they stack) and the composer (one row: the pencil, the text and
      the camera) all fit the screen, with nothing cut off and no
      sideways scroll.
- [ ] **The usual foods follow the meal.** With a history of breakfast
      and lunch foods, focus the field before 10:00, then again between
      10:00 and 15:00. Passing: each list leads with that meal's foods,
      and logging one does not reshuffle the list on screen.
- [ ] **The Pro scan demo shows this page.** On a free account tap the
      camera in Food's field and watch the demo in the Pro offer through
      twice, then open Upgrade and watch it there. Passing: the Food
      page in the drawn phone has no title, the wheel on the page with
      its target in the label, the week as bars, and one field with the
      camera inside it and no meal control. After Log, the food's
      picture rises from the field to the wheel, the wheel, the week and
      the macros take the meal, the earlier diary rows move down for the
      new one, and nothing stutters. With Reduce Motion on it is the
      result sheet, still.

## The mark is a T whose stem rises (DS7, 2026-11-11)

Affects: the app icon in its three modes, the launch image and the launch
animation (`LaunchSplash`), Home's header mark (`BrandMark`), the guide's
face (`GuideMark`), the sign-in screens' logo and the mark on share cards.
The icons and the launch image were regenerated and looked at as files;
the launch animation never shows under automation, so only a phone shows
the handover.

- [ ] **The icon.** Install a TestFlight build made after the merge.
      Passing: the home screen shows the white T on purple; with the home
      screen set to Dark it is the purple T on a dark tile, and set to
      Tinted it takes the tint. Spotlight, Settings and a notification
      show the same T, and the gap under the bar is still open at the
      smallest of them.
- [ ] **The launch.** Force-quit and open the app three times. Passing:
      the launch image is the purple bar alone, a little above the middle
      of the screen; the stem rises into it without the bar moving or
      changing size as the image hands over; the whole mark then flies
      into Home's header and lands on the header's mark with no jump.
- [ ] **A slow start.** Open the app on a poor connection. Passing: once
      the stem is in, the mark breathes until the app is ready.
- [ ] **Reduce Motion.** With Reduce Motion on, open the app. Passing:
      the stem fades in where it stays, nothing breathes or flies, and
      the overlay fades.
- [ ] **A share card.** Share a run and a medal. Passing: the small mark
      in the card's corner is the T, in the card's colour.

## The welcome shows your week, and sign-in a lifter who faces you (DS8, 2026-11-11)

**The welcome rows below are replaced** by "The welcome stands on
photographs of athletes" (DS9, 2026-11-12) further down: the example week
is gone. The sign-in rows still apply; their button names now read "Sign in".

Affects: `Login.tsx` (the welcome, sign-in and sign-up), `WelcomePreview`,
`SignInFigure`, `AuthLockup` and the `.ds-auth-*`, `.welcome-*` and
`.signin-*` styles. Captured in Chromium at 393 and 320 px and measured for
overflow at 100%, 135% and 200% text; WebKit on a phone has not drawn them.

- [ ] **The welcome on a phone.** Delete the app, install a build made
      after the merge and open it. Passing: the lockup is clear of the
      status bar; the week card, today's card and the target card are all
      whole above "Get started"; the three cards rise in once and the ring
      draws; nothing reaches past either edge of the screen.
- [ ] **Sign-in on a phone.** Tap "Sign in". Passing: the lifter
      appears at once (the drawing is in the app, not fetched), presses the
      bar twice and rests with it overhead; "Welcome back" is on one line
      beside it; the screen fits from the lockup to "Sign up" without
      scrolling on a 6.1 inch phone.
- [ ] **Across the forms.** Tap "Sign up", then "Sign in". Passing: the
      heading changes and the lifter does not start its rep again.
- [ ] **The keyboard.** Tap Email. Passing: the field is above the
      keyboard, and the page scrolls so "Sign in" can be reached.
- [ ] **Reduce Motion.** With Reduce Motion on, open the welcome and
      sign-in. Passing: the cards are in place with no rise, and the lifter
      stands still.
- [ ] **Larger Text.** Set Larger Text to its largest standard size and
      open both. Passing: the words grow and wrap, the picture keeps its
      size, and nothing is cut off or leaves the screen.
- [ ] **iOS 15.** On a phone or simulator on iOS 15.4 to 15.8, open both.
      Passing: the picture's cards are sized and placed as on a current
      phone (they are measured from the screen, since iOS 15 has no
      container query units).

## The score is shown once, on Analytics (Trim1 calls 5 and 6, 2026-11-11)

The Performance page is gone. The score sits in a ring on the card at the
top of the Analytics overview, and "Score details" under it opens in place
what the page held. The unit suites cover the words, the colours and the
links; these need a phone.

- [ ] **The ring holds its score at the largest text size.** With the
      phone's text size at its largest, open Analytics. Passing: the score
      sits inside the ring with room around it, the words wrap under the
      ring instead of beside it where they no longer fit, and nothing runs
      past the card.
- [ ] **Score details opens where you are.** Tap Score details. Passing:
      the page does not jump, the six-week line gives way to the twelve-week
      chart, and the training load's range pills change its curve. Tap it
      again: the page closes back to the card.
- [ ] **A saved link still lands.** Open `/history#performance` and
      `/history?view=performance` (a bookmark, or a link from before).
      Passing: each opens the overview with Score details open.
- [ ] **The tooltip opens on a tap.** Tap the small "i" beside
      Performance. Passing: the explanation opens, reads in both themes,
      and a tap elsewhere closes it.

## Badges and medals are one shelf, on the profile (Trim1 call 3(c), 2026-11-11)

Analytics' Badges tab is gone. A profile shows badges above medals, and on
your own "See all" opens the whole badge collection in place. The unit
suites cover the fold, the links and who sees what; these need a phone.

- [ ] **From the streak.** On Home tap the streak chip, then "See your
      badges". Passing: your profile opens with the Badges heading at the
      top of the screen and the whole collection open under it.
- [ ] **A saved link to the tab.** Open `/history?tab=badges`. Passing: it
      lands on your profile with the collection open, and Analytics shows
      two tabs, Analytics and Bests.
- [ ] **Open and close.** On your profile tap "See all", then "Show
      fewer". Passing: the collection opens where it is, the page does not
      jump, and closing returns the newest four.
- [ ] **Someone else's profile.** Open another person's profile.
      Passing: their newest badges and their medals, and no "See all" on
      the badges.
- [ ] **Larger Text.** With the phone's text at its largest, open the
      collection. Passing: the three streak figures and the badge tiles
      wrap inside the screen, and nothing is cut off.

## Settings lists the two plan editors; four pages fold away (Trim1 calls 2 and 7, 2026-11-11)

Affects: the Settings list (ten rows, from twelve), Lift plan (the rest
timer's two controls and Reset programme at its foot), Run plan (voice
cues), Account (the plan, AI usage, the three exports and recently deleted
meals), and four routes that are now redirects (`/settings/training`,
`/settings/workout-prefs`, `/settings/subscription`, `/settings/data`).
Captured in Chromium at 393 and 320 px; a phone has not drawn them.

- [ ] **Back from the editors.** Settings → Lift plan, then swipe back
      from the screen's left edge; the same from Run plan. Passing: each
      returns to the Settings list, not to a blank or a third page.
- [ ] **Reset programme, at the foot of Lift plan.** Scroll Lift plan to
      its end and tap Reset programme. Passing: the confirmation opens
      over the page with Cancel first; Cancel leaves the plan as it was.
- [ ] **The rest timer, where it now lives.** On Lift plan, switch
      Auto-start rest timer off, start a workout and finish a set.
      Passing: no timer starts. Switch it back on and it does.
- [ ] **Voice cues, where they now live.** On Run plan, switch Audio cues
      off and open a run's setup. Passing: its Run controls line reads
      "Voice cues off".
- [ ] **The plan on Account.** On a free account, Settings shows "Free"
      on the Account row; Account's first card opens the Pro page. On a
      trial it reads the days left.
- [ ] **An old link.** From Safari or a note, open a saved link to
      `/settings/training` in the installed app. Passing: Lift plan
      opens.

## A short plan pairs its last lifts as supersets (Lift22, 2026-11-12)

Affects: new plans of 30 and 45 minutes past beginner (`planSupersets.ts`,
`sizeSessionsToTime`), the session clock (`estimateSessionSeconds`), a
session's opening supersets (`sessionPrescription`) and Train's day list
(`SupersetBlock`). Unit-tested and captured in Chromium from the app's own
components; no signed-in account has drawn Train on a phone.

- [ ] **A new 45-minute plan.** Reset the programme at 45 minutes,
      intermediate, four days or more. Passing: Train shows at least one
      day with a "Superset" block of two lifts, the block's line reads
      "One set of each, then rest", and the day's minutes are 45 or under.
- [ ] **The pair in the workout.** Start that day. Passing: the first
      lift of the pair reads "Superset with" the second, finishing a set
      of it moves to the second, and the rest timer runs after the second.
- [ ] **Splitting it.** Open the first lift's "…" and tap "Remove from
      superset". Passing: the two run as straight sets for the rest of the
      session, and Train still shows the pair after Finish.
- [ ] **An hour's plan.** Reset at 60 minutes. Passing: no day shows a
      "Superset" block.

## Train says when a lift day runs past its length (slice 4, 2026-11-12)

Affects: Train's Lift tab, under the day's card (`OutgrownDayNotice`), and
the lift plan editor's save, which now shares its builder input and its
refusal wording with Train's rebuild (`liftPlanRebuild.ts`). Captured from
the components in Chromium at 393 and 320 px; a phone has not drawn it, and
no rebuild has gone through the deployed `configurePlan` yet.

- [ ] **The owner's Pull A.** On the plan with the 12-lift Pull A, open
      Train on that day. Passing: under the card, "Pull A takes about N
      min" with N the card's own minutes, and "Your sessions are 45 min."
- [ ] **Rebuild for 45 min.** Tap it, then Rebuild. Passing: a toast says
      the lift days were rebuilt; every day's card reads 56 min or less;
      the week number in the header is unchanged; a day done this week
      still shows done, and its session still opens from it; the deadlift
      and the other lifts the new days hold keep their weights.
- [ ] **Cancel rebuilds nothing.** Tap Rebuild for 45 min, then Cancel.
      Passing: the days are as they were.
- [ ] **Keep this day.** On another long day, tap Keep this day. Passing:
      the notice goes; close and reopen the app and it stays gone; add a
      lift to that day and it comes back.
- [ ] **Not on a done day, nor in a past week.** Open a done day and a
      day of a past week. Passing: no notice on either.
- [ ] **Offline.** Turn on airplane mode and tap Rebuild. Passing: an
      error toast, and the plan unchanged once back online.

## The deadlift's card faces the person (2026-11-12)

Affects: the deadlift's card picture (Home's hero on a day it leads, Train,
the exercise rows), now drawn from the front
(`docs/exercise-art/cutout-sources/deadlift.json`), and Home's animation for
it, made again from the front the same day
(`docs/exercise-art/motion/README.md`). The form guide keeps its six frames
drawn from behind. Checked in Chromium at 393 px in both themes; no phone
has drawn it.

- [ ] **Home on a deadlift day.** On a day whose plan starts with the
      deadlift (Pull A), open Home. Passing: the hero shows the athlete from
      the front with the bar on the floor, plays the lift from the front
      for about five seconds (floor, lockout, back to the floor), and stops
      on the card with no jump.
- [ ] **The form guide is unchanged.** Open the deadlift's form guide in a
      workout. Passing: the six frames from behind, as before.
- [ ] **Reduce Motion.** With Reduce Motion on, open Home on a deadlift
      day. Passing: the front-view card shows and nothing moves.

## The welcome stands on photographs of athletes (DS9, 2026-11-12)

Affects: the welcome in `Login.tsx`, `WelcomePhotos.tsx`, the photographs in
`src/assets/welcome/` and the `.welcome-*` styles. Captured in Chromium at
393, 375 and 320 px in both themes and at 1.35x and 2x text; WebKit on a
phone has not drawn it, and nothing here can film a cold start.

- [ ] **The first photograph on a cold start.** Delete the app, install a
      build made after the merge, and open it on mobile data. Passing: the
      first photograph (a woman sprinting) fades in within about a second,
      with no white flash; the lockup is clear of the status bar; the
      headline, Get started, Sign in and the links sit at the foot on the
      dark ground.
- [ ] **The fade.** Wait on the welcome. Passing: a new photograph fades in
      every four or five seconds, five in all, then the first again; the
      words never move; faces stay clear of the headline on a 6.1 inch
      phone and on an iPhone SE.
- [ ] **Away and back.** Switch to another app for a minute and back.
      Passing: the photographs carry on from where they were, with no jump.
- [ ] **Reduce Motion.** With Reduce Motion on, open the welcome. Passing:
      the first photograph only, still.
- [ ] **Light mode.** With the phone in light mode, open it. Passing: the
      same as dark, light words on the photographs.
- [ ] **Owner to-do (optional): the word on one strap.** One sports-bra
      strap in the third photograph (three women running) carries the word
      "RUN", about 3 px tall on a phone. It is a word, not a brand, and can
      stay. To remove it: open `93-lfDpgAP5_Ao.jpg` from the welcome
      originals zip in Photos on an iPhone, use Clean Up on the strap, and
      send the result; the next session swaps it into
      `src/assets/welcome/welcome-3-crew.webp` and its manifest.

## Social covers and the race list's photographs (2026-11-12)

Affects: six interest Space covers in `src/assets/editorial/` (New to
Tropos, Runners, Women's Running, Lifters, Hybrid Training, Triathlon &
Multisport), and the race list in the run plan and in setup
(`UpcomingRacePicker.tsx`, `.race-pick-fade`). Captured in Chromium against
the emulators at 393 px; no phone has drawn them.

- [ ] **The Spaces row.** Open Social and scroll to Spaces. Passing: the six
      new covers are sharp, and each name sits clear of the faces.
- [ ] **A Space's header.** Open New to Tropos and Lifters. Passing: the
      faces and the bars are inside the header band.
- [ ] **The race list.** Settings → Run plan → Training for a race → A race
      I've entered → Choose an upcoming race. Passing: each race is a card
      with its place on the right, fading into the card under the date,
      distance and name; the words read in light and dark.
- [ ] **A long list.** Clear the filters and scroll the whole list.
      Passing: it scrolls smoothly, and each photograph appears as its card
      comes into view.
- [ ] **Choosing a race.** Tap one. Passing: it is selected (a tick and a
      coral edge), the list closes, and the race's name and date fill the
      plan.
- [ ] **Choosing a race in setup (2026-11-13).** On a new account, choose
      Support my running, a race plan, then "A race I've entered", and
      choose a race from the list. Passing: the same cards with their
      places; the race's day fills the date; the review names the race; and
      once setup is done, the run plan shows the race chosen, and its
      Space's hero counts you in the plan group (once 3 or more have it).

## Train's race band and Run plan's photograph cards (2026-11-13)

Affects: `RaceCockpitCard` (a band of the race's Space cover when the goal
is bound to a race), `PhotoChoiceCards` on Settings → Run plan (the running
goal and the distance), and the photographs in `src/assets/plan/`. Captured
in Chromium at 393 px in both themes against the emulators; no phone has
drawn them.

- [ ] **Train with a race chosen from the list.** Choose a race in Run plan
      or setup and open Train's Run tab. Passing: the race card opens on
      the race's place with its name on it, sharp, and the card's corners
      clip the photograph. A race typed in by hand keeps the plain card.
- [ ] **Run plan's cards.** Open Settings → Run plan. Passing: No race and
      Training for a race, then the four distances, are photographs with
      their names readable in both themes; tapping one moves the coral
      edge and the tick at once, and the photographs are there on the
      first open on mobile data within about a second.
- [ ] **VoiceOver.** Swipe through the cards. Passing: each is read as its
      name, "selected" or not, then its fact ("42.2 km, 12+ weeks").
- [ ] **Larger Text.** At the largest size, open Run plan and Train.
      Passing: the cards grow taller and keep every word; the band grows
      with the race's name.

## Readiness, and the Health plugin that reads sleep and heart (2026-11-13)

Affects: the Health plugin (`@capgo/capacitor-health` 8.12.3 in place of
`capacitor-health`), `healthKit.ts`, WatchRun's `openAppSettings`,
readiness on Home's lift hero (`ReadinessStrip`, `useTodayReadiness`,
`readiness.ts`), Train's `easier=1` link, and Pro's sleep and heart
(`useBodySignals`, `bodySignals.ts`). Unit tests mock the plugin and the
end-to-end tests run in Chromium; no phone has run any of it, and the
simulator build in CI is the only native compile.

- [ ] **Steps still read (the plugin switch).** On an account with steps
      connected, open Home. Passing: today's steps match the Health app;
      Settings → Apple Health's "Open Settings" opens Tropos's page in iOS
      Settings, as before.
- [ ] **The morning question.** On a lift day with nothing known, Home's
      hero asks "How do you feel today?". Passing: Tired shows "Steady ·
      You said you’re tired" and "Go easier today"; tapping it opens the
      session with one set less per lift and lighter loads; Change asks
      again; tomorrow it asks afresh.
- [ ] **Sleep and heart (Pro).** On a Pro account with a Watch, tap "Add
      sleep and heart from Apple Health" and allow all three. Passing:
      after a normal night Home says "Ready · 7 h … of sleep, resting
      heart rate as usual"; after a short night, Steady with the night's
      hours against the usual; the minutes match the Health app's Sleep
      for that night, counted once when both phone and Watch recorded it.
- [ ] **Refused in Health.** Turn the three off in the Health app.
      Passing: no sleep or heart line appears and nothing errors; the
      question is asked as for a free account.
- [ ] **The permission sheet.** Passing: iOS shows Steps on its first
      ask, and Sleep, Resting Heart Rate and Heart Rate Variability on
      the readiness ask, with the new wording; nothing asks to write.
- [ ] **App Store privacy answers.** Sleep and heart are read on the
      phone and never sent, so the "Health and Fitness" data answer is
      unchanged; confirm in App Store Connect before submitting.

## A free account is told its personal target (Q87, 2026-11-13)

Affects: `resolveAdaptiveTarget` (the estimate is worked out for a free
account, never applied), `PersonalTargetCard` under Food's wheel, Home's
Pro strip (the trial is offered once the target is ready, Q71) and the
formula line on Settings → Nutrition. Unit-tested; no phone and no store
sandbox has run it.

- [ ] **The card on a phone.** A free account with about three weeks of
      meals and eight or more weigh-ins over 14 days. Passing: Food shows
      "Your personal target is ready" under the wheel with the number and
      how far it is from today's target; the wheel keeps today's target.
- [ ] **The trial from the card.** Tap Try Pro free on a sandbox Apple ID
      that has never had the trial. Passing: Apple's sheet offers 7 days
      free; once it is confirmed Food's target moves the same day (to the
      personal target when it is within 150 kcal, else 150 toward it).
- [ ] **Not now.** Tap the cross. Passing: the card is gone, and stays
      gone after closing and reopening the app.
- [ ] **Home's strip.** On the same free account before and after the
      target is ready (from day 3). Passing: before, "Log meals from a
      photo with Pro" and See plans; after, "Your personal target is ready:
      try Pro free for 7 days" and Start trial.

## Charts older than 3 months and the score's details are Pro (Q84, 2026-11-13)

Affects: Analytics' range pills (6M and 1Y), an exercise's chart (6M, 1Y,
All), and Score details with the training load chart, for a free account.
A person's sessions, bests, lifetime totals and exports stay free.
Unit-tested; the capture specs that film 6M and the details now sign the
test user in as Pro for the length of the capture.

- [ ] **A free account on Analytics.** Passing: 6M and 1Y carry a small
      lock; tapping one opens the Pro page and leaves the range where it
      was; Score details shows "Pro" and opens the Pro page, not the fold.
- [ ] **An old link.** As a free account, open a saved link to
      `history?range=1Y&score=details`. Passing: Analytics shows 3 months
      and the headline score, with the details closed.
- [ ] **VoiceOver.** Swipe the range pills as a free account. Passing:
      each locked one is read as "6M, Pro".
- [ ] **After a trial starts.** Passing: every range and the details open
      at once, with no restart.

## The easy cue on easy and long runs (Run24 (12), 2026-11-13)

Affects: `checkEasyCeiling` in `useAudioCues`, called from `Run.tsx` on an
easy or a long run in its easy running (`judgesEasyNow`) for a runner with
a confirmed benchmark. Unit tests drive the spacing and the gate; no phone
has spoken it on a real run.

- [ ] **An easy run, too quick.** With a confirmed benchmark, start an easy
      run and run clearly faster than the fast end of your easy pace for
      two minutes. Passing: one spoken line about easing off after about
      half a minute, then at most two more, a minute and two minutes
      apart; nothing once you are back at easy.
- [ ] **Strides and a race-pace finish.** Run an easy run with strides and
      a long run that finishes at race pace. Passing: no easy cue during
      the strides or the race-pace block.
- [ ] **No benchmark, or the cue switched off.** Without a confirmed
      benchmark, or with pace alerts off in the run's settings, run fast on
      an easy run. Passing: no easy cue.

## Half and full marathon plans are Pro after their first week (Q85, 2026-11-13)

Affects: Home's run card and Train's Run tab (today's planned session offers
Pro), the Run page (a planned training run on a locked plan opens as a free
run), and the distance control in setup and Settings → Run plan (a note for a
free account choosing a half or full marathon). The race itself, recovery
weeks, 5K and 10K plans, the starter and free runs stay free. Unit-tested; no
phone has drawn it.

- [ ] **Week 1 free.** A free account sets up a half marathon. Passing: the
      plan's first week (and any lead-in days) start as usual from Home and
      Train; setup and Run plan say the plan is Pro after its first week.
- [ ] **Week 2 on.** The same account in its second week. Passing: Home's run
      card reads "Your half marathon plan continues with Pro" with Try Pro
      free (or See Pro); Train's Start says the same; Start free run on Train
      still records a run.
- [ ] **After the trial starts.** Passing: Start comes back on Home and Train
      at once, on the week the plan has reached.
- [ ] **Race day and recovery.** Passing: Start race works on race day for a
      free account, and the recovery weeks after it start as usual.

## Faster paces after a run are Pro; slower stay free (owner, 2026-11-13)

Affects: the run summary's pace card after a race, a time trial, a tempo or
an interval session. Settings' pace insight is Pro as before. Unit-tested;
no phone has drawn it.

- [ ] **Free, faster.** A free account saves a 5K faster than its benchmark.
      Passing: the card reads "Pro moves every upcoming training pace from
      VDOT … to …." with Try Pro free (See Pro once the trial is used) and
      Not now; the button opens the Pro page and the paces stay as they were.
- [ ] **Free, slower.** A free account's saved targets are too quick for its
      runs. Passing: the card reads "Your saved targets may be too quick right
      now" with Update paces, and the tap updates them.
- [ ] **After the trial starts.** Passing: Settings → Run plan offers the
      faster paces with Update paces.

## The time trial in the plan (Run24 (4), 2026-11-13)

Affects: the plan's `time_trial_3k` and `time_trial_5k` sessions (`runScheduler`'s trial weeks), their segments on the run screen (`segmentsFromTimeTrial`), and the run summary reading the trial's work as a race (`benchmarkEffortOf`). Unit tests drive each piece; no phone has run a time trial.

- [ ] **Week 2 without a benchmark.** Set up a half 16 weeks out with no race time. Passing: week 2 shows "3K time trial" on the strides day, with its words (a warm-up, 3 km as hard as you can hold evenly, a cool-down, a parkrun does the same job).
- [ ] **Running it.** Start the time trial. Passing: the run screen shows the warm-up, then "3 km time trial" with no pace bar and no pace alerts, then the cool-down; the 3 km segment ends at 3 km.
- [ ] **The new paces.** Finish it faster than the paces in use. Passing: the run summary offers the new paces, read from the 3 km only (not the warm-up and cool-down); on a Pro account one tap takes them, on a free account the card names Pro and nothing changes; with no paces before, the card reads "Your training paces, from this run".

## A shorter base for a regular runner (Run24 (2), 2026-11-13)

Affects: setup's race preview, the stored run plan's `shortBase`, and every surface that names a week's phase (the race card's rail, "Why this run" on Home, Train and the run screen, Train's lift label). Unit tests drive each reader from one stored plan; no phone has made or carried such a plan.

- [ ] **Setup.** As a regular runner, give 330 minutes a week and a 120-minute longest run, and set a half 16 weeks out. Passing: the preview says "Your build starts in week 5, since you already run 330 minutes a week." A building runner with the same numbers sees no such line.
- [ ] **Week 5.** On the plan's fifth Monday, open Train and Home. Passing: the race card's rail lights Build, the week's tempo is there, "Why this run" reads "Build · week 5 of 16", and the lift label ends "· Build".
- [ ] **A plan made before this build.** On an account whose race plan was saved before this shipped, roll a week and change a run day in Settings. Passing: its phases stay where they were (Base until week 7 of a 16-week half); the plan gains no `shortBase`.

## The session library on the run screen (Run24 (5), 2026-11-13)

Affects: the new sessions' segments on the run screen (`segmentsFromIntervals` with a style, `segmentsFromProgression`), their spoken cues, the setup's step preview, and their words on Home, Train and the launch card. Unit tests build each session from template to segments; no phone has run one. Open each from a run day's template picker (day sheet → Template) to try it before a plan holds it.

- [ ] **Hills.** Start Hills 6×60s with a confirmed benchmark. Passing: a 15-minute warm-up, then "1 min uphill" headed "HARD · HILL 1/6" with no pace bar and no pace alerts, "Jog down" between, a spoken "Hill 1 of 6" at each climb.
- [ ] **A fartlek.** Start Fartlek 30. Passing: six "1 min pick-up" steps headed "COMFORTABLY HARD", no pace anywhere, "Pick-up 1 of 6" spoken.
- [ ] **Repeats at 5K pace.** With a confirmed benchmark, start 4×800m at 5K pace. Passing: each repeat shows its own pace (about the 5K pace the app predicts), headed "5K PACE · REP 1/4", and the in-run heading never swaps it for the interval band; a minute's rest between. Without a benchmark: "5K EFFORT", no pace.
- [ ] **A progression run.** Start Progression 50 with a confirmed benchmark. Passing: 35 minutes easy with no pace alert, then "15 min to finish" at the threshold band, judged on pace there only.
- [ ] **The setup's steps.** Open any of the four above and tap Customise. Passing: the steps shown are the session's own words until you change the repeats.

## The weekly race check against the plan's own peak (Run24 (11) review fix, 2026-11-13)

Affects: Home's race register of the fell-behind sheet (`raceLongRunCheck`),
which now reads `programState.runPlan.peakLongRunKm`, written whenever a race
plan's week is built. Unit and season tests drive it; no stored plan has
picked up the field yet.

- [ ] **A stored plan picks up its peak.** On an account with a race plan
      made before this shipped, open the app after its next Monday. Passing:
      `users/{uid}/programState/current` has `runPlan.peakLongRunKm` (the
      plan's longest long run in km), and until it does the sheet's race
      register never opens.
- [ ] **A slow marathoner in the taper.** A marathon plan whose long run
      peaks under 21 km (setup says "Your longest run will be 20 km"), every
      long run done, opened in a taper week. Passing: no "Your long runs and
      your race" sheet.

## A race plan's sizes kept on the plan (Run24 (1), (2), (8), 2026-11-14)

Affects: the run plan document (`programState.runPlan.blockInputs`), written
when a race plan is made and on every rebuild of its week, and read back on
the next one. Unit tests and the simulator drive the generator and the
rollover; no phone has written or read the field through Firestore.

- [ ] **Setup writes it.** Set up a half or a marathon at setup with a
      starting point and no race time. Passing: the Firestore console shows
      `runPlan.blockInputs` with `runsPaceSPerKm: null`, the starting
      point's figures and `heldLongKm` at the first week's long run.
- [ ] **The first rollover keeps a pace.** Save two or three runs, then open
      the app on the Monday after. Passing: `runsPaceSPerKm` holds the pace
      of those runs, and opening the app again the next Monday after a
      faster or slower run leaves it as it was.
- [ ] **A plan from before.** On an account whose race plan was made before
      this build, open the app. Passing: the week is the one it would have
      been; `blockInputs` appears once a rebuild has read saved runs.

## The session library in the plan (Run24 (5), 2026-11-13)

Affects: which sessions a race plan's base, build and taper weeks hold (`runScheduler`'s `BUILD_FAMILIES`, `BASE_LIGHT_SESSIONS`, `TAPER_SHARPENER`) and a regular runner's second quality day. Unit tests and the simulator's traces cover the plan; no phone has shown one.

- [ ] **A base week.** Set up a 10K 14 weeks out on four run days. Passing: Train's week 1 shows "Fartlek 30" (week 2 "Short hills 6×30s" or the 3K time trial) beside an easy run with strides, an easy run and the long run; its day sheet and Home's hero say what it is.
- [ ] **A 5K build.** Set up a 5K 12 weeks out. Passing: the build weeks show 4×1 km, then a 5K-pace session ("4×800m at 5K pace") and later 200s; the week before race week shows "6×400m at 5K pace".
- [ ] **A marathon taper.** Set up a marathon 18 weeks out with a confirmed benchmark and no goal time. Passing: each taper week shows "Sharpener 2×12 min", and Start plays its two 12-minute blocks at marathon pace.
- [ ] **Two quality days.** As a "Regular runner" at setup, on five run days with no lifting on two of them. Passing: a build week holds two quality sessions, neither on a lifting day; the same runner with every run day a lifting day holds one.

## A race block capped, with a rolling base before it (Run24 (3), 2026-11-13)

Affects: race plans more than 16 (5K, 10K), 18 (half) or 20 (marathon) weeks out (`RACE_BLOCK_MAX_WEEKS`, `raceBaseRolling` in `runScheduler`), and every reader of a plan's phase (`getPhaseForWeek`, `isRunStepBackWeek`): the race cockpit's rail and "Week N of M", the session words, the lifting's lighter weeks. Unit tests and the simulator's traces drive it; no phone has shown it.

- [ ] **A marathon a year out.** Set up a marathon 40 or more weeks away. Passing: the cockpit reads Base, "Week 1 of N" with N the whole plan; week 2 or 3 holds a tempo, 8 x 400 or a time trial, not easy runs only; the long run climbs over the first weeks to 18 km and holds there; The weeks ahead shows a lighter week every fourth.
- [ ] **Into the block.** On the same plan, move the device date to 20 weeks before the race. Passing: the long run that week is the one the base held (or a rung above), not a drop; the cockpit still reads Base until the block's build.
- [ ] **The lifting's lighter week.** A hybrid plan with a far race. Passing: the lift side's lighter week falls in the same week as the run plan's lighter week, in the base and in the block.

## Plans with no race date, and what comes after a race (Run24 (3), 2026-11-14)

Affects: setup's "Plan, no race", Run plan's "Plan, no race" card and goal picker (`RollingGoalPicker`), a plan stored as `runPlan.mode` "rolling" on a free running profile (`rollingGoalOf`, `runModeWithPlan`), its weekly rollover (`nextRunWeek`, `generateRollingPlan`), Train's run tab and header, Home's rest day, and the recovery-complete banner. Unit tests and the simulator's `build-10k-no-date` trace drive it; no phone has shown it, and setup and Run plan save it through `completeOnboarding` and `configurePlan` as they stand.

- [ ] **Setup.** As a regular runner who also lifts, choose Plan, no race, then Build to 10K and 4 runs a week, and finish setup. Passing: Home leads with the first planned run; Train's run tab reads "Build to 10K · Week 1" and shows the week's runs; no Pro offer on any of them.
- [ ] **The next Monday.** Move the device date to the next Monday. Passing: Train reads "Week 2" and the week holds new runs, a session among them by the second week; the lift week moved with it.
- [ ] **Run plan.** Open Settings, Run plan. Passing: Plan, no race is chosen with Build to 10K; changing it to Keep fit and saving keeps the run days and starts Keep fit at Week 1; choosing No race and saving leaves no planned runs.
- [ ] **A planned run.** Start today's planned tempo from Home. Passing: the run screen shows its warm-up, work and cool-down, and the run summary counts it against the plan.
- [ ] **After a race.** On a race plan whose recovery has ended, open Train. Passing: the banner reads "Recovery complete" with Choose a plan, Set next race and No plan for now; Choose a plan opens Run plan on Plan, no race with Keep fit chosen, and saving it plans the week from today.
- [ ] **Free running.** On free running with no plan, open Train's run tab. Passing: "Keep your running going" is offered above "Set a race goal", opens Run plan on Keep fit, and stays gone once dismissed.
- [ ] **An older build.** With the plan saved, open the app on a build from before this change. Passing: the plan's runs stay as they are (a plan from a newer build is kept, `isRunPlanFromNewerBuild`), not wiped to free running.

## Coming back after a break is one check for both sports (Q35, 2026-11-13)

Affects: Home's Welcome back for the weights (`LiftReturnSheet`, whose line
now reads "It’s been about N weeks since your last lift"), Home's run return
and the race plan's re-entry weeks, all measured by one rule over both
sports' sessions (`trainingReturn.ts`). A break from a sport is time away
from that sport; a sport the plan does not hold is never greeted. The easing
amounts are unchanged. Unit-tested; no phone has shown it.

- [ ] **Stopped lifting, kept running.** On a hybrid plan, run as usual and
      log no lift for three weeks. Passing: Home offers Welcome back for the
      weights with Ease back in first, and its line names the last lift; the
      run plan carries on, with no run greeting.
- [ ] **Stopped running, kept lifting.** On a race plan, lift as usual and
      log no run for three weeks. Passing: Home opens the race plan's
      welcome back, and a rebuild plans the re-entry weeks; no Welcome back
      for the weights.
- [ ] **A plan with no lifting.** Switch a hybrid who lifted a month ago to a
      running-only plan. Passing: no Welcome back for the weights.

## What comes after the 30-minute goal (Run24 (3), 2026-11-14)

Affects: the starter goal's Done card on Home and Train (`StarterDoneCard`) and Run plan opened from it (`?goal=build_5k`, `?goal=keep_fit`, `?goal=5k`). Component tests and the starter journey drive it; no phone has shown it, and no capture was taken.

- [ ] **The card.** Finish the 30-minute goal's last week. Passing: Home shows Done, "30 minutes without stopping", and three rows, Build to 5K, Keep fit and Train for a 5K, each with its line, then Not now; at 320 px and with large text the rows wrap and nothing is cut.
- [ ] **Build to 5K.** Tap it. Passing: Run plan opens on Plan, no race with Build to 5K chosen; Save plans the week, Train reads "Build to 5K · Week 1", the Done card is gone on Home and Train, and no Pro offer appears.
- [ ] **The 5K.** On another account at the same point, tap Train for a 5K. Passing: Run plan opens on Training for a race with 5K chosen and its date still to pick, as before.

## Apple Watch companion: device acceptance kit (2026-11-14)

The last step before `WATCH_RUN_RELEASE_ENABLED` and
`VITE_CONNECTED_TRAINING_ENABLED` are turned on for a standard build. Every
first-release item in `docs/proposals/connected-training.md` is built and
unit-tested (its "First release: built and tested" table), and both native
targets compile in CI's `ios-native-compile` job, but no device has run
them: everything below is what only a paired iPhone and Watch can show. It
covers the proposal's native feasibility gate (G1 to G6) and its acceptance
matrix. Run it in one sitting with a pilot build ("Connected training pilot"
in What to Test, docs/ios-release.md "Pilot builds on TestFlight") on a test
account, Save workouts to Apple Health off until the export block. Plan
about an hour: two short runs outdoors, then checks standing still. When
every row passes, ask for the flip; when one fails, write what you saw on
the proposal and keep the gates off (the proposal's "If this gate fails").

Affects: `ios/App/TroposWatch/` (the Watch app), `ios/App/App/WatchRunCoordinator.swift`,
`WatchRunPlugin.swift` and `HealthWorkoutStore.swift` (the iPhone side),
`src/lib/watchRunBridge.ts`, `watchRunStep.ts`, `watchRunSyncStatus.ts`,
`healthWorkoutExport.ts`, `src/pages/Run.tsx`, `RunSummary.tsx`, Settings →
Apple Health.

**Record first** (write the answers into the row when you tick it):

- [ ] **The devices.** iPhone model and iOS version; Watch model and watchOS
      version (the Watch app's minimum is watchOS 9, the iPhone's iOS 15.4);
      the TestFlight build number and the commit in its What to Test note.
- [ ] **The setup.** Settings → Apple Health on the iPhone: Use Watch for
      runs on, Save workouts to Apple Health off. The Watch app installed
      from the iPhone's Watch app. Today has a planned interval or tempo
      session, or build one in the run setup's interval options with short
      steps (a 1 min warm-up, 3 × 200 m with 60 s recoveries, a 1 min
      cool-down) so the steps come round quickly.

**Run A: a structured session, phone in a pocket, locked** (G1, G2, G3):

- [ ] **K1. The Watch asks once, with the right words.** Start the session
      on the iPhone, then open Tropos on the Watch (this release does not
      open it for you). Passing: it shows the run, and its Health prompt
      names heart rate (read) and
      workouts (save) with the Watch's texts: "Tropos reads heart rate
      during a run you start on your iPhone…" and "Apple Watch asks this of
      any app that runs a workout session… The Watch saves no workout to
      Health." After Allow, heart rate shows within 30 s.
- [ ] **K2. The step on the wrist.** Passing: the Watch shows the step the
      phone shows: "EASY" over "Warm-up" with its countdown (within a second
      of the phone's), "Next:" naming the first rep. At the warm-up's end
      the Watch buzzes once (Apple's start haptic) and shows the rep's
      heading ("… · REP 1/3"), its distance or time and pace target, metres
      or seconds left, and "Next: Recover"; the recovery buzzes the stop
      haptic; the last step says "Last step"; after it "All steps complete"
      with the success haptic. No buzz when the run starts. Note any step
      whose words differ from the phone's.
- [ ] **K3. With the phone locked.** Lock the phone and pocket it for at
      least two step changes. Passing: the Watch's time, distance and step
      keep moving, each step change still buzzes, and "Last update" never
      shows. Write down how often the figures moved (every second, every few
      seconds, or stopped). If they stop while the phone is locked, the web
      view is not running and the wrist controls cannot be promised (G2):
      stop here and record it.
- [ ] **K4. Pause and Resume from the wrist, phone locked.** Tap Pause on
      the Watch. Passing: within 8 s the Watch shows Paused (never "No phone
      response"), and on unlocking, the phone is paused at the same time.
      Resume from the wrist the same way. Then tap Pause twice quickly:
      one pause, the second tap refused or greyed.
- [ ] **K5. Heart rate with the wrist down.** Run two minutes with the wrist
      lowered. Passing: on the finish screen the heart rate card shows Time
      in zone (the Watch covered at least half the moving time), with no
      gap at the step changes longer than a few seconds (each haptic pauses
      HealthKit's collection while it plays).
- [ ] **K6. Lose the phone, find it again.** Mid-run, turn off Bluetooth
      and Wi-Fi in the iPhone's Settings app for 30 s (Control Center keeps
      the Watch connected), or leave the phone behind and walk out of range.
      Passing: the Watch says "Phone disconnected", Pause and End grey out,
      the phone keeps recording; once connected again the Watch says
      "Reconnecting to iPhone…" and then shows the phone's state, and
      nothing tapped while disconnected happens afterwards.
- [ ] **K7. End from the wrist, then lose the app.** With the phone locked,
      tap End run and confirm. Passing: the Watch says "Review and save on
      iPhone". Force-quit Tropos on the iPhone and open it again: Home
      offers the run waiting to be saved, and it opens on that run's finish
      screen. Save. Passing: the Watch shows "Saved on
      iPhone · syncing", then "Synced to Tropos"; History holds one run, and
      the planned session is done once.
- [ ] **K8. End twice.** On the next run, tap End and confirm twice before
      the Watch answers. Passing: one finish screen, one saved run.

**Run B: a free run, then the edge cases** (acceptance matrix):

- [ ] **K9. A free run.** Start a free run (not the planned one). Passing:
      the Watch mirrors it with no step block; the save gives only the plan
      credit the claim map would without a Watch.
- [ ] **K10. Saved offline.** Finish, turn on airplane mode on the iPhone,
      Save (privacy zones confirmed earlier in the session), force-quit,
      reopen, turn airplane mode off. Passing: the Watch shows "Saved on
      iPhone · syncing" until the run reaches the server, then "Synced to
      Tropos"; one run in History.
- [ ] **K11. The Watch app quit mid-run.** During a run, force-quit the
      Watch app and open it again. Passing: it shows the run and the current
      step with no buzz, and heart rate comes back.
- [ ] **K12. No Watch.** With the Watch off, start and save a short run.
      Passing: the run works as before; no heart rate card and no 0 bpm;
      Settings → Apple Health reads Connection lost or Watch app not
      installed, never a permission verdict.
- [ ] **K13. Heart rate not allowed.** In the Health app, turn off Heart
      Rate for Tropos and run briefly. Passing: the Watch shows "—" for
      heart rate, never 0; Settings says "No heart rate yet?" with the way
      to Health's Data Access, not "Denied".
- [ ] **K14. Another account.** Sign out on the iPhone. Passing: the Watch
      shows "Start a run on your iPhone". Sign in as another account and
      start a run: nothing of the first account's run, heart rate or step
      shows on the Watch.

**Apple Health** (G4; the export block on a test account):

- [ ] **K15. Export off writes nothing.** After Runs A and B, open Health →
      Browse → Activity → Workouts. Passing: no Tropos workout and no
      workout from the Watch app; the Activity rings count the runs once,
      from the Watch's own movement.
- [ ] **K16. Export on writes one.** Turn on Save workouts to Apple Health,
      run and save. Passing: exactly one Tropos workout, its start and end
      the run's recording, its duration the moving time (not the GPS wait
      or pauses), no route; the Move ring counts it once.
- [ ] **K17. Reinstall.** Delete the app, reinstall, sign in. Passing: no
      second workout for the same run, now or after the next foreground.
- [ ] **K18. Write access off, then on.** Turn off workout writing for
      Tropos in Health, save a run: Settings shows a pending update. Turn it
      on and tap Try again. Passing: the workout appears once, and the
      pending update goes (the verified-absence fix, `HealthWorkoutStore`).
- [ ] **K19. Removed in Health, then deleted in Tropos.** Delete an
      exported run's workout in Health, then the run in Tropos. Passing: no
      pending update is left in Settings after the next foreground.
- [ ] **K20. Deleted on another device.** Delete an exported run on the web
      app. Passing: on the iPhone's next foreground the workout leaves
      Health and Settings shows nothing pending.
- [ ] **K21. A time zone change.** Save a run after moving the iPhone to
      another time zone (Settings → General → Date & Time). Passing: the run
      stays on the day it started; the Health workout keeps its actual
      start and end.

**Packaging, from the run that built the pilot** (G6):

- [ ] **K22. Both apps signed.** The pilot run's logs show the Watch app
      signed with its own App Store profile (`com.tropos.app.watchkitapp`),
      HealthKit in both, and the archive verified with
      `--expected-connected-training YES`, including the Watch app's audio
      background mode and its two Health texts.

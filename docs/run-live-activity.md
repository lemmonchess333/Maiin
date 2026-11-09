# Live Activities: the run and the rest on the lock screen

**Status (2026-11-09):** both halves are built. The app's half sends each
activity's data (`src/lib/runLiveActivity.ts`, `src/lib/restLiveActivity.ts`),
and the widget extension `ios/App/LiveActivities/` draws it on the Lock Screen
and in the Dynamic Island (Polish2 call 1: build the widget, keep the plugin).
Nothing has run on a phone yet: the pull request's `simulator-build` job is the
first compile of its Swift, and the device rows in
`docs/qa/pre-launch-backlog.md` ("Live Activities on the phone") are the test.
On the web every call is an inert no-op; the web's views of the same things
are the run HUD and, for a rest, the tab's title (`src/lib/restOutside.ts`).

## What it draws

Both cards are dark, `#17171B` (`THEME.surface`), whatever the phone's
appearance: the run screen is always dark, and a Live Activity sits on the
wallpaper rather than in the app's theme. Text is `#F4F4F6`, captions and units
`#8E8E93` (5.5:1 on the card). Every colour measures at least 4.6:1 on it. The
type is the system's (SF Pro), not the app's two fonts, which the widget
does not bundle; the rest's countdown uses its wide heavy italic, the
system's counterpart of the rest band's Archivo display cut.

### A run (outdoor GPS runs only)

- **Lock Screen**, 16 pt side margins, 14 pt top and bottom:
  - a status line: the running figure and "Recording" in coral `#D4637A`
    (13 pt semibold), grey while paused, with "Tropos" in grey on the right;
  - the time as the hero, 46 pt heavy with tabular digits, coral (grey while
    paused, as the HUD greys it), "Time" under it at 12 pt;
  - beside it on the right, distance over pace, each figure 22 pt bold white
    with its unit at 13 pt grey ("3.4 km", "5:12 /km"). A changed figure
    rolls its digits.
- **Dynamic Island**: compact, the running figure in coral on the left and the
  time on the right (15 pt semibold); minimal, the figure alone; expanded, the
  status line top left and the card's figures along the bottom, the time at
  36 pt and the others at 20 pt.

### A lift's rest

- **Lock Screen**:
  - a status line: the dumbbell and "Rest" in purple `#7B72E9`;
  - the time left, the system's own countdown to the rest's end, 48 pt in the
    wide heavy italic with tabular digits, in the text colour as the rest band
    keeps it;
  - beside it, "Next · Bench Press" (13 pt grey) over the next set,
    "Set 2 · 15 kg × 10" (16 pt semibold white);
  - under them, a bar running down in purple, the system's own as well.
  - When the rest's end passes, the card turns to done with no word from the
    app: a green tick and "Rest done" in `#4DB872`, "0:00", and the bar whole
    and green, as the band's ring turns green.
- **Dynamic Island**: compact, the dumbbell on the left and the countdown on
  the right ("Done" in green at the end); minimal, the dumbbell (the tick when
  done); expanded, "Rest" top left, the countdown at 38 pt and the next set
  along the bottom, and the bar.

## How the halves fit

- **One widget for the plugin's type.** `capacitor-live-activities` starts
  every activity with its own `DynamicActivityAttributes`, and ActivityKit
  gives an activity to the widget configured for its attributes type. The
  extension links the plugin's `LiveActivitiesKit` for that type and
  configures `TroposLiveActivity` for it; the plugin's `DynamicActivityWidget`,
  which draws a JSON layout the app sends, is not in the bundle.
- **The data is the contract.** Each start and update sends `data` with a
  `kind` ("run" or "rest") and the keys that kind's view reads, listed in
  `src/lib/liveActivityContract.ts` and read by name in
  `ios/App/LiveActivities/LiveActivityPayload.swift`.
  `liveActivityContract.test.ts` holds the two lists to each other, with the
  type each key is read as, and the widget's colours to `THEME`. Change a key
  on one side and that test names the other. The plugin refuses a start
  without a JSON layout, so every start carries `PLUGIN_LAYOUT`, the smallest
  it accepts; nothing reads it.
- **A run** is fed by `Run.tsx`, which formats every figure as the HUD does,
  so the two never disagree. Updates go at most every 2 s and only when
  something changed; a change inside that window is held and sent when it
  opens, so a pause, after which nothing else changes, still reaches the card.
  The time is the app's label rather than a self-ticking timer: ActivityKit's
  timer keeps counting through a pause.
- **A rest** sends its start and end; the countdown and the bar are the
  system's, counting between them, so they keep time with the app asleep and
  need no updates. The end is also the activity's stale date, which is how the
  card turns to done. +15 s ends the activity and starts another, since an
  update would clear the stale date.
- **Ending.** Both end on the last data they sent, never an empty state, and
  the plugin's patch (`patches/capacitor-live-activities+8.0.0.patch`) ends
  with the immediate dismissal policy: the default keeps an ended activity on
  the Lock Screen for up to four hours.

## The extension in the project

`project.pbxproj` was edited by hand, as the Watch app's target was;
`iosProjectWiring.test.ts` pins what follows.

- Target `LiveActivitiesExtension`, an app extension
  (`com.apple.product-type.app-extension`), bundle ID
  `com.tropos.app.LiveActivities`, sources in `ios/App/LiveActivities/`,
  iPhone only, `SKIP_INSTALL = YES`, automatic signing like the app's.
- **Deployment target iOS 16.2**, the plugin's floor (Polish2 call 1: the app
  keeps 15.4, the widget is gated on 16.2). On an older iOS the system never
  loads it. Its two configurations sit after the project's in the file:
  `cap sync` writes CapApp-SPM's platform from the first
  `IPHONEOS_DEPLOYMENT_TARGET` it finds (`iosDeploymentTarget.test.ts`).
- **`LiveActivitiesKit`** comes from a local Swift package reference to
  `node_modules/capacitor-live-activities`, the same directory CapApp-SPM
  names, so Swift Package Manager sees one package. The plugin publishes the
  kit as a CocoaPods pod only; the patch makes it a library product of its
  Swift package. There is no Podfile and no `pod install`.
- **The app embeds it in every build**: the App target depends on it and
  copies it into `App.app/PlugIns` ("Embed Foundation Extensions"), with no
  gate. The Watch app's gate does not reach it.
- `ios/App/App/Info.plist` declares `NSSupportsLiveActivities`; without it
  every start is refused.
- **No App Group and no entitlements.** The plugin's README asks for an App
  Group, which it uses for images saved with `saveImage` and for copies of
  the data it never reads back. Tropos uses neither: the widget draws only
  the activity's own state. So the extension's App ID needs no capability,
  and the app's entitlements are unchanged.
- The extension has its own privacy manifest
  (`ios/App/LiveActivities/PrivacyInfo.xcprivacy`): it collects nothing, and
  declares the App Group defaults code in `LiveActivitiesKit` (1C8F.1), as the
  app's manifest does for the plugin.
- `cap sync ios` leaves all of this alone: it rewrites CapApp-SPM's
  `Package.swift` and copies the web bundle, and never edits the project.
  (`cap add ios`, which would rewrite every bundle ID to the app's, is never
  run again.)

## Signing and CI

- `deploy-ios.yml` lists the targets it signs from the project
  (`scripts/ios_signed_targets.py`), and requires the widget among them
  (`WIDGET_BUNDLE_ID`). Signing from the API key makes its profile
  (`Tropos CI <serial> LiveActivities`) and, the first time, registers its App
  ID: a target with no entitlements needs no capability, so
  `scripts/ios/asc-signing.mjs` may register it. The owner's own certificate
  secrets hold only the iPhone and Watch profiles, so with them the run stops
  in its first minute and says to sign from the API key.
- `scripts/verify_ios_live_activity.py` checks the archive and the exported
  IPA: the app declares Live Activities, `PlugIns` holds one WidgetKit
  extension with the widget's ID, its executable and the app's versions,
  signed with its own App Store profile. `ios-native-compile.yml` runs it
  unsigned on both simulator builds, standard and pilot.

## On a Mac

Nothing is needed beyond the usual `npm run build:ios` and opening
`ios/App/App.xcodeproj`: the target is in the project. Build the App scheme
to an iPhone on iOS 16.2 or later (the Dynamic Island needs an iPhone 14 Pro
or later), start an outdoor run or tick a working set, and lock the phone.
Settings → Tropos → Live Activities must be on.

## Known limits

- **A killed app leaves its card.** If iOS or a crash ends the app mid-run, the
  card stays until iOS ends it (up to eight hours): the plugin forgets its
  activities on relaunch, and its `endActivity` for one it recovers returns
  without ending it. A resumed run starts a second card. Worth a patch if the
  device check below shows it.
- **Updates while backgrounded** ride the background-GPS session. If the run's
  card stalls with the screen locked, the fix is push updates, not a tighter
  throttle.
- **A tap opens the app where it was**: the widget sets no deep link.

## Device-test checklist

The rows to tick are in `docs/qa/pre-launch-backlog.md`, "Live Activities on
the phone". This table is the run's detail.

| #   | Check                                                                                | Result | Notes |
| --- | ------------------------------------------------------------------------------------ | ------ | ----- |
| 1   | Start an outdoor run → the card appears on the lock screen with time, distance, pace | ⬜     |       |
| 2   | The figures keep updating with the screen locked (the background-GPS session)        | ⬜     |       |
| 3   | Pause → "Paused" and the time grey within about 2 s; resume → coral again            | ⬜     |       |
| 4   | Finish → the card goes at once (no card left after the save)                         | ⬜     |       |
| 5   | Discard → the card goes at once                                                      | ⬜     |       |
| 6   | Dynamic Island (14 Pro or later): the glyph and the time compact; expanded figures   | ⬜     |       |
| 7   | Kill the app mid-run → note how long the card stays (see Known limits)               | ⬜     |       |
| 8   | Treadmill or manual run → no Live Activity (outdoor GPS only)                        | ⬜     |       |

Legend: ⬜ not yet run · ✅ pass · ❌ fail (add a note).

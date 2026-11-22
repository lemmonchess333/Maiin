# Run Live Activity (lock screen / Dynamic Island)

**Status:** both halves built, for a run, a lift (Wid2 call 2) and the
Home Screen widgets (Wid1).

- **TypeScript:** `src/lib/runLiveActivity.ts` (the seam, tested) and the
  Run.tsx lifecycle wiring (start on active, throttled per-tick updates
  mirroring the HUD's rolling pace, end on finish/discard/unmount).
- **Native (2026-11-10):** the `LiveActivitiesExtension` target, written
  into `ios/App/App.xcodeproj` without a Mac: `ios/App/LiveActivities/`
  (the widget bundle, its Info.plist and entitlements), `LiveActivitiesKit`
  linked from the plugin's patched package, `NSSupportsLiveActivities` in
  the app, and the App Group on both. CI's simulator build compiles it,
  and `iosProjectWiring.test.ts` pins each piece. The owner registered
  `com.tropos.app.LiveActivities` and the group in Apple Developer.
- **Remaining:** the device checks below, on a TestFlight build. On iOS
  before 16.2 the extension is never loaded and `startActivity` rejects
  into a swallowed no-op, as on the web.

The steps below are what Xcode would have done; the target in the
project matches them.

The same extension also shows a lift, from its first set to its finish
(`src/lib/liftLiveActivity.ts`, Wid2 call 2), and holds the Home Screen and
Lock Screen widgets (Wid1; "The widgets" below). Both need nothing more
than the steps below; their device checks are in
`docs/qa/pre-launch-backlog.md`. Settings → Notifications → Lock Screen →
Live Activities turns every card off on the phone (Wid2 call 6,
`src/lib/liveActivitySetting.ts`).

## What ships on the lock screen

While an outdoor GPS run records, drawn the way Wid2 decided (2026-11-12,
design C: the picture leads):

- **The Lock Screen card.** The runner's drawing on the left, in one soft
  light of the run's coral in that corner of a dark card. Beside it: the
  session's name in small capitals ("EASY 30", "TEMPO RUN"; "PAUSED" while
  paused), the distance as the
  card's one large figure with its unit small beside it, and one line with
  the pace and the time ("5:12 /km · 23:41").
- **The Dynamic Island.** Compact: the run glyph and the distance.
  Minimal: the distance alone, since Apple asks for something live in the
  smallest size. The distance is 12 pt in both (Run26 call 1), so it fits
  the 28 pt Apple gives each side when the island is short of room, as
  when music shares it. Expanded: the glyph on the left of the camera, the time
  on its right, and under them the drawing with the session's name, the
  distance and "Pace 5:12 /km".
- **The name is the session's.** The one the run was started as, as the
  setup's Start button named it ("Easy 30", "Long 18 km with race pace"),
  or the run type's name once it is another type or no plan's session
  ("Tempo run", "Free run"): `runInProgressName` in `runPlanMetadata.ts`.
  It is on one line, cut short if it runs past the card.
- **The drawing changes pose.** A Live Activity plays no clip, so the card
  shows one pose of the runner and takes the next on every second update,
  about every four seconds. Paused, it holds its pose at 45%.

The drawing is four frames of Home's own flipbook for the runner
(`public/form-art/motion/run-easy.webp`), cut by `npm run art:live-activity`
into `ios/App/LiveActivities/Assets.xcassets` at 96 pt tall. The card names
a pose in its data (`src/lib/liveActivityArt.ts`) and the plugin draws the
bundled image of that name, so there is no Swift of ours. ActivityKit
refuses a card whose image is larger than the card, so the height stays
inside the card's 160 pt; `liveActivityArt.test.ts` holds the sizes, the
names and the catalog's place in the extension's bundle.

One thing in the mockup is not in this card. Its figure is the system's
bold face: the plugin draws only the system's fonts, and Archivo needs our
own views.

All values arrive pre-formatted from the app (unit-aware `distanceLabel` /
`paceLabel`, the run timer's formatter), so the lock screen and the in-app
HUD can never disagree.

Updates are data-only (the layout binds `{{placeholders}}` once at
start), throttled to one OS call per 2s and deduped — inside
ActivityKit's update budget. Elapsed is the app's own label rather than
a native self-ticking timer element, deliberately: ActivityKit's timer
keeps counting through a pause.

## What ships for a lift

One card from the first set to the finish, in the same design (Wid2, design
C), drawn by the plugin from the layout the app sends:

- **On a set.** The session's lead lift (`sessionLeadArt`, the picture
  Home's hero shows) drawn mid-rep on the left, in a soft purple light;
  "SET 2 OF 4"; the set's weight and reps as the card's one figure
  ("100 kg × 5", as the rest band names a set); the exercise under it; the
  day's name in the top corner.
- **Resting.** The lift drawn standing, "REST", the system's own countdown
  to the rest's end (it stops at 0:00 and keeps time with the app asleep),
  and "Next:" with the set that comes next.
- **Rest over.** Once the app is awake past the rest's end, the lift drawn
  set up, "REST OVER" and the next set's name. Asleep, the countdown holds
  at 0:00, since only the app can change the card.
- **The island.** Compact: the dumbbell and the set's number ("2/4"), the
  countdown in a rest, "Go" once it is over. Minimal: the same figure
  alone. Expanded: the drawing with the kicker, the figure and the line.
- **The finish** takes the card away at once (Wid2 call 4), as does
  leaving the workout.

The drawings are three poses of each of the 24 lead lifts' flipbooks
(`src/lib/liveActivityArt.ts`, cut by `npm run art:live-activity`), so a
lead lift without a flipbook shows no drawing. A layout is fixed when its
card starts, and a rest's countdown is part of it, so the card is started
again at each change between a set and a rest; a set after a set, and a
rest's end, change its data alone. Each start happens with the app open,
as ActivityKit requires.

## The widgets

Wid1's three widgets, drawn as Wid2 call 5 decided, are SwiftUI views of
ours in the same extension: `TodayWidget.swift`, `StreakWidget.swift` and
`FoodWidget.swift`, over `WidgetChrome.swift`. They read the snapshot the
app writes to the App Group (`HomeWidgetsPlugin.swift` in the app,
`HomeWidgetStore.swift` in both targets), which Home writes whole and Food
and today's water log write in part (`src/lib/homeWidgetSnapshot.ts`,
`src/hooks/useHomeWidgetSections.ts`). The food widget's "+ Glass" is an
iOS 17 App Intent (`LogDrinkIntent.swift`) that queues the drink in the App
Group; the app saves it once on its next open (`src/lib/widgetDrinks.ts`).
A widget's tap opens the app at `https://troposfit.com/<path>?from=widget`,
which iOS hands to the app (`src/lib/widgetLinks.ts` lets through only the
paths a widget writes). The Today widget draws the same pose images as the
Live Activities. The extension's deployment target stays 16.2: the App
Intent and iOS 17's widget background sit behind availability checks.

## Operator steps (Mac + Xcode, once)

Follow the plugin's setup (docs:
https://github.com/ludufre/capacitor-live-activities), but not its Podfile
step: this project has no CocoaPods. Capacitor 8 brings every plugin in
through the local Swift package `ios/App/CapApp-SPM`, and the widget
extension links the plugin's `LiveActivitiesKit` the same way. The plugin
publishes `LiveActivitiesKit` only as a CocoaPods pod, so
`patches/capacitor-live-activities+8.0.0.patch` also makes it a library
product of the plugin's own Swift package; `npm install` applies it.
The same patch makes the plugin's `endActivity` read
`behavior.dismissalPolicy`: it always used iOS's default, which leaves an
ended card on the Lock Screen for up to four hours. And it keeps the
`countdown` timer from trapping when a card is drawn after its end. The
app ends every card with `"immediate"` (`src/lib/liveActivities.ts`), and
before a launch's first card it ends any card an earlier launch left.

1. `npm run build:ios` (builds the web bundle and runs `cap sync ios`,
   which resolves the plugin through `CapApp-SPM`).
2. Open `ios/App/App.xcodeproj` (there is no `.xcworkspace`). File → New →
   Target → **Widget Extension**. Product name **`LiveActivities`**
   (exactly). **Uncheck** "Include Live Activity", "Include Control",
   "Include Configuration App Intent". Don't activate the scheme when
   prompted.
3. Right-click the new `LiveActivities` folder → **Convert to Group**.
4. Link `LiveActivitiesKit` to the extension through Swift Package Manager:
   File → Add Package Dependencies… → **Add Local…** → choose
   `node_modules/capacitor-live-activities` at the repository root, and add
   its **LiveActivitiesKit** product to the `LiveActivitiesExtension` target
   only (not to `App`, which already has it through `CapApp-SPM`). If the
   product list does not offer `LiveActivitiesKit`, run `npm install` so the
   patch is applied, then File → Packages → Reset Package Caches.
5. In the extension target's build settings, set **Targeted Device Family**
   to iPhone (`TARGETED_DEVICE_FAMILY = 1`; the template's `1,2` fails
   `iosProjectWiring.test.ts`) and check **Skip Install** is Yes (the
   template sets it; an archive refuses an extension installed beside the
   app).
6. `ios/App/App/Info.plist` — add:

   ```xml
   <key>NSSupportsLiveActivities</key>
   <true/>
   ```

7. Replace `ios/App/LiveActivities/LiveActivitiesBundle.swift` with:

   ```swift
   import WidgetKit
   import SwiftUI
   import LiveActivitiesKit

   @main
   struct LiveActivitiesBundle: WidgetBundle {
       var body: some Widget {
           LiveActivities()
           DynamicActivityWidget()
       }
   }
   ```

8. **App Groups** capability on BOTH the app target and the extension
   target: `group.com.tropos.app`, the group both App IDs hold on Apple's
   site. The plugin names its own group, `group.<bundle id>.liveactivities`,
   but only for its `appGroup` images, which no Tropos layout uses
   (`iosProjectWiring.test.ts` keeps it that way). A layout that needs an
   app-group image first needs that group registered and assigned on
   Apple's site, and both entitlements files changed to it.
9. Build to a device (Live Activities need iOS 16.2+; Dynamic Island needs
   iPhone 14 Pro+). There is no `pod install` step.

### TestFlight signing for the extension

`deploy-ios.yml` reads the targets it signs from the project
(`scripts/ios_signed_targets.py`), so the new extension is signed, checked
and exported with no change to the workflow. Apple's side needs, once:

- Apple Developer → Identifiers: register the extension's bundle ID (Xcode
  names it `com.tropos.app.LiveActivities`) with **App Groups** on and the
  group above assigned, and assign the same group to `com.tropos.app`.
- Signing from the API key (the default) makes the extension's profile on
  every run. With your own certificate secrets, which hold the iPhone and
  Watch profiles only, the run stops naming the extension: delete those
  secrets and let the run sign from the API key.

## Device-test checklist (fill in on the Mac/Xcode session)

| #   | Check                                                                                | Result | Notes |
| --- | ------------------------------------------------------------------------------------ | ------ | ----- |
| 1   | Start outdoor run → card appears on lock screen with the runner, distance, pace/time | ⬜     |       |
| 2   | Stats keep updating with screen locked (rides the background-GPS foreground service) | ⬜     |       |
| 3   | Pause run → the name reads "PAUSED" and the runner dims; resume brings the name back | ⬜     |       |
| 4   | Finish run → card dismisses (no stale card after save)                               | ⬜     |       |
| 5   | Discard run → card dismisses                                                         | ⬜     |       |
| 6   | Dynamic Island (14 Pro+): compact distance; expanded the runner, distance and pace   | ⬜     |       |
| 7   | Kill the app mid-run, reopen, resume → one card; the one left from before is gone    | ⬜     |       |
| 8   | Treadmill/manual run → NO Live Activity (outdoor-GPS-only gate)                      | ⬜     |       |
| 9   | The runner is drawn, not a grey photo icon, and changes pose about every 4 s         | ⬜     |       |
| 10  | The card is dark to its corners, with a coral light behind the runner                | ⬜     |       |
| 11  | Music playing (14 Pro+): the run's side of the island shows the distance, not "1…"   | ⬜     |       |

Legend: ⬜ not yet run · ✅ pass · ❌ fail (add a note).

## Notes

- The dark card is a deliberate single-look commitment (the run overlay
  is always-dark); lock-screen widgets render on wallpaper, not app
  theme.
- Update cadence: ActivityKit budgets updates aggressively. If stats
  visibly stall on device with the screen locked, the fix is
  server/push-channel updates — out of scope for v1; note it here
  rather than tightening the local throttle.

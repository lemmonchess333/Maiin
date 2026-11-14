# Run Live Activity (lock screen / Dynamic Island)

**Status:** both halves built.

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

The same extension also shows a lift's rest (`src/lib/restLiveActivity.ts`):
a dark card with a purple dumbbell, "Rest", the system's own countdown to
the rest's end, which stops at 0:00, and "Next:" with the exercise, and in
the Dynamic Island the
dumbbell and the countdown. It needs nothing more than the steps below; its
device check is in `docs/qa/pre-launch-backlog.md`.

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
  smallest size. Expanded: the glyph on the left of the camera, the time
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
   target: `group.com.tropos.app.liveactivities`. Xcode writes the
   extension's entitlements file and adds the group to
   `App/App.entitlements`.
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

Legend: ⬜ not yet run · ✅ pass · ❌ fail (add a note).

## Notes

- The dark card is a deliberate single-look commitment (the run overlay
  is always-dark); lock-screen widgets render on wallpaper, not app
  theme.
- Update cadence: ActivityKit budgets updates aggressively. If stats
  visibly stall on device with the screen locked, the fix is
  server/push-channel updates — out of scope for v1; note it here
  rather than tightening the local throttle.

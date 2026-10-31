# Run Live Activity (lock screen / Dynamic Island)

**Status:** TypeScript half ✅ shipped — `src/lib/runLiveActivity.ts` (the
seam, tested) + Run.tsx lifecycle wiring (start on active, throttled
per-tick updates mirroring the HUD's rolling pace, end on
finish/discard/unmount). The plugin (`capacitor-live-activities`) is
installed. **Remaining is operator-bound**: the widget-extension half
below needs a Mac + Xcode; until it exists the seam's `startActivity`
rejects and every call is a swallowed no-op — web and un-provisioned
native builds are unaffected.

The same extension also shows a lift's rest (`src/lib/restLiveActivity.ts`):
a dark card with a purple dumbbell, "Rest", the system's own countdown to
the rest's end and "Next:" with the exercise, and in the Dynamic Island the
dumbbell and the countdown. It needs nothing more than the steps below; its
device check is in `docs/qa/pre-launch-backlog.md`.

## What ships on the lock screen

While an outdoor GPS run records: a dark card (surface `#1A1A1F`) with a
coral running glyph + state line ("Recording" / "Paused") and three
stat columns — DISTANCE / PACE / TIME. Dynamic Island: compact = run
glyph + distance; expanded = distance / pace / time + state line;
minimal = run glyph. All values arrive pre-formatted from the app
(unit-aware `distanceLabel` / `paceLabel`, the run timer's formatter),
so the lock screen and the in-app HUD can never disagree.

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
| 1   | Start outdoor run → card appears on lock screen with live distance/pace/time         | ⬜     |       |
| 2   | Stats keep updating with screen locked (rides the background-GPS foreground service) | ⬜     |       |
| 3   | Pause run → card state line flips to "Paused"; resume flips back                     | ⬜     |       |
| 4   | Finish run → card dismisses (no stale card after save)                               | ⬜     |       |
| 5   | Discard run → card dismisses                                                         | ⬜     |       |
| 6   | Dynamic Island (14 Pro+): compact distance, expanded three stats                     | ⬜     |       |
| 7   | Kill the app mid-run → card does not zombie (OS reaps within its window)             | ⬜     |       |
| 8   | Treadmill/manual run → NO Live Activity (outdoor-GPS-only gate)                      | ⬜     |       |

Legend: ⬜ not yet run · ✅ pass · ❌ fail (add a note).

## Notes

- The dark card is a deliberate single-look commitment (the run overlay
  is always-dark); lock-screen widgets render on wallpaper, not app
  theme.
- Update cadence: ActivityKit budgets updates aggressively. If stats
  visibly stall on device with the screen locked, the fix is
  server/push-channel updates — out of scope for v1; note it here
  rather than tightening the local throttle.

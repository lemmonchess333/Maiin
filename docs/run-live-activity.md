# Run Live Activity (lock screen / Dynamic Island)

**Status:** TypeScript half ✅ shipped — `src/lib/runLiveActivity.ts` (the
seam, tested) + Run.tsx lifecycle wiring (start on active, throttled
per-tick updates mirroring the HUD's rolling pace, end on
finish/discard/unmount). The plugin (`capacitor-live-activities`) is
installed. **Remaining is operator-bound**: the widget-extension half
below needs a Mac + Xcode; until it exists the seam's `startActivity`
rejects and every call is a swallowed no-op — web and un-provisioned
native builds are unaffected.

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
https://github.com/ludufre/capacitor-live-activities — steps mirrored
here against this repo's paths):

1. `npx cap sync ios` (installs the plugin pod).
2. Xcode → File → New → Target → **Widget Extension**. Product name
   **`LiveActivities`** (exactly). **Uncheck** "Include Live Activity",
   "Include Control", "Include Configuration App Intent". Don't
   activate the scheme when prompted.
3. Right-click the new `LiveActivities` folder → **Convert to Group**.
4. `ios/App/Podfile` — add (target name must match the extension target
   Xcode created):

   ```ruby
   target 'LiveActivitiesExtension' do
     pod 'LiveActivitiesKit', :path => '../../node_modules/capacitor-live-activities'
   end
   ```

5. `ios/App/App/Info.plist` — add:

   ```xml
   <key>NSSupportsLiveActivities</key>
   <true/>
   ```

6. Replace `ios/App/LiveActivities/LiveActivitiesBundle.swift` with:

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

7. **App Groups** capability on BOTH the app target and the extension
   target: `group.com.tropos.app.liveactivities`.
8. `pod install` in `ios/App`, build to a device (Live Activities need
   iOS 16.2+; Dynamic Island needs iPhone 14 Pro+).

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

# Plan: background GPS for run tracking (native iOS/Android)

**Status:** Step 1 (seam) ✅ shipped. Step 2 (native source) ✅ shipped for
**iOS** — the TypeScript half landed first (retention-audit RUN-01:
`src/lib/nativeLocationSource.ts` behind the seam, `getLocationSource()`
returning it on native, Run.tsx's visibility policy + `useWakeLock`
platform-gated), and the native config + "While Using only" UX completed it:
`Info.plist` carries the background-location keys, and the Section 7
grant note ships (`nativeLocationSettings.ts` + `RunBackgroundGrantNote`).
**Android** config (manifest permissions + foreground-service notification)
is the remaining follow-up (see below). On-device verification is still
outstanding — it needs a Mac + Xcode build (`npx cap sync ios`, then the
checklist + results table at the bottom).
**Priority:** high — until the device build ships, the run tracker only works
with the screen awake and the app foregrounded.

## Problem

The run tracker uses the browser Web API (`navigator.geolocation.watchPosition`
in `src/hooks/useGPS.ts`). On iOS, a WKWebView (Safari, PWA, _and_ the Capacitor
shell) **stops delivering location** the moment the screen locks or the app
backgrounds — i.e. phone in a pocket, which is every real run. `useWakeLock`
keeps the screen on while the app is foregrounded, but that drains battery and
does nothing once the app is backgrounded or the user switches apps.

Net: a real run loses tracking as soon as the screen sleeps. Fine for testing
with the screen on; not viable for an actual run.

## Goal

Continuous tracking with the phone pocketed / screen off, on the native
iOS + Android shells. Web stays as-is (best-effort, screen-on).

## Approach

Use `@capacitor-community/background-geolocation` (native plugin; runs a
foreground service that keeps location flowing in the background).

Keep all the existing point logic — `isValidReading`, the Kalman filter, the
first-fix grace + re-anchor (added in #938), distance/pace/splits. **Only the
_source_ of raw fixes changes**, per platform.

### Step 1 — abstract the geolocation source in `useGPS` (no web behaviour change) ✅ DONE

Shipped: `src/lib/locationSource.ts` (`LocationSource` interface + `webLocationSource`
pass-through + `getLocationSource()` with the native branch point stubbed to web).
`useGPS` now watches/pre-warms/clears through the source instead of calling
`navigator.geolocation` directly. Web behaviour is unchanged (1:1 pass-through,
unit-tested); Step 2 is now a one-line flip in `getLocationSource()` plus the
native source module.

Today `start()` calls `navigator.geolocation.watchPosition` directly. Introduce
a small internal "location source":

- **web** (`!Capacitor.isNativePlatform()`): the current `navigator.geolocation`
  path, unchanged.
- **native**: the background-geolocation watcher.
  Both feed the _same_ callback that runs `isValidReading` → Kalman → `pointsRef`.
  This PR is web-safe and verifiable in the existing harness (no native behaviour
  yet).

### Step 2 — add the plugin + native config + wire the native path ✅ (iOS)

Shipped:

- `@capacitor-community/background-geolocation` installed. The plugin ships
  **only** TS defs + native code (no JS entry): the bridge is registered by
  the consumer via `registerPlugin("BackgroundGeolocation")` from
  `@capacitor/core` — do NOT `import()` the package.
- `src/lib/nativeLocationSource.ts` implements the `LocationSource` seam over
  the plugin, translating plugin `Location` → the real `GeolocationPosition`
  shape and `NOT_AUTHORIZED` → `PERMISSION_DENIED (1)`. The run watcher opts
  into background delivery (`backgroundMessage`); the pre-warm one-shot does
  not. `getLocationSource()` returns it on `isNativePlatform()`.
- **iOS** (`ios/App/App/Info.plist`): added
  `NSLocationAlwaysAndWhenInUseUsageDescription` and `UIBackgroundModes →
location` (kept the existing `NSLocationWhenInUseUsageDescription`).
- **Wake lock is web-only** now (`src/hooks/useWakeLock.ts` early-returns on
  native) — the plugin's OS service owns background tracking and the screen
  should sleep.
- **Run page no longer stops GPS when backgrounded on native**
  (`Run.tsx` `handleHidden`/`handleVisible` gated behind `isNativePlatform()`).
  This was essential: the pre-existing web battery-saver called `gps.stop()`
  on hide, which would have torn down the background watcher the instant the
  app backgrounded. The false "GPS data may have gaps" banner + route-quality
  penalty are also web-only now (native tracks continuously).
- **"While Using only" UX** (Section 7): `src/lib/nativeLocationSettings.ts`
  (`shouldWarnBackgroundPause` + `openLocationSettings`) + the non-blocking
  `RunBackgroundGrantNote`. The plugin exposes no API to read the iOS
  authorization tier, so we infer a While-Using pause from the symptom (no
  fresh fix during a real hidden window) on foreground return and point the
  user at Settings → Always. The run is never blocked; tracking degrades to
  foreground exactly as web does.

**Remaining follow-up — Android** (needs Android Studio, out of scope here):

- `AndroidManifest.xml`: `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION`.
- The plugin runs a foreground service with a persistent notification —
  configure its text/icon. `backgroundTitle`/`backgroundMessage` are already
  set by `nativeLocationSource.watch`.
- `npx cap sync android` and repeat the device checklist on Android.

Run `npx cap sync ios` on the Mac before building (installs the plugin's
native pod into the Xcode project).

## Permission UX (ties into the existing acquiring screen)

- Reuse the plain copy added alongside this plan: denied → "Location is turned
  off for Tropos…". For native, also handle the "While Using only" case:
  tracking works while foregrounded but warn it'll pause when the screen locks,
  and point to Settings → Always.

## Battery

The plugin's foreground service is the right tool (OS-managed, efficient).
Keep `useWakeLock` only on the **web** path. Document expected drain on a long
run; consider a lower-power "balanced" accuracy mode for >90 min runs.

## Testing (device-only — NOT verifiable in web/CI)

- Start a run, lock the screen, walk; confirm points keep recording.
- Background the app (switch apps) mid-run; confirm tracking continues.
- Airplane mode → back; confirm graceful recovery (no crash, route resumes).
- Permission "While Using" vs "Always"; permission denied.

## Gotchas

- Requires a native build (Mac + Xcode / Android Studio); can't be verified
  from the web sandbox or CI emulator harness.
- Don't regress the web path — Step 1's abstraction must keep
  `navigator.geolocation` behaviour identical on web (the existing run
  Playwright harness covers this).
- iOS background location review: App Store requires the usage strings to
  clearly justify "Always" location.

## Device-test results (fill in on the Mac/Xcode session)

Web/CI cannot exercise the native path — these are the on-device checks that
conclusively prove Step 2. Record outcomes here.

| #   | Check                                                                                                  | Result | Notes |
| --- | ------------------------------------------------------------------------------------------------------ | ------ | ----- |
| 1   | Outdoor run, lock screen, walk 400m+ → points keep recording; distance/pace correct on unlock          | ⬜     |       |
| 2   | Background the app mid-run (switch apps) → tracking continues                                          | ⬜     |       |
| 3   | Deny background (While Using only) → run tracks foregrounded, Section 7 note appears, no crash on lock | ⬜     |       |
| 4   | End run → watcher removed (no lingering location arrow in status bar after save)                       | ⬜     |       |
| 5   | Pre-warm on the run-setup screen still resolves a first fix quickly                                    | ⬜     |       |
| 6   | Battery % drain over a 30-min tracked run                                                              | ⬜     |       |

Legend: ⬜ not yet run · ✅ pass · ❌ fail (add a note).

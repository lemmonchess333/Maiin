# Plan: background GPS for run tracking (native iOS/Android)

**Status:** not started — needs a Mac + Xcode device build to implement/verify.
**Priority:** high — without this, the run tracker only works with the screen
awake and the app foregrounded.

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

### Step 2 — add the plugin + native config + wire the native path

- `npm i @capacitor-community/background-geolocation`, `npx cap sync`.
- **iOS** (`ios/App/App/Info.plist`):
  - `NSLocationWhenInUseUsageDescription` + `NSLocationAlwaysAndWhenInUseUsageDescription`
    (user-facing copy: why we need background location for run tracking).
  - `UIBackgroundModes` → include `location`.
- **Android** (`AndroidManifest.xml`): `ACCESS_FINE_LOCATION` +
  `ACCESS_BACKGROUND_LOCATION`; the plugin runs a foreground service with a
  persistent notification (configure its text/icon).
- Request permission at run start; handle "While Using" (no background grant)
  by falling back to the web-style foreground path + a clear note.

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

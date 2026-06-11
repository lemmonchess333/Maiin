# Heart rate & HealthKit — groundwork and the native path

Heart rate is the #1 running table-stakes gap in the competitive analysis
(`docs/competitive-analysis-running-2026.md`): Strava, NRC, Garmin and Coros all
show live HR + zones during a run and a zone distribution after it. This doc
records what shipped as **web-visible groundwork** and what the native step is.

## What's shipped (web-visible, lock-safe)

- **`src/lib/hrZones.ts`** — the pure zone maths (no React/DOM/Firebase,
  mirror-ready). Five-zone %HRmax model (Z1 Recovery 50–60 … Z5 Max 90–100),
  age-predicted max via **Tanaka** (`208 − 0.7·age`, better-validated than
  `220 − age`), single-reading bucketing, and a post-run zone distribution that
  excludes below-Z1 samples from the denominator. Unit-tested.
- **`profile.maxHeartRate`** — the single INPUT (a measured max always beats the
  age estimate). Persisted through the full guarded chain: `auth.tsx`
  interface + hydrate → `firestore.rules` `allowedUserFields()` →
  `functions/profileSanitizer.js` (range 100–240, `null` clears) → `updateProfile`.
- **`src/hooks/useHeartRate.ts`** — resolves the effective max HR
  (measured → age estimate → unknown), exposes the zones, and (when a live
  source exists) the current bpm + zone. `live` defaults to `false` so the
  static preview costs nothing.
- **`src/components/settings/HeartRateZonesSection.tsx`** — Settings preview of
  the five bands + max-HR capture / "use estimate". This is the web-visible
  surface; it works today without any native plugin.
- **`src/lib/heartRateSource.ts`** — the **native-injection seam** (mirrors
  `locationSource.ts`). The web source is a deliberate NO-OP that reports
  `available === false` and never emits — browsers have no usable HR API inside
  the iOS WKWebView. Consumers fall back to the static preview instead of
  erroring.

## The native step (needs a Mac/Xcode build)

Live HR is genuinely native-only. The plan:

1. **Capacitor plugin for HealthKit live HR.** Either a community plugin or a
   thin custom one that starts an `HKWorkoutSession` and an
   `HKAnchoredObjectQuery` on the `heartRate` quantity type, forwarding samples
   to JS. Request `HKObjectType.quantityType(.heartRate)` read auth at run start.
2. **Implement `nativeHeartRateSource`** in `heartRateSource.ts` against that
   plugin (`available: true`, `subscribe` → plugin listener, `stop()` →
   end the query + workout session).
3. **Flip the branch** in `getHeartRateSource()` to return it when
   `isNativePlatform()`. That's a one-line change — the seam is the whole point.
4. **Wire `Info.plist`** with `NSHealthShareUsageDescription` (and
   `NSHealthUpdateUsageDescription` if we later write workouts back) and enable
   the HealthKit capability in the Xcode project, then `cap sync ios`.

Consumers (run HUD, post-run breakdown) read through `useHeartRate({ live: true })`
and `hrZones.ts` — they need no change when the native source lands; they simply
start receiving non-null `bpm`/`zone`.

## Why no Web Bluetooth fallback

Web Bluetooth GATT (the Heart Rate Service, `0x180D`) is unsupported in iOS
WKWebView and off-by-default elsewhere, and the real users are on the native
app. Wiring a flaky web path would be effort spent off the target platform; the
honest answer is "live HR streams in the app", with the static zone preview
available everywhere. See the parity rules in `CLAUDE.md`.

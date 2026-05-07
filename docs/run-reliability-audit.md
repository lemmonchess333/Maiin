# Run Reliability Sprint — Phase A audit + P0 plan

## Context

The run section of Tropos has correctness gaps that produce confusing states on the live build: a 0.00km / 14s "run" landing on a full summary screen with Save / Share / Export GPX / Discard all visible; outdoor runs starting before GPS is ready; failed-save toasts hidden behind Safari/PWA bottom chrome. Before we add new running features (HealthKit, Watch, segments, etc.) we need a reliability pass.

Phase A is **audit only** — no edits. This document records what the code does today, identifies the bugs, and proposes a minimal P0 implementation plan that the user can approve before we cut a branch.

## 1. Files inspected

- `src/pages/Run.tsx` — run lifecycle host
- `src/pages/RunSummary.tsx` — post-run summary surface
- `src/components/run/TreadmillMode.tsx` — manual-distance input
- `src/components/run/RunSetupModal.tsx` — pre-run config (distance/time targets)
- `src/components/run/RunBottomSheet.tsx` — active-run controls
- `src/hooks/useGPS.ts` — geolocation watcher + Kalman + accuracy filtering
- `src/hooks/useRunTimer.ts` — elapsed-time state
- `src/lib/gps.ts` — Haversine, splits, pace, validity rules
- `src/lib/firebase.ts` — Firestore persistence wiring
- `src/lib/offlineQueue.ts` — confirmed NOT used for runs
- `src/components/Layout.tsx` + `index.html` + `src/index.css` — safe-area + viewport-fit handling
- `src/components/ToastProvider.tsx` — sonner Toaster mount + offset
- `capacitor.config.ts` + `vite.config.ts` + `.github/workflows/deploy.yml` — build / deploy targets

## 2. Current state model

`Run.tsx` is **imperative**, not a centralised FSM:

- A 5-phase lifecycle in one piece of state: `phase: 'waiting' | 'acquiring' | 'countdown' | 'active' | 'paused' | 'finished'` (`Run.tsx:22, 65`)
- 8+ separate `useState` hooks for ancillary state: `runConfig`, `treadmillDistance`, `locked`, `countdown`, `autoPaused`, `acquiringSeconds`, `bgGapBanner` (`Run.tsx:65-73`)
- 3 custom hooks: `useGPS(timer.elapsed)`, `useRunTimer()`, `useWakeLock()` (`Run.tsx:61-62`)
- 10+ `useEffect` blocks driving phase transitions (`Run.tsx:138-222`)
- Treadmill is a derived condition: `runConfig?.activityType === 'treadmill'` (`Run.tsx:281, 399, 410`)

`RunSummary.tsx`:
- Receives a state payload from `navigate('/run-summary', { state: { points, distance, elapsed, splits, elevationGain, runConfig } })` (`Run.tsx:229`)
- Tracks one local `saved: boolean` and a `showDiscardConfirm: boolean` (`RunSummary.tsx:47, 459`)
- **No `saving` state distinct from `saved`** — the Save button toggles immediately to "Saved" on success

## 3. Current GPS flow

- Permission queried passively via `navigator.permissions.query({ name: 'geolocation' })` on mount (`useGPS.ts:47-54`)
- Tracking starts via `navigator.geolocation.watchPosition` in `gps.start()` (`useGPS.ts:74-139`)
- Signal quality derived from accuracy alone: `≤8m strong / ≤15m good / ≤30m fair / >30m weak / null searching` (`useGPS.ts:18-24`) — there is **no "ready" gate** that consumers must wait for
- Each fix runs through `isValidReading()` (`gps.ts:63-79`):
  - First fix accepted at ≤150m accuracy
  - Subsequent fixes ≤50m (first 15s) or ≤35m thereafter
  - Reject if implied speed > 12 m/s or distance < 1m
  - **Rejected fixes are silently dropped** — no consumer-facing signal that GPS dropped
- Valid fixes feed Kalman filter (`gps.ts:13-41`) then accumulate `distanceRef.current` via Haversine (`useGPS.ts:118-120`)
- `gps.start()` re-fired on resume (`Run.tsx:251`); `gps.stop()` clears the watch on pause/finish (`useGPS.ts:141-147`)
- **A 15-second "Start without GPS" escape hatch exists** (`Run.tsx:375-382`) — appears in the acquiring phase and lets the user begin a run with zero GPS data

## 4. Current timer / pace flow

- 1-second `setInterval`, `Date.now()` deltas, paused time excluded cleanly (`useRunTimer.ts:11-31`)
- Distance = sum of Haversine deltas between valid fixes (`useGPS.ts:118-120`)
- Pace = all-time average: `(elapsed_sec / distance_m) * 1000` (`gps.ts:81-87`)
- Pace short-circuits to `'--:--'` if distance < 10m (good guard at the formatter)
- **No rolling-window pace today**, but `pointsRef` already stores all points with timestamps — adding a 30s rolling pace is a small derived computation, not a data-model change

## 5. Current save flow

- Save fires from `RunSummary.tsx:417-426` → `handleSave()` (`RunSummary.tsx:83`)
- Direct write: `addDoc(collection(db, 'users', user.uid, 'runs'), runData)` (`RunSummary.tsx:117`)
- **`offlineQueue.ts` is NOT wired in for runs** — Firestore's built-in IndexedDB persistence handles offline writes
- Single `saved: boolean` only; no separate `saving`. Cannot represent a "saving in progress, retrying after failure" state
- On success: `setSaved(true)` + `navigate('/')` after 800ms (online) or 1800ms (offline) (`RunSummary.tsx:194-196`)
- On failure: `toast.error("Failed to save run. Please try again.")` (`RunSummary.tsx:199`) — **no retry button, no inline error banner**
- Save state is local to `RunSummary.tsx` (resets on remount) — does not persist across runs

## 6. Current treadmill flow

- `TreadmillMode.tsx` has **zero GPS logic** ✓
- Manual distance input: `<input type="number" step={0.01} min={0} />` (`TreadmillMode.tsx:23-34`)
- Save button disabled if `!distance || Number(distance) <= 0` (`TreadmillMode.tsx:40`) — but `0.005km` would be accepted and treated as a valid run
- On save: `onSave(Number(distance) * 1000)` → `Run.tsx:404` calls `setTreadmillDistance(distance); finishRun(distance)` → routes to the same `/run-summary`
- **No treadmill-specific summary view** — the same Save / Share / Export GPX / Discard buttons render

## 7. Current invalid-run handling

- `Run.tsx:223 finishRun(distanceOverride?)` is the single transition to summary. **It has no minimum-duration or minimum-distance gate.** Any `onStop()` reaches summary regardless of state.
- The only invalid-run guard in the codebase: `RunSummary.tsx:253` shows a "Run too short" warning if `(distance || 0) === 0 && (elapsed || 0) < 30 && !saved`.
  - Both conditions must be true. A 31-second 0km run **bypasses entirely** and lands on a fully-functional summary.
  - Even when the warning shows, Save / Share / Export GPX / Discard all still render unconditionally below it (`RunSummary.tsx:407-440`).
- `grep "invalid"` across `src/` returns zero matches in the run flow — the concept doesn't exist as a first-class type.

## 8. Main reliability bugs found

Ranked by severity:

1. **0km / non-trivial-time runs land on a full summary with all four actions.** Root cause: no gate in `finishRun` (`Run.tsx:223`) and `RunSummary.tsx:253` only warns when *both* distance=0 AND elapsed<30. Fix surface: introduce an `isInvalidRun` derivation and gate Share / Export GPX / full-summary rendering behind it.

2. **"Start without GPS" enables outdoor runs with no fixes.** `Run.tsx:375-382` lets the user begin after 15s of acquiring even if zero fixes have arrived. Combined with bug #1, this is the canonical 0.00km production path. Fix surface: redirect this CTA to a treadmill / manual-distance flow rather than starting an outdoor run that can never accumulate distance.

3. **Save failure has no retry path.** Toast-only error (`RunSummary.tsx:199`). On Safari PWA the toast can be hidden behind the bottom chrome (`ToastProvider.tsx:43` uses `calc(env(safe-area-inset-bottom, 0px) + 80px)` which can race-fail on first paint). Fix surface: distinct `saving` state + inline error banner + visible Retry button.

4. **TreadmillMode accepts 0.005km.** `step={0.01}, min={0}` (`TreadmillMode.tsx:26`). The disabled-button check only rejects `<= 0`. Fix surface: bump to `min={0.05}` (50m floor), update validation accordingly.

5. **GPS-loss mid-run is silent.** `isValidReading()` drops fixes silently (`gps.ts:63-79`); no consumer-facing "GPS dropped — recovering" state. Fix surface: add a `gpsLostSeconds` derivation in `useGPS` (time since last accepted fix) and surface a banner after some grace period.

6. **`RunSummary.tsx` uses hardcoded `pb-24`** (`RunSummary.tsx:233`) instead of the existing `--page-bottom-pad` variable that already accounts for safe-area inset. Fix surface: one-line CSS swap.

7. **Distance target is informational only.** `RunSetupModal.tsx:222-225` enforces `min="0.5"` at the input level (so the user's "0.005km" observation is likely a misread of `0.05` or `0.50`), but no downstream code blocks finishing a run that's nowhere near the target. Fix surface: low priority — informational targets are fine; only fix if we want hard enforcement.

8. **Pace can render junk for very short distances.** `gps.ts:81-87` returns `'--:--'` only when distance < 10m; between 10m and the first split, the formatter still produces values. Fix surface: not a P0 bug; cosmetic.

## 9. Verdict on the separate-concerns + derived-guards model

**Verdict: it fits. Adopt the derived-guards layer in P0; defer the full state-consolidation refactor.**

What works without restructuring:
- The proposed guards (`isOutdoorGpsRun`, `requiresGpsPreflight`, `canStartCleanly`, `requiresManualDistance`, `isInvalidRun`, `canShowFullSummary`, `canShowShare`, `canExportGpx`, `canShowRetrySave`) can all be derived from the **existing** state (`runConfig.activityType`, `phase`, `gps.points.length`, `gps.signalQuality`, `distance`, `elapsed`, `saved`, `saveError`).
- They slot in as `const` declarations at the top of `Run.tsx` and `RunSummary.tsx` render bodies. No reducer, no context, no new hook required for v1.
- Each conditional render that currently inlines a comparison (`activityType === 'treadmill'` etc.) becomes `{canShowShare && <ShareButton />}`. Pure substitution.

What would require restructuring (and we should NOT do in P0):
- Collapsing the 8 useState hooks into a `useReducer` — moderate-to-high blast radius, no reducer pattern elsewhere in the run flow today
- Moving GPS / save state into context — the current local-state model works fine for one Run page mount
- Adding a formal FSM — overkill for the 5 phases we have

**P0 = derived guards + a few concrete bug fixes. P1 (separate task) = consider state consolidation if the guard layer surfaces friction.**

## 10. Recommended P0 implementation plan

Cut a fresh branch `claude/run-reliability-p0` off `main`. Five focused commits.

### P0-1: Derived guards module + `isInvalidRun` gate

**Create:** `src/pages/run/guards.ts` (or co-locate in `Run.tsx` if the file size stays manageable). Pure functions:

```ts
isOutdoorGpsRun(activityType): boolean        // not treadmill, not guided-indoor
requiresManualDistance(activityType): boolean // treadmill
isInvalidRun({ distance, elapsed, isOutdoorGpsRun }):
  // outdoor:    distance < 100m OR elapsed < 30s
  // treadmill:  distance < 50m   (manual entry, trust user up to a floor)
canShowFullSummary({ isInvalid, saved }): boolean
canShowShare({ isInvalid }): boolean          // false for invalid
canExportGpx({ isInvalid, isOutdoorGpsRun }): boolean
canShowRetrySave({ saveError, saved }): boolean
```

**Modify:** `Run.tsx:223 finishRun()` — branch on `isInvalidRun(...)`:
- Invalid → open a focused "Run too short" sheet (new component) with two buttons: **Discard** (default) and **Save anyway**. No Share / Export GPX rendered.
- Valid → existing `navigate('/run-summary', ...)` path unchanged.

**Modify:** `RunSummary.tsx:407-440` — gate `Share`, `Export GPX` behind `canShowShare`, `canExportGpx`. Keep Save + Discard always visible.

### P0-2: Replace "Start without GPS" with "Switch to treadmill"

**Modify:** `Run.tsx:375-382` — when the acquiring phase exceeds 15s without a fix, replace the existing "Start without GPS" CTA with **"Switch to treadmill"**. Tap → updates `runConfig.activityType` to `'treadmill'`, transitions phase back to `'waiting'`, mounts `TreadmillMode`. Closes the loophole that produced 0km outdoor runs.

If the user explicitly wants an indoor freeform option without GPS, that's a separate "Indoor freeform" activityType — not in P0.

### P0-3: Save flow — `saving` state + retry path

**Modify:** `RunSummary.tsx:47, 83-201`:
- Split `saved: boolean` into `{ status: 'idle' | 'saving' | 'saved' | 'error', error?: string }`.
- On success → status='saved', navigate after delay (existing).
- On failure → status='error', render an inline banner above the action row (NOT a toast). Banner has a Retry button and the error message.
- Keep the toast as a complement (background-mode users will still see it), but the banner is the durable affordance.

### P0-4: TreadmillMode minimum distance

**Modify:** `TreadmillMode.tsx:23-41` — set `min={0.05}` on the input, update the disabled check to `Number(distance) < 0.05`. 50m floor matches the outdoor invalid-run threshold halved (manual entry, less paranoid).

### P0-5: Safe-area + cosmetic cleanups

**Modify:** `RunSummary.tsx:233` — replace `pb-24` with `style={{ paddingBottom: 'var(--page-bottom-pad)' }}` to track safe-area-inset-bottom dynamically. Aligns with the rest of the app's bottom-padded pages.

Optional in this commit: add `gpsLostSeconds` derivation in `useGPS` and a low-priority "GPS recovering…" banner if it exceeds 8s. **Defer if it grows the diff.**

### Out of scope for P0 (note in plan, do not build)

- Full state consolidation / reducer refactor
- Rolling-window pace (data exists; UI surface is a P1 polish)
- GPS quality scoring beyond accuracy bands
- Run-too-short sheet **animation** beyond a basic vaul Drawer
- Any cross-platform Capacitor changes — `capacitor.config.ts` already has `ios.contentInset: "automatic"` which handles native safe-area; web-side fixes from P0-5 are sufficient
- Tests — current run flow has zero tests; covering this in P0 would 2× the diff. P0 ships behind manual QA + the existing tsc/lint gate; P1 follow-up adds unit coverage for the guards module

## 11. Risks and unknowns before editing

1. **The "Start without GPS" button exists for a reason.** Some users in urban canyons / underground gyms tolerate flaky GPS but want to record. Replacing with "Switch to treadmill" is the safer default but may regress those users' workflow. Recommend a quick check with the user before P0-2.
2. **Run flow has zero unit tests today.** Refactors carry regression risk that lint/tsc won't catch. P0 should ship behind extra-careful manual QA on a Capacitor build, not just the PWA preview.
3. **Capacitor iOS vs Safari PWA** divergence on safe-area is partially papered over by `contentInset: "automatic"` in `capacitor.config.ts`, but `pb-24` literals on iOS Safari PWA are visibly clipped. P0-5 fixes one site; we should grep for other `pb-24` / `pb-32` usages in case they're a wider pattern.
4. **`isValidReading()` thresholds** (`gps.ts:63-79`) drop fixes silently. If the P0-2 change pushes more runs through the GPS flow (because the escape hatch is gone), users with bad first-fix accuracy may experience a longer "Acquiring" — worth measuring with telemetry but unlikely to block.
5. **`offlineQueue.ts` exists but isn't wired for runs.** Firestore's IndexedDB persistence covers most offline cases, but a hard-failed save (auth token expired, quota) currently has no recovery. P0-3's banner+retry handles the visible case; deeper offline-queue integration is a P2 task.
6. **`/run-summary` payload is `navigate(state)`** — survives a refresh in the History API but is lost on hard reload. Not a P0 bug but worth knowing if we ever add a "save later" affordance.

## Verification (when P0 ships, per commit)

```bash
npm run lint            # must pass
npx tsc --noEmit        # must pass
npm run test            # existing suite still green (no new tests in P0)
npm run build           # production bundle clean
```

Manual on a Capacitor iOS build (not just PWA preview):
- Start outdoor run with airplane mode → after 15s see "Switch to treadmill", confirm switch lands in treadmill mode with manual entry
- Start outdoor run, get GPS, finish at < 100m → confirm "Run too short" sheet, NOT full summary
- Start outdoor run, valid distance → confirm full summary with Save / Share / Export GPX / Discard
- Trigger a save failure (toggle airplane mid-save) → inline banner with Retry, no silent loss
- Treadmill flow: try to enter 0.04km → button disabled
- RunSummary: bottom button is clear of the home indicator on a notched iPhone
- Background app for 30s during a run → existing bg-gap banner still works (P0 should not regress this)

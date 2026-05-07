# Run Reliability Sprint P0 — Manual QA checklist

Tick through this on a **Capacitor iOS build** (preferred) or `chess333.github.io` PWA before opening the PR. PWA preview can't fully exercise `geolocation.watchPosition`, native haptics, or the safe-area inset behaviour — flag any test that requires the native build.

Branch: `claude/run-reliability-p0` · 6 commits (`bdb95ac` → `20f86a4`).

## Setup

- [ ] Pull `claude/run-reliability-p0` into your local + Capacitor build
- [ ] Sign in as a real user (not anonymous — save flow writes to `users/{uid}/runs`)
- [ ] Confirm a notched iPhone for safe-area checks (iPhone X or later)
- [ ] Have airplane-mode toggle handy (used to force GPS-loss + save-failure cases)

---

## Commit 1 — Type relocation + guards module

Pure-functions commit. Nothing user-visible to verify; the guards are just the foundation for C2-C5. Skip to C2.

## Commit 2 — Save flow status, retry banner, no auto-nav

### Happy path

- [ ] Pick **Free** / **Easy** → Start → wait for GPS → run for ≥ 30 seconds and ≥ 100m → Stop
- [ ] On RunSummary, tap **Save Run** → button shows "Saving…" briefly
- [ ] After save resolves, primary slot becomes a green "**Done**" button (not auto-navigation)
- [ ] **Confirm: you stay on the RunSummary screen** until you tap Done. The 800ms / 1800ms auto-nav timeouts are gone.
- [ ] Tap Done → lands on Home

### Save failure → retry

- [ ] Repeat the run, reach RunSummary while online
- [ ] **Toggle airplane mode ON**, then tap Save Run
- [ ] Save fails. Inline coral banner appears above the action row: "Couldn't save your run" with a Retry button
- [ ] Toast also fires ("Failed to save run. Tap Retry below.") but the banner is the durable affordance
- [ ] **Toggle airplane mode OFF**, tap **Retry** → save succeeds, Done button appears

### Discard race-prevention

- [ ] During a save (the brief "Saving…" window), confirm Discard is hidden
- [ ] After save succeeds (Done state), confirm Discard is also hidden — saved-run deletion is out of scope
- [ ] In the failed/error state, Discard reappears alongside Retry

## Commit 3 — InvalidRunReview

### Outdoor sub-100m / sub-30s

- [ ] Start any non-treadmill type with a GPS lock → run for **5 seconds, distance < 100m** → Stop
- [ ] Land on **"Run too short"** focused card (NOT the full summary)
- [ ] Body copy reads: *"We recorded {time} and {km}km. This may have happened before GPS locked."*
- [ ] Two visible actions: **Save anyway** (neutral) and **Discard** (red). No Share, no Export GPX, no map, no charts.
- [ ] Tap Save anyway → green "Saved anyway." caption + Done button. Still no map / charts / share / GPX.
- [ ] Tap Done → Home

### Sub-50m treadmill

- [ ] Start **Treadmill** → wait 30s → Stop → enter `0.04` km — note button stays disabled (this is C5; below)
- [ ] To force the case for C3: enter `0.05` (just above floor), Save → if elapsed is < 30s but distance ≥ 50m, the run is **valid** for treadmill (no elapsed-time gate). Confirm normal summary renders.
- [ ] To exercise the treadmill invalid path: enter `0.04`, then tap Save (the button is disabled — verify) → no save fires
- [ ] **Note:** treadmill validity rule is distance-only. The body copy on InvalidRunReview reads *"This is below the minimum distance or duration for a normal summary."* (no GPS-lock framing)

### Save anyway holds the user inside InvalidRunReview

- [ ] In any invalid case, tap Save anyway → confirm you do NOT fall through to the full map / splits / charts surface. Saving doesn't promote invalid data.

## Commit 4 — Track without GPS

- [ ] Start any non-treadmill type
- [ ] **Toggle airplane mode ON** before / during the acquiring phase so GPS can never lock
- [ ] Wait 15 seconds in the acquiring phase
- [ ] CTA appears: **"Track without GPS"** with subtitle *"Record time now and enter distance after."*
- [ ] Cancel button below is unchanged (small, muted, returns to setup)
- [ ] Tap "Track without GPS"
- [ ] You land directly in **TreadmillMode** (manual distance entry view) with the timer already running. No setup modal re-prompt.
- [ ] Run a few seconds → Stop → enter a valid distance → Save → normal flow (note: P1 follow-up — the run will be tagged `activityType: 'treadmill'` internally, so the post-run summary will say "Treadmill". Acceptable for P0.)

## Commit 5 — TreadmillMode 0.05km floor

- [ ] Pick **Treadmill** → Start → let timer run for any amount → Stop
- [ ] In the distance input, type `0.04` → **Save Treadmill Run** button stays disabled
- [ ] Below the input, helper text reads: *"Distance must be at least 0.05km."*
- [ ] Clear the input → helper text disappears (no visible message on empty input)
- [ ] Type `0.05` → button enables, helper text disappears
- [ ] Type `0.10` → still enabled, no helper

## Commit 6 — RunSummary safe-area

**Capacitor iOS only — Safari PWA may show the bug regardless because of how it computes `env(safe-area-inset-bottom)` at first paint. Worth checking both.**

- [ ] On a notched iPhone (X or later), reach RunSummary on a valid saved run
- [ ] Scroll to the bottom — the **Discard** button (or Done in the saved state) is fully visible above the home indicator
- [ ] Compare to history at `b14a8d3` (or any commit before `20f86a4`) on the same device — bottom UI was previously clipped behind the indicator. Confirm the fix.

---

## Regression checks (existing flow still works)

The sprint doesn't change the happy-path content, but it does restructure the action row. Quick spot-check that nothing visible regressed:

- [ ] **Map renders** with pace-coloured route + legend on a normal valid outdoor run
- [ ] **Stats grid** (km / time / pace) shows correct values
- [ ] **Splits chart** + per-km list render for a run > 1km
- [ ] **Best Efforts** card appears for runs that crossed any of the canonical distances (1km / 5km / 10km / etc.)
- [ ] **Pace trend badge** appears once you have ≥ 2 saved runs
- [ ] **Notes textarea** still accepts input + saves with the run
- [ ] **Share button** opens the share-composer flow (only after Save Run resolves to "saved" — gate added in C3)
- [ ] **Export GPX** downloads a valid `.gpx` file (only after saved + only on outdoor runs — gate added in C3)
- [ ] **Treadmill runs** never show Export GPX, even after saved
- [ ] **Background-then-foreground** during an active run still surfaces the existing bg-gap banner (P0 must not regress this)

---

## Known-limitation acceptances (NOT bugs)

These are documented P1 follow-ups; confirm they read correctly but don't block the merge:

- [ ] After "Track without GPS" the post-run summary will label the run as **"Treadmill run"** even though the user was outside. Acceptable for P0; resolved by the future `activityType: 'manual'` work.
- [ ] On Treadmill with Pace alerts toggle ON, no pace alerts fire (no GPS-derived pace exists). The toggle remains interactive but is effectively a no-op. Polish item, not P0.

---

## Out-of-flow follow-ups flagged by Commit 6

Worth a separate small PR after this sprint merges:

- [ ] `src/pages/RunDetail.tsx:109` — same `pb-24` page-wrapper pattern as the RunSummary bug. Same `var(--page-bottom-pad)` fix applies.
- [ ] `src/pages/Food.tsx:884` — `pb-28` on a content container. Different shape; worth a look but not obviously broken.
- [ ] `src/components/run/RunBottomSheet.tsx:115` — `fixed bottom-0` action sheet with a hand-calibrated `pb-6`. Bottom controls could be partially obstructed by the home indicator on iPhone X+. Left alone in C6 (touching it risks visual regression on the active-run hero).

---

## Sign-off

- [ ] All checks above ticked or explicitly noted as N/A
- [ ] No regressions vs main on the happy path
- [ ] Open PR for `claude/run-reliability-p0` → `main`

# Design-review capture channel (screenshots without a local rig)

Read before writing or changing a capture spec (`e2e/screenshots/*.capture.spec.ts`), running the emulator rig, or reading a screenshot diff report. Moved out of CLAUDE.md on 2026-10-05; the text is unchanged apart from the note on running the authenticated suite below.

**Run the authenticated suite one test at a time locally**: `npm run test:e2e:auth`. CI does (`workers: 1` under `CI`); locally the default runs specs in parallel against the one shared seeded account, and an accessibility sweep that waits a fixed 1.5 s per route then fails under load with nothing wrong in the app (2026-10-04, `a11yAuthenticated.auth.spec.ts`). `playwright.config.ts`'s auth-emulator note has the measurements.

**The capture specs are a PR gate as well as a screenshot source.** The
`capture-specs` job in `emulator-tests.yml` runs every
`e2e/screenshots/*.capture.spec.ts` on pull requests and on main, blocking,
with the same build and the same seed chain `app-screenshots.yml` uses
(the two lists must stay identical, pinned by `captureSeedChain.test.ts`;
a seed added to only one leaves its spec failing on login in the gate, or
its frame reading as `removed` in the diff report).
Before that job existed these specs ran ONLY on a push to
`claude/screenshot-app`, so their ~98 assertions could not fail a PR:
#2187 removed an `aria-label` a spec located by, the locator matched zero
elements for two merges, and nothing went red. If you change a
user-visible string, an aria-label, or a reading order, that job is what
tells you which spec you broke — so read its failure before assuming the
rig is at fault. Frames written there are thrown away with the runner;
committing them to the `app-screenshots` branch is still the workflow
below.

**The agent sandbox can run the whole capture rig, in minutes — no need
to send a capture loop to CI.** The chain is exactly
`emulator-tests.yml`'s: build with the emulator env
(`VITE_USE_EMULATORS=true … npm run build:e2e`), then
`firebase emulators:exec --only auth,firestore --project demo-tropos`
around the seed chain and `npm run test:e2e -- capture.spec.ts
--project=auth-emulator`. The ONE thing to know is the browser: the
pre-installed Chromium is a different build from the one Playwright asks
for, so pass `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
— the capture specs' `test.use` already reads it as `executablePath`.
Full suite locally: 64 passed in 6.8 minutes.

Two caveats worth carrying. **Seed the FULL chain or you will measure the
wrong thing** — `food-suggest-typed` frames at 430px under `seed:e2e`
alone and at 142px under the whole chain, because the extra diary content
is what pushes the composer down; a light seed hides exactly the class of
bug the rig exists to catch. And **`home.screens.capture`'s "audit
surfaces" test times out locally** (90s on a fullPage shot of the heaviest
surface) while passing in CI — verified by running it on clean main, so
treat that one as environmental rather than a regression.

CI is still the authority. Push any branch's code to
`claude/screenshot-app` (scratch trigger branch — force-with-lease is fine)
and `app-screenshots.yml` builds it against the emulator, captures the key
surfaces light+dark (`e2e/screenshots/home.screens.capture.spec.ts`), and
commits PNGs to the `app-screenshots` branch for `git fetch` + view. Each
run also DIFFS against the previous capture (`scripts/diff-screenshots.mjs`,
pixelmatch): `screenshot-diff/DIFF_REPORT.md` + per-frame changed-pixel
highlights ride the same branch and mirror into the run's step summary —
a report, not a gate (intended change is normal here). Visual
PRs cite before/after from this channel (the D15 lesson: no visual churn
without screenshots). Concurrent runs no longer race the branch: the
workflow cancels a superseded run (D26), because the loser's frames are
overwritten by the newer force-push anyway and its diff report is exactly
the artifact the race corrupts — push, WAIT for the run, then push the
next capture. Gotchas: capture specs must be named
`*.capture.spec.ts` (auth-emulator project); the Progress/Form switch and
other SegmentedControls are `role="radio"`, not buttons; give best-effort
clicks short explicit timeouts so a missed locator costs seconds, not its
30s default. **Capture specs select by user-visible STRINGS, so renaming
copy or reshaping an aria-label requires `rg` over `e2e/` in the same
commit** — three selectors broke this way on 2026-08-22 alone (the
surfaces day-cell regex, its unpinned twin in day-peek whose count-guard
skipped the click SILENTLY, and the circles weekly-focus button). Where a
component renders standalone, pin the spec's literal against the real
render the way `weekStripCaptureSelector.test.tsx` does — it now reads
BOTH day-cell specs.

**Read the diff report with the flaky frames in mind.** Three classes
of frame change between runs with no code change, and chasing one costs
an hour:

- **Bottom-sheet frames** (`circle-create-compact`, `easier-chooser`,
  `sheet-trainingblock`) capture at whatever point the sheet's
  open/settle animation had reached, so consecutive runs can differ by
  8-57% — one frame showing the sheet open and the next showing the
  surface behind it. Verified 2026-08-22 across two runs whose only
  code delta was `index.css` range-input rules: none of the three
  surfaces imports anything that changed.
- **Map frames** (`run-detail`) vary with MapLibre tile-load timing.
  The tell is that every changed pixel sits inside the map's y-band.
- A frame moving by **0.1-0.7%** is usually antialiasing, not a change.
- **`badges-grid` resizes ±10px with the capture's WALL CLOCK.** The
  seeded user earns "Early Bird" only when the run executes before 7am
  (the badge is "log before 7am for 5 days"), so a pre-7am-UTC capture
  shows it earned (1-line date footer) and a later one shows it locked
  (2-line description) — the row grows ~10px and the whole page shifts.
  Diagnosed 2026-08-22 by cropping the insertion boundary (y≈900): the
  delta is fixture DATA, not layout. Same family as the useHomeData
  midnight flake — time-of-day-dependent seeds.
- **Frames whose height changes** are a different problem from frames
  whose pixels change, and the tempting fix does not work.
  `home-energy-default-after` measured 1191 → 1190 → 1458 → 1191 → 1358
  across five captures. Waiting for the document height to settle does
  NOT close it: Home renders its loading states as ordinary EMPTY states
  (`—` / "Tap to log") rather than skeletons, so they are height-stable
  for longer than any settle window, and the shot lands on a page that is
  stable but not final. Nothing generic separates a loading empty state
  from a real one — the frame needs an anchor on the DATA it exists to
  show. `e2e/helpers/settleHeight.ts` is still worth calling before a
  fullPage shot; it just is not that fix.
- **A raw DOM scroll inside a capture spec races the app's own smooth
  scrolling.** `index.css` sets `html { scroll-behavior: smooth }`, so
  `el.scrollIntoView({ block: "start" })` ANIMATES, and a spec that then
  measures inside a fixed `waitForTimeout` can land mid-flight.
  `food-suggest-typed` did: its height guard refused a frame that was
  fine, going 1-failed / 2-passed over five full-seed runs while CI
  stayed green — a coin flip that usually lands right is not a gate.
  Pass `behavior: "instant"` (an explicit behavior beats the computed
  property by spec) or use Playwright's `scrollIntoViewIfNeeded()`,
  which waits for stability itself. The shape to look for is a raw
  `scrollIntoView` / `window.scrollTo` followed by a measurement rather
  than by a settle.
- **Raster art needs `img.decode()`** — `e2e/helpers/settleImages.ts`
  took `races-directory-light` from 10.88% to unchanged, and
  `badges-grid` from churning-in-every-report to unchanged in both
  themes. Diagnose by band before adopting: badges' mask was bands of
  exactly 62-64px against a `BadgeHex` rendered at `size={64}` — art and
  nothing else.
- **The capture that first carries a fix MEASURES that fix.** The diff
  report compares each capture to the previous one, so the run right
  after you adopt something is a fix-vs-pre-fix comparison, not a churn
  reading. `badges-grid-light` read 4.14% — its worst value ever — on
  the capture that introduced `settleImages`, and was written up here as
  "the helper made it worse". It had not: that was correctly-decoded art
  replacing partially-decoded art. The NEXT run, both sides post-fix,
  showed it unchanged. Judge a capture fix on the second diff after it,
  never the first — otherwise a working fix gets reverted for doing its
  job.
- **`home-energy-default-after` is the one that took a content anchor.**
  Five heights across five captures, unfixed by height-settling, because
  Home renders its loading states as empty states. Anchoring on the data
  (a non-zero calorie target) held it steady across two runs. The anchor
  is pinned against a real render in `energyCaptureAnchor.test.tsx`,
  including the runtime's number grouping — `formatCalories` is
  `toLocaleString()` with no locale, so a comma-only pattern is a bet on
  the CI runner's locale.
- **A `removed` row usually means the run did not finish, not that a
  surface was deleted.** The diff and commit steps are `if: always()`,
  so a job killed by `timeout-minutes` still force-pushes the frames it
  managed to take — as the new BASELINE — and every frame whose spec
  never ran reads as "removed". Hit on 2026-09-04: a full pass was
  taking ~14 minutes against a 15-minute budget, and adding ONE exercise
  to the form-demo list tipped it over; 15 frames across the solo-feed,
  run-HUD, tooltip and home specs vanished at once. Nothing was wrong
  with any of them. The budget is now 30 minutes, and an unsuccessful
  capture step stamps an INCOMPLETE CAPTURE banner at the top of the
  report — but check the run's conclusion before believing a cluster of
  removals, and re-run rather than diffing against a truncated baseline.

Localise before diagnosing: read the `diffs/` highlight and find the
y-band the changed pixels occupy. If it is the map, or a sheet, suspect
the rig before the diff. And do NOT assume a two-band highlight means
content shifted vertically — cross-correlate first; on the
2026-08-22 sheet frames the best vertical offset was 0 and the two
bands were two different STATES, not one state moved.

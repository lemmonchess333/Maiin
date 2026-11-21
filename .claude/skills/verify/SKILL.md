---
name: verify
description: Run Tropos for real and bring back evidence that a change works. Boots the Firebase emulators, seeds the capture specs' account, builds and serves the app against them, drives the features a change touches in Chromium, and returns a step trace, a screenshot per step and every console error, judged against the feature map. Use before committing any change that reaches what the app shows or does, after the cheap checks pass. Not for tests-only, docs-only or CI-only changes.
---

# verify

Tests say the code does what its author meant. This says the app still
works where a person uses it: signed in, against real (emulated) data, in a
browser. It is Tropos's smoke-test harness, and it deliberately takes the
place of Claude Code's built-in `/verify` inside this repo.

## When

- Before committing a change under `src/`, `public/`, `index.html` or the
  Vite config.
- After the cheap checks, never instead of them: `npx tsc -b`, the touched
  tests (`npx vitest run <files>`), eslint on the changed files. They take
  seconds and catch most mistakes; this takes a minute.
- Not for a change that cannot reach the running app (tests, docs, CI,
  `functions/`, most scripts). `npm run verify:app` says so and exits 0;
  write that in the commit's `Verified:` line. Three kinds of file outside
  `src/` do select features: the seeds and `firestore.rules` (the whole
  map: every signed-in anchor is seeded data read through the rules),
  `package.json` and the other shared build inputs (the smoke set), and
  the skill's own files with the names it borrows from
  `src/test/journeyScreens.ts` (the whole map).

## Run it

```bash
npm run verify:app                         # what this branch touches, vs origin/main
npm run verify:app -- --features home,food # named features
npm run verify:app -- --smoke              # the smoke set
npm run verify:app -- --list               # the feature map
npm run verify:app -- --down               # stop the emulators and the server
```

The first run boots everything (about 2 minutes: the emulators, the seed
chain, an emulator build of the app). Later runs reuse what is up and
rebuild only when an input changed, so they cost the driving: about a
second a feature. The rig stays up between runs; `--down` stops it.

`--diff <base>` compares against another base (CI and shallow clones need
a sha). `--repeat N` drives every chosen feature N times and fails any
whose verdict moves between rounds (that is how the map is stress-tested).
`--rebuild` ignores the build cache. `--motion` drives without reduced
motion, for a change to an animation.

## Read the result

The last line names the report: `.verify/runs/<time>/report.md`, beside
`trace.json` and `screenshots/`.

- **PASS** (exit 0): every chosen feature's steps passed, no error card
  showed on any of its screens (a section's "This section couldn’t load.",
  any screen's load failure, the route's "Something went wrong"), and
  nothing threw (no page error outside environment noise). Now look: open
  each feature's last screenshot and hold it against its `Expected:` line
  in the report. A step passing means the anchor was there, not that the
  screen is right.
- **FAIL** (exit 1): a step did not happen, an error card showed, the page
  threw, or a feature was flaky. The report says which, with the step and
  its `-FAIL` screenshot.
- **INCOMPLETE** (exit 2): some features could not run here. Incomplete
  is not a pass. The usual cause is a cloud sandbox that cannot download
  the Firestore emulator's jar (its host, storage.googleapis.com, is
  blocked): the signed-out features ran, the signed-in ones did not. Push
  the branch and run the **Verify app** workflow on it (it takes the
  feature ids), or verify on a machine that has the jar. Say which in the
  commit.
- **Exit 3**: the rig could not start, with the reason (no Chromium, a
  port taken by another emulator, a seed or build that failed).

Errors in the report are page errors and `console.error`s, less the
environment's noise (Google hosts the sandbox cannot reach, the favicon)
and the rig's limits (the Functions and Storage emulators, which it does
not run, as the capture job does not). An error on the app's own server
or the Auth and Firestore emulators is never noise. Page errors fail the
feature; console errors are listed for you to read, because the Firebase
SDK logs failures it has handled there.

## When it fails

Find the cause. Never re-run until green, add a wait, or loosen an anchor
to make a failure go away: a flaky harness teaches retrying instead of
fixing. If the app is right and the map is wrong (a renamed button, a
moved route), fix the map in the same change. After three rounds on the
same failure, stop and bring in a human with the report.

## Record it

Name what ran in the commit's `Verified:` line: `verify(home,food)` for a
pass, or `verify(incomplete: signed-out only)` when Firestore could not
run, beside the other checks (`unit`, `types`, `lint`).

## The feature map

`scripts/verify/featureMap.ts` is the guide and the rubric: each user-
visible feature with the code that draws it (`sources`), its route, its
steps (by role and name, label or test id, never a timer) and what its
last screenshot should show (`expected`). A change's files choose the
features through `sources`; a file every screen depends on, or an app
file no feature names, runs the smoke set, and the report lists the latter
as unmapped.

When you add a page or move an anchor, change the map in the same commit.
`scripts/verify/featureMap.test.ts` holds every route to `src/App.tsx`,
every glob to a file, and every page to a feature or to `NOT_DRIVEN` with
the reason. Names the journeys share come from `src/test/journeyScreens.ts`.
Features are read-only (nothing saved, posted or followed), so they run in
any order against one seeded emulator, each in a fresh browser context.

## How it works

`scripts/verify/`: `rig.ts` (emulators, seeds, build, preview), `drive.ts`
(the steps, screenshots, errors, and `judge`, a feature's verdict),
`select.ts` (files to features), `report.ts` (the run's verdict),
`cli.ts`. The emulators are one per machine, so their state (and the
signed-in sessions) lives in the git common dir, `verify-rig/`, shared by
every worktree; the build, the preview and the runs are per worktree, in
the git-ignored `.verify/`. The seeds run once per emulator lifetime and
seed key (the seed scripts and the local date); a new key restarts the
emulators empty and seeds them again. Emulators the rig did not start are
never seeded unless you pass `--seed`. The seed chain and build
environment are the capture job's, pinned to `emulator-tests.yml` by
`captureSeedChain.test.ts` and `rigConfig.test.ts`. A feature signs in as
the capture specs' account, or as `season` (sixteen weeks of training)
where the e2e account has no data for the screen. The lower-level drivers
in `.claude/skills/verifier-tropos-web/` remain for one-off sweeps.

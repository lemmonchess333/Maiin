# Design-QA frame loop (spike)

The "verify transitions at the frame level" technique — adapted from native
iOS (record the simulator, diff frames, fix pops/hitches) to Tropos's web
stack. Lets an agent **self-check animation polish** instead of leaving
visual QA for a human on a device.

## The split

- **`frameAnalysis.ts`** — the pure brain. Takes one number per adjacent
  frame pair (the `changeRatio`: fraction of pixels that moved) and grades the
  transition: flags **pops** (isolated visual jumps), **stalls** (a frozen
  frame mid-motion / dropped frames), and **not-settled** (the animation never
  came to rest), plus a smoothness score. No browser, no clock — deterministic
  and unit-tested (`frameAnalysis.test.ts`, runs under `npm run test`).
- **`../../e2e/design-qa/*.capture.spec.ts`** — the plumbing. Drives a real
  interaction in chromium, records it with the **DevTools screencast** (no
  ffmpeg), turns the frame stream into change-ratios via an in-page canvas
  diff, and runs them through the analyzer. Chromium-only, runs in the
  `auth-emulator` Playwright project.

## Targets

- **bottom-nav Home → Food** — a route transition.
- **water-card fill** — `WaterWave` + `WaterBubbles`, the app's most complex
  SVG animation (CLAUDE.md flags it); the highest-value jank target.

Add a surface by copying a test and swapping the `trigger` (e.g. a
bottom-sheet open, the `SoloFirstFeed` mount).

## Run it

```bash
# the analyzer logic (no browser needed)
npm run test -- scripts/design-qa

# a real capture (needs chromium + the Firebase emulator + a seeded user)
npm run seed:e2e
E2E_AUTH_EMULATOR=1 npm run test:design-qa
```

## In CI / the QA workflow

It runs automatically as a **non-blocking** step in
`.github/workflows/emulator-tests.yml` (after the auth E2E): the next CI run
executes the captures against the emulator-backed app and uploads a
`design-qa-report` artifact. It's `continue-on-error` on purpose — until the
selectors/`settleMs` are calibrated, a flagged transition surfaces in the log
and the uploaded artifact **without blocking the merge**. Flip it to blocking
once tuned.

For PR design review, run `npm run test:design-qa` (the same hook the
`verifier-tropos-web` / `/qa-design-review` flow can call) and read the jank
flags in the failure message.

The **first real run is a calibration pass**: confirm the trigger actually
animates (the analyzer says `no motion captured` if the selector drifted) and
that `settleMs` covers the whole transition. After that the thresholds in
`frameAnalysis.ts` hold the line — tune them there, never inline.

## Why this shape

The judgement (what counts as jank) is the reusable, durable part, so it's
isolated and proven without a browser. The capture is environment-dependent
plumbing. To add a surface, copy the example test and swap the `trigger`
(e.g. the water-card fill, a bottom-sheet open, the `SoloFirstFeed` mount).

## Scope note — steal the rigor, not the maximalism

This loop enforces **smoothness**, not a visual style. Tropos's design system
is deliberately calm (subtle shadows, no decorative gradients, no new
colours); the goal here is hitch-free motion within that restraint, not the
shader-heavy "delight" of the article this idea came from.

## What the CI calibration found (runs 1-3)

The non-blocking lane earned its keep immediately:

1. **`networkidle` never fires** against a Firebase app — Firestore's realtime
   listeners hold the connection open, so the wait timed out. → wait for the
   trigger element instead.
2. **Single-frame "stalls"** were the CDP screencast emitting duplicate frames
   at ~120fps, not hitches. → a stall must be a RUN of ≥3 frozen frames.
3. **Discrete pop/stall counts are noisy** on a web screencast (non-deterministic
   across retries) — but **`smoothness` is robust** (0.87-0.93, and it ranked the
   water-fill smoother than the route transition). JPEG compression noise also
   manufactured false pops. → capture **PNG** (lossless), and treat this lane as
   a **diagnostic, not an oracle**: it logs `smoothness` + candidate frames for
   review and hard-fails only on `hasMotion` (a dead selector).

**The durable takeaway:** pixel-diffing a screencast gives you a reliable
_smoothness metric_, not reliable _binary jank flags_. Use it to watch
smoothness for regressions and to surface frames worth eyeballing.

## Not yet done

- A smoothness baseline/regression GATE — compare each transition's smoothness
  to a stored reference (like Playwright's screenshot snapshots) and fail on a
  drop. That's the point to flip the CI step from non-blocking to blocking.

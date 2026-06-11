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

## Run it

```bash
# the analyzer logic (no browser needed)
npm run test -- scripts/design-qa

# a real capture (needs chromium + the Firebase emulator + a seeded user)
npm run seed:e2e
E2E_AUTH_EMULATOR=1 npx playwright test --project=auth-emulator transition.capture
```

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

## Not yet done

- Wire into the `/qa-design-review` skill so feature PRs auto-run it.
- Calibrate selectors/`settleMs` against the real authed surfaces.
- A baseline/regression mode (compare a transition's smoothness to a stored
  reference, like Playwright's screenshot snapshots).

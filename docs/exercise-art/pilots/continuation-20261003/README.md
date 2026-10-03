# Crunches draft — 3 October 2026

Base: `f16195eb460b6e7f573239ac81f8fc8585cc7235`.

Historical draft checkpoint; the later [composite repair](../crunches-composite-20261003/README.md) is released separately. Original files and failed measurements below remain unchanged.

This adds a native six-file **review candidate**, not a production release.
Crunches remains absent from `FORM_ARTWORK` and `public/form-frames`. The
released exercise count stays at 57, with 84 in-scope exercises still lacking
released artwork.

## Movement and selection

The exact catalogue variation is a bent-knee floor crunch: feet flat, hands
lightly behind the head, shoulders curling up while the lower back and pelvis
stay grounded, then a controlled return. It is not a sit-up. Strong purple
rectus abdominis and pale obliques describe the visible muscle hierarchy;
deep hip flexors are not drawn through the body.

The canonical athlete and exercise master accompany every pose edit. The
selected sequence is `1, 2, 3, 3, 2, 1`: setup, begin curl, peak, brief pause,
controlled lower and return. Repeated joint configurations are copied into
separate native PNG files. No image was composited, warped, cropped, enlarged
or otherwise repaired by code.

The first intended early curl rose farther than requested and became the
peak candidate. An intermediate attempt using both endpoints rose higher
than the peak and is preserved as `rejected-intermediate-too-high.png`.
One retry using only the flat master and canonical identity produced the
selected intermediate. The measured head-top rows are 440, 353 and 322;
the rejected candidate is 309. Movement spacing is uneven and is a remaining
review finding, not a claim of smooth animation.

## Release-blocking contact findings

Read-only 31×31 patch matching measures these translations from setup:

| Region         | Intermediate Δx, Δy | Peak Δx, Δy |
| -------------- | ------------------- | ----------- |
| Near heel sole | +1, +2              | 0, 0        |
| Near toe sole  | +3, 0               | 0, 0        |
| Far toe sole   | +3, +1              | +2, 0       |
| Far heel sole  | +1, 0               | 0, 0        |
| Pelvis floor   | −1, +1              | 0, 0        |

The existing release validator allows at most 1px fixed-anchor drift. These
results exceed that limit. The full measurements and source hashes are in
`crunches/registration.json`. Patch matching also responds to changes in
shading and outlines; it does not establish anatomical correctness. Native
review found a plausible small crunch and consistent identity, but cannot
override the failed contact checks.

Further retries with the same generation method are stopped. Before more
poses are generated, the next approach must demonstrate a lower-body region
that remains registered while the upper torso moves. The failed candidate is
not silently substituted or promoted.

Side Plank remains blocked by its previously recorded 12px shoe displacement.
No new Side Plank generation was purchased and none of its files were changed.

## Review and checks

The draft integrity audit checks all six source files, hashes, canvas sizes,
cue order and declared pose reuse. The account-free form-art fixture exposes
`crunches (draft)` with these findings. Browser results and actual mobile
screenshots are recorded under `evidence/`; final check results are in
`VALIDATION.json`. Player checks are separate from artwork release approval.

```sh
node docs/exercise-art/pilots/continuation-20261003/measure-registration.mjs
npm run check:form-drafts
npx playwright test --config playwright.form-art.config.ts
VITEST_MAX_WORKERS=4 npm run verify
```

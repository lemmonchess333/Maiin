# Exercise artwork continuation — 2 October 2026

Base: main `5fe0da9dc9f69fb54e6101754a8bc4c939053df2`.

| Exercise                        | Result                                                                       | Selected frames               |
| ------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| Hanging Leg Raise (`leg-raise`) | Complete draft; native stills and actual mobile player reviewed              | 6 files, 3 distinct poses     |
| Side Plank (`side-plank`)       | Corrected setup master; raised candidates rejected for moving fixed contacts | 1 setup, no complete sequence |

Both use `identity/athlete-anatomy-v3.png`. Each exercise has a six-beat plan,
canonical/master/plan/image hashes, and review notes. The images were generated
individually with `image_gen.imagegen`; no contact-sheet crops, upscaling,
compositing, pixel repairs or public asset replacements were used. Matching
Hanging Leg Raise hold and return poses are explicitly reused as separate files.

`MANIFEST.json` is consumed by the existing draft audit and account-free player.
Side Plank is listed as incomplete and is excluded from that player's complete
sequence menu. A populated directory is not treated as approval.

## Hanging Leg Raise

The catalogue variation is a straight-leg raise from a fixed pull-up bar. The
draft depicts a braced hang, partial raise, hip-height endpoint, brief hold,
controlled lowering and a return below the hips. The sixth pose equals the
first, making the loop boundary stationary. The middle pose is higher than the
requested halfway angle, so the caption makes no angle claim.

Both hands stay on the bar. All four named grip/bar-joint patches have zero
best-fit integer translation across the three unique poses. Pixel shading does
change; this diagnostic does not certify every joint, bone length or grip detail.
Native stills show straight legs, no visible torso swing, consistent identity,
and the same purple rectus-abdominis / pale-oblique hierarchy.

The actual player was inspected at 393 × 852 in both themes. Automated checks
cover all six loaded PNGs, captions and cues, manual stepping, the real 6→1 timer,
identical start/finish displayed pixels, 44px controls, no horizontal overflow,
and reduced motion. Screenshots and test results are under `evidence/`.

This is a reviewed **draft**, not a production release. Shipping still needs
delivery WebPs and their visual check, a card cutout, exact production cues and
registry entries, and release evidence bound to those final delivered files.
No existing production guide was replaced.

## Side Plank

The intended variation is a forearm side plank with straight stacked legs and
a timed hold, followed by a controlled exit and a side switch. It is not a
hip-dip repetition exercise.

The first setup hid the supporting forearm through severe foreshortening. A
local edit produced the selected setup with elbow, forearm, wrist and fist
visible. The raised pose then moved the fixed contacts. A targeted repair did
not resolve that error:

| Contact measurement          | Setup | Raised candidate | Repair candidate |
| ---------------------------- | ----: | ---------------: | ---------------: |
| Last bright forearm/fist row |   797 |              793 |              794 |
| Last bright lower-shoe row   |   820 |              808 |              808 |

The 12px shoe displacement persists. These positions must stay planted while
the hips rise. The raised files remain rejected; no missing frames were filled
with duplicates. Further full-scene retries were stopped. The next attempt
needs a registered support/foot construction before more poses are purchased.

## Reproduce the checks

```sh
node docs/exercise-art/pilots/continuation-20261002/measure-registration.mjs
npm run check:form-drafts
npx playwright test --config playwright.form-art.config.ts --grep leg-raise
VITEST_MAX_WORKERS=4 npm run verify
```

The measurement script reads images without altering them and binds each
measurement to its source hash. `VALIDATION.json` records the measured final
check results. The root `inventory.json` is regenerated from the live registry;
the old September totals in earlier reviews are historical.

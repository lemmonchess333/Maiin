# Exercise artwork migration

## Current checkpoint — 5 October 2026

The [Bulgarian Split Squat continuation](releases/2026-10-05/README.md) now has six
native-reviewed frames with fixed dumbbell geometry and a repaired deep-ankle
contour. Actual V2 video review found brief empty stages during player transitions,
so the continuation also adds decoded-image readiness and stale-promise guards.
The full repository gate passes: 11,817 tests passed, 370 skipped, zero failures.

Repaired-player browser review is still pending during a GitHub Actions runner
incident. The exact app-entry patch, lossless delivery hashes, review draft and
remaining steps are preserved. The artwork remains inactive and current branch
coverage remains **64 of 141** released guides. This checkpoint does not change
production deployment status.

## Previous checkpoint — 3 October 2026

The [fifth new-conversion batch](pilots/new-conversions-05-20261003/README.md) adds Ab Wheel Rollout and Kettlebell Swing: twelve native draft frames with measured contact drift and mobile review evidence. The [fourth batch](pilots/new-conversions-04-20261003/REVIEW.md) adds Seated Calf Raise and Farmer’s Carry. All four remain outside production pending their recorded form/contact corrections.

The latest continuation releases [Pistol Squat](releases/2026-10-03/PISTOL_SQUAT.md) after native ankle and mobile review, and adds the missing [horizontal Glute-Ham Raise endpoint](pilots/glute-ham-full-range-20261003/README.md). Glute-Ham Raise remains a draft with pad-contact findings recorded.

The owner clarified the calf raise with an upright shoulder-pad machine screenshot. The [standing calf release](releases/2026-10-03/STANDING_CALF_RAISE.md) now supplies the matching sequence to both Calf Raise and Standing Calf Raise. The earlier [donkey calf release](releases/2026-10-03/DONKEY_CALF_RAISE.md) is a separate exercise variation. Other unfinished conversions remain in review.

The [third new-conversion batch](pilots/new-conversions-03-20261003/README.md) adds Glute-Ham Raise, Donkey Calf Raise and Pistol Squat: 18 native draft frames for three previously unconverted IDs. Glute-Ham Raise remains a draft with an updated full-range endpoint. Pistol Squat and the calf raise have since passed separate production reviews.

The [second new-conversion batch](pilots/new-conversions-02-20261003/README.md) adds Nordic Hamstring Curl, Hip Adduction Machine and Sissy Squat: another 18 native draft frames with catalogue-based sequences, source hashes and mobile playback evidence. All three were previously unconverted. Fixed-equipment drift is recorded, so the drafts remain outside production.

The [new-conversion batch](pilots/new-conversions-20261003/README.md) adds Cuban Press and Hip Abduction Machine: 12 native draft frames with plans, provenance and mobile playback evidence. Both were previously unconverted. They remain outside production pending the recorded anatomy/equipment findings; existing repair sets were left alone.

The reviewed Hanging Leg Raise, Plank and Crunches guides are now live on Firebase Hosting from commit `f527f68`. [Production verification](releases/2026-10-03/PRODUCTION_VERIFICATION.json) checks all 18 delivered frames and three thumbnails against local SHA-256 hashes.

The [Shrugs repair](releases/2026-10-03/SHRUGS.md) now adds a reviewed branch guide with fixed legs and reusable rigid equipment layers. Four fixed-body patches and nine visible equipment-face comparisons pass exactly; mobile playback passes in both themes. It is now live on Firebase Hosting from `1cf1f24`; [production verification](releases/2026-10-03/SHRUGS_PRODUCTION_VERIFICATION.json) confirms all six frames, the card thumbnail and the registry bundle match the reviewed local build.

The [forearm Plank release](releases/2026-10-03/PLANK.md) adds a reviewed
entry, timed hold and controlled exit, six lossless delivery files, exact cues
and a transparent card thumbnail. Its four measured arm supports stay within
the existing 1px limit. The full hold intentionally remains still.

The [Crunches repair](releases/2026-10-03/CRUNCHES.md) adds six reviewed
frames with fixed feet and pelvis through authorized layer compositing.
All five measured support patches now have zero drift. The original failed
draft is preserved separately, with its contact findings unchanged.

Hanging Leg Raise is now integrated as a reviewed production guide on this
branch. The [release record](releases/2026-10-03/README.md) covers six lossless
WebPs, seven-word cues, a reviewed card thumbnail and actual mobile playback.
The branch registry now contains **64 released sets** (55 approved, 3 owner-released
with findings, 6 historical sets needing review). Of the 141 in-scope exercises,
77 still have no released artwork.
Side Plank remains incomplete and excluded. The [local contact repair trials](pilots/side-plank-composite-20261003/README.md) fix vertical support drift but retain a measured fist mismatch; neither trial is approved. `inventory.json` reflects this
branch's current registry, not deployment status.

## Previous checkpoint — 2 October 2026

The live registry now contains **56 released sets**: 47 with recorded approval,
3 owner-released with findings, and 6 historical sets needing review. The
current integrity audit reports no errors and 165,641,054 delivered bytes.
`inventory.json` has been regenerated from `scripts/audit-form-art.ts --json`;
85 of the 141 in-scope exercises still have no released artwork. This count
includes exercises with existing drafts and is not a count of untouched work.

The [October continuation](pilots/continuation-20261002/README.md) adds a
six-frame Hanging Leg Raise draft using the canonical athlete, fixed-grip
measurements and mobile player evidence. Side Plank has a corrected setup
master but its raised candidates fail contact registration and remain
incomplete. Neither set is activated in production. The new complete draft is
included in `check:form-drafts` and the account-free review fixture.

The sections below record the original September migration checkpoint and
its release controls; their old coverage/byte totals are historical.

Recovered on 7 September 2026 from current main `ea6e786`. The earlier local
checkout and unpushed work were removed during workspace maintenance; this
branch rebuilds that work on top of the newer app fixes.

## Current coverage

- Catalogue: 152 exercises; 141 non-cardio exercises in this migration.
- Previously shipped: seven six-frame sets, 42 WebP images, 3,483,250 bytes.
- Ten new sets activated by explicit owner request, with review findings retained:
  dumbbell curl, hammer curl, front raise, goblet squat, push-ups, barbell
  back squat, barbell curl, dumbbell bench press, bodyweight squat and composited
  barbell shrug. Delivery: 60 WebPs, 3,364,280 bytes.
- Strict visual-review approvals: **zero new sets**. The distinct
  `owner-released-with-findings` status records release permission, not certified
  anatomy, equipment consistency or mobile playback. See `OWNER_RELEASE.md`.
- Lat pulldown and deadlift remain incomplete and excluded. Rejected shrug and
  replacement squat candidates remain excluded.
- `BATCH_REVIEW_MANIFEST.json` and the pilot reviews preserve the generation-stage
  checkpoint. Current release records under `releases/2026-09-owner/` bind the
  selected source PNGs, delivery WebPs and displayed cues by SHA-256.
- Original squat/cable pilot files were not recovered. Their earlier rejection
  notes are retained in `REVIEW_NOTES.md`; they are not released or counted.

## Player and release controls

- Six authored stills play in order, with no reverse pass or opacity crossfade.
- Pause/play, previous/next, slower playback, and cue selection.
- Only current and next frames mounted. Wait for both to load before advancing.
- Hidden/inactive guides suspend playback. Reduced motion exposes all six
  positions manually without autoplay or preloading.
- Failed images pause with an explicit retry, retaining a good current pose
  when the next image fails. No switch to the old rig on an image error.
- Exact exercise IDs and an explicit registry control release; no approximate
  variant matching. Existing sets retain their historical shipped state.
- Strict visual approvals require an evidence file tied to hashes of every image, the
  reference, and the displayed cues. Identity, camera, anatomy, equipment,
  contact, physics, muscle hierarchy, cue agreement, looping and both mobile
  themes all require review evidence. Measurements are not a substitute for
  reviewing anatomy and technique.
- Owner-authorized activation uses a separate evidence contract: explicit owner
  instruction, exact image and cue hashes, retained findings and unverified
  visual checks. It does not pass or alter the strict review validator.
- Cable scenes require a numerical payout/stack ladder, a routing ratio, and
  fixed selected/total plate counts before the prompt can be printed.
- Viewed artwork uses its own per-build cache, limited to 48 images and 24 MiB,
  with a 2 MiB limit per cached file. No pre-download of the full library.
  Quota failures do not prevent network images from displaying.

## Releasing a set

A release is its record and its cues. Nothing else is written by hand.

1. Deliver the six frames as `public/form-frames/<id>/1.webp` to `6.webp`.
2. Write the six cues in `src/lib/releasedFormPlacards.ts`.
3. Print a draft record with
   `node --import tsx scripts/create-form-art-review.ts <id> --version=<version> --reference=<1-6>`,
   complete the review, and save it as
   `docs/exercise-art/releases/<date>/<id>.json` with `"decision": "approved"`.
4. Run `npm run art:releases`. It writes the set's registry facts (version,
   canvas, reference frame, record) to `src/lib/formArtReleases.data.ts`
   from the record. Do not add the set to `src/lib/formArtwork.ts`.
5. Run `npm run art:cutouts -- --only=<id>` for its card thumbnail.
6. Run `npm run check:form-art` and `npm run test`.

When a set has more than one approved record, the newest review wins. Sets
released without a strict review (the older shipped sets and the owner
releases) are still listed by hand in `formArtwork.ts`; no new set joins them.

## Production commands

```sh
npm run check:form-art
npm run check:form-drafts
npm run art:releases
node --import tsx scripts/audit-form-art.ts --json
node --import tsx scripts/form-card-prompt.ts db-curl docs/exercise-art/scenes/db-curl.json
node --import tsx scripts/form-card-prompt.ts squat docs/exercise-art/scenes/squat.json
node --import tsx scripts/form-card-prompt.ts rope-tricep-pushdown docs/exercise-art/scenes/rope-tricep-pushdown.json
node --import tsx scripts/create-form-art-review.ts barbell-row
```

The review command prints an unapproved template. It never approves artwork.
Without `--version` it describes a set as released, for a re-review; with
it, the set is described from its delivered frames, for a new or
replacement set.
`inventory.json` is the full exact-ID queue. Plan status `reviewed` means the
written movement plan has been checked, not that any generated image is approved.

## Review the draft

`e2e/fixtures/form-art.html` mounts the real player without login or Firebase.
Its selector includes all seventeen shipped sets and all ten original draft previews; both themes,
manual cues and the newer sets' recorded findings are available. Batch frame
selection and cues come directly from the review manifest, avoiding a second
hand-maintained file list. Changing exercises resets the active cue. Run
`npm run dev -- --host 127.0.0.1` and open
`/Maiin/e2e/fixtures/form-art.html`. This fixture and the pilot PNGs are not
included in the production build.

The connected cloud browser rejected this local URL with `ERR_BLOCKED_BY_CLIENT`.
No fresh browser screenshot or mobile playback approval is claimed. Owner-authorized release is recorded separately; mobile playback review remains
outstanding.

## Size and delivery

Native PNG masters remain outside the shipping directory. The 60 new delivery
images use WebP quality 92, method 6, at their unchanged native canvases (1024×1536
portrait or 1536×1024 landscape). No per-frame crop, resize or re-registration is
applied. The total shipping artwork is 6,847,530 bytes across 102 images. The new
assets add 3.36 MB to both web output and native packages that include `dist/`.
The existing lazy loading and cache limits still apply.

See `DB_CURL_REVIEW.md`, `PRODUCTION_BRIEF.md` and `VALIDATION.md` for the pilot,
production rules and measured validation results.

The latest continuation is documented in `COMPOSITE_REPAIR_REVIEW.md`.

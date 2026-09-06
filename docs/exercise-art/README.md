# Exercise artwork migration

Recovered on 7 September 2026 from current main `ea6e786`. The earlier local
checkout and unpushed work were removed during workspace maintenance; this
branch rebuilds that work on top of the newer app fixes.

## Current coverage

- Catalogue: 152 exercises; 141 non-cardio exercises in this migration.
- Previously shipped: seven six-frame sets, 42 WebP images, 3,483,250 bytes.
- Newly approved replacement sets: **zero**.
- New work: nine complete six-slot **draft** sequences, outside `public/`:
  dumbbell curl, hammer curl, front raise, goblet squat, push-ups, barbell
  back squat, barbell curl, dumbbell bench press and bodyweight squat.
- Lat pulldown, deadlift and barbell shrug have rejected incomplete pilots.
- `BATCH_REVIEW_MANIFEST.json` records the eight newer sets; see
  `BATCH_REVIEW.md` and `BATCH_03_REVIEW.md` for candid review findings.
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
- New approvals require an evidence file tied to hashes of every image, the
  reference, and the displayed cues. Identity, camera, anatomy, equipment,
  contact, physics, muscle hierarchy, cue agreement, looping and both mobile
  themes all require review evidence. Measurements are not a substitute for
  reviewing anatomy and technique.
- Cable scenes require a numerical payout/stack ladder, a routing ratio, and
  fixed selected/total plate counts before the prompt can be printed.
- Viewed artwork uses its own per-build cache, limited to 48 images and 24 MiB,
  with a 2 MiB limit per cached file. No pre-download of the full library.
  Quota failures do not prevent network images from displaying.

## Production commands

```sh
npm run check:form-art
npm run check:form-drafts
node --import tsx scripts/audit-form-art.ts --json
node --import tsx scripts/form-card-prompt.ts db-curl docs/exercise-art/scenes/db-curl.json
node --import tsx scripts/form-card-prompt.ts squat docs/exercise-art/scenes/squat.json
node --import tsx scripts/form-card-prompt.ts rope-tricep-pushdown docs/exercise-art/scenes/rope-tricep-pushdown.json
node --import tsx scripts/create-form-art-review.ts barbell-row
```

The review command prints an unapproved template. It never approves artwork.
`inventory.json` is the full exact-ID queue. Plan status `reviewed` means the
written movement plan has been checked, not that any generated image is approved.

## Review the draft

`e2e/fixtures/form-art.html` mounts the real player without login or Firebase.
Its selector includes the seven existing sets and all nine drafts; both themes,
manual cues and the newer sets' recorded findings are available. Batch frame
selection and cues come directly from the review manifest, avoiding a second
hand-maintained file list. Changing exercises resets the active cue. Run
`npm run dev -- --host 127.0.0.1` and open
`/Maiin/e2e/fixtures/form-art.html`. This fixture and the pilot PNGs are not
included in the production build.

The connected cloud browser rejected this local URL with `ERR_BLOCKED_BY_CLIENT`.
No fresh browser screenshot or mobile playback approval is claimed. The new
set remains draft until this review is complete.

## Size and delivery

The six-slot curl draft uses five unique poses, with the mid-position reused on
return. Native PNG masters stay outside the shipping asset directory. Existing
shipped art adds about 3.5 MB to `public/`; none of these draft PNGs adds to the app
build. Cache limits control PWA storage, but do not by themselves reduce a future
Capacitor package containing every asset in `dist/`. Before bulk release, choose
compressed delivery assets and assess native-package inclusion separately.

See `DB_CURL_REVIEW.md`, `PRODUCTION_BRIEF.md` and `VALIDATION.md` for the pilot,
production rules and measured validation results.

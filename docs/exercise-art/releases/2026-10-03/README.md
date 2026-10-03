# Hanging Leg Raise release — 3 October 2026

The reviewed October draft now has production artwork for the exact catalogue
ID `leg-raise`. It depicts a straight-leg hanging raise, a brief controlled hold
at hip height, and lowering without a backward kick. Six separate WebPs use
three distinct poses in order **1, 2, 3, 3, 2, 1**. The sixth pose equals the
first, so the loop closes without a jump.

## Delivery and cues

All six WebPs are lossless exports at the original 1024 × 1536 canvas. Decoded
RGB bytes were compared against every source PNG and match exactly. There is
no per-frame crop, resize, re-registration or new anatomy edit. The set adds
3,437,788 bytes under `public/form-frames/leg-raise/`.

The draft instructions contained cues longer than the player's seven-word
reading budget. Production cues retain their meaning while fitting that limit:

| Position       | Production cue                                   |
| -------------- | ------------------------------------------------ |
| Hang and brace | Hang with straight arms; brace without swinging. |
| Begin raise    | Raise both straight legs without kicking.        |
| Reach parallel | Bring your legs level with your hips.            |
| Hold control   | Pause briefly; keep your torso steady.           |
| Lower slowly   | Lower both legs together under control.          |
| Return to hang | Return below your hips without swinging back.    |

The muscle key describes the visible purple rectus abdominis and pale
obliques. Hip flexors contribute to the exercise but are not drawn through
the body. The partial pose is not assigned an unmeasured joint angle.

`leg-raise.json` binds the delivered images, native sources, reference frame,
displayed cues, four fixed contact anchors and two invariant spans. Its
approval reflects native and mobile artwork review, not clinical certification.

## Card thumbnail

The third pose is the reference for a separate transparent card image.
`image_gen.imagegen` removed the background and long station uprights while
retaining the athlete's raised-leg pose and held bar. This is a reframed
thumbnail, not a pixel-identical replacement for the full form guide. Its
reviewed PNG and source binding are under `docs/exercise-art/cutout-sources/`.

The existing card export pipeline trims and scales that transparent input to
422 × 480 and encodes the WebP. It does not redraw the athlete. A targeted
export preserves every other released card and rejects stale source hashes:

```sh
npm run art:cutouts -- --only=leg-raise
```

Prepared cutouts require an explicit reviewed status, an exact reference hash,
an exact PNG hash, an exercise-local filename and actual alpha transparency.
The normal exporter still handles exercises without a prepared source.

## Validation

`evidence/` contains actual production-player screenshots at 393 × 852 in both
themes, including the thumbnail on each surface. The browser checks cover all
six delivered images and cues, byte-identical endpoint files and matching displayed endpoints, the
real loop timer, reduced-motion stepping, no overflow and no page errors.

The focused 207-test run passed, including the seven-word cue budget, release
contracts, all card hashes and the prepared-source rejection cases. Final
repository and browser-suite results are recorded in `VALIDATION.json`.

Side Plank remains excluded: its raised candidate still shifts the lower shoe
12px upward. The earlier rejected candidates and measured findings remain in
the October draft folder. This release does not activate that incomplete set.

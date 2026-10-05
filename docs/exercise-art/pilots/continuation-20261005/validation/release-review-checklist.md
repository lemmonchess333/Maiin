# Review requirements retained for this draft

This continuation remains an unreleased draft with findings. The existing release bounds and approval requirements are unchanged. This file records the requirements for a later review; it is not an approval record and does not substitute for measurements or actual player evidence.

## Exact review checks

`src/lib/formArtReview.ts` requires all 11 checks below, each with `passed: true` and nonempty evidence tied to the delivered set:

1. `identity`
2. `camera`
3. `anatomy`
4. `equipment`
5. `contact`
6. `physics`
7. `muscles`
8. `cueAgreement`
9. `sequenceAndLoop`
10. `mobileLight`
11. `mobileDark`

The review also requires the exact exercise ID, version and native dimensions, six ordered delivered paths and their SHA-256 hashes, a delivered reference frame with its exact hash, a real reviewer, a valid review timestamp and an approved decision. A generated template does not supply approval.

The aggregate cue hash uses the exact ordered player labels and cues:

```ts
sha256(JSON.stringify(cues.map(({ label, cue }) => ({ label, cue }))));
```

Per-frame cue-string hashes alone do not supply that aggregate. Canonical identity and master-image hashes belong in provenance; they are distinct from the selected delivered-reference hash.

## Native measurement contract

At least two genuinely fixed named anchors and two positive invariant dimensions must be present in frame 1, with the same names measured in all six delivered frames. Compare every frame against frame 1:

- Every named anchor's x and y coordinates must each differ by no more than **1 native pixel**. This is a per-axis bound, not a 1-pixel Euclidean-distance test. Coordinates must be finite and within the native canvas.
- Every invariant dimension must satisfy **`Math.abs(size / base - 1) <= 0.01`**, using unrounded measurements. The base and each measured size must be finite and positive.

The meaningful support pair for this exercise is the planted front heel and rear laces/instep on the bench. The existing registration diagnostic also tracks front toe, bench pad corner, two leg bolts, and two bench base corners. Retain all measured anchors; do not select only stable bench points to conceal a known foot-contact defect.

Two possible explicitly defined support dimensions are `frontShoeSupportSpan` (distance between front-heel and front-toe patch centres) and `benchFloorFootSpan` (distance between the near and far bench-base patch centres). They must be calculated from each final image's measured patch locations. These are projected separations of named image features, not physical shoe or bench sizes. Integer patch matching does not become subpixel-accurate because a Euclidean distance has decimal places.

Passing those support dimensions would not prove dumbbell rigidity. The recorded projected equipment variation needs its own honest equipment evidence; occluded handles and hidden endcaps must not be replaced with invented measurements. Structural minimums also do not establish clean ankle joins, anatomy, or suitable motion.

Any final native report must name and hash the actual selected files. Earlier raw-source or rejected-composite diagnostics remain useful history but cannot certify changed output bytes.

## Player evidence

The six slots use setup, shallow, deep, bottom, deep and shallow. Slots 5 and 6 reuse slots 3 and 2 with distinct ascent cues. Standing is completed by the actual **6→1** transition. Nominal progress values are `[0, 0.33, 0.67, 1, 0.67, 0.33]`; these are planned progress values, not measured joint-depth fractions.

Execute the existing three Bulgarian checks in `playwright.form-art.config.ts`: the six-frame loop in both themes and reduced-motion/manual stepping at 393 × 852. Inspect the actual player images and interactions. Test discovery, a native contact sheet, a GIF, and successful non-browser verification do not establish this evidence. The current environment blocker is documented in `browser-blocker.md`.

## Existing generator workflow for a future approved delivery

Only after the actual review evidence supports promotion:

1. Deliver the six native-canvas WebPs under `public/form-frames/bulgarian-split/` and author the six released placards. Do not silently crop or resize reviewed motion frames.
2. Use `node --import tsx scripts/create-form-art-review.ts bulgarian-split --version=<new-version> --reference=<1-6>`. A new set requires `--version`; without it the script describes an existing registered set for re-review. The generated template remains a draft.
3. Complete an actual review record under `docs/exercise-art/releases/<date>/bulgarian-split.json`, with the exact delivered hashes, cues, native measurements and 11 checks. Do not author approval before the evidence exists.
4. Run `npm run art:releases`. The generator selects approved records by review timestamp and writes `src/lib/formArtReleases.data.ts`; do not hand-edit that generated release registry.
5. Run `npm run art:cutouts -- --only=bulgarian-split` for the separate card artwork derived from the selected reference, then inspect it in both themes. Its trimmed and padded 480-pixel-long-side output does not replace the six reviewed motion frames. The generator supports a prepared reviewed transparent source; any black-key processing must also be inspected.
6. Run the existing released-player checks and the full `npm run verify` gate against the final delivery.

Draft-only native and browser findings belong in this pilot directory. They must remain outside the released registry and must not increase released coverage.

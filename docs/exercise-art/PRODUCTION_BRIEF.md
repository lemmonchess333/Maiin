# Canonical six-frame exercise artwork brief

Use one canonical athlete: `docs/exercise-art/identity/athlete-anatomy-v3.png`.
The owner reverted the shorts requirement on 21 September because it hides leg
muscles. Preserve the original bald faceless white/light-grey anatomical style,
full thigh/hip visibility, fine dark contours and consistent white trainers.
The pelvic centre must remain smooth, neutral and featureless, with no genital
detail, central slit, underwear outline, waistband or garment seams.

Derive one exercise master from this global athlete. Save it at
`masters/<exact-exercise-id>/1.png`, and attach BOTH images to every frame edit.
An adjacent pose is supplemental. The one-person rule remains unchanged.
Exercise-local plans and provenance records record candidate status; the older shorts masters
are superseded and must not seed new frames. Historical artwork remains available
pending identity/mechanics review; no blanket regeneration approval is implied by
an automated integrity check.

1. Identify the exact catalogue exercise and variation, equipment, primary and
   secondary muscles, stabilisers, camera and visible movement plane.
2. Author six named movement beats and the actual physical body/equipment state
   of each beat before generation. The app and images must teach the same
   exercise. Never stretch four catalogue instructions into a guessed six.
3. Choose a camera that shows the important joints and both grips. Keep it fixed
   within the set: no left/right flips, zoom changes or perspective changes.
   Maintain one canvas, crop, scene scale, lighting and floor reference.
4. Build one master and inspect it. Derive adjacent positions by editing the
   nearest acceptable existing pose, moving only the joints and equipment that
   physically need to move. Fixed regions must retain their original geometry.
5. Keep equipment real: rigid bars, equal modest plates on each side, identical
   dumbbells, constant attachments and grip widths, hands attached throughout.
   Use one modest illustrative barbell plate per side unless the exercise's
   written setup requires otherwise. No enormous or inconsistent displayed load.
6. Cable travel must match selected-stack lift for the actual routing ratio.
   Selected plates move together; unselected plates stay on the base. Keep
   plate counts, plate thicknesses, pulley position and cable routing constant.
   A handle's vertical pixel position alone does not determine cable payout.
7. Primary muscles use the strongest purple, secondary muscles lighter lilac,
   stabilisers subtle pale purple only where useful. Colours communicate a
   qualitative contribution hierarchy, not measured activation. Keep it stable
   across frames; do not dim everything on return, inflate muscles, obscure
   anatomy or highlight unrelated areas.
8. Produce six separate full-resolution image files, not a collage or grid
   cropped and enlarged. No anatomy blur, painterly texture or compression
   artefacts. Matching joint configurations on the outward and return portions
   may reuse the same pose, with the appropriate cue rendered by the app.
9. App masters contain no text; the player renders an accessible caption and the
   cue list beneath it. Standalone captioned exports, if needed, use one bold
   uppercase white caption, centred consistently at the bottom: FRAME NAME N/6.
   No legends, extra instructions, borders, arrows or mock app UI in the image.
10. Review all six together and in actual sequential playback, including 6→1.
    Reject shifting anchors, changing anatomy/scale/equipment, broken grip,
    impossible machine physics, wrong sequence, colour drift or poor sharpness.
    Reject, too, a set that fails any of the three card checks in step 12.
    The sixth beat normally shows controlled return, unless the exercise's
    written sequence legitimately ends at its starting position.
11. Keep candidates outside `public/` until review passes. Record image/reference
    and cue hashes, named fixed anchors, invariant dimensions, technique checks
    and mobile light/dark evidence. Any asset or cue edit invalidates approval.
12. Check the set against the library, not only against itself. Its card
    cut-out (`npm run art:cutouts`) sits beside other sets' on Home's Today
    card, Train's rows and the finish screen, so a new or regenerated set must
    arrive normalised:
    - **One highlight purple.** The primary muscles are one purple in every
      set, with the secondary lilac and the stabiliser pale purple as its
      tints. A set whose primary purple is not the library's is rejected, not
      graded. The released library does not meet this yet: its primary purple
      runs from #4e40c7 to #8d3db6, about half each, and the regeneration pass
      that normalises it fixes the one value and writes it into this item.
    - **A shared bounding box.** The athlete is drawn at one scale across the
      library: the same head-to-sole height for a standing figure at the same
      camera distance, never enlarged or shrunk to fill a canvas. Released
      figures run from 220 to 371 px tall within one card, so one lift reads
      as a bigger person than the lift beside it.
    - **No ground.** Nothing is drawn under the athlete: no floor line, mat,
      plinth, cast shadow or reflection. The card and the guide's stage are
      the ground. Two released sets carry a baked-in ground.

    Record the evidence under the release record's `muscles` check (the
    purple) and `camera` check (the scale and the ground). The validator's
    eleven checks are unchanged, so every existing record stays valid: these
    criteria apply to a set when it is next drawn, and are not by themselves
    a reason to regenerate one.

For a sequence with changing floor contacts, the release record may declare
`contactPhases`: named groups of at least two one-based frame numbers, each
with its own `referenceFrame`, at least two `anchorNames` and two
`dimensionNames`, and evidence explaining which physical contacts remain
fixed. Measurements stay in each frame's `anchors` and
`invariantDimensions`; the same one-pixel/one-percent limits apply within
each group. Groups may overlap (for example, palms and toes).
Every frame must belong to a measured contact group or appear once in
`airborneFrames`, with a `frame`, measured `takeoffFrame` and `landingFrame`,
and evidence of ground clearance, consistent body scale and the landing
transition. Airborne frames cannot also claim planted contacts. This does
not replace native anatomy/camera review or either mobile review. Existing
records without phases retain their all-frame measurement requirements.

Cost rule: inspect each pilot before buying its adjacent frames. Reuse identical
poses when mechanically appropriate. Stop repeating a failed generation method;
record the specific failure and change the method before another batch.

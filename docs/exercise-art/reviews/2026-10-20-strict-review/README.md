# Stricter review of the remaining 33 exercise sets

Reviewed against canonical FA56 `fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b`, from clean baseline `a97944f5d8a6350d114e18bba2a18bb1d243ae35`.

**31 sets now pass the existing strict visual/evidence contract; two retain owner release with findings. Eight sets were improved.** The 11 checks, maximum 1 px anchor drift per axis, and maximum 1% invariant-dimension drift are unchanged. No validator, timeout, test-runner, palette or athlete standard was relaxed. Strict visual review does not require or imply calibrated 3D/manufacturer certification. Each release binds six current encoded frame hashes, exact cues, dimensions, reference and real measured physical landmarks.

## Corrections

| Set                | Change                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lu Raise           | After direct owner feedback, replace all four physical poses with complete drawings authored directly from FA56; outward lateral arc now reaches fully overhead. Update cues/preparation/Deltoids–Traps legend and derive the normal card from overhead frame 4. |
| Leg press          | One modest disc replaces the original three-disc load on the existing double-beam lever; athlete and all other native layers remain exact.                                                                                                                       |
| Rowing machine     | Preserve the original fixed support pods while athlete, seat, chain and pedals continue moving.                                                                                                                                                                  |
| Overhead extension | One uniform whole-source camera correction fixes stance/scale drift; no individual anatomy fitting.                                                                                                                                                              |
| T-bar row          | Replace the load with one compact native cast disc, collar and closed sleeve; preserve both complete athlete poses and grips.                                                                                                                                    |
| Stationary bike    | Stabilise only the original floor pods; preserve all athlete and pedal regions.                                                                                                                                                                                  |
| Barbell row        | Small uniform whole-source framing corrections; actual heels and independent outer-sole spans now meet limits.                                                                                                                                                   |
| Dips               | Stabilise only the original floor pods; preserve athlete, hanging feet, grips and bars.                                                                                                                                                                          |

Same adult pale faceless anatomy athlete, original white trainers, smooth featureless pelvis, **no shorts**. Primary `#7B72E9`, secondary `#9590E0`, grey apparatus, inherited native contours and shading. No anatomical warps, individual limb fitting, or isolated head/shoe grafts.

## Lu Raise technique and source

The owner-rejected old sequence stopped in a broad high V and mixed an older illustration style. The replacement follows [Lu Xiaojun's actual training footage](https://www.youtube.com/watch?v=J7zEP4WujbQ), played and inspected at starting/lateral/overhead phases, with [Catalyst Athletics' overhead lateral raise coaching text](https://www.catalystathletics.com/exercise/865/Overhead-Lateral-Raise/). Lu demonstrates plates; this catalogue entry remains its dumbbell variation. The embedded Catalyst coaching video was not reviewed.

Four intact image-authored native poses, one call each, play A/B/C/D/C/B. A is padded at 1:1; B/C/D have the whole preview zoom undone uniformly. Only B then receives a uniform whole-source camera refinement. The pigment operation changes existing violet pixels while retaining original lightness/shading and neutral contours. No new gradient or anatomical composites. Both actual heel features drift at most 1 px; two independent trainer spans drift at most 0.686852%. Four genuine discrete poses are not represented as continuous interpolation.

`lu-raise/four-pose-review.png`, final native measurements, actual registered light/dark stage/card captures, all-six decoded frame observations, normal/slower timed loops and manual wraps are retained. `source-comparison.json` is the pre-redraw diagnosis, resolved by this release. The old held approval/panels are not current approval evidence.

## Evidence and limits

All 33 current native six-frame sheets were visually reviewed. Genuine material shoe contours, physical equipment corners, floor mounts and wall junctions were measured. Ambiguous toe matches, an occluded handstand wall corner, featureless padding and finger brightness masks were rejected rather than used to force a pass. `measurements.json` preserves those exclusions. The dedicated visible-wall and independent barbell-row sole measurements supply valid replacements. `uniform-camera-refinement.json` contains the final overhead-extension matrix; the earlier least-squares `whole-source-registration.json` is diagnostic history.

Current production player observations cover the sets shown in `mobile-observations/`. Source/stage review and prior actual registered all-six light/dark reviews are retained where the artwork/movement is unchanged. Later batched browser screenshots became stale/blank: failed captures of bench/calves are excluded, and no fresh complete 33-set mobile run is claimed. Dips has separately settled current captures. Lu has fresh registered current all-six/player evidence and settled screenshots in both themes. Existing bench jump and synchronised calf heel/body timing fixes remain intact.

The initial staged fixture changed frame paths without the corresponding thumbnail source metadata. Its generic fallback thumbnails are **not card proof**. Final registered `ExerciseThumb` galleries in `lu-raise/registered-eight-*-cards.png` show all eight corrected sets in the three normal sizes in both themes. `final-card-binding.json` reproduces the normal cutout recipe byte-for-byte and binds its current source/card hashes. Production resolver behaviour was not weakened to accommodate the temporary fixture.

Small illustrative contour/projection differences, discrete held/reused poses and established low contrast of tiny white details on light cards remain disclosed. These are visual illustrations, not a biomechanical or manufacturer engineering certification.

Two sets retain honest owner-release findings:

- **Swimming:** two fixed material scene anchors and two invariant physical dimensions have not been established. Treating waterline/canvas boundaries as material landmarks would be false.
- **Turkish get-up:** supports change through back/elbow/hand/knee/standing phases; the required comparable physical anchors/dimensions across actual phases have not been established. Their original findings remain; no invented grounded phases are added.

These are evidence limitations, not a requirement to rebuild the library in 3D. The library has 150 strictly reviewed sets and these two owner-released guides, all 152 still available.

## Reproduction and checks

Each of the eight changed sets has a portable `native-source.zip` under `docs/exercise-art/sources/<id>/2026-10-20-strict-review/`, containing frozen inputs, canonical reference, native editable layers and a portable reproduction entry point. `archive-reproduction.json` records a fresh extraction and independent reproduction of all 48 encoded WebPs, each byte-exact to public delivery. Earlier two-directory export comparisons are also retained. `final-card-binding.json` separately checks all eight normal cards.

Review scripts ending in `.txt` are provenance snapshots, not runtime code. `publish-reviewed.py.txt` is an intermediate publication snapshot superseded for Lu by the final release and source archive; do not rerun it over the final registry. The test fixture was retired before project lint/build/tests.

The complete normal `npm run verify` is measured on the clean baseline and frozen committed candidate. The baseline index/result are included in `project-checks/`; candidate results and comparison are retained in the task checks and reported in the PR. No reduced timeout/concurrency/skip configuration is used. Baseline failures are described only when directly measured, never assumed.

# Native contour and projection follow-up

The owner requested a further correction pass after all 152 sets reached the
unchanged strict review standard. The previous broad contour/projection
disclaimer was not a list of 33 independently identified faults. This pass
inspected all six current frames of those 31 sets plus swimming and Turkish
get-up on the nine retained review sheets, then inspected the documented
joins and suspect apparatus at native size.

Three concrete cosmetic issues were corrected:

| Set                       | Correction                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Face pulls                | Finish the existing secondary back fields with the same lilac base and source pixel value. Pale interior gaps no longer interrupt the muscle fields. The neutral spine, open anatomical borders, primary shoulder contours, silhouette, grips, cable and machine are retained. |
| Incline dumbbell curl     | Remove the small stepped shoulder edge in the raised near-arm state. The native 37 by 18 correction retains same-coordinate fixed shoulder pixels beneath a continuous antialiased edge. The actual working arm and dumbbell are untouched.                                    |
| Overhead tricep extension | Reuse one complete native 86 by 171 round dumbbell master, including both discs and shaft, at integer offsets behind the original hand/forearm foreground. The load no longer changes its construction between positions.                                                      |

Fourteen delivered files change across the three six-frame sets; four incline
curl hold/return files remain encoded-byte exact. The existing cue text,
physical pose order, camera, canvas and playback modes are unchanged. There
was no new athlete generation, body fitting, anatomical warp, head/shoe graft,
new palette or additional spatial body gradient. The canonical FA56 athlete,
original trainers, primary `#7B72E9`, secondary `#9590E0`, smooth featureless
pelvis and **no shorts** standard remain in force.

No additional actionable silhouette breaks, detached contour fragments or
inconsistent rigid-load construction were identified in the other 30 reviewed
sets. Normal foreshortening and muscle outlines changing with joint angle are
part of the existing pose drawings. Their historical authoring findings remain
available; they are not a new outstanding repair list. This pass does not claim
identical pixels in different anatomical poses, calibrated three-dimensional
reconstruction or continuous animation.

## Evidence

- `prepared-proof.json` binds every original/current frame and the actual
  changed pixels, native bounds and method.
- `fixed-material-proof.json` verifies the original 17 by 17 material anchor
  patches and entire measured apparatus/support regions are decoded-pixel
  exact. Existing physical coordinates and independent invariant dimensions
  remain valid. The one-pixel/one-percent strict limits are unchanged.
- Each new `sources/<id>/2026-10-20-contour-polish/native-source.zip` contains
  frozen complete original images, correction layers, two reopened native
  OpenRaster editables, the canonical reference and portable `reproduce.py`.
  Fresh extraction and independent reproduction match all 18 encoded files
  exactly; `archive-proof.json` binds the archives.
- `mobile/observations.json` records actual staged and registered production
  player observations at 390 by 844, all six decoded paths, manual wrapping,
  normal/slower playback, both themes and normal `ExerciseThumb` cards.
  Registered settled stage/card screenshots are the final visual evidence.
  The stage screenshot API fits the 390 by 844 CSS viewport to a native
  380 by 822 raster; those returned pixels are preserved without resizing.
  The separate registered card gallery has a 390 by 844 returned raster.
  `timed-loop-proof.json` extracts a complete six-slot cycle and wrap in each
  guide at the unchanged normal 1200 ms and slower 2400 ms player timers.
- `project-checks/` preserves the initial clean `f9eb8107` baseline and the
  original artwork candidate's successful local build, bundle-size check
  and focused tests. Main subsequently advanced to `d41b9d95`, including new
  app code and a dependency. After exact `npm ci`, that clean main was
  measured again: all 2,803 runtime inputs stayed frozen and the normal
  verification reached the same `python3` Microsoft Store launcher stop,
  exit 9009, with an identical raw verification log. The independent raw
  current-main records and input manifests are byte-preserved in
  `project-checks/current-main-baseline.zip`, indexed by the adjacent JSON.
  Current main was integrated normally; all reviewed frame/card bytes remain
  unchanged. The final frozen combined candidate is run through the same
  command and unmodified full Linux CI verification before merge. No local
  full green run is claimed.

The existing strict validator, artwork tolerances, tests, CI commands, timeouts
and skips were not weakened. These corrections preserve all 152 strict sets.

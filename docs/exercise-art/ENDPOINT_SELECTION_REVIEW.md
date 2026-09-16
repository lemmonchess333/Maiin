# Saved-draft endpoint selection, 16 September 2026

Base: `0858348cede106a98992fd1a25de84a00806c13b`.
The full baseline batch manifest was reconstructed locally and matched Git
blob `85b7b7e4b090077a69114f2dcd9c256ecf76f5d5` before any edit. The RDL
endpoint fix from #2348 is preserved, as are all 17 production registrations.

## Changes

- Single-arm row: exclude and preserve the former extreme top; use a brief
  hold at the preceding original position, then lower and return to the
  original hang. This is a **reduced-range review candidate**, not completion
  of the full-range endpoint repair. Six paths contain three distinct poses.
- Seated dumbbell shoulder press: frame 6 now shows the exact original
  shoulder-height setup, not an unfinished lowering position. Frames 1-5
  are unchanged. Native canvas remains 1024 by 1536.
- Incline dumbbell press: frame 6 now shows the exact original extended-arm
  setup, matching the finishing cue. Frames 1-5 are unchanged. Native canvas
  remains 1536 by 1024.

The two presses still have four unique positions and a larger 5-to-6 step.
These are instructional stills, not smooth interpolated animation. Existing
press-depth, wrist/equipment, limb-proportion and motion-spacing findings
remain open. No exercise is promoted and no strict review is marked passed.

## Integrity and verification

All 30 selected originals from the five-set source archive were decoded and
checked against their native dimensions, byte counts and SHA-256 after the
local selection changes. No delivered frame is cropped from a contact sheet.
The row builder was verified against the old selection before editing and
against the new selection afterwards; it reproduces the existing PNG bytes.

Seven regression cases pin the three affected endpoint sources, preserve
intermediate motion, exclude the old row extreme, and bind the row
measurements to the manifest. The real-player light/dark cases compare the
actual displayed start/finish pixels for all five reviewed sets; the row's
hold is also checked as identical displayed pixels in slots 3 and 4.

The local sandbox still cannot resolve github.com, so no fresh local full
repository verify or browser pass is claimed. Exact-head CI, source export,
player review and emulator results must be checked before merge. Green
code/browser checks are not evidence of approved anatomy or a phone build.

Current-chat generated infographics were rejected. Any dates, PR numbers,
merge claims, colours or characters inside those outputs are not repository
evidence. None of those generated outputs is included in this change.

No workflow permission, production image registry or release gate changes.
Tracks issue #2333; the full-range row repair and other technique findings
remain unfinished after this selection checkpoint.

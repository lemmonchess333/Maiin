# Approved card-illustration polish

The owner approved the previewed movement-card selections and relaxed easy-run
direction, asking for further review and improvement before use.

- Dead bug and bicycle crunch cards now use their existing released frame 2,
  showing the opposite-limb reach and torso turn instead of neutral tabletop.
  Their six-frame guides, captions, and release records are unchanged.
- Easy run retains the white/gray fine-contour anatomy and purple/lilac muscle
  palette, but uses a more upright, compact jogging silhouette. Fast run is
  unchanged. No card layout, token, component, dependency, or asset count changed.
- The first transparent candidate had stray colored edge pixels. Image-generation
  refinement produced a clean black-background source, then the existing cutout
  pipeline trimmed/padded it and generated the 232×480 transparent WebP. Source
  and output hashes are recorded in the existing provenance/manifest files.

Visual review checked the complete figure and final isolated assets at 48, 96,
136 pixels on light/dark backgrounds. All limbs/shoes remain visible; relaxed
and faster running read distinctly at run-card sizes. The white anatomy remains
subtle on light backgrounds, consistent with the existing library. This is an
illustration review, not biomechanical certification. It does not establish
an ideal running technique for every person.

Actual React-card browser capture was attempted but Chromium could not open a
process socket in the execution sandbox, including the approved escalated run.
No mobile browser playback or full-app screenshot pass is claimed by this review.

The three shipped WebPs together are 5,814 bytes smaller than before; the source
JPEG is also smaller. No generated draft or contact sheet is bundled in public.

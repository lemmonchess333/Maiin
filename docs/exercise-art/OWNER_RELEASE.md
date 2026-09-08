# Owner-requested artwork activation

After PR #2179 merged the player and draft archive, the owner explicitly said
“Merge the new artwork”. This release activates the ten complete selected sets,
including the composited shrug. It adds sixty separate WebPs and their exact
six-beat cues to the production registry. It preserves the seven older guides.

The owner instruction is release authorization. It is not evidence that anatomy,
equipment dimensions or mobile playback passed visual review. A distinct
`owner-released-with-findings` state retains that distinction. The existing
`approved` validator and all of its passing-evidence requirements are unchanged.

Each record in `releases/2026-09-owner/` binds the version, canvas, reference,
ordered delivery files, original PNG provenance and displayed captions/cues.
The audit rejects stale files or cues; tests verify source provenance and keep
owner permission separate from a strict passing review. All eleven visual
checks remain unverified, and the original findings are retained verbatim.

## Delivery and selection

- Eight portrait sets at 1024×1536; push-ups and dumbbell bench at 1536×1024.
- WebP quality 92, method 6; native canvas retained without cropping or resizing.
- New files: 3,364,280 bytes; total artwork: 6,847,530 bytes (102 frames).
- This adds 3.36 MB to a native package that bundles the full `dist/` directory.
- Mid/early outward poses reused on return remain separate ordered files.
- Barbell squat frame 3 is captioned “Continue descent”, avoiding an unmeasured
  assertion that the illustrated thigh is precisely parallel.
- Incomplete lat pulldown and deadlift are excluded. Unselected squat, hammer
  equipment and original generated shrug candidates are also excluded.

## Outstanding findings

Hammer-curl weights appear smaller in the middle poses. Goblet dumbbell extent
changes with depth. Barbell curl grip, upper-arm length and plate silhouettes,
dumbbell bench alignment, push-up hand registration, and squat foreshortening
still need detailed review. The bodyweight squat's middle and bottom positions
are close. Shrug joins use deformation and feathering; the entire pelvis is
not pixel-locked. These findings are recorded per exercise.

The delivered sequence overviews were visually inspected. This is not a
replacement for full-resolution anatomical review or actual mobile playback.
The cloud browser previously rejected the local fixture with
`ERR_BLOCKED_BY_CLIENT`; no light/dark playback pass is asserted.

The added sixty cues and ten exact-ID entries increase the ExerciseFormContent
JavaScript chunk from its budget baseline of 159693 to 168345 bytes.
Only this chunk allowance and the matching total are updated; the 5% growth
threshold and all other chunk allowances remain unchanged.

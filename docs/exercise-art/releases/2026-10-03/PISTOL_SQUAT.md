# Pistol Squat release — 3 October 2026

The previously repaired Pistol Squat sequence now passes native full-pose, ankle-transition and production-player review. The working shoe remains fixed through descent and return; the free leg stays extended off the floor. The existing local calf transition joins the generated lower leg to the fixed shoe without a visible double edge. No additional image generation was needed for this release.

Six lossless1024×1536 WebPs and a transparent464×480 card are registered with the six original catalogue-based cues. The sequence is standing balance → halfway descent → controlled depth → hold → upward drive → standing return. Coverage becomes64 of141 guides.

- [Review and delivered hashes](pistol-squat.json)
- [Exact lower-shoe measurements](PISTOL_SQUAT_MEASUREMENTS.json)
- [Nine passing browser checks for this release and the updated drafts](pistol-ghr-evidence/BROWSER_VALIDATION.json)
- [Original fixed-contact construction](../../pilots/repair-new-conversions-03-20261003/README.md)

The same continuation adds a [full horizontal Glute-Ham Raise endpoint](../../pilots/glute-ham-full-range-20261003/README.md). That set remains outside production while knee/pad contact and pad profile consistency are reviewed.

Full `VITEST_MAX_WORKERS=4 npm run verify` runs before handoff. GitHub's required unit job gates merge and the production workflow deploys the merged release. Dependency files remain unchanged; the previously measured main-branch audit findings are outside this artwork change.

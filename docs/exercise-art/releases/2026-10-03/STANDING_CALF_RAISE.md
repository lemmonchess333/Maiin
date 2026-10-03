# Standing calf raise reference correction — 3 October 2026

The owner supplied an upright standing calf machine reference after the earlier work targeted Donkey Calf Raise. Calf Raise and Standing Calf Raise now receive the intended shoulder-pad variation: upright torso, forefeet on an elevated step, lowered heels, controlled rise, top hold and slow return.

Both catalogue entries share the reviewed six-pose delivery sequence through their own asset paths and cues. The release adds12 lossless1024×1536 WebPs and two transparent320×480 cards. No exercise names or catalogue instructions change. Coverage becomes63 of141 guides.

- [Calf Raise review](calf-raise.json)
- [Standing Calf Raise review](standing-calf-raise.json)
- [Generation, native sources and composition](../../pilots/standing-calf-reference-20261003/README.md)
- [Six passing browser checks](standing-calf-evidence/BROWSER_VALIDATION.json)

Native scene review and both mobile themes passed. Full `VITEST_MAX_WORKERS=4 npm run verify` runs before handoff; the required GitHub `unit` job gates merge and the existing production workflow handles deployment. The dependency audit already reports identical findings on main's unchanged package files (six high, eleven moderate); this artwork release does not modify dependencies or audit policy.

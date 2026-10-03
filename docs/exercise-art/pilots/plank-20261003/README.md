# Plank source artwork

Two native poses authored from `identity/athlete-anatomy-v3.png`: the full
forearm hold is the exercise master and frame 3; a lower-body edit gives the
knee-supported entry/exit in frame 1. Six separate files use the explicit
order `1, 1, 3, 3, 3, 1` because setup/bracing and alignment/holding share
joint configurations. This is a timed hold, not six repetitions.

The plan defines intended and fixed movement before generation. Provenance
binds that plan, the canonical athlete, the exercise master and all source
files. The registration script reads pixels only; it does not repair images
or grant approval.

```sh
node docs/exercise-art/pilots/plank-20261003/measure-registration.mjs
```

The delivered assets, native/mobile review and checks are documented in
[the Plank release](../../releases/2026-10-03/PLANK.md).

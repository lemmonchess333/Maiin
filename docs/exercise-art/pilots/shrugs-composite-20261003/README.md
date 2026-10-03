# Shrugs fixed-leg repair candidate

This continues the exercise-art work after the Crunches release. It is **not released** and changes no production registry, card or guide.

The user authorized code-based layer compositing for fixed-contact repairs. `build.mjs` pins the three original source hashes, copies the setup legs and feet below row 860, and uses a 20px smooth join from rows 840–860. The original upper body and equipment above row 840 remain pixel-identical. There is no scaling or warping. Six native PNGs use pose order 1,2,3,3,2,1.

Both sole patches and both knee patches now have zero translation and zero mean RGB difference. The entire fixed region is checked channel-by-channel against setup; the unchanged moving region is checked against each original pose. Original failed candidates remain intact under `../parallel-twenty/shrugs/`.

Native join crops were inspected at 2×. The blend removes the previously measured leg/foot drift, but the narrow thigh join still needs full sequential review. The pelvis above the repair boundary remains independently drawn. This is deliberately a partial repair, not an approval claim.

## Equipment diagnostic

`measure-equipment.mjs` segments the front caps using neutral-grey pixels, a 5×5 erosion to remove thin anatomical outlines, and the largest connected component in each fixed region. An initial un-eroded diagnostic attached thigh contours to the right cap and was rejected. The final eroded footprints are:

| Pose     | Screen-left cap | Screen-right cap |
| -------- | --------------- | ---------------- |
| Setup    | 77×87           | 80×90            |
| Midpoint | 76×87           | 79×89            |
| Peak     | 76×87           | 82×90            |

These are screen-space, threshold-dependent interior footprints, **not physical dumbbell dimensions**. The right-cap width differs by up to 3px across poses. That result cannot certify rigid equipment or be used to approve the guide. The source images also vary their bevel and face shading. The next repair must preserve a consistent dumbbell-and-grip layer while moving it with each straight arm; do not redraw the whole scene or promote this set from sole registration alone.

## Reproduction

```sh
node docs/exercise-art/pilots/shrugs-composite-20261003/build.mjs
node docs/exercise-art/pilots/shrugs-composite-20261003/measure-fixed-supports.mjs
node docs/exercise-art/pilots/shrugs-composite-20261003/measure-equipment.mjs
```

`composition.json`, `fixed-support-review-20261003.json` and `equipment-diagnostic.json` retain `releaseApproved: false`. Coverage remains 59/141.

The later `shrugs-rigid-20261003` repair resolves the equipment findings in separate assets; see `docs/exercise-art/releases/2026-10-03/SHRUGS.md`. These historical sources and measurements remain unchanged.

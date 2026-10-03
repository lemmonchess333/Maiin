# Crunches fixed-contact repair

User authorized code-based layer compositing to preserve fixed feet and pelvis. Run `node docs/exercise-art/pilots/crunches-composite-20261003/build.mjs`, then `node docs/exercise-art/pilots/crunches-composite-20261003/measure-registration.mjs`.

The three original poses remain unchanged in `../continuation-20261003/crunches/`. The compositor pins their hashes, copies the setup lower body, and follows the pelvic boundary with a 20px smooth blend. No warping or scaling. A preliminary vertical join showed a doubled abdominal outline and was replaced before release.

All five measured supports now have zero drift and zero RGB difference. Fixed and moving regions outside the join are checked channel-by-channel. These are key poses, not equal-angle samples. Composition metadata deliberately does not grant release approval; see `../../releases/2026-10-03/crunches.json` for the independent release record.

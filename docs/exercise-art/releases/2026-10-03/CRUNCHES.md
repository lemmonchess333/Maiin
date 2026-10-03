# Crunches repair and release

The bent-knee floor crunch now has six reviewed delivery frames using the canonical anatomical athlete. Original generated poses failed fixed-contact limits; the user authorized code-based compositing to preserve feet and pelvis. Those original files and findings remain intact.

The repaired sequence uses three key poses in order `1,2,3,3,2,1`: setup, begin curl, lift shoulders, pause, lower and return. These are unevenly spaced instructional poses, not equal-angle animation samples. Hands rest behind the head; the shoulder blades rise while lower back and feet remain down.

The reproducible compositor in `../../pilots/crunches-composite-20261003/build.mjs` pins source hashes, copies the setup lower body and uses a 20px smooth blend along the pelvic boundary. It asserts exact RGB equality outside the join in both preserved regions. Five support patches have zero translation and zero channel difference. Two shoe support spans stay invariant. A preliminary vertical blend showed a doubled outline; the reviewed curved join removes that defect without warping or scaling.

Six native 1536×1024 lossless WebPs total 3,508,792 bytes and decode identically to the repaired source PNGs. The card is a separately reviewed transparent derivative, exported at 480×227. The initial direct-keyed card retained floor shadows and was rejected. The replacement is bound to the reference frame and its own source hash in `../../cutout-sources/crunches.json`.

Mobile review covers light and dark themes at 393×852, all six cues and assets, manual stepping, real 6→1 playback, endpoint equality and reduced motion. Evidence is under `crunches-evidence/`; `crunches.json` binds the artwork and cues; `CRUNCHES_VALIDATION.json` records repository verification.

This is a branch integration, not a deployment. Coverage is 59 of 141 exercises; 82 still lack released artwork. Side Plank and Shrugs retain their existing unresolved findings.

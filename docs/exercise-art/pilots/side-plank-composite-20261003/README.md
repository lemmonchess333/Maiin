# Side Plank contact repair trials — 3 October 2026

Both trials remain unapproved and outside `public/`. The original setup and failed raised pose are preserved in `../continuation-20261002/side-plank/`; `build.mjs` pins their SHA-256 hashes before processing.

Run from the repository root:

```sh
node docs/exercise-art/pilots/side-plank-composite-20261003/build.mjs
```

The first trial transplants the setup forearm and shoes, blending the joins into the raised pose. This makes the measured support rows match (forearm 797, lower shoe 820), but native review rejects the doubled calf contours and a stray torso fragment near the arm boundary. Correct contact rows alone do not make an acceptable guide.

The second trial translates the raised pose's contact layers: forearm (-4, +4) px, shoes (0, +12) px. Spatially resampled joining regions avoid the doubled silhouettes. The calf and forearm contours now remain continuous, and both measured contact rows match the setup. However, the fist's rightmost foreground point in the recorded ROI is x364 versus setup x370, a remaining 6px difference. These clipped bounds are a diagnostic, not a measurement of total limb dimensions or proof of fixed hand contact.

Next repair must retain the setup forearm/hand geometry with an anatomically continuous elbow join, then validate the shoe shape and limb dimensions across poses. Do not promote the translated trial merely because the two vertical measurements pass. Six-beat sequencing, invariant-dimension review, mobile light/dark playback and release evidence are still outstanding. No new generation was purchased for these trials.

# Production deployment — 3 October 2026

User requested deployment and continued artwork work. The six-commit artwork branch was ahead of main with no divergence. After GitHub's required `unit` check passed, main was fast-forwarded without force to `f527f68354bd60e47c1d73afec3ce8fdf3dea961`.

Release workflow: https://github.com/lemmonchess333/Maiin/actions/runs/37115535373

Firebase Hosting completed successfully. The production homepage loads at https://adaptive-fitness-af8bb.firebaseapp.com. All 18 new guide frames and three card thumbnails were downloaded from that origin and match their reviewed local SHA-256 hashes exactly; see `PRODUCTION_VERIFICATION.json`. The live artwork registry bundle also matches the local build byte-for-byte and includes the Crunches release. The workflow correctly skipped unchanged backend resources.

The independent dependency audit is not clean: the release and a separate audit of the previous main package/lock files both report six high and eleven moderate findings. Package and lock files are byte-identical across this release. This is measured baseline evidence, not an assertion that all CI passed. The artwork deployment changes no dependencies. Remediation remains a separate open item.

Continued Shrugs repair is held on the working branch, outside the production registry. Coverage remains 59 of 141 exercises.

## Shrugs deployment continuation

Main was fast-forwarded without force to `1cf1f243845072c2203db934a33125bb113ae36f` after the required GitHub `unit` check passed. Firebase Hosting successfully published [workflow 37120201404](https://github.com/lemmonchess333/Maiin/actions/runs/37120201404). The six Shrugs frames, card thumbnail and production artwork registry match the reviewed local build byte-for-byte; see `SHRUGS_PRODUCTION_VERIFICATION.json`. Firebase coverage is now 60 of 141 exercises.

A fresh local `VITEST_MAX_WORKERS=4 npm run verify` passed: 978 test files and 10,876 tests, with 8 files and 367 tests skipped. Lint, artwork audits, build and bundle-size check passed. The dependency audit still reports six high and eleven moderate findings; package and lock files are unchanged from the previous deployment.

The Side Plank trials remain outside the production registry. The first contact transplant is rejected for doubled calf contours; a second translated-contact candidate fixes vertical drift but retains a 6px fist extent difference. Their reproducible scripts and measurements are preserved for the next repair.

# Production deployment — 3 October 2026

User requested deployment and continued artwork work. The six-commit artwork branch was ahead of main with no divergence. After GitHub's required `unit` check passed, main was fast-forwarded without force to `f527f68354bd60e47c1d73afec3ce8fdf3dea961`.

Release workflow: https://github.com/lemmonchess333/Maiin/actions/runs/37115535373

Firebase Hosting completed successfully. The production homepage loads at https://adaptive-fitness-af8bb.firebaseapp.com. All 18 new guide frames and three card thumbnails were downloaded from that origin and match their reviewed local SHA-256 hashes exactly; see `PRODUCTION_VERIFICATION.json`. The live artwork registry bundle also matches the local build byte-for-byte and includes the Crunches release. The workflow correctly skipped unchanged backend resources.

The independent dependency audit is not clean: the release and a separate audit of the previous main package/lock files both report six high and eleven moderate findings. Package and lock files are byte-identical across this release. This is measured baseline evidence, not an assertion that all CI passed. The artwork deployment changes no dependencies. Remediation remains a separate open item.

Continued Shrugs repair is held on the working branch, outside the production registry. Coverage remains 59 of 141 exercises.

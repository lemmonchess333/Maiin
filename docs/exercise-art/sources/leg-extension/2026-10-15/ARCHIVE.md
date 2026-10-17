# Leg Extension retained endpoint source

The 99 source/review payload files are preserved in `candidate-inputs-exact.zip` with their original relative names. The original observation also covered 31 runtime cache files; these are excluded from both the ZIP and readable source payload. All 130 observed local files remain unchanged. Readable JSON and review app code have `.txt` suffixes. The exact dated source archive is scoped in `.prettierignore` so hooks cannot rewrite reviewed bytes.

For portable reproduction, extract the ZIP into a new external scratch folder, omit its `draft/` and `working-unit/` directories when copying inputs to another fresh scratch folder, and run `python -B reproduce.py` there with Pillow and NumPy. The recipe regenerates two endpoints, six lossless paths and four layered ORAs. ORA member payloads reproduce exactly; container timestamps may differ.

The parent draft review permits local integration only. Actual registered review, final source manifest, project checks, current-head CI and merge remain separate gates. All strict certification fields remain null.

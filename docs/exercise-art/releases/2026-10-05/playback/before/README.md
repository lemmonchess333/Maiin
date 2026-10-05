# Before the player decode fix

Run [37361829827](https://github.com/lemmonchess333/Maiin/actions/runs/37361829827) passed 86 automated browser tests, but actual video review found six brief empty artwork stages. This evidence does **not** approve continuous playback.

The two original WebMs, 20 original screenshots, raw CI report/logs, exact source audit and all transition diagnostics are preserved here. `preserved-evidence.json` maps original paths to the preserved files and verifies every byte against the retrieved package manifest. Original JSON and Markdown use a final `.txt` suffix so formatting hooks cannot alter the evidence.

See `REVIEW.md.txt` and `video-findings.json.txt` for the failure. `independent-video-review/SUPERSEDING-REVIEW.md.txt` explicitly replaces the earlier sampled-state pass with a blocked playback decision.

The fixed checker and its reproduced failing results are in the parent folder and `../baseline/`. They evaluate each encoded frame individually, including the 6-to-1 transition. A separate later run must verify the repaired player.

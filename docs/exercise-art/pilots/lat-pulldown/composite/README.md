# Lat-pulldown cable repair

The owner explicitly approved deterministic raster compositing after generated
edits repeatedly moved the four selected plates by the wrong amount. This set
replaces the proposed artwork from PR #2133 for review. It is a complete six-file
draft, not a production activation or a passing anatomy/mobile review.

## Repair

`build.py` uses the original `../1-stack-corrected.png`, the partial pull from
`../2-early.png`, and `bottom-source.png`. The latter is the inspected generated
bottom-pose candidate, retained for reproducibility. Python, Pillow and NumPy
are required. Run from any working directory:

```sh
python docs/exercise-art/pilots/lat-pulldown/composite/build.py
```

Every output is a separate native 1024×1536 PNG. The measured bar movement is
0, 136, 327, 327, 136 and 0 pixels. The original four-plate block moves the same
distance in the opposite direction, with no rescaling. Its source pixels are
asserted unchanged. Both pulleys and the diagonal cable stay fixed. The lower
stack, lower body, seat and right machine frame are checked against the master.
Continuous guide rails are restored once using the existing cylindrical texture.

The source upper-body poses are composited into the fixed scene, with a 16-pixel
transition at y860–875. This is not a claim of unchanged upper-body anatomy or
constant grip spacing. `review.json` records those remaining findings.

## Review deliverables

- `1.png` through `6.png`: ordered draft frames.
- `sequence-preview.jpg`: overview only; not the source of the individual files.
- `sequence-preview.webp`: reduced-size animated review aid; not a production asset.
- `measurements.json`: source-pixel and anchor checks bound to the output hashes.
- `review.json`: limitations and method authorization, kept separate from approval.

The frames are in the draft manifest and intentionally absent from `public/`
and the released artwork registry. The older PR's whole-stack movement must not
be shipped as a substitute for these corrected drafts. Remaining checks cover
grip/bar-end consistency, forward neck clearance, final chest position and real
mobile playback in both themes.

## Verification safety

Automatic approval review stopped the first unrestricted verification attempt
because a test tried to contact external Firestore. The root unit-test command
now preloads a TCP/TLS guard, inherited by worker and child processes. Tests must
mock SDK requests; Unix-domain IPC remains available. Explicit emulator commands
are unchanged. A child-process regression checks rejection before sockets open.
The isolated worktree also uses its own dependencies, because Vite rejects worker
imports through a dependency symlink outside the workspace root.

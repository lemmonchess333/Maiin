# Prepared Bulgarian app integration

**This proposal is unapplied.** The native V2 artwork passes its native checks, but actual recorded playback of the repaired player is still required before activation under the existing production brief. The raw review draft remains `decision: draft`, with the three player checks pending. No owner-only approval step has been added.

`app-integration.patch` adds the exact six authored cues to `src/lib/releasedFormPlacards.ts` and the three Bulgarian release cases to `e2e/form-art-release.pw.ts`. It preserves the matching ascent poses (3=5, 2=6), distinct setup versus frame 6, the real 6-to-1 return, both themes, reduced motion and the existing pixel threshold. A comment reflects the player's decode readiness and synchronous presentation hint. The patch passed applicability checking and an in-memory TypeScript check with zero diagnostics. Its SHA-256 is `532351f95ef6bbd3fe2eb9a288e642f0f42ff048210968d0f98cd6f8edb8cea8`.

The proposed `cardWidth: 480` is provisional. Measure the actual standard card export and replace that warning with its observed dimension before committing the test.

## Resume after a clean recorded-player review

1. Review the exact new CI videos through the full 1→2→3→4→5→6→1 cycle in both themes. Apply the unchanged parent `playback/check-continuity.mjs` and pinned profile to explicitly declared complete ranges, then inspect all transition boundaries and the original screenshots. Keep reduced-motion evidence scoped to its actual theme.
2. Run the parent `export-bulgarian.mjs` with explicit output and report paths. It validates all selected PNG and manifest pins and produces six lossless WebPs whose decoded RGB equals the reviewed PNGs. Until the preceding review passes, choose an output outside `public/`. The prepared six WebPs total 2,856,426 bytes; their exact hashes are preserved in `candidate-delivery.json.txt`.
3. After the review passes, deliver the frames to `public/form-frames/bulgarian-split/`, apply the patch, and compare the official review-template command with the prepared draft: `node --import tsx scripts/create-form-art-review.ts bulgarian-split --version=anatomy-v3-rigid-2026-10-05 --reference=4`. Bind the actual passing player evidence, native/geometry evidence and verified lossless delivery before approving the new record.
4. Generate the registry with `npm run art:releases`; generate only this card with `npm run art:cutouts -- --only=bulgarian-split`. Inspect its native transparent result and both card backgrounds, record the actual dimensions, and remove the provisional test comment. Refresh the inventory from the audit command's actual output.
5. Verify the delivered guide, cues and card in the real released-player fixture and run the required repository gate on the integrated inputs. Preserve those separate results before describing app integration as complete.

Keep original selection, generation, construction and failed-player records as historical evidence. They do not retroactively become approved. This continuation authorizes same-branch work and publication; it does not request a PR, merge or production deployment.

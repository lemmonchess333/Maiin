# Equipment corrections and scoped review

This publication corrects the native equipment layers in skull crushers and rope tricep pushdown. It replaces twelve guide images and their two normal cards. The accepted athlete, anatomy, muscle colours, white trainers, no-shorts model, cues, pose order, canvas sizes and reference-frame choices remain unchanged. Existing source archives and release records are preserved.

Each new source folder contains six exact delivered PNGs and an immutable portable native equipment-source archive. The skull source explicitly retains its existing common crop; the normal card exporter naturally trims the compact apparatus to a narrower card. No new image generation or anatomical transform was used.

## Broader screening

The screening in `equipment-visual-audit.md` and JSON covers the original source head `5dabd5e45fb83e8a0dc57d2d0933102fe5bcf926`: all 152 guides, 912 guide images and 154 physical cards (including two unregistered running cards). It is a visual screen, not strict certification of every set. The confirmed bench head/support continuity and calf-shorts findings are retained for separate work; this publication does not alter those sets.

The two confirmed-finding PNGs, full asset hash manifest, display inventories and renderer scripts are included. The 26 guide contact sheets and seven card contact sheets remain in the external work evidence folder and are not included in this repository package. There are no links claiming those external images are packaged here.

To reproduce the display-only sheets, use a separate checkout at the exact source head above, Python with Pillow, and one of the included scripts: `python make-all-guide-sheets.py --repo PATH --output OUTPUT`, `python make-contact-sheets.py --repo PATH --output OUTPUT` or `python make-suspect-sheets.py --repo PATH --output OUTPUT`. Each command checks the exact source head. These tools only crop/scale QA displays and write evidence; they do not author source artwork. Their algorithms retain the original screening scripts, replacing hardcoded locations with CLI arguments.

`screening-provenance.json` binds the source head, scope, original scripts and immutable recovery ZIP. `screened-public-assets.json` and `preservation-baseline.json` retain all original public hashes and 274 historical release hashes. The recovery ZIP includes the original twelve guides, two cards and their two previous release records. Other original assets remain available from the pinned Git source head.

The clean original head's normal full verification was measured before integration. It completed with seven failed test files and ten failed tests; the candidate must be compared honestly with that recorded baseline. Scoped native/player/card review and exact-head project/CI results are recorded separately when completed. Strict certification flags remain null throughout.

## Registered acceptance

`registered-player-review.zip` preserves all 40 raw evidence/harness members byte-exact. `registered-player-review.json.txt` preserves the original report bytes outside the ZIP; `registered-review-envelope.json` binds every archive member. The actual registered 390x844 normal dark, slower dark and normal light modes passed all-six-frame decode/loop observations for both sets, with instruction selection and paused 6-to-1 manual wrap. Four full-player light/dark captures and both normal cards at 480/348/160/48px in both themes were inspected. Native/public equipment visual peer review is included. The final light attempt interrupted by HMR is retained and explicitly excluded; only that deficient capture was repeated. Browser errors were empty. At 48px on light backgrounds, white athlete contours remain faint while equipment silhouettes are identifiable. This is scoped visual acceptance with findings, not strict certification.

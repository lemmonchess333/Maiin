# The badges, redrawn (DS4 call 4, 18 November 2026)

Captures for the two badge PRs: the directions (#3393) and the full set.

- `directions-*.webp`: the dev lab `/dev/badge-directions`, six badges drawn
  two ways (A, Lit enamel; B, Porcelain and drawing) at the shelf's 56 px,
  the grid's 64 px and the reveal's 120 px, with the current art above. At
  1100 px the directions stand side by side; at 393 px A is above B.
- `redraw-grid-*.webp`: the profile's badges with "See all" open (the shelf,
  the next badge, the streak figures and all 30 in the grid), before on the
  left and after on the right at 393 px; after alone at 320 px.
- `redraw-reveal-393-*.webp`: the reveal after the seal breaks, for a gold, a
  platinum and a bronze badge, before on the left and after on the right.
- `redraw-all-30.webp`: every badge at 120, 64, 56 and 40 px with its grey
  drawing beside it at 56 px, on the dark card above and the white card
  below, at the opacity `.badge-art-locked` gives each theme.

How they were taken: this sandbox could not download the Firestore emulator
(its egress proxy refuses storage.googleapis.com), so the signed-in rig did
not run. The real components (`BadgeShelf`, `BadgeGrid`,
`BadgeEarnedContent`) were rendered by Vite's dev server in the
pre-installed Chromium at 2×, with `useStreaks` and `useLiftUnit` answered by
a fixture of 19 badges earned and a 41-day streak; the before is the same
page served from `origin/main`. The lab's own capture spec
(`e2e/screenshots/badge-directions-lab.capture.spec.ts`) runs in CI.

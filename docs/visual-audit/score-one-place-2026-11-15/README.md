# The score in one place, one load model (App1 Q10, Q12, Q13, Q16)

Before (origin/main at `bc8c3654`) and after, from the branch
`claude/app1-score-one-place`, 15 November 2026.

Captured without the emulator rig, which needs the Firebase CLI this
sandbox does not have: a throwaway Vite page rendered the real
`PerformanceSection` and `WeeklyReview` from each tree with their data
hooks stubbed to one fixture (six scores 58 to 74, a high band, 16.2k kg
lifted and 32.4 km run against a usual 13.7k kg and 28.0 km), in
Chromium at device scale 2. Larger text is the root font size doubled,
as the large-text capture spec does. The "before, details open" frame
lacks the training load card, which History, not the section, passed in.

- `progress-393.webp`, `progress-320.webp`: the closed lead, light and
  dark, before and after.
- `progress-details-393-dark.webp`: Score details open.
- `progress-320-2x.webp`: 320 pt at 2x text, a high week and a week
  that says back off. Nothing runs past the card.
- `review-393-dark.webp`: the weekly review's first card.

# The visual-pass prompt

The reusable prompt for "improve the app's visual design" sessions, written
after the 2026-08-22 pass so the next one starts where this one finished
rather than re-deriving it. Paste the block, edit the bracketed lines.

What each clause buys is documented below the block — delete clauses you
disagree with, but read why they exist first.

---

## The prompt

```
Run a visual-design pass on Tropos.

SCOPE: every user-facing surface — Home, Food, Run (including the live run
HUD), Program, Social, Settings, Onboarding — in BOTH themes at 393px.
[Narrow this list if you want a focused pass.]

HOLD IT AGAINST:
- CLAUDE.md's design system: spacing scale, type scale, 44px touch floor,
  sport colour-coding (coral=run, purple=lift, orange=food, teal=water),
  and the primitives (Button, IconButton, SectionLabel, SegmentedControl,
  EmptyState, RangeInput).
- WCAG AA: 4.5:1 body text, 3:1 large text and UI component parts —
  measured against the surface the element ACTUALLY renders on
  (BottomSheet bodies paint --background, not --card).
- Consistency: one treatment per element kind — dates (en-GB), units
  (spaced: "60 kg"), uppercase labels (SectionLabel), page titles
  (text-xl).

METHOD — non-negotiable:
- Evidence is the capture channel (push to claude/screenshot-app, read the
  diff report). Measure pixels; do not eyeball, and do not trust your own
  reasoning over a measurement.
- If frames are unreliable, fix the instrument FIRST. Known flaky classes
  and their diagnostics are documented in CLAUDE.md's capture section.
- Judge any capture fix on the SECOND diff after it, never the first —
  the first diff measures the fix landing, not churn continuing.
- Check .claude/plans/programme-run-followups.md and docs/adr/ before
  re-deciding anything; check docs/design-backlog.md and
  docs/visual-audit/ for prior findings and their status.
- Mutation-check every new test guard. Verify with the tool that actually
  runs the code (tsc -b does NOT cover e2e; `cmd | tail; echo $?` reports
  tail's exit code).

DECISION AUTHORITY: visual-design decisions are delegated — decide and
ship rather than stalling on "needs a decision" piles. Standing calls
already made (do not re-litigate; supersede with a written record if you
must change one):
- Contrast beats palette purity. Fixing AA is worth a per-theme colour
  shift; a fixed hex serving both themes is presumed wrong.
- ONE secondary text grey: --muted-foreground, tuned to pass 4.5:1 on
  card, muted AND background in both themes. No fractional
  text-muted-foreground/<n> — de-emphasis is the type scale's job
  (banned in tokenContrast.test.ts).
- Decorative identity colour (fills, tints, glows, large numerals) may
  keep fixed hexes; TEXT and state-bearing UI parts take the theme-aware
  AA step (-strong tokens, --teal). Where one value feeds both, split it
  (the CardColour hue/textHue pattern).
- Page titles are text-xl. Uppercase micro-labels go through
  SectionLabel. Units are spaced. Dates are en-GB.
- Record each new decision where the next agent will hit it: the audit
  doc's STATUS trail, CLAUDE.md if it changes a documented claim, and a
  plan-file lock row for anything architectural.

DONE MEANS: every in-scope surface audited against frames; everything
fixable under the standing calls SHIPPED and frame-verified (before/after
measurements in the PR); tests+lint+tsc green with new invariants pinned
as ratchets or bans; and a list of at most the GENUINELY open questions —
each with both options measured, never "someone should decide".
```

---

## Why each clause is there

- **"Measured against the surface it ACTUALLY renders on"** — the original
  audit quoted 3.07–3.26:1 for the muted-text cluster; the true floor was
  2.53:1 because sheets paint `--background` and five chips tinted the text's
  own colour. The generous range nearly changed the decision.
- **"Judge a capture fix on the second diff"** — a working fix
  (`settleImages` on the badge grid) was nearly reverted because its own
  landing diff (4.14%) was read as churn.
- **"Fix the instrument first"** — the channel was manufacturing a fake
  defect (theme-transition capture), silently dropping a frame (dead
  selector), and swinging one frame across five heights (loading states
  rendered as empty states). Every finding downstream of a lying frame is
  wasted work.
- **"Check the plan file before re-deciding"** — the "just repoint the
  hexes" fix had already been considered and declined by DS1b; the audit
  re-derived the question without looking. The eventual decision RESOLVED
  that lock's premise rather than contradicting it, but only because it was
  read first.
- **"Contrast beats palette purity" as a standing call** — ~100 fixes sat
  blocked for hours on exactly this question. Pre-answering it in the
  prompt is the single highest-leverage sentence.
- **"tsc -b does not cover e2e" / exit-code note** — both burned this
  session: hours of "types verified" that verified nothing.
- **"At most the genuinely open questions, both options measured"** — the
  session's "needs a decision" pile shrank every time someone measured both
  branches; two of seven items dissolved entirely on measurement.

---
Status: accepted
---

# UI primitives contract: shared interactive surfaces use `src/components/ui/`, hand-roll only unique one-offs

## Context

`src/components/ui/` is a mature primitive set — `Button`, `IconButton`,
`Banner`, `BottomSheet`, `Dialog`, `ConfirmDialog`, `Toggle`, `Spinner`,
`Tooltip`, `Coachmark`, `ChoiceSheet`, `ErrorState`, `AnimatedNumber`,
`RunControlButton` — plus the CSS primitives `.ds-card` /
`.ds-card-interactive` / `.ds-input` in `src/styles/components.css`. Each
primitive already carries the contracts that are easy to forget when
hand-rolling:

- `Dialog` — focus trap (`useFocusTrap`), Escape-to-close, body-scroll
  lock, focus restore on close, fade+scale that respects reduced motion,
  `aria-labelledby`/`aria-describedby` wiring, and a `role` override for
  `alertdialog`. It renders `children` in the body, so callers compose
  arbitrary content while inheriting the a11y contract.
- `ConfirmDialog` — a layout-only, two-`Button` wrapper around `Dialog`
  for plain title/description confirmations (`destructive` flag drives the
  variant). No children slot — for confirmations with custom body content,
  use `Dialog` directly.
- `Button` / `IconButton` — 44px touch targets, focus ring, `active:scale`,
  and (for `IconButton`) a compile-time-enforced `aria-label`.
- `Banner` — `role`/`aria-live` wired by variant.

Despite this, **there was no written rule about when to reach for a
primitive**, so hand-rolled equivalents drifted back in. The drift that
prompted this ADR (evaluating a "use the design primitives more
consistently" proposal, 2026-05-31):

- **`ProgrammeSettings` confirm modal** — a hand-rolled `motion.div`
  `role="alertdialog"` with naked `<button>` Cancel/Save. It has a backdrop
  click and an animation, but **no focus trap, no Escape handler, no
  body-scroll lock, no focus restore** — the exact contract `Dialog`
  provides for free. This is a genuine WCAG gap (a modal that lets keyboard
  / AT users tab into the page behind it), not a style nit.
- **Lift-day and race-distance selectors** (`ProgrammeSettings`), and the
  same shape in `ProModal`, `ReportModal`, `TrainingSection` — hand-rolled
  pill rows. They use real `<button>`s at 44px, but selected state is
  visual-only (no `role="radio"` / `aria-checked` / `aria-pressed`), so the
  selection is invisible to assistive tech (WCAG 4.1.2).

The single explicit primitive rule that previously existed —
"use the `Button` / `IconButton` primitives" — was scoped to the
training-plan section of `CLAUDE.md`, not stated globally. The root cause of
the drift is the missing global contract, not any one control.

## Decision

**Shared, interactive, or accessibility-bearing surfaces use the
`src/components/ui/` primitives. Hand-roll Tailwind only for unique,
single-use, non-interactive surfaces.** Concretely:

| Surface                        | Primitive                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Any modal / confirmation       | `Dialog` (custom body) or `ConfirmDialog` (plain two-button) — never a hand-rolled `role="dialog"`/`alertdialog` |
| Buttons, including destructive | `Button` (`variant="destructive"` for destructive actions)                                                       |
| Icon-only buttons              | `IconButton` (forces `aria-label`)                                                                               |
| Bottom sheets / drawers        | `BottomSheet`                                                                                                    |
| Inline status / notices        | `Banner`                                                                                                         |
| Grouped card surfaces          | `.ds-card` / `.ds-card-interactive`                                                                              |
| Text inputs                    | `.ds-input`                                                                                                      |
| On/off switches                | `Toggle`                                                                                                         |

This is a **convention for new and touched code plus opportunistic
migration**, not a stop-the-world rewrite mandate. When you touch a surface
that hand-rolls one of the above, migrate it; don't open a separate sweep
unless the a11y gap is the point of the change.

### Known exceptions

- **Multi-step modals** (e.g. `AccountSection`'s delete → reauth → retry
  flow) legitimately hand-roll on top of `useFocusTrap`, because
  `ConfirmDialog`'s two-button API can't express the step machine. Use
  `Dialog` directly there (children + the a11y contract) rather than a bare
  `motion.div` — but the multi-step layout itself is a justified one-off.
- **Segmented / radio-group selectors have no primitive yet.** Until a
  `SegmentedControl` primitive exists (tracked as follow-up — `role=
"radiogroup"`/`radio`, roving tabindex, arrow-key nav, `aria-checked`),
  the hand-rolled pill rows are the accepted interim. New selectors should
  at minimum add `role="radio"` + `aria-checked` so they're not worse than
  the eventual primitive.

## Consequences

- **For engineers**: when adding an interactive surface, reach for the
  primitive first; the a11y contract comes with it. Hand-rolling a modal or
  a button now reads as a deliberate exception that should say why.
- **For reviewers**: a hand-rolled `role="dialog"`, a naked `<button>` that
  duplicates a `Button` variant, or a new pill selector without
  `aria-checked` is a review comment, not a merge-blocker for unrelated PRs
  — flag it, link this ADR.
- **For future audits**: the primitive set is the source of truth for
  interactive-surface behaviour. If a surface re-implements a primitive's
  contract by hand, that's drift to migrate, not a parallel pattern to
  preserve.
- **Migration backlog seeded by this ADR** (do as scoped follow-ups, behind
  the open work that already touches these files): (1) `ProgrammeSettings`
  confirm path → `Dialog` (rebuild, with its change recap) + `ConfirmDialog`
  (reset) + `Button variant="destructive"` (reset trigger); (2) build the
  `SegmentedControl` primitive and migrate the lift-day / race-distance /
  `ProModal` / `ReportModal` / `TrainingSection` selectors.

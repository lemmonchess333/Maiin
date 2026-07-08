# Tropos interaction design principles

Flow/interaction doctrine — the layer **above** the visual design system in
`CLAUDE.md`. That section governs how things _look_ (colour, type, spacing,
touch targets); this governs how a journey _feels_ to move through. Distilled
from the "log a run / log a meal feels heavier than Runna" work (2026-07) and
grounded in HCI research + what the dominant apps do.

**The through-line:** the interface should carry the load the user shouldn't
have to. Every principle below is a variant of that. When a flow feels
"heavy," the cause is almost never tap count — it's **decisions, dead-waits,
and lost context**.

**How to use this:** when building or reviewing a user journey, walk it against
these seven. Each names the research, an app that does it, and the in-house
reference implementation so it's concrete, not abstract. There's a diagnosis
playbook at the end.

---

## 1. Defaults beat configuration — present zero decisions when intent is known

If the app can infer what the user wants, don't ask. A config form the user
must reckon with is heavy even when they _could_ just tap through it.

- **Research:** Hick's Law — decision time grows with the number of options
  ([lawsofux.com/hicks-law](https://lawsofux.com/hicks-law/)); Johnson &
  Goldstein, _Do Defaults Save Lives?_ (Science 2003) — a default alone moved
  organ-donor rates ~12% → ~99%.
- **App:** Runna's one-tap **Start Workout** from a pre-filled preview.
- **In-house:** `RunLaunchCard` — a confident planned run (a real template
  resolved) skips the 8-decision `RunSetupModal` for a glanceable one-tap
  launch. The inferred meal slot (`inferMostLikelyMealSlot`) — the user never
  picks breakfast/lunch/dinner in the common case.

## 2. Optimize the common path; keep the escape hatch one tap deeper

Progressive disclosure. The common case is instant; power/rare config is one
tap away, never gone.

- **Research:** Nielsen's progressive disclosure — deferring advanced features
  gave 30–50% faster initial task completion
  ([nngroup.com/articles/progressive-disclosure](https://www.nngroup.com/articles/progressive-disclosure/)).
- **App:** Gmail (quick reply vs full compose); Superhuman.
- **In-house:** `RunLaunchCard`'s "Customize" and `RunTilePicker`'s "More
  options" both drop to the full modal; the focused Settings editors
  (`/settings/run-plan`, `/settings/lift-plan`, `/settings/nutrition`) sit in
  front of the full programme editor.

## 3. Reversibility beats confirmation — the safety net is undo, not a dialog

Users dismiss dialogs by habituation. A recoverable action + undo protects far
better than a "Are you sure?" — and removes a friction step. Reserve hard rails
for the genuinely irreversible.

- **Research:** Aza Raskin, _Never Use a Warning When You Mean Undo_
  ([alistapart.com/article/neveruseawarning](https://alistapart.com/article/neveruseawarning/));
  Nielsen heuristics #3 (user control) & #5 (error prevention).
- **App:** Gmail undo-send; iOS "Recently Deleted."
- **In-house:** Food delete / remove-favourite / decrement-servings are all
  optimistic-hide + undo-toast (the reference). Hold-to-finish on the run
  screen — the _hold_ is the confirmation, and the summary doesn't auto-save,
  so an accidental finish loses nothing. Counter-example that's correct:
  account deletion keeps heavy rails — it's genuinely irreversible.

## 4. Design with the grain of the platform — constraints are inputs, not afterthoughts

Ignoring a platform constraint produces _silent_ breakage. Check the native
shell up front (see also CLAUDE.md "Build for the iOS app, not just the web").

- **Research:** Norman's affordances & signifiers; platform HIGs.
- **In-house:** the iOS audio-unlock finding killed the "zero-tap auto-start"
  idea — `useAudioCues.prime()` must run inside a user gesture, so a
  countdown auto-fired from an effect would be silent; that's _why_ the launch
  card is one tap, not zero. The `appCheck.ts` web/native split and the
  back-dismiss native/web platform gate are the reference seams.

## 5. Make the common action feel instant; mask unavoidable waits (Doherty)

Sub-400ms feels immediate and sustains flow. Strip manufactured latency; use
optimistic writes + motion for the unavoidable.

- **Research:** Doherty threshold — sub-400ms response drove 25–30% more
  throughput (IBM, 1982)
  ([lawsofux.com/doherty-threshold](https://lawsofux.com/doherty-threshold/)).
- **App:** optimistic UI + skeleton screens everywhere.
- **In-house:** the food AI-photo save was made optimistic — dropped an awaited
  favourite-cache write + a hard 1200ms "Saved!" freeze down to a 500ms flash.
  The 100ms skeleton gate on the run setup; `onSnapshot`-driven diary repaint.

## 6. Design the ending, not just the middle (peak-end)

People judge an experience by its peak and its **end**. A strong close is
cheap and disproportionately memorable.

- **Research:** peak-end rule (Kahneman & Fredrickson 1993;
  [nngroup.com/articles/peak-end-rule](https://www.nngroup.com/articles/peak-end-rule/)).
- **App:** Runna's post-run "How did it feel?" RPE; Duolingo's lesson-end
  celebration; Apple rings closing.
- **In-house:** partially done — the animating hero ring is the intended
  meal-log confirmation (a deliberate no-toast decision). **Known gap:** the
  RunSummary ending is a long scroll with a manual save + an injected share
  decision; strengthening it (auto-save, share-later, one-tap RPE) is a queued
  follow-up.

## 7. Hide the machinery; surface the intent (mental models)

Don't make users learn the app's internal state machine or vocabulary.

- **Research:** Norman's mental models / gulf of execution; recognition over
  recall (Nielsen heuristic #6); Krug, _Don't Make Me Think_.
- **App:** Runna never exposes "freeform vs structured" — you just see your run.
- **In-house:** the run surface is locked to two states with **no** user-facing
  mode toggle (`resolveRunPlanSurface`); the full run config modal stopped being
  anyone's default surface.

---

## Engineering corollary: one source of truth prevents drift

Not a UX principle per se, but it's what lets the above stay consistent: when
the same logic feeds multiple surfaces, extract ONE implementation.
`runConfigDefaults.ts` gives the modal, launch card, and tile picker a single
`buildConfig`; the "tested copy must be the running copy" rule
(`performanceEngine.ts ↔ .js`) is the same idea. See CLAUDE.md's
recurring-mistake rules.

---

## The meta-rule: check what already exists before building (and why it left)

The most important lesson of the arc. Before building a "new" surface:

1. **Search for an existing mechanism.** The food "Usual strip" idea turned out
   to duplicate the existing `quickMeals` one-tap re-log — it just lived in the
   composer's empty-focus dropdown.
2. **Search git history for why it's shaped that way.** A _standing_ quick-add
   strip had been **deliberately removed** (wave2 D, PR #1223) to consolidate to
   "one composer entry surface." Re-adding it would have re-litigated a locked
   decision. `git log -S`/`--grep` + the plan file first.
3. **A decision the app already made is not yours to silently reverse.** If the
   past choice looks wrong, surface it as a product question, don't quietly
   undo it.

Auditing/building against a state a prior decision already moved past is wasted
effort even when you arrive at the same place. This mirrors the plan-file lock
discipline in CLAUDE.md.

---

## Diagnosis playbook (how the run/food arcs were run)

1. **Pick one journey** and walk it end-to-end; count every **tap**, forced
   **decision**, and forced **wait** (network / animation / dead time).
2. **Grade it against the seven** above — name which principle each friction
   point violates.
3. **Benchmark** the dominant apps for that domain (see CLAUDE.md "Reference
   apps") — 3+ doing X invisibly means surface it; 3+ not having X is a signal
   to not build it.
4. **Check what exists / why** (the meta-rule) before proposing anything new.
5. **Spec + stress-test** (edge/failure matrix) before building anything in
   correctness-critical code; leave an escape hatch; verify; ship behind a
   platform/opt-out seam where the native path can't be verified in-sandbox.

Reference specs from the arc live in the session scratchpad
(`spec-run-fast-launch.md`, `spec-food-fast-log.md`, `spec-back-dismiss.md`).

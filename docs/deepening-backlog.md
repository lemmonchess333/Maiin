# Deepening backlog — app-wide unification & depth

Working backlog of **architectural-depth and unification opportunities** across
the app, mined with the same lens used on onboarding/settings: find a recurring
_class_ of problem (drift between copies, a value re-derived instead of read
from source, a state designed as a void instead of a payoff), then propose the
_single-source / first-act_ fix — and **critique that fix** for over-reach
before it earns a slot.

How to use it: each item is self-contained. We go **one by one** — pick an ID,
turn the "Scope check" into the actual plan, build it as a staged PR with the
verify discipline (parity test / screenshot / engine pin) the change calls for.

Priority: **P0** = protects data/money/trust or kills an active bug class ·
**P1** = core value depth (recalibration, cold-start, the differentiator) ·
**P2** = consistency/polish. Effort·Risk is a rough t-shirt.

The meta-principle (the thread through all of it): **most of these are one
concept stored or computed in two+ places that can disagree.** The fix is
almost always _one source + a pin_, or _one model + multiple views_ — the same
move as `buildPlan` (one engine, two surfaces) and the `runEligibility` /
plan-validation parity pins already landed.

---

## Status ledger (2026-06-12)

All sixteen items have been worked. The recurring outcome was **verification-
first**: most audits confirmed the codebase is already disciplined (one source,
already idempotent, already covered) and the deliverable was a _pin_ + a
documented decision, not a large fix. The notable live bug was D1's
`hideWeightNumber` (client write rejected by rules — fixed).

| ID  | Status     | PR    | Note                                                                                                               |
| --- | ---------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| D1  | ✅ Done    | #1319 | profile field allow-list parity test; fixed `hideWeightNumber` live bug                                            |
| D2  | ✅ Done    | #1313 | `getNutritionPhase` accessor + footgun guard                                                                       |
| D3  | ✅ Done    | #1321 | single-sourced Experience/Equipment/RaceDistance vocabularies                                                      |
| D4  | ✅ Done    | #1315 | mirror-cross-test gate                                                                                             |
| D5  | ✅ Done    | #1317 | `programmePreservationNote` helper + pin                                                                           |
| D6  | ✅ Done    | —     | adaptive calorie status surfacing                                                                                  |
| D7  | ✅ Done    | #1318 | proactive recalibration check-in                                                                                   |
| D8  | ✅ Done    | #1320 | onboarding adaptivity framing                                                                                      |
| D9  | ✅ Done    | #1330 | cold-start payoff sweep — one laggard (History) fixed; rest PASS/locked                                            |
| D10 | ⛔ Blocked | —     | depends on a captured onboarding "why" (not captured; adding the capture is a product decision needing user input) |
| D11 | ✅ Done    | #1324 | `useEffectiveTargets` single-source pin (no re-derivation found)                                                   |
| D12 | ✅ Done    | #1323 | trigger-idempotency audit + checklist (all 6 already idempotent)                                                   |
| D13 | ✅ Done    | #1328 | streak windowing honesty (documented + lifetime-label guard)                                                       |
| D14 | ✅ Done    | #1325 | run-state transition matrix                                                                                        |
| D15 | ✅ Done    | #1327 | DS invariants as ratchet tests (mono-numerals, 44px)                                                               |
| D16 | ✅ Done    | #1329 | hand-rolled toggles → `Toggle` primitive (all `role="switch"` gone)                                                |

**Follow-ups left deliberately open:**

- **D10** needs the onboarding "why"-capture built first (a product decision on
  what to ask + how to surface it) — do it _with_ that, not before.
- **D15 ratchet burn-down** — the `tabular-nums`-without-`font-mono` baseline (30)
  and the role=switch baseline (now 0 after D16) should be lowered as surfaces are
  touched _with screenshot review_; a blind sweep risks regressions (many are
  inline-style `fontVariantNumeric` on the run screen / export-fixed ShareCard, or
  tiny secondary labels where the numeral font may look worse).
- **D3** left the widget-styling merge (`OptionCard` vs `SettingsOptionCard`) and
  the ~4 non-onboarding lib-module `RaceDistance` copies as a follow-up.

---

## A. Unification spine — kill the drift classes

### D1 · Profile field registry + allow-list parity test — **P0 · M·Low**

**Problem (quantified).** A persisted profile field lives in **four** places
that must agree: the `UserProfile` TS type, `firestore.rules`
`allowedUserFields()`, `functions/profileSanitizer.js` `PROFILE_FIELD_VALIDATORS`,
and the Settings/onboarding widget. They **don't** — the type carries ~176
field lines, the rules allow-list ~135 entries, the sanitiser **63** validators.
The sanitiser is littered with proof this recurs: "without this the
completeOnboarding callable would silently strip the field" appears for
`hideWeightNumber`, `goalWeightKg`, `adaptiveCapState`, `runFitness` — and I
added `hideSharedRouteEnds` to all four by hand an hour ago. Every miss is a
**silent data-loss bug** (the CF write drops the field).

**The move.** One TS registry of profile fields (id, validator-kind, allow-list
membership, server-managed?). A **parity test** asserting `rules` allow-list and
`profileSanitizer` keys are supersets of the client-writable registry — drift
fails CI, exactly like the `runEligibility` cross-test. (Rules can't import TS,
so the test parses the rules file string for the field list; that's enough.)

**Scope check.** Don't try to _generate_ the rules/sanitiser from the registry
(three languages, fragile). Just **pin** them equal. The registry owns the field
list + validator-kind, nothing else. ~1 day.

### D2 · The two `goal`s — one nutrition-phase accessor — **P0 · S·Low**

**Problem.** `planBuilder` itself documents it: _"nutrition phase lives on
`profile.program.goal` — that's what every macro/calorie consumer reads … NOT
`programState.goal`."_ Two `goal` fields, one canonical for nutrition, and a
_prior shipped bug_ (`e1b0296`: editor wrote `programState.goal` but macros read
`profile.program.goal`). ~38 sites reference some `goal`. Any new writer can pick
the wrong one and silently mis-set the user's calories.

**The move.** A single `getNutritionPhase(profile)` accessor — the _only_
sanctioned reader — plus a test pinning the canonical field and asserting no
macro/calorie module reads `programState.goal`. Optionally rename one to remove
the footgun entirely.

**Scope check.** Accessor + lint/test guard first (cheap, high-value). A full
field rename is a bigger migration — defer unless the accessor proves
insufficient.

### D3 · Onboarding ↔ Settings: shared capture, one Training-Profile model — **P1 · L·Med**

**Problem.** `buildPlan` already unifies the _logic_ (one engine, both
surfaces), but the **capture UI** doesn't: onboarding has its own step widgets,
Settings has its own field rows, for the _same measures_. That's why a measure
can be askable in onboarding but awkward/missing in Settings, and why D1's
allow-list drift exists at all.

**The move.** Model the **Training Profile** as one thing with three modes:
_create_ (onboarding), _edit_ (settings), _auto_ (adaptive engines). Shared
per-measure capture components rendered by both; Settings becomes the same
questions in edit-mode. (Full design in chat — the create/edit/auto framing.)

**Scope check.** The registry (D1) is the spine that makes this safe; build D1
first. Share _components_, not screen flow — onboarding stays a wizard, settings
stays an accordion; only the per-measure controls are shared.

### D4 · Standing invariant: every `functions/lib` mirror has a cross-test — **P1 · S·Low**

**Problem.** `runEligibility` and plan-validation are now pinned; `perfScoring`,
`runModeResolution`, `challengeTiers`, `aiScanQuota`, `scheduledRunCompletion`,
partner-streak were already pinned. But "keep in lockstep" comments are how the
_next_ unpinned mirror gets born. There's no rule that a new `functions/lib/*`
mirroring `src/lib/*` must ship a `.cross.test`.

**The move.** A tiny meta-test (or CONTRIBUTING note + a grep in CI) that flags
any `functions/lib/*.js` whose header says "mirror of" / "lockstep" but has no
matching `*.cross.test.ts`. Converts a convention into a gate.

**Scope check.** Don't over-formalise — a grep-based CI check listing
unpinned-mirror suspects is enough; humans judge intentional asymmetries (like
`dateUtils` UTC-vs-local).

---

## B. Recalibration & adaptivity — make the "adaptive" claim visible

### D5 · Diff-aware recalibration in Settings — **P1 · M·Med**

**Problem.** Changing goal/days/equipment silently rebuilds the plan via
`configurePlan`. The engine _correctly_ preserves history (Pgm5), but the UI
never **shows** the user it did — so a cautious user fears recalibrating, and a
bold one doesn't trust that their logged work survived.

**The move.** Before commit, show the diff: "+1 lift day (Push, Fri) · runs
unchanged · **your 12 logged workouts kept**." The Pgm5 invariant made visible.
Mirrors MacroFactor's "new target X (was Y)".

**Scope check.** Read-only preview from a dry-run `buildPlan(preserveHistory:
true)` against current vs proposed — no new engine logic, just surfacing the
existing output's delta. Start with lift-days + goal (highest-impact edits).

### D6 · Surface engine-adapted vs user-set — **P1 · S·Low**

**Problem.** TDEE (`adaptiveCapState`) and paces (`runFitness`) recalibrate
_automatically_; weight/goal/sex are _user-set_. Settings shows them as one flat
list, so the user can't tell what's learning vs what they own — and manual edits
silently fight the adaptive engine.

**The move.** Label adapted measures: "Calorie target — **adapting** · last
retuned 3 days ago," with the manual override as a deliberate, explained action.
This is Whoop/MacroFactor's credibility mechanic.

**Scope check.** Copy + a timestamp read; no logic change. The data
(`adaptiveCapState`) already exists.

### D7 · Proactive recalibration moments — **P2 · M·Med**

**Problem.** Goal/days/injuries _drift_ (the lapsed-returning, vacation-gap,
new-injury segments CLAUDE.md names), but recalibration is only ever
user-initiated. A stale plan just keeps running.

**The move.** Invite a re-check at natural seams — phase boundaries, after a
logged gap, after a goal-weight is hit: "Still training 4 days? Still chasing
strength?" One-tap confirm or adjust → a small recalibration payoff.

**Scope check.** Gentle + rate-limited (one prompt per seam, dismissible) — this
is a nudge, not a nag. Reuse the existing contextual-tip lane infra.

---

## C. Cold-start & payoff — the most-seen states, designed as first acts

### D8 · Onboarding-as-first-act — **P1 · L·Med**

The full design from chat: live-assembling plan as they answer (the product
demoing _adaptive hybrid_), capture the _why_, frame the adaptivity ("week 1 is
where we start"), payoff = a **startable first session + projected trajectory**,
recommend-don't-ask + inline "why". Rendered through D1/D3 so it can't drift
from Settings. **Scope check:** stage it — restyle+tap-advance first (low risk),
then live-preview, then the reorder that touches the `buildPlan` call path.

### D9 · Every empty state is a payoff, not a void — **P1 · M·Low**

**Problem.** CLAUDE.md: cold-start is one of the most-seen states across the user
base. Some empty states are designed (the Performance hexagon `EmptyState`, the
solo-first Social feed); others are likely still bare. There's no _systematic_
guarantee every primary empty state has a designed next-step.

**The move.** Audit each primary surface's pre-data state (Home performance,
History pre-data, Food pre-log, Program pre-plan, Social solo, Crews) against one
bar: _icon + one-line value + a single concrete next action_. Fix the laggards;
the screenshot harness already makes them visible.

**Scope check.** This is a finite sweep, not open-ended — there are ~6 primary
surfaces. Use the cold-start seed (not the rich seed) to capture them.

### D10 · The captured "why" resurfaces — **P2 · M·Med**

**Problem (depends on D8).** If onboarding captures motivation, it must _return_
— in streaks, deload weeks, nudges — or it was theatre.

**The move.** Thread the why into the insight/nudge copy ("you wanted your first
marathon — 6 weeks out, on track"). Retention lever, not onboarding polish.

**Scope check.** Only worth building _with_ D8; no value if the why isn't
captured. Keep the reflection sparse (one or two surfaces) so it stays special.

---

## D. Per-domain correctness deepening

### D11 · Nutrition/TDEE single-source + adaptive surfacing — **P0 · M·Med**

**Problem.** The goal → phase → macros chain is the core nutrition value and the
documented #1 nutrition drift (`e1b0296`). `useEffectiveTargets` _should_ be the
one source of the day's targets, but D2's two-`goal` issue and the adaptive-cap
state feed it. Worth a focused audit: is every calorie/macro display reading
`useEffectiveTargets`, or are some re-deriving (the deleted `useHomeData`
re-derivation pattern)?

**The move.** Pin `useEffectiveTargets` as the sole targets source; a test that
fails if a component recomputes macros independently. Pairs with D2 and D6.

**Scope check.** Audit-then-pin; likely small fixes, not a rewrite (the hook
exists). The value is _trust in the numbers_ — highest-stakes display in the app.

### D12 · Trigger idempotency as a standing invariant — **P0 · M·Med**

**Problem.** `syncChallengeProgress` was fixed _twice_ (lost-update race, then
double-count-on-retry). Firestore triggers are at-least-once + concurrent;
_every_ read-modify-write in a trigger needs a transaction + a per-source
idempotency marker. There's no guarantee a _new_ trigger follows the pattern.

**The move.** Audit all `onCreate`/`onWrite` handlers (`onWorkoutCreated`,
`onRunCreated`, `onActivityCreated`, challenge/partner sync) for: runs in a
`runTransaction`, guarded by an `applied/<sourceId>` marker (or is naturally
MIN/MAX-idempotent). Document the checklist; add the marker where missing.

**Scope check.** This is verification-first — most may already be correct
(partner-streak persist uses MAX-idempotency). The deliverable is _confidence +
a documented pattern_, fixing only genuine gaps.

### D13 · Streak/challenge windowing honesty — **P2 · S·Low**

**Problem.** `useStreaks` documents `totalActiveDays` is _windowed_ (400-day /
500-doc), not truly lifetime — "acceptable for launch." Fine, but a user with a
2-year streak will see a wrong "total active days." Silent inaccuracy on a
gamification number.

**The move.** Either surface it honestly ("active days, last 400") or move to a
maintained server aggregate. Decide deliberately; don't let the windowing be
invisible.

**Scope check.** Likely a copy fix (label the window), not an engine change —
unless you want true-lifetime, which is a server-aggregate project. Decide first.

### D14 · Run-state machine: exhaustive transition coverage — **P1 · M·Med**

**Problem.** The race-prep → taper → recovery → freeform state machine is the
most complex correctness surface (the whole `programme-run-followups` plan
file). Client + server copies exist; `resolveRecoveryExit` is pinned (Run9 3b).
But are _all_ transitions (no-show, fell-behind, race-completed, recovery-exit,
newer-race-supersedes) covered by tests against _both_ copies?

**The move.** A transition matrix test — every (state × event) → expected
next-state — run through the client engine, with the server-mirrored transitions
cross-pinned. Turns the prose lock-rows into executable coverage.

**Scope check.** Build on the existing `runModeResolution.cross` test; extend to
the full matrix rather than spot cases. High value because a wrong transition
silently corrupts a user's training plan for weeks.

---

## E. Design-system & component finish

### D15 · The three DS invariants as tests, not vigilance — **P1 · S·Low**

**Problem.** CLAUDE.md: mono-numerals, token-colors, 44px-targets "regress
constantly and keep getting swept up after the fact." Hex is lint-enforced;
**mono-on-numbers is not** (the week-strip bug I fixed) and neither is the 44px
floor on hand-rolled controls.

**The move.** Heuristic lint/test where tractable: flag `font-bold`/`text-*`
spans whose children are numeric literals without `font-mono`; flag `<button>`
without the `Button`/`IconButton` primitive that lack a min-h. Imperfect but
converts "per-PR vigilance" into a CI nudge.

**Scope check.** These are heuristics with false positives — ship as _warnings_,
not errors, and tune. Don't chase 100% precision.

### D16 · Consolidate hand-rolled controls onto primitives — **P2 · M·Low**

**Problem.** `PrivacySection` has _both_ the `Toggle` primitive (AI toggle) and
hand-rolled `<button role="switch">` toggles (auto-post) in the same file —
divergent 44px/focus/haptic behaviour for the same control. The CLAUDE.md
"route CTAs through `Button`" convention isn't lint-enforceable, so it drifts.

**The move.** Sweep settings (and similar) to the `Toggle`/`Button`/`IconButton`
primitives; the primitive already supplies the invariants D15 chases.

**Scope check.** Finite, mechanical, low-risk — a contained refactor PR per
section. Verify via screenshot (no behaviour change intended).

---

## Suggested sequencing

1. **D1 (profile registry + parity test)** — the spine; unblocks D3/D8 and kills
   the most active bug class. Cheap, high-leverage.
2. **D2 + D11 (nutrition single-source)** — highest-trust numbers; small fixes.
3. **D12 (trigger idempotency audit)** — money/data integrity; verification-first.
4. **D5 + D6 (recalibration + adaptive surfacing)** — makes "adaptive" real,
   directly serves your differentiator.
5. **D8/D3 (onboarding-as-first-act through the shared model)** — the big
   visible 100x, safely on the registry spine.
6. The rest (D9, D13–D16) as contained sweeps between the above.

Each is a `/goal`-able unit: turn its Scope check into a plan, build with the
matching verify discipline, land clean.

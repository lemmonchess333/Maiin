# Tropos training-programming handoff for Claude Code

> Status: prepared 2026-08-07 and audited against remote `origin/main`
> `a69a9d655424ca4c27e8315bcbffe340f1085748`. This is the entry point for the
> evidence and architecture handoffs covering Tropos lifting and running. It
> is planning material, not approval to rewrite a saved programme or open a
> pull request.
>
> STATUS 2026-08-09 — integrated into `docs/` from the current main
> descendant (base `52c2f02`; the 2026-08-07 audit SHA is an ancestor, so
> these documents describe a real past state of this history). During
> integration the ledger issue IDs were renamed `LIFT-01..08` →
> `LIFT-EV-01..08` and `RUN-01..10` → `RUN-EV-01..10`, because this repo
> already uses `RUN-0x` (retention-audit rows Run13/Run14 in
> `.claude/plans/programme-run-followups.md`) and `LIFT-0x` (2026-07-10
> programme audit) for UNRELATED issues — a bare grep must never conflate
> the two vocabularies. Rows the integration pass re-verified against the
> current tree carry dated STATUS notes in the two focused handoffs; rows
> without one have NOT been re-verified since 2026-08-07 and must be
> re-traced before acting.

## Read order

1. Read `AGENTS.md`, `CLAUDE.md`, and
   `docs/adr/0002-dual-scheduling-ontology.md`.
2. Read `docs/proposals/lifting-v8-evaluation.md`,
   `docs/adr/0010-volume-currency.md`, and
   `docs/adr/0011-command-boundary-scope.md`.
3. Read the full [lifting handoff](lift-programming-claude-handoff.md).
4. Read the full [running handoff](running-programming-claude-handoff.md).
5. Inspect the actual target branch, current state/migrations, and the
   relevant tests before proposing or making a change.

The handoffs were re-audited against fetched remote `origin/main`
`a69a9d655424ca4c27e8315bcbffe340f1085748`. The earlier lift feature tree
was already squash-merged into main and later main commits materially changed
both lifting and running behavior. Fetch and record the intended target SHA
before relying on a finding; do not merge the old divergent feature branch.

STATUS 2026-08-09 — the publication instructions that stood here are done:
these files now live in `docs/` on a current-main descendant, staged
explicitly, with the read-order references below verified present
(`AGENTS.md`, `CLAUDE.md`, ADR-0002/0010/0011,
`docs/proposals/lifting-v8-evaluation.md`).

## What the source work supports

The lifting handoff incorporates five supplied training sources. The running
handoff incorporates three supplied running books plus contemporary review
evidence. Together, they support a product that:

- begins from the person's actual capacity, constraints, and priorities;
- models a session's purpose, dose, recovery cost, and progression rather
  than only naming a template or phase;
- makes progression conservative, inspectable, and responsive to observed
  work rather than calendar-driven alone;
- preserves recovery, avoids catch-up loading, and supports clear re-plan
  choices when life interrupts training; and
- coordinates running and lifting as concurrent priorities without pretending
  to diagnose readiness, injury, or medical safety.

They do **not** support importing fixed mileage bands, set landmarks, taper
percentages, a universal intensity split, a universal 10% rule, or any book's
sample programme as a default Tropos algorithm.

## What Claude receives instead of the books

Claude Code does not need the supplied PDFs or EPUBs to act on this work. The
two focused handoffs contain the applied, paraphrased synthesis:

- **Applied lifting design rules** translate the lifting sources into
  selection, dose, progression, recovery, priority, and hybrid-training
  decisions.
- **Applied running design rules** and the **conservative state-response
  matrix** translate the running sources into a plan-input, session, dose,
  interruption, taper, and safety model.

Treat those sections as the source-derived product brief. They deliberately
state both the lesson to apply and the tempting rule Tropos must not turn into
a universal algorithm. Do not ask for, commit, split, or reproduce the books
or their sample programmes.

## Cross-discipline operating hierarchy

Use this ordering whenever a source-informed change affects lifting, running,
or both:

1. Adherence, feasible schedule, demonstrated current capacity, and truthful
   history outrank optimization.
2. Session dose, effort, frequency, and recovery outrank advanced variation,
   tempo, labels, and novelty.
3. Progression needs eligible observed work or an explicitly labelled baseline
   policy. Elapsed time, a missed session, or unverified activity is not proof
   of adaptation.
4. Preserve exercise identity, completed/custom history, local dates, and
   user-approved goals. Evidence never authorizes a silent rewrite of them.
5. When hard running and lifting conflict, surface the trade-off and
   priority-preserving choices. Do not silently stack, delete, move, or
   date-pin a split-ordered lift to resolve a date-pinned run conflict.

## Immediate correctness gates

Do not build new theory-driven features on these known current-branch faults.
The focused handoffs provide concrete current-behaviour context, relevant
paths, and verification scenarios.

| Area         | Resolve first                                                                                                                                                            | Why it gates further work                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifting      | Fix timed-hold repeated-failure semantics, the false first-plan phase label, and manual-deload/recovery-escalation copy.                                                 | The remote command/sanitizer P0s are resolved, but remaining prescriptions, automatic recovery behavior, or user-facing explanation can still be wrong. |
| Running      | Resolve the advertised-but-retired Structured mode, make race-plan save/preview use one current effective schedule and goal, and remove compressed-plan safety promises. | A runner must never be shown one plan mode/frequency/preview while the stored plan silently does another or told a limited-runway plan is safe.         |
| Running      | Make asynchronous layoff classification trigger a carry-safe re-entry replan, then preserve Run15's progressive long/easy/quality dose model.                            | Remote main now has real dose progression, but a returning runner can initially materialize against the optimistic fallback.                            |
| Shared state | Follow the documented command boundary and name every direct-save exception before adding durable programming fields.                                                    | Remote main intentionally retains a few direct engine writes; treating either all writes or no writes as transactional would be inaccurate.             |

## Implementation order

Do not begin with new templates, labels, or personalization constants. Use one
bounded vertical slice:

1. Fetch the target, reproduce the relevant current behaviour, and identify
   whether it is a correctness repair or an owner decision.
2. Record or obtain the product decision, user-visible result, and explicit
   non-goals. A straightforward correctness repair still records the intended
   behaviour it restores.
3. Map durable ownership, migrations, direct-save/command boundaries, and
   client/server parity for every affected field.
4. Implement the slice with regression, property, parity, and lifecycle
   coverage appropriate to the crossed boundary.
5. Verify saved/refetched behaviour and run `npm run verify` before handoff.

Lifting and running have different scheduling ontologies: lifts are
split-ordered and runs are date-pinned. Preserve that distinction. For hybrid
changes, read both handoffs and make any hard-session/lift trade-off visible
rather than silently deleting, stacking, or moving workouts.

## Source boundary and self-contained evidence contract

The accessible books are recorded with edition, temporary-cache identity, hash,
and limits in the two evidence ledgers. Source books and linked studies are
citations, not implementation dependencies: the detailed handoffs contain the
usable paraphrased principles, limits, and non-adoptions. If a proposed
behaviour is not supported by a recorded principle plus an explicit product
decision, stop for source intake or owner review; do not import a sample plan,
numeric protocol, or competitor behaviour.

Resolve evidence disagreement by transferability, user constraints,
saved-history truthfulness, and product safety—not by counting books or
choosing the most detailed routine. Agreement raises confidence; it never
creates a universal default.

A separate Drive-linked item required Google sign-in in this environment, and
the latest temporary preview attachment was not available at its supplied
path; neither is used for evidence claims. For a future source:

1. Treat an inaccessible or unsigned-in source as unavailable; make no claim
   from it.
2. Record author, title, edition, readable locator, format, and source
   file/hash identity where available.
3. Add a short paraphrased principle, its limit or disagreement, the Tropos
   product implication, and the explicit non-adoption.
4. Add it to the relevant ledger only after readable review. Never commit the
   source asset or extracted text.

Do not commit supplied books, extracted text, or temporary analysis artefacts.
When publishing these handoffs, stage the named Markdown files explicitly,
not `git add .`; the existing `tmp/` folder is outside their scope.

## Owner-decision session — 2026-08-09

Ratified (implemented in PR #1886; details in each ledger's STATUS notes):

1. RUN-EV-01 — Structured removed from onboarding; two-state surface stands.
2. RUN-EV-05 — below-floor label renamed "mostly-easy plan" everywhere
   user-visible; internal state keys unchanged.
3. LIFT-EV-02 — phase copy derives from primary goal (deload overrides);
   `currentPhase` initializes to the engine's own "progression".
4. LIFT-EV-07 — sex-based 0.75 starting-load factor retained and FENCED:
   cold-start seeding only, never expanded into sex-based programming,
   superseded by any real capacity signal.

PROPOSED, NOT RATIFIED (recommendations put to the owner, twice
unanswered — a future session must obtain an explicit yes/no before
acting; none of these is a lock):

- LIFT-EV-05 recovery posture → recommend automatic protective
  reductions kept, surfaced in a banner with honest non-MRV copy and
  one-tap undo (the DeloadBanner pattern).
- RUN-EV-08 benchmark policy → recommend two-tier by consequence:
  measurements auto-update with visible provenance and reversal;
  anything touching a prescription keeps explicit acceptance.
- LIFT-EV-06 goal change → recommend a visible keep-or-represcribe
  choice on a same-frequency primary-goal change, reusing the
  training-block transform; never automatic.
- RUN-EV-06 dose heuristics → recommend keeping the 150-minute long-run
  ceiling and 6 km floor, explicitly labelled Tropos heuristics.

Deferred with reason (not decision-ready): LIFT-EV-04 and RUN-EV-07
(boundary/concurrency ownership — need their own audit sessions before
options can even be framed); RUN-EV-02 remainder (atomic
schedule/preview commit — needs a trace); RUN-EV-04 and lift Q5/Q6
(exposure modelling, volume review, run/lift priority inputs — need
real user data that pre-launch Tropos does not have); run Q7 (no new
plan taxonomy while the two-state lock stands).

## Working standard

Use books and research to ask better questions and make an explainable plan,
not to decorate static prescriptions with scientific language. Preserve saved
history, user-approved edits, race identity, local-date semantics, completion
truthfulness, and the relevant client/server lifecycle in every change.

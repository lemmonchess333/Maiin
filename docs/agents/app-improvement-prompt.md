# The app-improvement prompt

The reusable prompt for a whole-app improvement pass — security, guards,
de-slop, front-end, design. Paste the block, edit the bracketed lines. The
sibling `visual-pass-prompt.md` in this directory is the narrower
pixels-only pass; this one is broader and expects to run as a workflow.

Its first run (`app-improvement-pass-2026-09-05.md`) fixed or declined
everything the 2026-09-04 survey found, so the block no longer carries that
survey: each run surveys the current tree itself. What each clause buys is
explained below the block; delete clauses you disagree with, but read why
they exist first.

---

## The prompt

```
Run an app-improvement pass on Tropos as a WORKFLOW (this is the
cross-cutting sweep CLAUDE.md routes to workflows: /effort ultracode, or the
word "workflow"). Five workstreams, in this order: SECURITY → GUARDS →
DE-SLOP → FRONT-END → DESIGN. Plan, implement in small PRs, verify each.

[Narrow to one workstream by deleting the others. Nothing below depends on
running all five.]

READ FIRST, BEFORE THE FIRST EDIT: CLAUDE.md (all of it — the recurring-
mistake rules and the design system are the spec), CONTEXT.md, docs/adr/,
docs/invariant-guards.md, docs/voice-and-tone.md, docs/design-principles.md,
docs/frontend-design-principles-2026-07.md (Part F and its Guardrails),
.claude/plans/programme-run-followups.md, the three prior security
audits in docs/audits/, and docs/agents/app-improvement-pass-2026-09-05.md
(what this prompt's first run fixed, declined and settled). An audit that
re-derives a locked decision is wasted effort even when it lands in the
same place.

GROUND YOURSELF — this sandbox misleads in two ways:
- The clone is SHALLOW (`git rev-parse --is-shallow-repository` → true).
  `git log` shows ~50 commits of a repo whose PR numbers run past #2130.
  Run `git fetch --unshallow` before any claim about history, and never
  keep a history-narrating comment because "git has no record" — it does.
- Dependencies are not installed. `npm ci` (≈30 s), then take the baseline:
  `npm run lint`, `npm run check:cycles`, `npx vitest run`, `npx tsc -b`.
  Record the numbers; every PR reports movement against them.

STANDING RULES — do not re-litigate, do not work around:
- Plan-file locks, ADRs 0001–0012, and CLAUDE.md's standing calls stand.
  In particular: Run9a two-state run surface (no mode toggle); one food
  composer; weekly-cadence
  forgiving streak; Social is P2; orange is a data identity, not a button
  colour; Food9 meal photos are device-local; Sub4 keeps the Stripe
  BACKEND dormant (removing an UNIMPORTED client package is not that
  teardown).
- Deferred product calls — do NOT build: the centre "+" action, demoting
  Social's nav slot, renaming Analytics → Progress (frontend-design-
  principles §E). Put them in the open-questions memo if you must.
- ADR-0001: file size is not a depth signal. Do not split a page because it
  is long; move PURE LOGIC out of pages into src/lib (workstream 3).
- Never call raw setDoc/addDoc/updateDoc/deleteDoc; every new persisted profile field
  goes in functions/profileSanitizer.js's allow-list; triggers are
  at-least-once and concurrent; never mix local-date and UTC;
  onAuthStateChanged fires several times; the tested copy does not prove
  the running copy (mirror parity pins the functions/ copy). All CLAUDE.md.
- graphify: no graph exists unless graphify-out/graph.json does. Do not
  create one, and ignore its hook nudge on verification work.
- Comments are not a tax to be minimised: keep every comment that states an
  invariant, a mirror coupling, or a why the code cannot express (the
  de-slop policy below).

────────────────────────────────────────────────────────────────────────
WORKSTREAM 1 — SECURITY
The prior audits (docs/audits/) and the first run's security work are
CLOSED in code. Do not re-audit Stripe/Apple webhook verification, billing
self-grant rules, activity read visibility, Storage MIME/size caps,
account-deletion re-auth, password-reset enumeration, Vertex log
redaction, the rate limiter, or anything the first run's record lists as
fixed. Survey for what is actually open; every rules path a fix touches
gets a rules test (`npm run test:rules`).
LEAVE, WITH A NOTE: App Check enforcement is operator-gated
(docs/app-check-rollout.md) — keep the seam, put the flip on the operator
checklist. Admin authority via the ADMIN_UIDS env var is a documented
trade-off. Default auth persistence is right for a mobile app.

────────────────────────────────────────────────────────────────────────
WORKSTREAM 2 — GUARDS (extend the gates that exist; add no parallel ones)
Every guard is revert-tested (break it deliberately, watch it fail,
restore) and added to docs/invariant-guards.md's table. A ratchet pins a
baseline that only decreases; raising it needs a written reason in the
test. Lint is pinned at `--max-warnings 0`; a deliberate sync with an
outside system carries its reason beside a disable. Look for invariants
that recent fixes re-established by hand with no gate holding them.

────────────────────────────────────────────────────────────────────────
WORKSTREAM 3 — DE-SLOP
ARCHAEOLOGY IN SOURCE. THE POLICY (decided — apply it, don't debate it):
KEEP a comment that states an invariant, names a mirror or cross-test,
  or explains a why the code cannot express.
MOVE OUT a comment whose content is what the code USED to do, a PR or
  date narrative, or a preserved old string. Destination: CHANGELOG.md,
  or the ADR / plan row / docs file that owns the decision; leave a
  one-line pointer only if the pointer is load-bearing. Never delete on
  the grounds that git has it — readers use files far more than blame.
RATCHET the marker count (archaeologyMarkers), never total comment share
  — a share ratchet rewards deleting the load-bearing ones.
LOGIC IN PAGES (ADR-0001): move pure logic out of pages into src/lib or
the owning feature module, with tests. Do not otherwise split pages.
TESTS: a test whose expected value is computed by the code under test
pins consistency, not behaviour — assert a literal instead.
NAMING: do NOT mass-rename. User-facing copy uses the CONTEXT.md glossary
term; identifiers follow their module's existing convention; fix mixed
usage only in files you touch.

────────────────────────────────────────────────────────────────────────
WORKSTREAM 4 — FRONT-END
Already pinned — do not re-derive: the tabular-nums⇄font-mono and
role=switch ratchets; AA contrast for every token in both themes;
fractional muted-foreground is banned; every lazy() is wrapped; legal
routes sit in all three route sets; every modal has a focus trap;
framer-motion is gated globally for position by <MotionConfig
reducedMotion="user"> in App.tsx — do NOT add per-component gates for
transform animations. Survey every surface against CLAUDE.md's design
system, and hold what you find to these:
- A sub-44px control becomes an IconButton (the hit area may exceed the
  glyph).
- Destructive actions: the net is UNDO (a sonner action toast) where the
  write is reversible; ConfirmDialog only where it is irreversible or
  visible to others. Never swallow a failure.
- A loading state is not an empty state: tell them apart at the hook.
- Callable rejections go through describeRejection so the user-fit part
  surfaces (CLAUDE.md: a server message is diagnostic data).
- Performance: measure before acting — Lighthouse against `npm run build`
  + preview, and e2e/performance.spec.ts. The dist-size ratchet is the
  standing guard.
- Offline: reuse the SustainedOfflineBanner pattern; never add a raw write.

────────────────────────────────────────────────────────────────────────
WORKSTREAM 5 — DESIGN (choices, not pixels)
- Reconcile docs/frontend-design-principles-2026-07.md Part F against
  code. Ship the small items; propose the arcs with evidence, do not
  start them.
- Every cold-start state is a first act, not a void (CLAUDE.md
  design-for-the-user-base). Audit the zero-data render of Home, Program,
  Food, Social and History in BOTH themes on the capture channel.
- Write design-system amendments into CLAUDE.md, not into code comments.
- Close with a memo of AT MOST five genuinely open design questions, each
  with both options built or mocked and MEASURED (frames, counts), never
  "someone should decide". Candidates you may not resolve yourself: the
  centre "+", the Social nav slot, the Analytics name.

────────────────────────────────────────────────────────────────────────
METHOD — non-negotiable
- Typecheck with `npx tsc -b`, never `tsc --noEmit -p` (it exits 0 on this
  repo regardless). Run the FULL unit suite before every push — adding an
  import to a component breaks any suite that mocks that module wholesale,
  and the touched subset will not show it. Rules changes: `npm run
  test:rules` and `npm run test:rules:storage` (emulator; Storage's
  cross-service cases self-skip here and say so — honest, not green).
  functions/ changes: `cd functions && npm test`. Always: `npm run lint`,
  `npm run check:cycles`, `npx react-doctor@latest --diff` with no score
  regression.
- Visual changes ship with frames: push to claude/screenshot-app, WAIT for
  the run, read screenshot-diff/DIFF_REPORT.md; judge any capture fix on
  the SECOND diff after it; the flaky frame classes are documented in
  CLAUDE.md's capture section.
- Mutation-check every guard. A negative assertion under waitFor proves
  nothing unless something anchors it (CLAUDE.md).
- Anything under functions/ is not verified by CI green (bundle-hash
  dedup). Read docs/post-deploy-verification.md; the Console spot-check is
  operator-only — list it, don't claim it.
- Cite file:line for every finding and every fix. Report outcomes
  faithfully: a skipped step is reported as skipped.

PR SHAPE
- One concern per PR, in workstream order; at most ~400 lines of non-test
  diff unless the change is a mechanical migration. Branches
  `claude/<area>-<slug>`; any plan-file lock goes alone on
  `claude/lock-<id>` and is PR'd immediately.
- Fill the PR template honestly — the schema-migration checkbox is real
  (programTypes.ts CURRENT_*_VERSION and migrations.ts).
- Each PR body states baseline → after for every ratchet it touches.
- The repo's Stop hook records standing approval: push, open the PR, watch
  CI, squash-merge when green, unsubscribe. Follow it.

DONE MEANS
- Every finding the survey turned up shipped, or declined in a PR with the
  reason and the citation; every new guard live, revert-tested, and in
  docs/invariant-guards.md.
- Every ratchet a PR touched moved, with its number in the PR body.
- Full suite, lint at the pinned warning count, cycles, tsc -b, rules
  tests and functions tests green on the final head; capture frames
  attached to every visual PR.
- A final report in five sections: FIXED (PR list); DECLINED (reason and
  citation); OPERATOR CHECKLIST (only a human with console access can:
  flip App Check enforcement per docs/app-check-rollout.md, do the
  Console deployed-source spot-checks, set the Cloud budget alert, turn
  on GitHub secret scanning and push protection); OPEN DESIGN QUESTIONS (≤5, both options measured); and the
  NEW BASELINE numbers for the next run of this prompt.
```

---

## Why each clause is there

- **"The clone is shallow"** — the 2026-09-04 slop survey read the ~50
  visible commits as "history is squashed" and nearly used that to argue
  for keeping history-narrating comments in source. One `git rev-parse
--is-shallow-repository` settled it. A prompt without this line invites
  the same wrong inference every run.
- **Take the baseline first** — a green suite at the start means a red one
  later is the agent's doing, not inherited. "Improvement" that cannot be
  measured against a starting number is a claim, not a result.
- **"Survey for what is actually open"** — the first run's survey was a
  snapshot of one day, and within a month nearly every item it listed had
  shipped. Line numbers and counts rot faster than anything else in a
  prompt; the record of what shipped is the starting point instead.
- **"Prior audits are closed"** — three security audits exist in
  `docs/audits/`, and re-verifying them cost the survey about a third of
  its effort to reach "all closed". Naming them as done is the single
  biggest saving in the prompt.
- **The keep / move-out comment policy** — a bare "reduce comments"
  instruction would delete the mirror pins and invariant notes CLAUDE.md's
  whole drift-defence rests on. The policy lets the agent classify instead
  of guess.
- **Ratchet the markers, never the share** — a share ratchet rewards
  deleting whichever comments are longest, which are exactly the
  load-bearing ones.
- **"Extend the gates that exist"** — six reachability/guard tests already
  exist with known, listed gaps. The house pattern is that each orphan
  instance produced a gate; a second, parallel gate for the same class is
  itself slop.
- **Pre-decided design calls (undo, not a dialog)** — the visual-pass
  lesson: about a hundred fixes sat blocked for hours on one unanswered
  question. The first run settled the others it carried (500 is a weight
  tier; sentence case shipped); its record has the evidence.
- **"framer is gated for position"** — the front-end survey reported "no
  global reduced-motion gate". `App.tsx` has had `<MotionConfig
reducedMotion="user">` all along, but it settles position only: opacity,
  stroke and count-up animations ask `useReducedMotion` themselves, and CSS
  animations need `motion-safe:`. Without this line the agent adds gates to
  transform animations that the global one already covers.
- **The Sub4 nuance** — the lock says keep the Stripe backend dormant. Read
  naively it blocks removing a dead client package; read the other way, a
  "remove dead deps" sweep tears down the backend. Both misreadings are
  one sentence apart, so the prompt carries the distinction.
- **"Measure before acting" on performance** — 153 exercise rows is not
  obviously jank; a windowing library added on suspicion is the kind of
  dependency workstream 3 exists to remove.

## Baselines

Each run takes its own at the start (GROUND YOURSELF in the block). The
first run's closing numbers are in `app-improvement-pass-2026-09-05.md`
under "New baseline".

## What the prompt deliberately routes to the operator

These need console access or a GitHub setting an agent does not hold. The
prompt asks for them as a checklist rather than letting them read as done:

Marking `CI / unit` a required status check was on this list and is DONE
— verified 2026-09-18 by reading a merge refusal (`405 Repository rule
violations found / Required status check "unit" is queued`), not the
settings page. It sat here as outstanding while it was already in force,
which is the failure mode this section invites: a checklist an agent
cannot observe drifts silently, in the direction of inventing work.
Re-verify a claim on this list before repeating it.

- Flip App Check enforcement per `docs/app-check-rollout.md`, only after the
  verified-request telemetry it describes.
- The Console deployed-source spot-checks in `docs/post-deploy-verification.md`
  for anything that touched `functions/`.
- A Google Cloud budget alert (`docs/qa/pre-launch-backlog.md`, cost & margin row).
- GitHub secret scanning and push protection on the repository.

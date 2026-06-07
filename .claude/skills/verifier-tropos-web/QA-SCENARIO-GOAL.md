# QA goal: scenario-driven "test the app as a user"

A recurring goal for an agent: drive the real app (auth → Firestore →
React) as a user would and surface what's **actually broken or
under-designed right now** — not a speculative wishlist. This exists
because, on this codebase, ideation-style "improvement lists" go stale
fast (most items turn out already-shipped), while _observing real state_
reliably finds real bugs (e.g. the Analytics cold-start blank, #1166).

## The discipline that makes it rigorous (not noise)

1. **Vary STATE, not just routes.** The real bugs are scenario bugs — a
   page renders but the _state_ is wrong (cold-start blank, offline,
   error, Pro-gated). Walking routes once with one user is shallow.
2. **Ground-truth before reporting.** Confirm the issue reproduces on
   current `main`, not a stale build. Grep the code before calling it a
   bug.
3. **Filter against known intent.** Check the suspected bug against
   `CLAUDE.md`, `.claude/plans/*` locks, and recent PRs BEFORE flagging.
   (The Social notification bell _looked_ like a lock violation but was an
   intentional, documented reversal — S3c. Don't re-flag intent as a bug.)
4. **Report DELTAS.** New console errors / regressions / under-designed
   states vs. the last run — not the full inventory every time.
5. **State the coverage boundary honestly.** A headless browser cannot
   exercise everything (see "Operator-only" below). Don't claim "all
   scenarios" while silently skipping the un-automatable half.

## Scenario matrix (the axes that matter for Tropos)

Run each reachable surface across these axes, not just once:

- **Data state:** cold-start (no data) · partial · rich · error/offline.
  ← most surfaces are only ever eyeballed _rich_; cold-start + error are
  where bugs hide, and cold-start is a recurring user-base reality.
- **Account:** new · returning · Pro · free · restricted · mid-deletion
  (write-freeze).
- **Theme × viewport:** light/dark × iPhone-SE (320–375) × standard (393).
- **Key flows (end-to-end):** join challenge · log workout (set entry →
  finish) · log food (manual) · start/finish run · follow + kudos ·
  Lift/Run switch · week rollover.

Seed the data states with `scripts/seed-rich-user.ts` (rich) and the
plain `seed:e2e` (cold-start). Drive with
`.claude/skills/verifier-tropos-web/drive-stress.mjs`.

## Surface checklist (automatable)

Home · Food (+ composer) · Program Lift (+ WorkoutSession) · Program Run ·
Social (Feed/Crews/People) · History (Analytics/PRs/Badges) · Settings (+
each section) · `/run` setup · UserProfile · dark mode · 320px viewport ·
offline banner.

## Operator-only (a headless run CANNOT cover — flag, don't fake)

Real GPS run tracking · Gemini food analysis (image + NL) · barcode
camera · Stripe checkout / Apple IAP / restore · push notifications ·
native iOS (Capacitor) behavior · multi-account device-switch (offline +
share queue uid-scoping). These overlap the **Pre-launch QA backlog** in
`CLAUDE.md` — treat that as the operator track.

## Output

Per run: screenshots + per-surface console errors (`out-*/errors.json`),
and a triaged findings list where each item is either (a) a real,
ground-truthed, not-already-known bug with a repro, or (b) explicitly
deferred to the operator track. No raw firehose.

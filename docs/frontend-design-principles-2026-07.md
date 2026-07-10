# Frontend design principles & retention verdict (2026-07)

**Date:** 2026-07-09 · **Type:** reasoning artifact (decision doc), not implementation.
**Method:** repo-grounded audit (every Tropos claim traced to `file:line`) + a 15-agent
research/synthesis/adversarial-critique workflow, with the synthesis's errors corrected
against the code. Reference-app facts are live-web (July 2026) where cited; anything
uncertain is flagged.

**What this answers.** The brief: _relentlessly improve the frontend — analyse the design
principles of the leading fitness apps (Runna, Nike Run Club, Strava, MyFitnessPal, Hevy…),
take the lessons in user psychology, decide the optimal number of tabs, and rank the
improvements that actually get users to keep using the app._ It is a **retention**
document. It ranks by consequence to retention/trust, not by ease.

**Honesty discipline used here.** Every behavioural claim about Tropos is either
**VERIFIED** (traced to `file:line`, and the load-bearing ones were re-read by hand) or
**REPORTED** (surfaced by the research pass, not personally re-traced) or **INFERRED**
(a judgement, labelled as such). Reference-app tab structures are live-web-sourced but were
mostly WebSearch-synthesised, not pixel-audited — treat tab _order_ and exact copy as
directionally right. Two of my own research agents (Runna deep-dive, psychology deep-dive)
failed the sandbox's web layer; those two threads lean on the repo's existing
`competitive-analysis*.md` and `design-principles.md` plus established HCI/HIG knowledge,
and are labelled accordingly.

---

## TL;DR — the verdict in five lines

1. **The frontend is already well-built. The retention holes are in the _loop_, not the
   pixels.** Tropos has designed cold-start states, a forgiving streak engine, a curated
   solo social feed, and enforced sport-coding. What's open is (a) the day-1→day-2 return
   trigger, (b) first-session survival, and (c) the differentiator being invisible. Fix the
   loop before repainting screens.
2. **Optimal tab count for Tropos: keep it at ≤5, and do NOT add a 6th.** Every leading
   fitness app runs **3–5** bottom tabs; the winners hold the line by _consolidating and
   nesting_, never inflating. 5 is defensible. The lever is not the count — it's **what
   occupies the five slots** (Social is the weakest slot for a cold-start app) and
   **whether the primary action is reachable in one tap**.
3. **The single highest-leverage IA question is the primary action, and it's genuinely
   contested.** A center "+" is _not_ the slam-dunk the first pass implied — lift and run
   already start from the Train tab, and a center-"+"→food collides with a locked "one food
   composer" decision. The honest recommendation is the Hevy/Strong model plus a Run fix,
   with the center-"+" as an explicit product call (§E).
4. **The nutrition moat is real and nearly invisible** — surfaced as one `text-xs` muted
   caption, silent in the drill-down sheet, and for free users it's a deliberate but
   under-signposted "conversion hook." Making it _felt_ is the cheapest high-value work in
   the app (§D-3, §F-4).
5. **Everything retention-critical here is native (notifications) — leave a web-visible
   seam.** The top-ranked fixes are Capacitor/WKWebView work that can't be exercised in the
   web preview loop. Per the repo's own iOS-parity rule, each must ship a web-visible stub.

---

## Part A — What the leading fitness apps actually do

Sources: this session's live-web research on NRC, Strava, MyFitnessPal, Cronometer,
MacroFactor, Hevy, Strong; the repo's `docs/competitive-analysis.md` and
`docs/competitive-analysis-running-2026.md` for Runna/Garmin/TrainingPeaks.

### A.1 — Tab count & primary-action placement (the benchmark)

| App | Domain(s) | Bottom tabs | Primary action | Social placement | Confidence |
|---|---|---|---|---|---|
| **Nike Run Club** | Run | **5** — Home · Plans · **Run** · Club · Activity | Center **"Run" tab** (not a raised FAB) — 1 tap from anywhere | "Club" deliberately secondary ("compete with your past self") | high |
| **Strava** | Multi-sport | **5** — Home · Maps · **Record** · Groups · You | Center **elevated "Record"** | Home feed _is_ the app; new features nest as sub-tabs (Events under Groups) | high |
| **MyFitnessPal** (2026) | Food | **4 + center [+]** — Today · Plans · [+] · Progress · More | Context-aware center **[+]** | folded into More/Progress | high |
| **Cronometer** | Food | **3** — Diary · Discover · More + per-group [+] | Per-diary-group **[+]** (customizable) | none | high |
| **MacroFactor** | Food | **~3** — Dashboard · [+] · More | Center **[+] "Quick Actions"** | none | **low — tab list unverified** |
| **Hevy** | Lift | **4** — Workout · Feed · History · Profile | **No FAB** — the Workout tab _is_ the start surface | Feed is its own tab (mature graph) | high |
| **Strong** | Lift | **4** — Workout · History · Exercises · Profile | **No FAB** — Workout tab opens templates-first | minimal | high |
| **Runna** | Run (+accessory lift) | ~4–5, plan-centric "Today" | Plan card → one-tap Start | none of note | medium (repo docs) |
| **Tropos today** | **Lift + Run + Food** | **5** — Home · Train · Food · Social · Analytics | **None in nav** — start/log lives inside pages | **top-level tab (cold-start graph)** | VERIFIED `Layout.tsx:39-45` |

**Three patterns converge (3+ apps → convention):**

- **3–5 tabs, never more.** Every app here runs 3–5. Growth is absorbed by _consolidation_
  (Strava merged Profile+Training → "You") and _nesting_ (Strava's 2026 Events is a
  sub-tab under Groups, not a 6th tab; Cronometer killed a standalone Trends tab into
  Discover). **New feature → deepen a hub, don't widen the bar.**
- **Primary action ≤1 tap — via one of two shapes.** Single-log domains (food, run) use a
  **center [+] or center tab**. Heavier, longer-lived actions (a lift session) get the
  **domain tab as the start surface** (Hevy/Strong have _no_ FAB). This split matters for
  Tropos (§E): the lifting benchmarks argue _against_ a center "+".
- **Social is deliberately secondary in the single-sport leaders.** NRC parks Club as
  opt-in; its stated philosophy is "compete with your past self." This corroborates
  Tropos's solo-first direction — and is evidence for demoting Social's _nav slot_ (§E-2).

### A.2 — Onboarding: speed-to-first-value beats profile capture

- **NRC** deliberately asks almost nothing up front (weight/height/experience) and defers
  plan personalization into the Plans tab — optimizing "get a beginner moving in a few
  taps" over day-one plan accuracy.
- **MacroFactor** is explicit that its adaptive numbers are **provisional for 2–3 weeks**
  until enough data exists — it never pretends day-1 targets are final.
- **Strava** asks the privacy decision (who sees my activity) _up front_, because for a
  social product it's too consequential to default silently.

### A.3 — The habit loop: weekly cadence, near-zero-friction reward, a return trigger

- **Weekly, not daily, streaks** is the training-app convention. NRC's public rationale:
  illness/travel/weather interrupt training without reflecting motivation loss. Hevy's
  streak is consecutive _weeks_ with ≥1 session. Tropos already made this call (forgiving
  streak engine) — this is external validation, and it constrains the "day-2 nudge" fix
  (§D-1).
- **Strava's kudos loop** works because it's one tap and arrives as a push almost
  immediately after logging — 14B+ kudos/yr. The lesson: keep the kudos-equivalent to a
  single tap, no confirmation.
- **The costliest 2025–26 mistakes were _legibility_ regressions, not missing features.**
  Strava's redesign hid the nav and broke feed recency ("a disaster"); MFP's April-2026
  redesign folded the Diary behind a "View All" and dropped per-meal subtotals — sustained
  backlash on both. **Guardrail for any Tropos Social/Food redesign: never trade loop
  legibility/speed for a prettier screen.**

---

## Part B — The user-psychology lessons (the "why")

These are the established laws the repo already leans on (`docs/design-principles.md` cites
Hick, Nielsen, Doherty, peak-end, defaults-save-lives) plus the HIG/retention layer. Where
a number is from general HCI/HIG knowledge rather than verified in-repo, it's marked
**[established]**.

1. **Tab count is a cognitive-load decision. [established]** Apple's HIG recommends a bottom
   tab bar for a small number of top-level destinations (practically 3–5); beyond ~5 the
   targets shrink below comfortable tap size and the bar stops being glanceable. **Hick's
   Law** (decision time grows with options) and **Miller's 7±2** both say: fewer top-level
   choices = faster, calmer navigation. This is _why_ every reference app sits at 3–5.
2. **Activation = time-to-first-value.** A week-one user forms a judgement in the first
   session or two. The job is to get them to a _felt payoff_ before asking for effort or
   money. Tropos's onboarding correctly ends on a "Your plan is ready" payoff
   (`Onboarding.tsx:249-276`) — good — but the payoff is destroyed if the session doesn't
   survive (§D-2).
3. **The Hook model (trigger → action → variable reward → investment).** Retention needs an
   _external trigger_ to restart the loop. The most fragile moment is day-1→day-2: the
   internal trigger (habit) doesn't exist yet, so an external one (a notification) must
   carry it. This is exactly where Tropos has a structural gap (§D-1).
4. **Loss aversion powers streaks — but only after there's something to lose.** A streak
   reminder is meaningless at streak 0–1. That's the correct instinct behind Tropos's
   `>=2` floor — but it collides with the need for a _first_ return trigger, and the fix is
   not "nag daily from day 1" (that re-introduces the anxiety the weekly cadence avoids) but
   "secure notification consent early and fire one calm first-week nudge" (§D-1).
5. **Peak-end rule.** People judge an experience by its peak and its _end_. Tropos's own
   `design-principles.md` flags the RunSummary ending as a known weak close (long scroll +
   manual save + injected share). A strong ending is cheap and disproportionately
   memorable (§F-8).
6. **Notification-permission psychology. [established]** Prompting for OS notification
   permission _before_ demonstrated value depresses grant rates, and a denial is usually
   permanent — it kills every local-notification trigger downstream. The permission ask
   must be primed (soft-prompt) at a moment of value, not on first open. This is the hidden
   dependency under the entire §D-1 fix and the first pass missed it.

---

## Part C — The optimal tab count for Tropos (the headline question)

**Verdict: keep the bottom bar at ≤5 tabs. Do not add a sixth. The count is not the
problem — the _contents_ and the _missing primary action_ are.**

- **5 is within convention and within HIG guidance.** NRC and Strava both run 5; nutrition
  and lifting apps run 3–4. Tropos spans three domains, so 5 is the _defensible top end_,
  not an excess. Adding a 6th (a "Coach" tab, a standalone "Log" tab) would break the
  glanceable bar and violate the pattern every leader follows.
- **The lever is slot allocation.** Tropos spends one of five prime slots on **Social**,
  which is 100% cold-start at launch and locked as **P2 "don't jump the queue"**
  (`competitive-analysis-running-2026.md §6`; `CONTEXT.md`). NRC — the closest single-sport
  analog — deliberately parks its social tab as secondary. That's the weakest slot and the
  first candidate to demote (§E-2, a product call).
- **The lever is the primary action.** Tropos is the only three-domain app in the
  benchmark, and it's the _only_ one with no ≤1-tap primary action in the nav
  (`Layout.tsx:39-45`). Every single-domain app solved this; Tropos hasn't, because no
  single center action cleanly serves lift+run+food. §E is the decision.

**Argue against (keep 5 exactly as-is, change nothing).** _"5 flat tabs is fine — it maps
to the five things the app does, the nav is calm, and every proposed change adds a modal or
buries a feature."_ This loses on one point: the benchmark shows 5 tabs is only "fine" when
the primary action is ≤1 tap and the slots hold high-frequency destinations. Tropos fails
both — the primary actions are inside pages, and a whole slot points at an inert cold-start
feed. Keeping the count is right; keeping the _allocation_ and the _missing action_ is not.

---

## Part D — What loses a week-one Tropos user (ranked, verified, corrected)

The research pass produced three findings. All three survived verification; **two required
material correction**, noted inline. Ranked by likelihood × reach.

### D-1 — The day-1 → day-2 return-trigger blind spot (highest — affects 100% of users)

**The corrected finding.** The synthesis claimed "no server-side win-back exists." **That
is wrong** — a sophisticated push system already ships:

- Hourly streak-at-risk push cron (`functions/index.js:2387,2701` — "Push #961"), which
  even correctly counts meals as activity (`index.js:2441`), plus a badge-earned nudge
  (`:2501`) and a daily recap (`:2578`).

But the _sharper_ finding holds and is worse for being systemic: **every trigger is
uniformly floored at `currentStreak >= 2` AND requires push-consent**, and the consent
opt-in can't appear until the same `>=2` floor _after a completed workout_:

- Client scheduler: `if (state.currentStreak < 2) return false` — **VERIFIED**
  `useStreakReminder.ts:91`.
- Server sender: `if (currentStreak < STREAK_NUDGE_MIN_STREAK) return false` (=2) +
  `remindersOptedIn` — **VERIFIED** `functions/lib/streakNudge.js:68`, consent at
  `index.js:2423`.
- Permission-priming modal: gated `< 2` **and fires only post-workout-completion** —
  **VERIFIED** `StreakReminderPrimingModal.tsx:51,57-61`.
- Meal + workout reminders default `enabled: false` — **VERIFIED** `useMealReminders.ts:24`.

**Net:** a brand-new user who logs once on day 1 and closes the app has (a) never been
offered notification permission, and (b) no trigger that can fire below streak 2 anyway. If
they don't reopen on their own, they are unreachable. This is the textbook churn moment and
it is structurally open.

**Fix direction (and the contrarian counter it must respect).** The naive fix — "fire a
'come back tomorrow' push on day 1" — collides with the deliberately-forgiving,
weekly-cadence streak philosophy (NRC's exact rationale; Tropos already made this call).
Daily nagging is the anxiety the brand avoids. The _right_ shape:
(1) **secure notification consent early** — move the soft-prime to the first-log
celebration (a value moment), decoupled from the `>=2` streak gate, and handle the denial
path;
(2) fire **one calm first-week nudge** (not a daily streak alarm) below the `>=2` floor;
(3) the server infra already exists — this is a threshold/opt-in-timing change, not a
build-from-scratch. **iOS-parity caveat:** this is native notification work — leave a
web-visible seam and route it through the design-capture channel; the OS-permission funnel
is the make-or-break dependency.

### D-2 — First-session survival: onboarding progress is destroyed by a backgrounding

**VERIFIED.** All onboarding answers live in bare `useState` with **no** `localStorage` /
draft persistence (grep for `localStorage|sessionStorage|draft` in `Onboarding.tsx` →
nothing; state at `Onboarding.tsx:305`). On a native iOS app, a phone call or notification
swipe across the 6 data-entry steps loses everything and restarts at step 0. It compounds
with 6 input screens before any computed value (preview at step index 6 of 8,
`Onboarding.tsx:243-276`).

**Honest severity (corrected).** The first pass rated this a flat "high." The honest
framing is **high-consequence-when-it-fires, moderate-frequency**: WKWebView often preserves
in-memory JS state across _brief_ backgrounding, so it doesn't fire every interruption — but
when the webview is evicted, it's a hard first-session abandon with zero recovery.
**Fix direction:** persist a uid-scoped draft to `localStorage` on each step change,
rehydrate on mount, clear on `completeOnboarding`. Pure survival fix, no flow redesign.

### D-3 — The differentiator is invisible (and under-signposted for free users)

**VERIFIED, with the synthesis's over-claim corrected.** Training-responsive macros are the
stated moat vs MyFitnessPal/Cronometer. The only in-product signal is a `text-xs`, muted,
truncating caption on the Food hero (`captionBuilder.ts` builds "Lift day · +150 cal";
**null on rest days**, `captionBuilder.ts:35`). The drill-down sheet built specifically to
explain the numbers never mentions day type (**REPORTED** — `HeroDrillDownSheet.tsx` has no
`dayType`/`caption`/`intensity` reference). The first-time explainer was removed and not
replaced (**REPORTED** `FoodHeroCard.tsx:222-225`).

For free users: `macroIntensity = isPro ? intensity : "REST"` — **VERIFIED**
`useEffectiveTargets.ts:356` — so free users' macros compute as flat REST while the label is
derived from the _real_ intensity for everyone (`:444-455`). **Correction:** the synthesis
called this "reads as broken." The code comment (`:353-355,444-446`) shows this is a
deliberate **"conversion hook"** that "NEVER asserts a macro change." So the honest finding
is not "it's a bug" (an untested inference) — it's that the hook is **so subtle it may not
convert**: there's no "Pro" chip/lock tying the label to a purchasable feature, so an
attentive free user has no path from "Lift day" to "this is a Pro capability."

**Is the moat felt or invisible? Invisible — architecturally present, user-legible almost
nowhere.** What makes a user notice (fix direction): one plain-language causal line in the
drill-down for Pro ("carbs up, fat down today — it's a hard training day"); a first-log
moment that says "your targets shift with your training"; a Pro chip on the caption for free
users so the hook is legible as _gated_, not inert. The running roadmap already _plans_ this
("surface the nutrition↔training loop as a first-class story", `competitive-analysis-running-2026.md:145`)
— this is the concrete UI direction for that planned work, not a new proposal.

**Argue against the whole ranking.** _"None of these three is the killer — Tropos is a
fifth app fighting entrenched incumbents; the user churns because the value prop doesn't beat
their stack at the moment of use."_ Why it loses: that argument _is_ finding D-3, and it
presupposes the user survived D-1 and D-2 to run the comparison at all. You can't lose a
value bake-off the user never returns to run. The counter is real but ranks _third_, not
first — it names the deepest problem while getting the sequencing backwards.

---

## Part E — The IA / navigation decision (contested — includes product calls)

This is where the first pass was most confident and most wrong. Corrected below.

### E-1 — The primary action: the center "+" is an OPTION, not the obvious answer

**What the first pass claimed:** add a flush center "+" opening a day-type-ranked
quick-start sheet, because the primary actions are only reachable via Home + scroll.

**The correction (VERIFIED):** lift **and** run already start from the **Train tab** via
`SessionCommandCard`'s single primary Start action (`Program.tsx:1009` renders
`SessionCommandCard sport="lift"`; the run sub-tab mirrors it; `ProgramTab = "lift" | "run"`
at `Program.tsx:157`). So the "only reachable via Home" premise is overstated — those two
have a home on the Train tab. The genuine tap-count win of a center "+" is narrow: **log
food from a non-Food tab**, and giving **Run a single consistent entry** (today `/run` is a
homeless full-screen route reachable only from Home pills, `Layout.tsx:49,215`).

**Two further problems the first pass glossed:**

- **Lock collision.** A center-"+"→"Log food" fast-add is a **second** food-composer entry
  surface, in direct tension with the locked **"one composer entry surface for food"**
  decision (`design-principles.md` meta-rule; the standing quick-add strip was deliberately
  removed, wave2 D / PR #1223). This must be reconciled, not ignored.
- **The lifting benchmarks argue _against_ a center action.** Hevy and Strong have **no
  FAB** — the Workout tab _is_ the start. The center-[+] pattern is a nutrition/run
  convention, not universal.

**Recommendation (ranked):**

1. **Adopt the Hevy/Strong model first (low-risk, lock-safe):** make each domain tab open
   directly to its start surface — Train → the day-relevant `SessionCommandCard` Start,
   Food → the composer focused. This gets the primary action to ~1 tap without a new
   composer entry, without touching the "one food composer" lock, and without rewiring the
   nav.
2. **Give Run a consistent home** — surface Start Run inside the Train tab's run sub-tab as
   a first-class Start (it already has the `SessionCommandCard`), so Run stops being a
   Home-pill-only action.
3. **The center "+" is a genuine product call, not an engineering default** (§E-4). If
   pursued, it is _fast-add only_ (weight, quick food) and must reconcile the composer lock
   explicitly, plus spec the nav rewiring below.

**Nav-rewiring cost the first pass ignored (must be specced if a center slot is added):**
the bar is 5 equal `flex-1` cells with a single shared Framer `layoutId="nav-active-pill"`
that glides between tabs, with a reduced-motion static fallback (`Layout.tsx:231-330`).
Inserting a **non-tab** center slot means specifying how the gliding pill behaves around a
slot that isn't a destination, the reduced-motion state, and the `IconButton`'s
accessible-label/expanded semantics. This is high-blast-radius work, not a quick add.

### E-2 — Demote Social off the bottom nav (PRODUCT CALL — genuinely two-sided)

**The case for:** Social occupies a prime slot pointing at a 100%-cold-start graph; the
positioning is locked P2 ("don't jump the queue"); NRC parks its social tab as secondary
for the same reason. Demoting to a Home-header people-icon (unread dot preserved) frees the
slot and is fully reversible once retention + graph exist.

**The contrarian counter (why this is a product call, not an engineering one):** the
`SoloFirstFeed` cold-start stack was a _deliberate, heavy_ investment (Soc8 PR3) built
precisely so the 100%-cold-start launch cohort sees a **designed** social state — the exact
"design cold-start for 1000 users" mandate. Burying it behind a header icon undercuts that
investment. And the P2 lock is about not _adding/promoting_ social features — it is not
obviously a mandate to _demote the one that ships_. Reasonable people differ. **Flag for the
product owner** (§E-4). Also note: demoting to the Home header crowds a header that already
carries the wordmark + streak flame + settings, and must still announce unread count — spec
the a11y if pursued.

### E-3 — Keep Food's diary independently reachable, keep Analytics its own tab

- **Food diary stays first-class** — this is a guardrail, not a nicety. MFP's April-2026
  fold of the Diary into a summary "Today" is eating a live backlash. Whatever happens with
  a center "+", the meal-by-meal diary with per-meal subtotals must not nest a tap deeper.
- **Analytics/History stays its own tab** — it's genuine drill-down content (Hevy, Strava,
  Strong all keep a dedicated data/self tab); do not fold it into Home. Renaming "Analytics"
  → "Progress" for legibility is a low-priority owner's call.
- **Badge parity:** only Social carries a nav dot today (`Layout.tsx:233`); server-set
  return-critical state (streak-at-risk, fell-behind) lands on Home invisibly. Generalize
  the dot to Home. Low effort, real reach.

### E-4 — Decisions that need YOU, not an engineer

1. **Add a center "+" at all?** (tap-savings are narrow, it touches a lock and the nav
   machinery) — vs the lock-safe domain-tab-start model in E-1.
2. **Demote Social's nav slot?** (frees prime real estate vs undercuts the Soc8 cold-start
   investment) — E-2.
3. **Rename "Analytics" → "Progress"?** — cosmetic, owner's taste.

---

## Part F — The ranked "relentless improvement" backlog

Ordered by retention consequence, not effort. Constraints baked in: respect the design
system (coral=running, purple=lifting, orange=nutrition-as-data-identity; 44px targets;
Archivo numerals; `Button`/`IconButton`/`Toggle` primitives; no new colours), the locked
decisions (run two-state model, one food composer, hero-vs-pill weight, weekly-cadence
streak, P2 social), and the **iOS-parity rule** (native features leave a web-visible seam).
Effort: **S** ≤ a few days · **M** ~1–2 wks · **L** multi-week/native.

| # | Item | Direction | Impact | Effort |
|---|---|---|---|---|
| 1 | **Notification-consent funnel + first-week return trigger** | Move the soft-prime to the first-log celebration (decouple from `>=2`), handle denial, fire one calm sub-`>=2` first-week nudge. Server infra exists (`index.js:2387`); this is threshold + opt-in-timing. **Native — leave web seam + OS-permission funnel.** | High | M |
| 2 | **Persist onboarding as a uid-scoped draft** | `localStorage` write per step, rehydrate on mount, clear on complete (`Onboarding.tsx:305`). Removes a hard first-session abandon. | High | S |
| 3 | **Make the nutrition moat legible + honest** | Causal line in `HeroDrillDownSheet` (Pro); first-log "targets shift with training" moment; Pro chip on the free-user caption so the conversion hook (`useEffectiveTargets.ts:356`) reads as gated, not inert. Implements the planned "nutrition↔training story." | High | M |
| 4 | **Onboarding-time opt-in for meal + workout reminders** | Mirror the streak-priming pattern: after "Start my program", one `Toggle` to enable the two reminders that default off (`useMealReminders.ts:24`). Turns on return triggers before Settings discovery. | High | S |
| 5 | **Domain-tab-as-start-surface (lock-safe primary action)** | Train opens to the day-relevant `SessionCommandCard` Start; Food opens the composer focused; give Run a first-class Start in the Train run sub-tab. No new composer entry, no nav rewiring. | High | M |
| 6 | **Cold-start Home: one unambiguous "start here"** | For the zero-data user, elevate ONE primary CTA (the day-type card) and soften the two competing empty-state CTAs until after the first log (`Home.tsx:1020-1251`). Reuse `EmptyState`. | Med | M |
| 7 | **Badge parity on Home** | Generalize `Layout.tsx:233` beyond Social so return-critical server state shows a dot on Home; keep it a dot, aria-label the count. | Med | S |
| 8 | **Strengthen the RunSummary peak-end close** | Doc-flagged peak-end violation: collapse the long scroll + manual save + injected share into an immediate glanceable celebration, auto-save, share as one-tap secondary. coral throughout, motion-safe. | Med | L |
| 9 | **Provisional-targets cold-start state (nutrition)** | Tell new users "targets are provisional until N weeks of data" as an explicit UI state (MacroFactor states its 2–3 wk ramp outright), not a silent formula fallback. | Med | M |
| 10 | **Name the differentiator in upsell copy** | Replace the generic "AI adaptive macros" bullet (`Upgrade.tsx:309,401`) with "macros that shift with your training" so a user who notices the caption has a path to the Pro story. | Med | S |
| 11 | **Default the injuries step to "none" / opt-in** | Drop the mandatory tap for the majority no-injury path (`Onboarding.tsx` injuries step) — one fewer pre-payoff screen. | Low | S |
| 12 | **Differentiate the final onboarding-save loading copy** | The ~1.2s payoff-moment retry hangs silently; add "Setting up your program…" so the highest-stakes transition doesn't read as frozen. Copy only. | Low | S |
| 13 | **Under-16 dead-end gets a recovery affordance** | The legal gate stays, but add a support link / "check back" copy so it reads designed, not broken. (REPORTED — re-trace before building.) | Low | S |
| 14 | **Surface run-plan / lift-plan editing one level up in Settings** | They're 3-deep and absent from `SettingsIndex`; add index rows for the frequent plan-edit task. Pure IA. | Low | S |
| 15 | **Standing guardrail: never fold the Food diary behind a summary** | Rejection-in-advance of an MFP-2026-style regression. Not a build — a constraint on any future "simplify Home/Food" pass. | — | — |

**Argue against the whole backlog ("the frontend is already good enough; spend effort on
HR/HealthKit").** The audits keep finding _designed_ states, and the competitive analysis
says the real conversion blocker for serious runners is HR/zones + Apple Watch. Why it
loses: "the screens look designed" and "the loop retains users" are different claims. A
beautiful cold-start card fails if no notification brings the user back to see it. And the
HR/HealthKit work is correctly locked as native-operator-gated P0 with no timeline — it
can't ship from this frontend surface, and the roadmap explicitly sequences
retention-proving before feature-expansion. The highest-leverage _shippable frontend_ work
is the loop repair above.

---

## Guardrails — locked decisions this work must NOT reverse

Re-litigating a lock is wasted effort even when it lands in the same place (CLAUDE.md
plan-file discipline). Verified against the docs during this pass:

- **Run surface is two states only** (freeform + race overlay), **no mode toggle**
  (`design-principles.md #7`, `resolveRunPlanSurface`). Don't reintroduce structured mode.
- **One composer entry surface for food** — the standing quick-add strip was deliberately
  removed (wave2 D / PR #1223). A center-"+"→food must reconcile this, not bypass it.
- **Orange = nutrition/data identity, not a button colour**; coral = running, purple =
  lifting. No new colours.
- **The hero-card-vs-action-pill visual-weight difference is intentional** (CLAUDE.md
  "Current Known Design Considerations"). Elevating a nav-level action must not silently
  re-litigate the pills' deliberate secondary status.
- **Weekly-cadence, forgiving streak** — the `>=2` floor and grace model are deliberate
  anti-anxiety choices. The D-1 fix works _with_ them (consent timing + one calm nudge), not
  by adding daily streak pressure.
- **Social = P2, "don't jump the queue."** Demoting the nav slot is _aligned_ with the
  lock; do not use this doc as licence to _build_ new social surface.

---

## What a normal session implements from this (cheap follow-on prompts)

Each converts to a scoped, testable normal-session task on its own `claude/…` branch:

1. **`fix/onboarding-draft-persist`** — F-2. localStorage draft + rehydrate + clear-on-complete; unit test that a simulated remount restores step + answers. (Lowest risk, ship first.)
2. **`fix/reminder-onboarding-optin`** — F-4. One `Toggle` after "Start my program" enabling meal/workout reminders; test the write.
3. **`fix/notification-consent-funnel`** — F-1. Move soft-prime to first-log; add denial handling; lower first-week nudge below `>=2`. **Native — leave the web-visible seam + route through app-screenshots.yml.**
4. **`fix/nutrition-moat-legibility`** — F-3 + F-10. Drill-down causal line + free-user Pro chip + upsell copy; parity test that the `isPro ? intensity : "REST"` gate now reads as gated, not inert.
5. **`fix/domain-tab-start`** — F-5. Train/Food/Run open to their start surface; no new composer entry.
6. **`fix/home-coldstart-hierarchy`** — F-6. One primary CTA for zero-data users.
7. **`fix/home-badge-parity`** — F-7. Generalize the nav dot.
8. **`design/runsummary-peak-end`** — F-8. Collapse the close; auto-save; one-tap share.

**Deferred to a product call (do NOT build without a decision):** the center "+" (§E-1/E-4),
demoting Social's nav slot (§E-2), renaming Analytics→Progress (§E-3).

---

## Confidence & sources

- **VERIFIED in code this session:** `Layout.tsx:39-45,231-330` (5 flat tabs, no center,
  Social-only badge); `useStreakReminder.ts:91` + `StreakReminderPrimingModal.tsx:51,57-61`
  + `streakNudge.js:68` + `index.js:2387,2423,2441` (the `>=2` + consent floor across
  client + server; server push infra EXISTS); `useEffectiveTargets.ts:356,444-455` (free
  macro REST gate + label = conversion hook); `Onboarding.tsx:243-276,305` + no-localStorage
  grep; `Program.tsx:157,1009` (lift+run start from Train); `captionBuilder.ts:35` (moat
  caption, null on rest).
- **REPORTED (research pass, not personally re-traced):** `HeroDrillDownSheet` silent on day
  type; `FoodHeroCard.tsx:222-225` explainer removed; under-16 dead-end; `Upgrade.tsx`
  copy. Re-trace before building against these.
- **Reference-app tabs (live-web, WebSearch-synthesised, July 2026):** NRC 5 (center Run);
  Strava 5 (center Record, held at 5 by consolidation + sub-tab nesting; 2025 legibility
  backlash); MFP 4+[+] (2026 diary-fold backlash); Cronometer 3; Hevy/Strong 4 (no FAB).
  **MacroFactor tab count is LOW-confidence** — the research could not confirm a definitive
  list; do not cite it as load-bearing.
- **[established] HCI/HIG knowledge:** HIG ≤5 bottom tabs, Hick's Law, Miller 7±2, Hook
  model, peak-end, notification-permission psychology. The Runna + psychology deep-dive
  research agents failed the sandbox web layer; those threads lean on the repo's existing
  `competitive-analysis*.md` / `design-principles.md` + established knowledge.
- **Builds on, does not re-derive:** `docs/design-principles.md`, `docs/competitive-analysis.md`,
  `docs/competitive-analysis-running-2026.md`, `docs/cold-start-payoff-audit.md`,
  `docs/social-activation.md`, `CONTEXT.md`, `DESIGN_GUIDE.md`.

# The app-improvement prompt

The reusable prompt for a whole-app improvement pass — security, guards,
de-slop, front-end, design — written after the 2026-09-04 survey so the
next run starts from measured evidence instead of a fresh audit. Paste the
block, edit the bracketed lines. The sibling `visual-pass-prompt.md` in this
directory is the narrower pixels-only pass; this one is broader and expects
to run as a workflow.

Every `file:line` in the block was measured on 2026-09-04 in a sandbox
clone (the `≈` marks that). They are starting points, not a checklist — the
prompt tells the agent to re-verify each against the tree before acting,
and a citation that no longer holds is itself a finding. What each clause
buys is explained below the block; delete clauses you disagree with, but
read why they exist first.

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
.claude/plans/programme-run-followups.md, and the three prior security
audits in docs/audits/. An audit that re-derives a locked decision is wasted
effort even when it lands in the same place.

GROUND YOURSELF — this sandbox misleads in three ways:
- The clone is SHALLOW (`git rev-parse --is-shallow-repository` → true).
  `git log` shows ~50 commits of a repo whose PR numbers run past #2130.
  Run `git fetch --unshallow` before any claim about history, and never
  keep a history-narrating comment because "git has no record" — it does.
- Dependencies are not installed. `npm ci` (≈30 s), then take the baseline:
  `npm run lint` (2026-09-04: 0 errors, 99 warnings), `npm run check:cycles`
  (clean), `npx vitest run` (647 files, 7,805 tests passing, ≈3.6 min),
  `npx tsc -b`. Record the numbers; every PR reports movement against them.
- Every file:line below was measured on 2026-09-04. Re-verify against the
  current tree before acting. They are where to start, not a to-do list,
  and a citation that no longer holds is a finding in itself.

STANDING RULES — do not re-litigate, do not work around:
- Plan-file locks, ADRs 0001–0012, and CLAUDE.md's standing calls stand.
  In particular: Run9a two-state run surface (no mode toggle); one food
  composer; hero-card vs action-pill weight is intentional; weekly-cadence
  forgiving streak; Social is P2; orange is a data identity, not a button
  colour; Food9 meal photos are device-local; Sub4 keeps the Stripe
  BACKEND dormant (removing an UNIMPORTED client package is not that
  teardown — see 3c).
- Deferred product calls — do NOT build: the centre "+" action, demoting
  Social's nav slot, renaming Analytics → Progress (frontend-design-
  principles §E). Put them in the open-questions memo if you must.
- ADR-0001: file size is not a depth signal. Do not split a page because it
  is long; move PURE LOGIC out of pages into src/lib (3d below).
- Never call raw setDoc/addDoc/updateDoc; every new persisted profile field
  goes in functions/profileSanitizer.js's allow-list; triggers are
  at-least-once and concurrent; never mix local-date and UTC;
  onAuthStateChanged fires several times; the tested copy does not prove
  the running copy (mirror parity pins the functions/ copy). All CLAUDE.md.
- The `/baseline-ui` skill mandates Radix/Base UI and motion/react. That is
  not this stack. Use it only as a slop-review lens; never its stack rules.
- graphify: no graph exists unless graphify-out/graph.json does. Do not
  create one, and ignore its hook nudge on verification work.
- Comments are not a tax to be minimised: keep every comment that states an
  invariant, a mirror coupling, or a why the code cannot express (3a).

────────────────────────────────────────────────────────────────────────
WORKSTREAM 1 — SECURITY
The prior audits (docs/audits/2026-05-25, 2026-05-26 with twelve findings,
2026-07-09 money path) are CLOSED in code — re-verified 2026-09-04
(finding #5 is moot: crews retired). Do not re-audit Stripe/Apple webhook
verification, billing self-grant rules, activity read visibility, Storage
MIME/size caps, account-deletion re-auth, password-reset enumeration,
Vertex log redaction, or the rate-limiter. Fix what is actually open:

1a. RULES — unvalidated URL fields rendered to other users. `activities`
    create allow-lists `authorPhotoURL` with no type, size or domain check
    (firestore.rules ≈582, ≈596-610), and it renders into <img src> for
    every feed viewer (src/components/Avatar.tsx ≈100). `spaces/{id}/posts`
    accepts `authorPhotoURL` and `photoUrl` as bare strings (≈1010-1017;
    rendered at src/features/spaces/SpacePostCard.tsx ≈311). Challenge
    participants (≈869-880) and space members (≈959-970): same pattern.
    FIX: apply the domain allow-list + length cap that `users/{uid}/public`
    already uses (≈478-489) to all four; cap `weekKey` and `id` on
    goalSpaces/{id}/events (≈1483-1489). Add rules tests — the test is the
    deliverable — for every path with zero coverage today: blocks,
    goalSpaces events, users/{uid}/{errors, progressPhotos,
    progressCheckins, privacyZones, checkins, trainingBlocks, journeys,
    nutritionCommitments, performance, devices}, and spaces posts
    likes/comments. Run `npm run test:rules`.
1b. PROMPT INJECTION — `analyzeFoodText` interpolates user text into the
    Gemini instruction string with only a quote escape (functions/index.js
    ≈1418-1425); a trailing backslash or a newline breaks out of the quoted
    span. `analyzeFood` (≈1230) is the correct shape: static prompt, user
    data as a separate content part. Match it, and pin with a test that
    text containing newlines and instruction-like phrases cannot alter the
    instruction segment (the cross-repo contract style of
    aiFoodIdentification.test.ts).
1c. CORS — `cors({ origin: true })` (functions/index.js ≈17) reflects any
    origin on the two most expensive endpoints (≈1106, ≈1332).
    `createCheckoutSession` already uses helpers.getAppCorsOptions(). Use it.
1d. RATE LIMITS via the existing functions/rateLimiter.js on
    backfillMyActivityCategories (≈5295) and recreditMyLiftVolume (≈5398)
    — a 500-doc scan+write per call, uncapped — plus applyProgramCommand
    (≈1032) and sendTestPush (≈3208).
1e. HEADERS — firebase.json Hosting sets only Cache-Control. Add
    Strict-Transport-Security, X-Content-Type-Options: nosniff,
    Referrer-Policy: strict-origin-when-cross-origin, a Permissions-Policy
    that still grants camera and geolocation to self (the app uses both),
    and anti-framing. `frame-ancestors` is IGNORED in a <meta> CSP — it
    must be an HTTP header, so serve the CSP (or X-Frame-Options: DENY)
    from firebase.json too. Add `form-action` to index.html's CSP. Trace
    `https://raw.githubusercontent.com` in connect-src (index.html ≈51):
    find the fetch or remove it. GitHub Pages cannot set headers; record
    that as accepted (Pages is the preview surface, not the product).
1f. SUPPLY CHAIN — `npm audit --omit=dev`: root reports 6 (2 critical: tar,
    websocket-driver; fixes available) → fix, then add a CI job that fails
    on high+ for the ROOT tree. functions/ reports 16 (1 critical) and is
    the documented firebase-admin 14 decision in CLAUDE.md — report-only
    there, cite the decision, do not start the v14 migration. SHA-pin every
    GitHub Action in all 15 workflows (keep a `# vX` comment so
    Dependabot's github-actions updates keep flowing). dependabot-auto-
    merge.yml runs on pull_request_target with write permissions and is
    safe ONLY because it never checks out PR code — add a source-scan
    guard test asserting no actions/checkout step ever appears in it. Add
    functions/.runtimeconfig.json to .gitignore.
1g. EMAIL VERIFICATION is never enforced (only a badge in
    settings/SecuritySection.tsx; `email_verified` appears nowhere in the
    rules). Decision: gate PUBLIC WRITES only — activities, space posts,
    comments — in rules AND with a client pre-check whose copy follows
    voice-and-tone; private logging stays ungated; OAuth accounts are
    already verified. [Owner: change this line to "surface only, no gate"
    if you disagree.]
1h. LOCAL STORAGE — 106 raw getItem/setItem calls across 33 modules and no
    wrapper; `tropos.account_deleted` and the bare OUTBOX/QUEUE/STORAGE
    keys are not uid-scoped (the theme key is global by design). Build one
    small wrapper module in src/lib (try/catch, JSON-safe, a uid-scoping
    helper), migrate, and add a guard banning raw localStorage outside it
    and public/init.js.
1i. LEAVE, WITH A NOTE: App Check enforcement is operator-gated
    (docs/app-check-rollout.md) — keep the seam, put the flip on the
    operator checklist. Admin authority via the ADMIN_UIDS env var is a
    documented trade-off. Default auth persistence is right for a mobile
    app — say so in one line in src/lib/auth.tsx's header; change nothing.

────────────────────────────────────────────────────────────────────────
WORKSTREAM 2 — GUARDS (extend the gates that exist; add no parallel ones)
Every guard is revert-tested (break it deliberately, watch it fail,
restore) and added to docs/invariant-guards.md's table. A ratchet pins a
baseline that only decreases; raising it needs a written reason in the test.
- firestoreWriteGuard.test.ts ≈41: RAW_WRITE lacks `deleteDoc` — about 20
  raw sites (socialApi.ts, sessionDelete.ts, useFoodFavourites.ts,
  SpacePostCard.tsx …). Add a `deleteDocGuarded` to
  src/lib/firestoreWrite.ts with the same offline-replay semantics as its
  siblings, migrate, extend the regex, and add the word to CLAUDE.md's
  "never raw" rule.
- symbolReachability.test.ts ≈128: DOMAIN_ROOTS omits src/utils and
  src/pages — four live orphans (calorieBalance.ts estimateBMR and
  NEAR_MAINTENANCE_THRESHOLD, dailyBurn.ts estimateStepCalories,
  formatters.ts formatStat). Delete them, add the roots.
- componentReachability.test.ts: add src/features/**/*.tsx to the scan.
  The allowlist is empty — keep it that way.
- unitTreatment.test.ts scans src/ only; functions/lib/socialFanout.js ≈65
  ships `${km}km` in notification copy. Fix it and cover functions/lib
  copy (a sibling test in functions/__tests__ is fine).
- claudeMdFreshness.test.ts: pin that every `path=` in src/App.tsx is named
  in CLAUDE.md's Pages table (explicit allowlist for /dev/*). Routes are
  not volatile counts; the test's existing ban on counts stays.
- designSystemInvariants.test.ts: add ratchets for raw `<button` in
  components/pages/features (baseline 395 — pressable cards, rows and
  day-cells are legitimate, hence a ratchet not a ban), `font-medium`
  (310), CSS animation classes without `motion-safe:` (≈39), and the page
  h1 class (`text-xl font-extrabold`).
- eslint.config.js: the hex ban misses object-property literals —
  ui/Dialog.tsx ≈106 carries `bg-[#1A1A1F]` unflagged. Extend the selector
  to Property literals and template strings. Pin lint at
  `--max-warnings <current>` as a ratchet (the 99 are WARN on purpose,
  #1051 — fix real bugs, don't chase zero).
- New and small: a src/styles class-usage gate (20 dead classes and 9
  keyframes today); the archaeology-marker ratchet (3a); a wholesale
  `vi.mock("firebase/firestore")` ratchet (58 files against 53 on the
  ADR-0009 fake — new and touched tests use the fake); a dist-size ratchet
  run after `npm run build` (per-chunk JSON baseline, fails on >5% growth
  without a baseline bump in the same PR — `chunkSizeWarningLimit: 1100`
  is a raised warning, not a budget).

────────────────────────────────────────────────────────────────────────
WORKSTREAM 3 — DE-SLOP
Orphan components are at ZERO (componentReachability's allowlist is empty);
production has one real `any` (lazyRetry.ts, justified); every
toLocaleDateString passes a locale; en-GB copy is consistent. Spend no time
there. The slop that is actually here:

3a. ARCHAEOLOGY IN SOURCE — the dominant class. 24.4% of all source lines
    are comments (≈49,000 of ≈201,000). Non-test source carries 240 PR
    citations in 115 files, 374 dated notes in 157 files, 170 "used to",
    and 24 header comments over 40 lines. Worst comment share:
    functions/lib/pushConsent.js 80%, challengeMarkers.js 75%,
    runHudTypography.ts 75%, nutritionPhase.js 74%, foodParseHelpers.ts
    74%, socialGates.ts 74%, analytics.ts 72%, performanceDocFields.ts
    70%, distanceUnits.ts 67%.
    THE POLICY (decided — apply it, don't debate it):
    KEEP a comment that states an invariant, names a mirror or cross-test,
      or explains a why the code cannot express. Reference shapes:
      performanceEngine.ts ≈467 (mirror pin), prTracking.ts ≈140 (counter
      → celebration coupling), webBackController.ts ≈45 (self-consuming
      history entry).
    MOVE OUT a comment whose content is what the code USED to do, a PR or
      date narrative, or a preserved old string. Reference shapes:
      bodySideData.ts ≈279/328/470 (superseded coordinates), analytics.ts
      ≈4 (describes a refactor), weather.ts ≈103 (keeps the old string).
      Destination: CHANGELOG.md, or the ADR / plan row / docs file that
      owns the decision; leave a one-line pointer only if the pointer is
      load-bearing. Never delete on the grounds that git has it — readers
      use files far more than blame.
    RATCHET the marker count (PR cites + dates + "used to" in non-test
      comments; baseline 784), never total comment share — a share ratchet
      rewards deleting the load-bearing ones.
3b. DUPLICATE HELPERS. Two week-key functions are both live —
    src/lib/dateHelpers.ts ≈32 localWeekKey and
    src/lib/performanceEngine.ts ≈37 getWeekKey — and
    hooks/useWeeklyReview.ts calls BOTH (≈49, ≈437). Establish their
    anchors first (Monday vs Sunday); if both semantics are needed, name
    them by semantics and pin each with a LITERAL date test. The
    performance engine is correctness-critical with a functions/ mirror, so
    this runs as plan → implement → cross-test, not as a rename. Then: 4
    exported + 16 inline YYYY-MM-DD producers → dateHelpers.ts; 9 local
    mm:ss formatters (RoutePreviewSheet, ShareCardRenderer,
    GuidedRunOverlay, RestTimerRing, useRunTimer, RunDetail, RunSummary …)
    → one in src/utils/formatters.ts; `formatVolume` means millilitres in
    lib/waterUnits.ts ≈115 and kilograms in utils/formatters.ts ≈6 (plus
    two local copies) → rename one; five `clamp`s; five raw `* 2.20462`;
    ten bare JSON.parse. Consolidate into the existing canonical homes and
    ban re-definition of the canonical names outside them.
3c. DEAD CODE. `@stripe/stripe-js` has zero imports (vite.config.ts ≈113
    manualChunks is its only reference); `cordova-plugin-purchase` appears
    only in comments in lib/purchaseProvider.ts — RevenueCat is the path
    (ADR-0006). Remove both after confirming zero imports AND absence from
    ios/App/CapApp-SPM/Package.swift and capacitor.config.ts; the server
    Stripe path is untouched, so Sub4 holds. Delete the 20 dead CSS classes
    and 9 keyframes (styles/animations.css is mostly dead: ds-fade-*,
    ds-scale-in, ds-skeleton, ds-stagger-1..5; components.css: ds-card*,
    feature-btn, progress-ring*, quote-card, stat-number). Root clutter:
    food-target-diagnostic.md and streak-notifications-diagnostic.md are
    investigation writeups (→ docs/audits/ or delete); generate-icons.js
    (→ scripts/ or delete); privacy.html is superseded by public/legal/ but
    still cited by settings/SupportLegalSection.tsx — resolve the
    reference. `STEPS_TILE_ENABLED = true` (home/WeightStepsTiles.tsx ≈25)
    is a hardcoded flag: ship it or remove it.
3d. LOGIC IN PAGES (ADR-0001). pages/Onboarding.tsx ≈115
    templateSplitToSplitType and ≈128 templateToProgramState build program
    state inside a page (plus five label mappers ≈162-214); pages/Run.tsx
    ≈190 deriveStrip; pages/ExerciseHistory.tsx ≈73/78, pages/Program.tsx
    ≈123, pages/WorkoutDetail.tsx ≈78 local formatters. Move to src/lib or
    the owning feature module, with tests. Do not otherwise split pages.
3e. TESTS. Three tautologies assert f(x) equals f(x):
    programEngine.test.ts ≈1891, bodyProps.test.ts ≈208,
    planSweep.golden.test.ts ≈157 — replace with real assertions (a
    determinism check compares against a stored literal). When a test's
    expected value is computed by the code under test it pins consistency,
    not behaviour — CLAUDE.md names two shipped bugs that passed that way.
3f. NAMING. Programme/Program coexist in 50 files (20 Programme*
    identifiers); Circle/GoalSpace/Space are three names for one concept.
    Do NOT mass-rename. Rule: user-facing copy uses the CONTEXT.md glossary
    term; identifiers follow their module's existing convention; fix mixed
    usage only in files you touch. Write that rule into CONTEXT.md.
3g. LINT DEBT. 88 eslint-disable comments: audit each of the 18
    exhaustive-deps disables individually (a stale closure hides behind
    each); the 21 react-refresh/only-export-components on provider files
    are fine; the 27 no-explicit-any are mostly tests — leave unless
    touched.
3h. COPY. "You're crushing it!" is on voice-and-tone's banned list. 26
    exclamation strings ("Saved!", "Props!", "Great run!", "Found!",
    "Welcome to Tropos!") — ration per principle 2. toast.error has 142
    sites with punctuation twins ("Couldn't save. Please try again." ×5 vs
    "Couldn't save. Try again." ×2): one phrasing, the shorter.

────────────────────────────────────────────────────────────────────────
WORKSTREAM 4 — FRONT-END
Already pinned and clean — do not re-derive: the tabular-nums⇄font-mono and
role=switch ratchets are at 0; AA contrast for every token in both themes;
fractional muted-foreground is banned; every lazy() is wrapped; legal routes
sit in all three route sets; optimistic updates all roll back; non-
interactive onClick is closed (2 sites, both with written reasons); every
modal has a focus trap; framer-motion is gated globally by
<MotionConfig reducedMotion="user"> in App.tsx — do NOT add per-component
gates for transform animations.

4a. BUTTON PRIMITIVE — 395 raw <button> against 209 primitive uses (35%).
    Do not wrap every <button> (CLAUDE.md scope note). Migrate the
    CTA-shaped ones, starting with: pages/RunSummary.tsx ≈1839 "Save Run"
    (variant sport), social/WeekOpenerCard.tsx ≈48, run/TreadmillMode.tsx
    ≈107, program/TrainingBlockCard.tsx ≈279, social/CirclesSection.tsx
    ≈717, run/RunSetupModal.tsx ≈1252, pages/Home.tsx ≈1625 "Upgrade",
    program/ProgrammeRunSection.tsx ≈1465. Continue by grep.
4b. SUB-44 CONTROLS (10) on primary paths: program/WeekPhaseRow.tsx ≈29/60
    (23px week nav), FoodAnalyzer.tsx ≈1079/1093 (24px steppers on the
    AI-correction path), social/ProgressPhotos.tsx ≈635/810,
    program/EaseWeekNudgeCard.tsx ≈89, program/DeloadBanner.tsx ≈231,
    program/RecoveryReductionBanner.tsx ≈145, food/FoodComposerCard.tsx
    ≈193. Use IconButton (the hit area may exceed the glyph).
    ui/Banner.tsx ≈153 grants itself a sub-44 exception in a comment —
    either fix it or write the exception into CLAUDE.md's design system.
4c. WEIGHT SCALE — `font-medium` ×310 and `font-normal` ×33 against the
    documented 800/700/600 rule. Decision: 500 is off-scale; body text is
    400 (the default — `font-normal` is a no-op to delete); emphasis is
    600. Migrate `font-medium` surface by surface WITH capture evidence
    (this shifts visual weight everywhere), ratchet 310 → 0, then lint-ban
    it. Amend CLAUDE.md's weight rule to say body = 400. [Owner: strike
    this item if 500 is wanted — then document it instead.]
4d. LOADING IS RENDERED AS EMPTY. pages/Home.tsx ≈386 returns "Tap to log"
    for both loading and genuinely absent (home/WeightStepsTiles.tsx ≈92-93
    builds the aria-label from it); ≈679 is the only skeleton gate.
    Distinguish at the hook: loading → Skeleton tiles. This is a cold-start
    design defect (design-for-the-user-base) AND the root cause of the
    `home-energy-default-after` capture flake CLAUDE.md documents.
    pages/Social.tsx is a network-bound feed with a loading flag and no
    skeleton; RunSummary, Login and Onboarding likewise (design-principles
    #5: mask unavoidable waits).
4e. DESTRUCTIVE WITHOUT A NET. program/SavedRoutinesSection.tsx ≈128
    deletes on first tap; social/CommentSheet.tsx ≈308 likewise and its
    catch reads `// Silently fail` (≈164); CirclesSection leave/wrap,
    pages/Routine.tsx, pages/RunDetail.tsx, food/FoodTimeline.tsx have
    delete handlers and no ConfirmDialog. Per design-principles #3 the net
    is UNDO, not a dialog: an undo toast (sonner action) where the write is
    reversible; ConfirmDialog only where irreversible or visible to others.
    Never swallow a failure.
4f. REDUCED MOTION, the CSS half: 26 `animate-pulse`, 3 `animate-ping` and
    the custom keyframes in styles/animations.css run without
    `motion-safe:`; JS loops (home/WaterWave, WaterBubbles, StreakFlame)
    need the existing useReducedMotion hook. Keep `animate-spin` ungated —
    a spinner is status, not decoration. CLAUDE.md: reduced motion gets the
    settled static state.
4g. A11Y RESIDUE: IconButton without aria-label at pages/WorkoutDetail.tsx
    ≈141/179; <img> without alt at social/ProgressPhotos.tsx ≈528; 25
    placeholder-only inputs — settings/SecuritySection.tsx ≈239-307 (five
    password fields), social/views/PeopleView.tsx ≈245 (search),
    settings/ShoesManager.tsx ≈195/239, run/RoutePlannerSheet.tsx ≈457 —
    real labels or aria-label. Evidence: e2e/accessibility.spec.ts.
4h. ERROR COPY — 81 of 142 toast.error sites open with a generic stem; the
    defect is catch blocks that DISCARD err.message
    (social/SaveRoutineSheet.tsx ≈187, social/ProgressPhotos.tsx ≈510).
    `describeRejection` lives in src/features/program/useProgram.ts — lift
    it to src/lib and route every callable rejection through it so the
    user-fit part surfaces (CLAUDE.md: a server message is diagnostic
    data). Scoped generic copy is fine.
4i. TOKENS: share/ShareCardRenderer.tsx ≈43-45 re-types the coral, purple
    and orange hexes → import THEME. features/streaks/BadgeHex.tsx (23 hex)
    and StreakFlame.tsx (13) are art: add a named palette to theme.ts or
    grandfather them explicitly in eslint.config.js with a reason — no
    silent hex.
4j. PAGE TITLES: the standard is `text-xl font-extrabold` (13 pages). Fix
    pages/History.tsx ≈1186 (text-lg — a nav tab smaller than its peers),
    pages/UserProfile.tsx ≈373, pages/ExerciseHistory.tsx ≈337,
    pages/Onboarding.tsx ≈987 (text-2xl font-bold),
    pages/AdminModeration.tsx ≈163/173/185.
4k. PERFORMANCE: measure before acting — Lighthouse against
    `npm run build` + preview, and e2e/performance.spec.ts. framer-motion
    is imported by 65 files (the motion chunk sits on most critical
    paths); program/ExercisePicker.tsx ≈336 renders all 153 exercises
    unwindowed. Virtualise or lazy-load only on measured jank; the
    dist-size ratchet (WS2) is the standing guard.
4l. OFFLINE: useOnlineStatus has 6 consumers; Program, Settings and
    space-post write paths show nothing when offline. Reuse the
    SustainedOfflineBanner pattern; never add a raw write.
4m. DOC DRIFT: CLAUDE.md's Pages table lists 14 pages against ≈47 route
    entries in App.tsx. Missing: /review, /upgrade, /space/:spaceId,
    /routine/:routineId, /workout/:workoutId, /history/exercise/:name,
    /diagnostics, /admin/moderation, /log, /support, /dev/*, and all 17
    /settings/* sub-routes; the table names a Settings page file that no
    longer exists (it is SettingsIndex plus src/pages/settings/). Fix the
    table; the freshness pin in WS2 keeps it fixed.
4n. COPY CASING. Title Case and sentence case coexist inside one primitive
    (SectionLabel: "Calorie Balance", "Macro Distribution", "Pick a Guided
    Run" vs "Activity today"; card titles: "My Shoes", "Progress Vault" vs
    "Training load"). Decision: sentence case everywhere — labels, card
    titles, buttons — with Title Case only for proper nouns and nav/page
    names (Apple HIG; "calm, plain"). Write it into docs/voice-and-tone.md.
    en-GB: "Customize" at run/RunLaunchCard.tsx ≈12 and pages/Run.tsx ≈380.
    [Owner: flip to Title Case here if preferred — but pick one.]
4o. EMPTY STATES: four hand-rolled remain — program/ExercisePicker.tsx
    ≈347, program/DayActionSheet.tsx ≈651, Layout.tsx ≈285,
    workout/RestTimerRing.tsx ≈64 → the EmptyState primitive. Hand-rolled
    uppercase labels: 80 against 135 SectionLabel uses
    (social/views/PeopleView.tsx ≈233/366/453, social/ProgressPhotos.tsx
    ≈685, program/RaceGoalPlanner.tsx ≈224/244, ManualFoodLogger.tsx ≈214,
    food/EditServingsSheet.tsx ≈393) → SectionLabel.

────────────────────────────────────────────────────────────────────────
WORKSTREAM 5 — DESIGN (choices, not pixels)
- Reconcile docs/frontend-design-principles-2026-07.md Part F against code.
  Verified 2026-09-04: F-2 (onboarding draft) and F-12 (setup copy) are
  DONE; F-7 (Home badge parity — Layout.tsx ≈239 is still Social-only) and
  F-10 (pages/Upgrade.tsx ≈328/420 still says "AI adaptive macros") are
  OPEN. Verify the rest against code. Ship the S-effort items in this pass
  (F-4, F-7, F-10, F-11, F-14); F-1/F-3/F-5/F-6/F-8/F-9 are their own arcs
  — propose with evidence, do not start them.
- Every cold-start state is a first act, not a void (deepening-backlog D9;
  CLAUDE.md design-for-the-user-base). Audit the zero-data render of Home,
  Program, Food, Social and History in BOTH themes on the capture channel.
- Design-system amendments this pass owes (write them into CLAUDE.md, not
  into code comments): body weight = 400; the sentence-case rule; the
  Banner exception or its removal; "framer is gated globally, CSS
  animations need motion-safe:" under Glow & motion; `deleteDocGuarded`
  under Conventions.
- Close with a memo of AT MOST five genuinely open design questions, each
  with both options built or mocked and MEASURED (frames, counts), never
  "someone should decide". Candidates you may not resolve yourself: the
  centre "+", the Social nav slot, the Analytics name, the email-
  verification gate.

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
- Every 1a–1h item shipped, or declined in a PR with the reason and the
  citation; every WS2 guard live, revert-tested, and in
  docs/invariant-guards.md.
- The ratchets moved — archaeology markers, raw <button>, font-medium, CSS
  animations without motion-safe, wholesale firestore mocks, dead CSS, raw
  deleteDoc — each with its number in a PR body.
- Full suite, lint at the pinned warning count, cycles, tsc -b, rules
  tests and functions tests green on the final head; capture frames
  attached to every visual PR.
- A final report in five sections: FIXED (PR list); DECLINED (reason and
  citation); OPERATOR CHECKLIST (only a human with console access can:
  mark "CI / unit" a required status check, flip App Check enforcement per
  docs/app-check-rollout.md, do the Console deployed-source spot-checks,
  set the Cloud budget alert, turn on GitHub secret scanning and push
  protection); OPEN DESIGN QUESTIONS (≤5, both options measured); and the
  NEW BASELINE numbers for the next run of this prompt.
```

---

## Why each clause is there

- **"The clone is shallow"** — the 2026-09-04 slop survey read the ~50
  visible commits as "history is squashed" and nearly used that to argue
  for keeping history-narrating comments in source. One `git rev-parse
--is-shallow-repository` settled it. A prompt without this line invites
  the same wrong inference every run.
- **The baseline numbers up front** — 7,805 green tests means a red suite
  is the agent's doing, not inherited. "Improvement" that cannot be
  measured against a starting number is a claim, not a result.
- **"Re-verify each citation"** — the survey is a snapshot of one day.
  CLAUDE.md already records how file counts rotted by 3–7×; line numbers
  rot faster. The citations buy a fast start, not a to-do list.
- **"Prior audits are closed"** — three security audits exist in
  `docs/audits/`, and re-verifying them cost the survey about a third of
  its effort to reach "all closed". Naming them as done is the single
  biggest saving in the prompt.
- **The keep / move-out comment policy with reference shapes** — comments
  are 24.4% of the source. A bare "reduce comments" instruction would
  delete the mirror pins and invariant notes CLAUDE.md's whole
  drift-defence rests on. Naming three of each shape lets the agent
  classify instead of guess.
- **Ratchet the markers, never the share** — a share ratchet rewards
  deleting whichever comments are longest, which are exactly the
  load-bearing ones.
- **"Extend the gates that exist"** — six reachability/guard tests already
  exist with known, listed gaps. The house pattern is that each orphan
  instance produced a gate; a second, parallel gate for the same class is
  itself slop.
- **Pre-decided design calls (body = 400, sentence case, undo not dialog,
  verification gate)** — the visual-pass lesson: about a hundred fixes sat
  blocked for hours on one unanswered question. Each call here is marked
  `[Owner: …]` so reversing it is one edited line, not a re-derivation.
- **"framer is gated globally"** — the front-end survey reported "no global
  reduced-motion gate". `App.tsx` has had `<MotionConfig
reducedMotion="user">` all along; only the CSS half is ungated. Without
  this line the agent adds ~110 redundant per-component gates.
- **"frame-ancestors is ignored in a meta CSP"** — the obvious fix for the
  missing anti-framing is to add it to `index.html`, where it does nothing.
- **The `/baseline-ui` fence** — that skill is third-party and mandates
  Radix/Base UI and `motion/react`; applying it literally rewrites the
  locked stack.
- **The Sub4 nuance** — the lock says keep the Stripe backend dormant. Read
  naively it blocks removing a dead client package; read the other way, a
  "remove dead deps" sweep tears down the backend. Both misreadings are
  one sentence apart, so the prompt carries the distinction.
- **"Measure before virtualising"** — 153 exercise rows is not obviously
  jank; a windowing library added on suspicion is the kind of dependency
  workstream 3 exists to remove.

## Baseline measured 2026-09-04

Numbers from the sandbox clone on that date, with the command that produced
each so the next run can show movement rather than re-survey.

| Measure                                            | Value                                                                   | Re-measure                                                                                                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit suite                                         | 647 files (6 skipped), 7,805 passing, 216 s                             | `npx vitest run`                                                                                                                                                                               |
| Lint                                               | 0 errors, 99 warnings                                                   | `npm run lint` (49 set-state-in-effect, 32 refs, 6 preserve-manual-memoization, 4 purity, 3 exhaustive-deps)                                                                                   |
| Comment share, non-test `src` + `functions`        | 24.4% (≈49,000 of ≈201,000 lines)                                       | strip code, count `//` and `/* */` lines                                                                                                                                                       |
| PR citations / dated notes / "used to" in comments | 240 / 374 / 170 (= 784)                                                 | `grep -rnE "#[0-9]{3,4}\b" src functions --include=*.ts --include=*.tsx --include=*.js \| grep -v __tests__ \| wc -l` and siblings                                                             |
| Header comments over 40 lines                      | 24                                                                      | scan file heads                                                                                                                                                                                |
| Raw `<button` (components + pages + features)      | 395 in 130 files                                                        | `grep -rn "<button" src/components src/pages src/features --include=*.tsx \| grep -v __tests__ \| grep -v "ui/Button.tsx\|ui/IconButton.tsx\|ui/Toggle.tsx\|ui/SegmentedControl.tsx" \| wc -l` |
| `<Button` / `<IconButton`                          | 173 / 36                                                                | grep                                                                                                                                                                                           |
| `font-medium` / `font-normal`                      | 310 / 33                                                                | `grep -rno "font-medium" src --include=*.tsx \| grep -v __tests__ \| wc -l`                                                                                                                    |
| Hex literals in `.tsx` (non-test)                  | 101 (ShareCardRenderer 26, BadgeHex 23, StreakFlame 13)                 | `grep -rnoE "#[0-9a-fA-F]{6}\b" src --include=*.tsx \| grep -v __tests__ \| cut -d: -f1 \| sort \| uniq -c \| sort -rn`                                                                        |
| CSS animation classes without `motion-safe:`       | ≈39 (26 pulse, 10 spin, 3 ping)                                         | grep `animate-` vs `motion-safe:animate-`                                                                                                                                                      |
| `toast.error(` sites / generic-stem                | 142 / 81                                                                | `grep -rhoE 'toast\.error\(\s*"[^"]+"' src \| sort \| uniq -c \| sort -rn`                                                                                                                     |
| Raw `localStorage` calls / modules                 | 106 / 33                                                                | `grep -rn "localStorage\." src --include=*.ts --include=*.tsx \| grep -v __tests__`                                                                                                            |
| Raw `deleteDoc(` outside the wrapper               | ≈20                                                                     | `grep -rn "deleteDoc(" src --include=*.ts* \| grep -v "__tests__\|firestoreWrite.ts"`                                                                                                          |
| Wholesale `vi.mock("firebase/firestore")` / fake   | 58 / 53 files                                                           | grep both idioms                                                                                                                                                                               |
| `eslint-disable` comments                          | 88 in 69 files                                                          | `grep -rn "eslint-disable" src --include=*.ts --include=*.tsx \| wc -l`                                                                                                                        |
| `npm audit --omit=dev` root / functions            | 6 (2 critical, 3 high, 1 moderate) / 16 (1, 4, 10, 1 low)               | run in each tree                                                                                                                                                                               |
| Dead CSS classes / keyframes                       | 20 / 9                                                                  | class names in `src/styles` with no `src` reference                                                                                                                                            |
| Unimported dependencies                            | 2 dead (`@stripe/stripe-js`, `cordova-plugin-purchase`) + 6 native-only | per-dependency import grep                                                                                                                                                                     |
| Routes in `App.tsx` vs CLAUDE.md Pages table       | ≈47 `path=` entries vs 14 rows                                          | `grep -c "path=" src/App.tsx`                                                                                                                                                                  |
| Sub-44px interactive controls                      | 10                                                                      | the perl scan in the survey; or eyeball `p-1`/`size-[5678]` on `<button`                                                                                                                       |
| Orphan components / orphan exports                 | 0 / 4 (all in `src/utils`)                                              | the reachability tests, with `src/utils` added                                                                                                                                                 |
| Part F (frontend-design-principles-2026-07) status | F-2, F-12 done; F-7, F-10 open; rest unverified                         | grep the cited anchors                                                                                                                                                                         |

## What the prompt deliberately routes to the operator

These need console access or a GitHub setting an agent does not hold. The
prompt asks for them as a checklist rather than letting them read as done:

- Mark the `CI / unit` job a required status check on `main` (the header
  of `.github/workflows/ci.yml` says it reports red but does not block).
- Flip App Check enforcement per `docs/app-check-rollout.md`, only after the
  verified-request telemetry it describes.
- The Console deployed-source spot-checks in `docs/post-deploy-verification.md`
  for anything that touched `functions/`.
- A Google Cloud budget alert (CLAUDE.md, cost & margin row).
- GitHub secret scanning and push protection on the repository.

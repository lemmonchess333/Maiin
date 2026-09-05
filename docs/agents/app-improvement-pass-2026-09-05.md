# App-improvement pass — 2026-09-05

First run of `app-improvement-prompt.md`: SECURITY → GUARDS → DE-SLOP →
FRONT-END → DESIGN, one concern per PR, every ratchet measured with its
gate's own probe before it was lowered. This file is the pass's record —
what shipped, what was declined and why, what only the operator can
verify, the owner calls it left open (both options measured), and the
baselines the next pass inherits.

## Fixed (merged, in order)

| PR    | Change                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------- |
| #2134 | The prompt itself (`docs/agents/app-improvement-prompt.md`)                                             |
| #2135 | Gate cross-user photo URLs in Firestore rules and cover the untested paths                              |
| #2136 | Harden the AI endpoints and maintenance callables in functions                                          |
| #2137 | Ship security headers from Firebase Hosting and pin them with a guard                                   |
| #2138 | Pin every GitHub Action to a commit, gate root advisories in CI, fix the audit                          |
| #2139 | Let a text-less Circle event through the rules (found by the new rules tests)                           |
| #2140 | One door to localStorage, uid-scoped keys, and a guard that keeps it so                                 |
| #2141 | Route every Firestore delete through the guarded wrapper (`deleteDocGuarded`)                           |
| #2142 | Require a verified email before publishing to other users (rules + callables + client notice)           |
| #2143 | Widen the reachability and freshness gates to the code they missed                                      |
| #2144 | Ratchet the four design-system drifts and close the hex-ban gaps                                        |
| #2145 | Pin the hygiene debt so it can only shrink (styles usage, archaeology markers, dist size)               |
| #2146 | Remove the dead code the survey found, and decline one removal                                          |
| #2147 | Calm the routine copy and replace three assertions that only agreed with themselves                     |
| #2148 | Move the business logic out of four pages into tested modules                                           |
| #2150 | Audit the exhaustive-deps disables: one leak fixed, the rest reasoned                                   |
| #2151 | Move the history out of five files' comments; keep every invariant (markers 790 → 766)                  |
| #2152 | One definition each for the clock, the kg↔lb factor, clamp and the week key                             |
| #2153 | Name five unlabelled inputs; one page-title tier; Customise, not Customize (off-scale h1 13 → 6)        |
| #2154 | Bring the last sub-44px taps up to the floor; six CTAs onto Button (raw buttons 399 → 390)              |
| #2155 | Gate every skeleton pulse and GPS ping behind `motion-safe:` (unguarded animations 38 → 8)              |
| #2156 | Confirm comment deletes, undo routine removal, say why a callable refused (`src/lib/callableErrors.ts`) |
| #2157 | Say what offline means on Program, Settings and the space composer                                      |

In flight when this file was written: the Home weight tile's loading
skeleton (#2158), the seed-script hotfix that also type-checks `scripts/`
and `e2e/` in `tsc -b`, the Part F small items (reminder opt-in on the
onboarding confirm step, Lift plan / Run plan rows in Settings, honest
upsell copy, a support link on the under-16 notice), and this document.

**A regression this pass introduced and caught.** #2152 deleted
`getWeekKey`; `scripts/seed-rich-user.ts` still imported it, nothing
compiled `scripts/`, and unit, lint and e2e CI stayed green. The next
capture run died at `seed:rich`. The hotfix repoints the import and makes
`tsc -b` cover `scripts/**` and `e2e/**` (`tsconfig.scripts.json`), which
also surfaced eight latent type errors there — one of them a
`test.use({ reducedMotion })` that Playwright had been ignoring silently.

## Declined, with the citation

- **Remove `cordova-plugin-purchase`.** Reached at runtime through
  `window.CdvPurchase` — the live IAP fallback. Not dead.
- **"`getWeekKey` is Monday-anchored, `localWeekKey` Sunday."** Both were
  Sunday-anchored; one was retired for being a duplicate, no bucketing
  changed (#2152).
- **"58 wholesale `vi.mock` calls vs 53 partial."** Measured: one.
  `firestoreHookCoverage.test.ts` already pins the fake discipline; the
  parallel gate drafted for it was deleted before it shipped.
- **Unlabelled IconButtons in WorkoutDetail; `<img>` without alt in
  ProgressPhotos; WaterWave / WaterBubbles / StreakFlame ignoring reduced
  motion; the feed with no skeleton; DeloadBanner /
  RecoveryReductionBanner under 44px; "You're crushing it!" copy.** Each
  was checked at the cited line and found already handled (labels
  present, alt present, `useReducedMotion` gating, `ActivityCardSkeleton`
  in `FeedView`, `before:-inset` hit areas, the phrase only in a
  style-guide comment).
- **Share-card colours onto `THEME` (4i).** `ShareCardRenderer` is
  deliberately literal — html-to-image's DOM clone cannot resolve CSS
  variables — and `shareCardPalette.test.ts` pins every literal equal to
  its `THEME` token, so the drift the item feared is already loud.
- **Badge parity on Home (F-7).** The design doc names no server signal
  for the dot to carry; see open question 2.
- **Split `functions/index.js`.** Declined for the fourth time on the
  same grounds; the standing hold lives in
  `functions/__tests__/triggerMetadata.test.js`.
- **`firebase-admin` 14.** Tried and measured earlier (CLAUDE.md, the
  advisories row): a ~130-site namespaced-API migration to clear 4 of 18
  advisories, none of them reachable.

## Operator checklist (what only a person with the consoles can verify)

- Mark **CI / unit** a required status check on `main`, so a red suite
  blocks a merge rather than reporting after it.
- **Firebase Console, deployed source** — the dedup gotcha means green CI
  is necessary, not sufficient: `analyzeFoodText` contains
  `require("./lib/foodTextRequest")` (#2136); the deployed Firestore rules
  contain `isAllowedPhotoUrl` (#2135) and `isEmailVerified` (#2142); the
  comment callables contain `assertCallerEmailVerified` (#2142).
- **Hosting headers** land only via Firebase Hosting (#2137):
  `curl -I` the Hosting origin and read HSTS, `nosniff`, Referrer-Policy,
  `X-Frame-Options`, the `frame-ancestors 'none'` CSP header and
  Permissions-Policy back.
- **App Check enforcement** stays a console exercise; the rollout order is
  in `docs/app-check-rollout.md`.
- **Google Cloud budget alert** (Billing → Budgets): the single smoke
  detector across Vertex, Firebase and the future ORS proxy.
- **GitHub → Security**: turn on secret scanning and push protection; decide
  whether Dependabot may auto-merge the now-pinned action shas (#2138).
- **Devices**: the Progress Vault must not leak across accounts on a shared
  device (#2140); airplane-mode a text post from the space composer and
  see "Post queued", reconnect and see it land, then repeat with a photo
  and see the draft held (#2157); flip the onboarding "Daily reminders"
  toggle on iOS and confirm the native permission prompt, then that both
  reminders are on in Settings → Notifications after finishing.
- **Capture channel**: after the seed-script hotfix merges, push `main` to
  `claude/screenshot-app` once to re-baseline `app-screenshots`; the
  baseline there at the time of writing is #2154's head.

## Open design questions (owner calls — both options measured)

1. **Is 500 a weight tier?** `font-medium` sits on 302 class chunks in
   108 components; the documented scale is 800/700/600. _A — document
   it_ as the secondary-label weight: zero code change, retire the
   `FONT_MEDIUM_BASELINE` ratchet. _B — migrate_ to 400/600 as the prompt
   proposed: 302 edits across every surface, capture evidence for
   essentially all 235 frames, then a lint ban. The prompt defaulted to
   B; nothing here presumes it.
2. **What would a Home badge carry (F-7)?** `Layout.tsx` has one badge
   site (`/social`, from `useUnreadCount`). The candidate server states
   already announce themselves: `pendingFellBehindPrompt` auto-opens its
   sheet, the deload offer is a banner. _A — nothing_ (zero work). _B —
   "weekly review ready"_ needs a persisted read-flag (a schema field) plus
   a Layout hook. Recommendation: A until a signal exists that has no
   surface of its own.
3. **Copy casing (4n).** By a two-word heuristic over `src/components` and
   `src/pages`, 71 text nodes are sentence case and 28 Title Case — the 28
   are mostly card and section titles (Progress Vault, Weight Trend,
   Weekly Insights, Macro Distribution, Performance Index, Calorie
   Balance). The prompt's default is sentence case everywhere with proper
   nouns excepted. _A — apply it_: 28 string edits, an `rg` over `e2e/`
   for every renamed literal, one capture run. _B — codify the split
   that exists_ (titles Title Case, buttons and labels sentence case) in
   `docs/voice-and-tone.md` and add a guard for buttons only. Either is a
   short PR; the choice is taste, and it must not be made twice.
4. **Deleting a comment: confirm or undo?** Shipped as a `ConfirmDialog`
   (#2156): one extra tap, no server change. The undo alternative needs
   server work — comments are server-written, so a restore path is a new
   callable or a delayed delete — and a client that keeps the row for the
   toast's lifetime. Recommendation: keep confirm unless deletes turn out
   to be frequent.
5. **Performance work (4k).** Deliberately not started: the prompt's own
   rule is measure first. The inputs are on the table — framer-motion is
   imported by 65 files and `ExercisePicker` renders all 153 exercises
   unwindowed — but the dist-size ratchet (#2145) is the standing guard
   and no jank has been measured. _A — Lighthouse + `e2e/performance.spec.ts`
   against a preview build_, then act on what they show. _B — virtualise
   ExercisePicker now_ (one component, a windowing dependency, a capture
   run). Recommendation: A; B without a number is the "polish" the
   prompt warns against.

## New baseline

| Ratchet / gate                                 | Value after this pass                                   |
| ---------------------------------------------- | ------------------------------------------------------- |
| Archaeology markers (`archaeologyMarkers`)     | 766                                                     |
| Raw `<button>` CTAs (`designSystemInvariants`) | 390                                                     |
| `font-medium` chunks                           | 302                                                     |
| `animate-*` without `motion-safe:`             | 8 (the spinners)                                        |
| Off-scale `<h1>`                               | 6 (wordmarks, brand heading, hero, two run h1s)         |
| ESLint                                         | 0 errors, 99 warnings (`--max-warnings 99`)             |
| Dist size                                      | per-chunk baseline in `scripts/dist-size.baseline.json` |
| `stylesUsage` KNOWN_DEAD                       | empty                                                   |
| Type-checked by `tsc -b`                       | `src/`, `vite.config.ts`, `scripts/**`, `e2e/**`        |
| Unit suite (last merged tree, #2157)           | 654 files, 7874 tests passing                           |

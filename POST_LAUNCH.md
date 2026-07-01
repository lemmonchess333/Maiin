# Post-Launch Work

Items parked for evaluation after launch. Intentional tech-debt parking, not forgotten bugs.

## Optimisations

### Home page Firestore subscriptions via `useEffectiveTargets`

**Status:** Deferred. Revisit when real-user data justifies the work.

**Context:** After migrating Home's header from `useDailyTargets` to `useEffectiveTargets`, Home opens two additional Firestore `onSnapshot` subscriptions on mount:

- `users/{uid}/workouts` — 30-day window, 60-doc limit
- `users/{uid}/runs` — same window and limit

These subscriptions are necessary for Home's header total to reflect the MAX rule (planned vs actual burn). The cost is modest per user but scales linearly with active Home sessions.

**Why deferred:**

- Pre-launch, single active user — cost is effectively zero.
- Firestore free tier covers current volume and far more.
- Optimising without real usage data risks picking the wrong fix.

**When to revisit:**

- Firestore read costs in the Google Cloud billing dashboard become visibly non-negligible.
- User count crosses a threshold where Home mounts dominate read traffic (observable post-launch via analytics).
- Users report sluggish Home loads that trace back to snapshot hydration.

**Possible fixes (evaluate against real data before picking):**

1. Daily aggregate document — maintain `users/{uid}/dailyTotals/{yyyy-MM-dd}` with pre-summed workout and run calories. Home reads one doc instead of subscribing to two collections. Write paths update the aggregate whenever a workout or run is written.
2. In-memory cache with TTL — keep `useEffectiveTargets` as-is but memoise results keyed by date, so repeat mounts within a short window reuse prior results without re-subscribing.
3. One-time read on mount instead of live subscription — downgrade from `onSnapshot` to `getDocs` on Home. Loses live updates but Home is a dashboard surface, not a live-editing one.

**Reference:** commit `124f7a6` migrated Home from `useDailyTargets` to `useEffectiveTargets`. Relevant files: `src/hooks/useEffectiveTargets.ts`, `src/pages/Home.tsx`.

## Features

### Steps tile → HealthKit / Health Connect wiring

**Status:** Deferred until native iOS / Android builds ship. The tile is now gated off via `STEPS_TILE_ENABLED` in `WeightStepsTiles.tsx` — the Home grid renders a single full-width Weight tile until the flag flips.

**Context:** The Home page renders a Steps tile (`src/components/home/WeightStepsTiles.tsx:29-40`) that currently shows a static "Connect Health →" affordance with an empty `onClick`. Web browsers have no access to step data — the tile is a deliberate placeholder for the post-iOS / post-Android release.

**Plan at native ship:**

1. **iOS** — add `@capacitor-community/health` (or Capacitor's recommended HealthKit bridge), request `HKQuantityTypeIdentifierStepCount` read permission, query daily step totals via `HKStatisticsQuery` with a day-aligned anchor.
2. **Android** — Health Connect (`androidx.health.connect.client`) via the matching Capacitor plugin. Same shape: request read permission, query today's step aggregate.
3. Flip `STEPS_TILE_ENABLED` to true and wire the real step count into the Steps tile: replace the static "Connect Health →" with `<steps> / <target>` and a small "↑ step-count" subtext. Keep the permission-priming pattern we built for notification reminders — a one-time modal on first foreground after native install, not nagging.
4. Persist the permission-shown flag to `users/{uid}/settings/healthKit` so the priming doesn't re-fire across devices.
5. Add a denied-permission inline banner mirroring the one on `NotificationsSection.tsx` — same UI vocabulary.

**Until then:** the static tile is a design placeholder. Treat any "why doesn't it do anything" feedback as expected pre-iOS behaviour. If a web-only beta runs longer than a week, consider hiding the tile on web via `Capacitor.isNativePlatform()` to avoid the dead-button perception.

**Files to touch at activation time:**

- `src/components/home/WeightStepsTiles.tsx` — render real step count + target.
- `src/hooks/useSteps.ts` — new, reads from the plugin.
- `src/lib/healthKit.ts` — new, platform-specific bridge.
- `POST_LAUNCH.md` — delete this section when shipped.

### Font rebrand experiment

**Status:** Numeral half SHIPPED — the brand bake-off replaced JetBrains Mono
with **Archivo** for all numbers (PR #1229; `docs/visual-audit/bakeoff/
DECISION.md`). The pair is now Plus Jakarta Sans (text) + Archivo (numbers).
Any further change to the _display/body_ face (Jakarta) stays deferred —
re-evaluate post-launch once real users weigh in.

**Context:** Pre-launch audit of typography flagged Plus Jakarta Sans as
"fine but generic" — it's become the 2024–25 default for consumer apps
(alongside Inter). Not bad, but not distinctive. The immediate cleanup
(trim weights, fix `RunBottomSheet.tsx` monospace bypass, delete
Georgia decorative serif) made the existing pair feel more unified
without needing a font change. That's shipped; rebrand deferred.

**When to revisit:**

- After collecting beta/early-user feedback on whether the brand feels
  distinctive or blends into the "modern fitness app" category.
- If a visual identity refresh is planned (logo, marketing site) —
  cheaper to re-evaluate the type system at the same time.
- If performance audits flag the Google Fonts load as a measurable
  startup cost — some alternatives (system fonts, self-hosted Satoshi)
  would cut it entirely.

**Candidate fonts evaluated (ranked by fit for Tropos's brand):**

| Font                  | Source                                                      | Why it's a candidate                                                                                                                            |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **DM Sans**           | Google Fonts                                                | Warmer + more open than Jakarta, used by Vercel / Supabase. Already loaded for `privacy.html` so there's precedent. Biggest bang-for-buck swap. |
| **Satoshi**           | [Fontshare](https://www.fontshare.com/fonts/satoshi) (free) | Premium editorial feel, distinctive numerals, stands apart from Cal AI / MyFitnessPal. Slight risk at very small sizes on Android.              |
| **Geist**             | [Vercel](https://vercel.com/font)                           | Sharp technical numerals — great for stats-heavy surfaces. Reads tech-brand rather than consumer-fitness, so only a fit if the brand pivots.    |
| **SF Pro / system**   | Apple / OS default                                          | Native iOS feel, zero font-download cost, fastest cold-start. Uninterested/invisible brand identity — only pick if speed > personality.         |
| **Plus Jakarta Sans** | Google Fonts                                                | **Current.** Friendly geometric sans. Fine but common.                                                                                          |

Plus two to avoid:

- **Inter** — everyone uses it. Zero differentiation.
- **Manrope** — almost identical to Plus Jakarta Sans. Not worth the swap.

**How to actually swap (~30 min implementation):**

The font system is centralised:

1. `index.html` — two `<link rel="stylesheet">` tags for the Google Fonts URLs. One-line swap for each font.
2. `src/index.css:21-22` — CSS custom properties `--font-display` and `--font-mono`. One string change each.
3. Body rule in `src/index.css:75` uses `"Plus Jakarta Sans"` directly — update to match the new display font (or refactor to `var(--font-display)` first for free).

Every other font reference in the codebase reads `var(--font-display)`
or `var(--font-mono)` (after the `RunBottomSheet.tsx` cleanup landed),
so changing those two variables + the `<link>` tags is the entire
swap. No component-level edits.

**A/B test path (if wanted):**

- Env flag: `VITE_FONT_VARIANT=jakarta|dm|satoshi`.
- `index.html` conditionally includes the matching font `<link>`.
- `index.css` sets `--font-display` from a runtime `data-font` attribute
  on `<body>` mirrored from the env flag.
- Analytics segment by flag to compare engagement / feel.

Small surface area; could run a week-long experiment before committing.

**Before committing to a rebrand, answer these:**

1. What brand emotion are we after — "friendly", "premium", "technical",
   "fitness-utility"? The current pair leans friendly/generic. Each
   candidate pushes toward a specific mood.
2. Is there a visual identity refresh planned that this should align
   with? If yes, do both together.
3. Is Android (Capacitor + native system font fallback) a big enough
   segment that font consistency across platforms matters? Satoshi and
   DM Sans are safe; system fonts diverge wildly between iOS and
   Android.

**Files that would change in a rebrand:**

- `index.html` — Google Fonts `<link>` URLs.
- `src/index.css` — `--font-display` / `--font-mono` CSS variables + the
  explicit `font-family` on the body rule.
- `CLAUDE.md` — typography section update.

Nothing else. The rest of the codebase reads through the variables.

## Brand refresh candidates

Parked from the Wave 3 design pass (visual-audit follow-up). Both are
deliberately deferred — they need a brand-level decision, not a polish PR.

- **Third display typeface for hero numerals.** ~~The hero stat numbers
  currently use the mono.~~ ADDRESSED by the bake-off: all numbers (hero +
  data) now use Archivo (a hero-only third face was rejected — it clashed
  with the data tier's zeros; see `docs/visual-audit/bakeoff/DECISION.md`).
  Only revisit if a future identity refresh wants a _distinct_ hero-numeral
  face above Archivo — and don't add a third family in isolation.
- **Hexagon-segmented calorie ring experiment.** The brand hexagon now
  appears in empty-states + streak badges (Wave 3 F). A speculative next
  step is a calorie/macro ring rendered as hexagon segments rather than a
  smooth arc — visually ties the data viz to the brand mark. Experiment
  only; the smooth ring is the safe default and the hexagon-usage rule
  (empty-states + badges only) holds until this is explicitly validated.

## Bake-off — settled, do not re-litigate

- **Hex calorie ring:** prototyped and rejected — partial-fill legibility loses to the circle (see `bakeoff/DECISION.md`); do not re-litigate without new evidence.
- **`--font-mono` / `.font-mono`** is a historical name that now resolves to Archivo (documented in `index.css` + guide); optional future rename to `font-num` is a call-site-wide churn — only do it with tooling.

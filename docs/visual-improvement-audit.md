# Visual improvement audit — 2026-07-02

Audit-first pass over the body map, exercise guide, badges, and Social
(Prompt 8). Ground rule applied throughout: **improve what exists, never
redesign** — every proposed change names the specific observed weakness it
fixes. Screenshots captured via the CI design-review channel
(`app-screenshots.yml`, 393×852, light+dark) on the rich-seeded user;
copies live in `docs/visual-improvement-audit/`.

## Decision list for Myles

1. **Badge regeneration — recommend NO (decision: confirm).** All 30 assets
   are one consistent generation from the documented spec
   (`docs/badges/ART_BRIEF.md`): metallic bevelled pointy-top hex, embossed
   cream motif, tier metal, matching framing/lighting. Prompt 8's suggested
   regen spec (flat emblem, purple/coral palette) describes a _different_
   identity than the shipped one — regenerating to it would be a redesign,
   not a fix. The set has no outliers worth touching (evidence: grid
   screenshots below).
2. **Lottie exercise packs — recommend NO.** New dependency + licensing +
   bundle cost, and any stock pack's art style would repeat the exact
   mismatch that got the Nano-Banana coach demos reverted (#1448: "does not
   match Tropos' flat-vector muscle-diagram language"). See Phase 5 table.
3. **Exercise movement demos — the honest state.** The generated-coach
   experiment was deliberately abandoned (#1448 revert, #1449 tooling
   removal, owner note: "a movement demo rendered in the real flat-vector
   Tropos style (custom posed art / 2D-3D rig), tracked separately").
   `ExerciseDemoPlayer` is currently **media-dead** (0 of 151 exercises have
   `media`). Player polish ships in this pass so the seam is ready, but
   nothing is visible until art exists. The recommended path (Phase 5) is
   the one already chosen: flat-vector posed art, post-launch.
4. **Body-map vectorization proposal — NOT NEEDED.** `MuscleHeatMap`
   renders `react-body-highlighter` → real SVG polygons. The glow is
   directly implementable (Phase 2), no rebuild.
5. **Instruction rewrites beyond the top-46 — park.** Instructions coverage
   is already 100 % (151/151). The genuine gap is the "Watch out" cue
   (`tip`): 45/151 have one; 46 template-prescribed exercises don't.
   Phase 3 fills those 46 with standard coaching cues. Rewriting the other
   ~60 rarely-prescribed entries is churn risk for no reach.
6. **`Watch out` callout colour** uses `THEME.semantic.nutrition` (food
   orange) as a warning colour on a non-food surface. Phase 3 moves it to
   `THEME.warning` — flagging since it's a semantic-colour call.

## Phase → PR map

| Phase | Scope                                                   | Effort | Risk                                 |
| ----- | ------------------------------------------------------- | ------ | ------------------------------------ |
| 2     | Body-map volume glow + guide-diagram glow               | M      | Low (overlay, WKWebView-safe recipe) |
| 3     | 46 watch-out cues + guide reading-surface polish        | M      | Low (content + presentation)         |
| 4     | Badge render-site normalization (no asset changes)      | S      | Low                                  |
| 5     | Demo-player crossfade polish + options table (here)     | S      | None (media-dead)                    |
| 6     | Social top-3 (leaderboards, CommentSheet, ActivityCard) | M      | Low                                  |
| 7     | Open sweep (≤5 trivial wins)                            | S      | Low                                  |

---

## Surface inventory

### 1. MuscleHeatMap (`src/components/analytics/MuscleHeatMap.tsx`)

![](./muscle-heatmap-light.png) ![](./muscle-heatmap-dark.png)

**Render mechanism (investigated per brief):** `react-body-highlighter`'s
`Model` → `div > svg > polygon[]`; muscle fill = `highlightedColors[freq-1]`,
silhouette fill = `bodyColor`. **SVG-drawable branch applies.**

**Named weaknesses**

- **W1 — flat tier fills read static.** Three flat purples on a flat
  silhouette; the "most-trained" muscle carries no additional visual energy.
  On OLED dark the flat fills sit dead on `#2A2A30` — nothing separates the
  diagram from an inert illustration.
- **W2 — no entrance behaviour.** The card pops fully-formed; sibling
  analytics cards (charts) animate in. Inconsistent liveliness.
- **W3 — highlight colours are passed as 3 constants** duplicated from the
  legend-dot logic; harmless but one more place tier colours live.

**Fix (Phase 2, implemented):** glow = a second, blurred `Model` overlay per
view whose **opacity/transform animates** (filter itself static — the
WKWebView-safe recipe). High-tier muscles glow brighter and settle first,
mid-tier fainter and later (intensity stagger); the single most-trained
muscle carries one slow ambient opacity pulse; `prefers-reduced-motion` →
static glow, no loops. Effort M, risk Low. `muscleShare.ts` thresholds and
test untouched.

### 2. Exercise guide (`ExerciseFormContent.tsx` + `exercises.ts`)

_(Capture note: the exercise-form shots missed the first run — the audit
test overran Playwright's default 30 s timeout after the slow full-page
badge shots; timeout bumped in the spec, images land with the Phase 3
before/after run.)_

**Coverage audit:** instructions **151/151 (100 %)**; `tip` (the "Watch out"
cue) **45/151**, with **46 template-prescribed** exercises missing one
(plank, db-bench, lat-pulldown, lateral-raise, goblet-squat, lunges, …).
`commonMistakes`/`difficulty`/`tempo` exist on 3 entries each (D-LIFT-19
backfill barely started — out of scope here beyond the cue backfill).

**Named weaknesses**

- **W1 — 46 most-used exercises have no watch-out cue**, so the guide's
  best safety/quality feature is invisible exactly where it's most seen.
- **W2 — "Watch out" is painted food-orange** (`THEME.semantic.nutrition`)
  — semantic drift; orange = nutrition domain identity everywhere else.
  `THEME.warning` is the correct register.
- **W3 — step markers are plain `1.` text** in lifting purple; the rest of
  the app's formatting language uses contained markers (chips/rings). Low
  hierarchy between marker and body.
- **W4 — the 60 px collapsed preview cuts mid-line** with a gradient fade —
  first line of step 2 is half-visible in the default state.
- **W5 — per-exercise muscle highlight already exists** (primary bright,
  secondary light) — the prompt's Phase-2 ask is shipped; what it lacks is
  the same glow treatment as the analytics map (fixed together in Phase 2).

**Fix (Phase 3, implemented):** backfill the 46 cues (standard, widely-taught
coaching cues only, voice per `voice-and-tone.md`); `Watch out` →
`THEME.warning`; numbered chips for steps; collapse height snapped to whole
lines. Effort M, risk Low.

### 3. ExerciseDemoPlayer (`src/components/ExerciseDemoPlayer.tsx`)

**State:** media-dead (see decision 3). The component itself is sound:
ping-pong crossfade, reduced-motion 2-up, failure fallback.

**Named weaknesses**

- **W1 — linear-feeling motion:** the crossfade runs at a constant 700 ms
  hold regardless of position; real reps decelerate into the turnaround.
  End-frame holds equal to mid-frame holds makes the loop read mechanical.
- **W2 — `ease-out` on both fade directions** (in and out) rather than a
  symmetric dissolve.

**Fix (Phase 5, implemented):** hold the range-of-motion extremes longer
than mid-frames (turnaround pause) + symmetric `ease-in-out` dissolve.
Invisible today (no media), but the seam is ready. Effort S, risk none.

### 4. Badges (30 assets + render sites)

![](./badges-grid-light.png) ![](./badges-grid-dark.png)

**Family judgment (grid + per-asset inspection):** one consistent
generation. Palette = tier metals per `ART_BRIEF.md` (bronze/silver/gold/
platinum), identical framing (~90 % of frame, pointy-top, slight
perspective), identical top-left key light, embossed cream motifs, no
rendered text, clean transparency. **No regeneration candidates.** The
prompt's "style/lighting drift between generations" premise doesn't hold on
inspection — the set was converged in one batch from the brief.

**Render sites:** `BadgeGrid` (64 px grid / 60 px next-badge hero),
`NextBadgeCard` on Home (36 px in a 56 px ring), `BadgeEarnedModal`
(reveal), `EmptyState` (stroke hexagon only — geometry family, not the
art). Sizing is coherent.

**Named weaknesses (render-site only)**

- **W1 — locked art = `grayscale(1)` + 50 % opacity.** With most of the
  catalogue locked (every new user), the grid reads as a wall of grey
  ghosts; the metallic art's charm is invisible pre-earn. Tension with the
  goal-gradient purpose of the grid.
- **W2 — earned glow is a flat 55-alpha box-shadow** on the card, not on
  the badge; at 3-col size it barely registers (see dark capture).
- **W3 — `BadgeGrid` streak summary uses `text-orange-500`** (raw Tailwind
  palette) for the current-streak number — off-token.

**Fix (Phase 4, implemented):** locked treatment keeps a trace of tier
colour (reduced-saturation rather than full greyscale) so the grid invites
rather than mourns; earned glow moves onto the badge (tier-tinted
drop-shadow behind the hex, static filter); `text-orange-500` →
`THEME.amberLight` token. Asset files untouched. Effort S, risk Low.

### 5. Social

Only `ProgressPhotos` uses the `EmptyState` primitive; every other social
empty state is hand-rolled (LeaderboardCard, FullLeaderboard ×2,
CommentSheet). Full findings with line numbers below; the top-3 by
impact-over-effort ship in Phase 6.

![](./social-light.png) ![](./social-dark.png)

**ActivityCard (928 lines)**

- **W1 — hero-stat size mismatch:** run stats `text-xl`, workout stats
  `text-lg` — two hero scales for the same role in one feed.
- **W2 — kudos-count button is a bare `text-xs` button** (sub-44 px target)
  next to a correctly-floored flame button.
- **W3 — flame styles via inline `style`** (scale/color/opacity +
  `setTimeout`) while sibling actions use classes — divergent mechanism,
  and the flame pop fights the app's motion language.
- **W4 — map backing `rgba(255,255,255,0.02)` raw literal** (×2) — fixed
  light-on-dark assumption, non-adaptive.
- **W5 — two near-identical author-row blocks** (hybrid vs standard) with
  different timeAgo treatment (one has a sport icon, the other doesn't).

**Leaderboards (LeaderboardCard + FullLeaderboard)**

- **W6 — the same 40-line row template exists twice** inside
  LeaderboardCard (<3 vs ≥3 branches) and diverges from FullLeaderboard's
  rows (rank `w-5 text-xs` vs `w-6 text-sm`).
- **W7 — FullLeaderboard's two empty states hand-roll a raw
  `rgba(123,114,233,0.12)` tile** — the only raw purple in the folder —
  while its sibling card uses `${THEME.brand}15` for the same tile, and
  both should be the `EmptyState` primitive (`compact`).
- **W8 — "you" row highlight `bg-primary/5` + `border-primary/15`** is
  near-invisible — the one row a user scans for doesn't pop.

**CommentSheet**

- **W9 — flat hierarchy: author, body, timestamp all `text-xs`**; the
  message itself (primary content) is the smallest type step.
- **W10 — delete is `opacity-0 group-hover:opacity-100`** — hover-gated in
  a mobile bottom sheet = unreachable on touch.

**PostCompletionKudos** — already calm and correct (44 px floors, tokens,
single decision). The "one orchestrated micro-animation" idea is a nice-to-
have; deferred (listed, not shipped — the surface is fine).

**Share cards (`ShareCardRenderer` + sheet + generator)** — audited against
the Strava/WHOOP bar and it's the _strongest_ social surface, contrary to
the prompt's assumption: Archivo tabular heroes at 220 px, one small brand
mark earning its footer place, deliberate inline-hex palette (documented as
capture-safe by design — html-to-image can't resolve CSS vars). Weakness
worth recording, not shipping: the palette literals duplicate THEME values
with no drift guard — a one-line test could pin `#D4637A === THEME.running`
etc. (Phase 7 candidate.)

**Phase 6 top-3 (implemented):**

1. Leaderboard consolidation — one row component, one rank treatment,
   `EmptyState compact` for all three hand-rolled states, raw rgba → token,
   visible "you" highlight (W6/W7/W8).
2. CommentSheet — body to `text-sm`, meta stays caption, delete always
   visible at 44 px (W9/W10).
3. ActivityCard — unify hero stat scale, floor the kudos-count target,
   flame pop → class-based motion-safe transition (W1/W2/W3).

Deferred to backlog: W4, W5, ProgressPhotos `border-purple-500` → token +
radius match (small, Phase 7 pick), ShareComposer mixed primitives,
share-card palette pin test.

### 6. Open-sweep candidates (Phase 7, cap 5)

1. `ProgressPhotos` selected border `border-purple-500` → `border-primary`;
   compare-tile radius matched to grid tiles.
2. Share-card palette drift pin (test asserting renderer literals ===
   THEME tokens).
3. `BadgeGrid` streak-summary raw `text-orange-500` (shipped with Phase 4).
4. `ActivityCard` map backing rgba → theme-aware token (with W4).
5. — reserved; anything further goes to backlog, not this pass.

## What was deliberately NOT done

- No badge asset regeneration (decision 1) — the set is coherent.
- No Lottie / new dependencies (decision 2).
- No share-card redesign — it's the quality bar already.
- No re-templating of the 151 existing instruction sets — 100 % coverage,
  consistent voice; forcing a Setup/Execution/Cues structure onto entries
  users already read is churn (voice doc: "over-editing good copy is its
  own failure mode"). The template applies to NEW entries.

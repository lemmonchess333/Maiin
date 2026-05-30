# Tropos Design Guide — for external collaborators (Codex et al.)

> **Who this is for.** You're contributing UI/code to Tropos but you haven't
> absorbed how the design system actually works. This file is the fast path.
> Read it before you touch anything visual. If your change conflicts with
> something here, the rule here wins — or you ask first.
>
> **The single most important sentence:** Tropos is a *calm, warm, iOS-style
> light-mode fitness app with two semantic sport colours and a strict
> two-font / token-driven system.* It is **not** a dark, neon, glassy,
> gradient-heavy "AI dashboard." Most generic UI instincts will pull you the
> wrong direction. Resist them.

---

## 0. The non-negotiables (memorise these first)

If you only remember ten things:

1. **Don't introduce new colours, gradients, or decorative elements.** The
   palette is closed and intentional. Adding a "nice blue" or a hero gradient
   is a regression, not an improvement.
2. **Purple = lifting/brand. Coral = running.** This sport-coding is everywhere
   (dots, labels, icons, CTAs). Never cross the wires.
3. **All numbers are JetBrains Mono + `tabular-nums`.** Calories, weight, reps,
   pace, volume — every numeric display. Use the `.stat-number` class or
   `font-mono tabular-nums`.
4. **All other text is Plus Jakarta Sans.** Two fonts total. No third font, ever
   (not even for one decorative glyph).
5. **44px minimum touch target.** This is an iOS app shell. Buttons default to
   `md` (44px). Anything smaller needs a real justification.
6. **Use the primitives.** `Button`, `IconButton`, `Banner`, `BottomSheet`,
   `Dialog`, `.ds-card`, `.ds-input`. Don't hand-roll a button out of a `div`
   and a Tailwind string.
7. **Colours come from tokens, not hardcoded hex.** Use `bg-primary`,
   `text-muted-foreground`, or `THEME.*` — never paste `#7B72E9` inline.
8. **Light AND dark mode both have to work.** Every change is reviewed in both.
9. **Calm over flashy. Breathing room over density.** Subtle shadows, soft
   tinted backgrounds, generous padding. When in doubt, do less.
10. **Design for 1000+ users, not "the one current user."** Cold-start states,
    light-trainers, lapsed users, vacation gaps are all real segments. A design
    that breaks for them is a bug, not an edge case.

---

## 1. Visual identity

- **Aesthetic:** Clean, warm light mode. iOS-inspired grouped background
  (`#F2F2F7`-ish), white cards, subtle depth. Minimal and calm.
- **Dark mode:** True dark-glass (bg `#121214`, surfaces `#1A1A1F`), warm
  neutrals — *not* cold blue-black. Used only when the user toggles it.
- **Brand colour:** Purple `#7B72E9`. Used **sparingly** — active tab
  indicators, CTAs, progress bars, accents. Never as a full-page background
  (the only purple "fills" are gradient CTA buttons and the auth logo).
- **Sport-coding:** Lifting = purple `#7B72E9`, Running = coral `#D4637A`.
  These two colours recur in calendar dots, section labels, icon tints, and
  contextual cards.
- **Logo:** Purple gradient hexagon with an upward chevron cutout + "TROPOS"
  wordmark, top-left of home.

**The "calm" test:** if a screenshot of your change looks like it belongs in a
crypto trading app or a generic SaaS dashboard, it's wrong. It should look like
it belongs next to Apple Fitness / Strava / a well-made iOS health app.

---

## 2. Where the design system lives (source of truth)

| File | What's in it |
| --- | --- |
| `src/styles/tokens.css` | `--ds-*` design tokens: brand colour steps, typography scale, shadows, transitions, font weights. |
| `src/index.css` | The **canonical HSL colour variables** (`--primary`, `--card`, `--destructive`, etc.) for `:root` (light) and `.dark`, plus the Tailwind `@theme` bridge that exposes them as `bg-primary`, `text-muted-foreground`, etc. Also app-shell layout vars (`--tab-bar-height`, safe-area insets). |
| `src/lib/theme.ts` | The `THEME` **JavaScript object** — sport colours, semantic colours, macro colours, chart colours, gradients. Used in TS/inline styles where a CSS class can't reach. Also `MACROS_TEXT_LIGHT` + `useMacroPalette()`. |
| `src/styles/components.css` | Shared CSS primitives: `.ds-card`, `.ds-card-interactive`, `.ds-input`, `.ds-status-banner`, `.bottom-nav-frost`, auth shell, `.stat-number`, `.progress-ring`, `.pressable`. |
| `src/styles/animations.css` | Keyframes + classes: `ds-fade-up`, `ds-scale-in`, stagger delays, run-button pulse, skeleton shimmer, number-update flash, PR flash, tab bounce. |
| `src/components/ui/` | React primitives: `Button`, `IconButton`, `Banner`, `BottomSheet`, `Dialog`, `ConfirmDialog`, `ChoiceSheet`, `Coachmark`, `Tooltip`, `Toggle`, `Spinner`, `AnimatedNumber`, `ErrorState`. |
| `CLAUDE.md` → "Tropos Design System" | The authoritative spec this guide summarises. If you need deeper detail, read that section. |

**Rule:** never re-declare a colour or radius that already exists as a token.
If you find yourself typing a hex value, stop and find the token.

---

## 3. Colour system — read this twice

Tropos has **two** colour mechanisms. Knowing which to use is the #1 thing
external contributors get wrong.

### 3a. Tailwind semantic classes (HSL tokens) — *prefer these*

Defined in `src/index.css` as HSL vars and bridged to Tailwind. Use them as
normal Tailwind utilities. They automatically adapt to dark mode.

| Class | Meaning |
| --- | --- |
| `bg-background` / `text-foreground` | Page canvas + default text |
| `bg-card` / `text-card-foreground` | Card surface + its text |
| `bg-muted` / `text-muted-foreground` | Subtle fill / secondary "iOS grey" text |
| `bg-primary` / `text-primary` | Brand purple (light — **for tints/accents/text**) |
| `bg-primary-strong` | Darker brand purple — **for filled CTAs with white text** (clears WCAG AA where `bg-primary` is borderline) |
| `bg-destructive` / `text-destructive` / `bg-destructive-bg` | Errors (filled / text / tinted surface) |
| `bg-success` / `text-success` / `bg-success-bg` | Positive states |
| `bg-warning` / `text-warning` / `bg-warning-bg` | Warnings |
| `border-border` | The standard hairline border |

> ⚠️ **`bg-primary` vs `bg-primary-strong`:** if white text sits *on* the
> colour (a filled button, a "Join"/"Follow" pill), use `bg-primary-strong`.
> If the colour is a light tint or coloured text on a light surface, use
> `bg-primary`. The `Button` primitive already does this for you.

### 3b. The `THEME` object (JS constants) — for what classes can't reach

Imported from `@/lib/theme`. Used in inline styles, charts (Recharts), SVG, and
anywhere you need a colour in JS. **Running coral has no HSL token yet**, so
run-discipline colours *must* come from `THEME`:

```ts
import { THEME } from "@/lib/theme";

// Sport-coding
THEME.running        // #D4637A  coral  — running
THEME.lifting        // #7B72E9  purple — lifting (same as brand)
THEME.brand          // #7B72E9
THEME.brandStrong    // #6560C8  filled CTA brand (AA-safe on white text)

// Semantic (harmonised)
THEME.semantic.hydration  // #52A3BD teal   — water
THEME.semantic.nutrition  // #D9884E orange — food/calories/macros
THEME.semantic.vitals     // #D4637A coral  — health/HR/recovery (== running)
THEME.semantic.positive   // #4DB872 green  — streaks/PRs

// Macros (dark-tuned; see 3d)
THEME.macros.protein // pink   THEME.macros.carbs // gold   THEME.macros.fat // sage
```

### 3c. Tints via hex-alpha suffix (the `${THEME.x}14` pattern)

Tropos builds tinted surfaces by appending a 2-digit hex alpha to a colour
constant. You'll see this constantly — learn the conversions:

| Suffix | Alpha | Typical use |
| --- | --- | --- |
| `0F` | ~6% | info banner surface, action-pill tint |
| `14` | ~8% | warning banner surface, light macro tint |
| `1A` | ~10% | standard icon-background tint, `sport-tinted` button |
| `30` | ~19% | banner/card borders on a tinted surface |

```tsx
// 6% coral surface with full-coral icon — the canonical run "info" banner
<div style={{ background: `${THEME.running}0F`, borderColor: `${THEME.running}30` }} />
```

`THEME.iconBg` (`rgba(123,114,233,0.10)`) is the pre-baked brand icon tint.

### 3d. Macro colours need a light-mode swap

The raw `THEME.macros.*` values are tuned for dark mode and **fail WCAG AA as
text on white**. For macro *text on a light card*, use the `useMacroPalette()`
hook (returns bright values in dark mode, the AA-safe `MACROS_TEXT_LIGHT`
values in light mode). Use the raw values only for dots/tints/bars.

### 3e. Semantic colour meanings are fixed

| Colour | Always means |
| --- | --- |
| Purple `#7B72E9` | Brand / lifting |
| Coral `#D4637A` | Running / vitals / recovery |
| Orange `#D9884E` | Nutrition / calories / macros |
| Teal `#52A3BD` | Hydration / water |
| Green `#4DB872` | Positive (streak, PR, success) |
| Coral-red `#FF6B4A` | The Food-page **Scan** CTA only (`THEME.food.scan`) |
| Amber `#D97706` | Warning *banners* only (`THEME.amber`) — distinct from nutrition orange |

Never repurpose one of these for an unrelated feature.

---

## 4. Typography

- **Display font:** Plus Jakarta Sans (everything that isn't a number).
- **Mono font:** JetBrains Mono (every number — with `tabular-nums`).
- **Scale** (1.25 modular; available as `text-display`, `text-h1`, … Tailwind classes):

| Token | Size | Use |
| --- | --- | --- |
| `text-display` | 48px | Hero stat numbers (e.g. health score) |
| `text-h1` | ~31px | Page titles ("Program", "Social") |
| `text-h2` | 25px | Section headers ("RUNNING", "NUTRITION") |
| `text-h3` | 20px | Card titles |
| `text-body` | 16px | Standard text (accessibility baseline — don't go below for body) |
| `text-small` | 14px | Secondary descriptions |
| `text-micro` | 12px | Labels, captions, uppercase tracking headers (floor) |

**Weight rules (strict):**
- `800` extrabold → hero numbers + page titles
- `700` bold → section headings + card titles
- `600` semibold → pill text + button labels
- **Never mix 700 and 800 in the same visual tier.**

Section labels are a deliberate style: ~10px, UPPERCASE, wide letter-spacing,
muted colour. That's intentional, not a bug — match it.

---

## 5. Spacing & layout

- **Page horizontal padding:** `px-4` (16px). Don't invent a different gutter.
- **Card internal padding:** `p-3` (12px) compact, `p-4` (16px) hero.
- **Vertical rhythm between cards:** `space-y-2` (dense) / `space-y-3` (section breaks).
- **Grid gap:** `gap-2` (8px) for compact grids.
- **Icon containers:** `w-9 h-9` (36px) standard, `w-12 h-12` (48px) hero.
  Icon inside: `w-4 h-4` standard, `w-5 h-5` hero.
- **Bottom padding:** use the `--page-bottom-pad` var (tab bar + safe area +
  breathing room). Don't hardcode `pb-20`.
- **Safe areas:** respect `--safe-top` / `--safe-bottom`. Run pages (`/run`,
  `/run-summary`) render full-screen *without* the nav Layout wrapper.

---

## 6. Card patterns

| Pattern | Recipe |
| --- | --- |
| **Standard card** | `bg-card` white, `rounded-xl` (12px), `p-3`–`p-4`, `shadow-card` (very subtle). Or use `.ds-card`. |
| **Hero card** (Health Score, Water) | `rounded-2xl` (16px), `p-4`, 48px icon container in a purple-tinted square. |
| **Compact tile** (Weight, Steps) | `rounded-xl`, `p-3`, `bg-muted`, 2-col grid. |
| **CTA card** (today's workout/run) | `rounded-xl`, sport-tinted bg at ~8% opacity, Play pill right-aligned. |
| **Action pill** (Quick Log / Start Run / Log Food) | `rounded-xl`, sport-tinted bg ~6%, icon + 11px semibold label, equal-width flex row, ≥44px touch target. |

- Use `.ds-card` for static grouped surfaces and `.ds-card-interactive` **only**
  on a real `<button>`/`<a>` (never a wrapped `div`) for pressable cards.
- Shadows live as tokens (`--ds-shadow-card`, `-hover`, `-elevated`). Don't write
  ad-hoc `box-shadow`.

---

## 7. Component primitives — use, don't reinvent

Reach for these instead of bespoke markup. They already encode the radius,
focus ring, touch target, press feedback, AA contrast, and reduced-motion
behaviour.

- **`Button`** (`src/components/ui/Button.tsx`): variants `primary` (filled
  brand), `secondary`, `destructive`, `ghost`, `outline`, `sport` (coral run
  CTA — "Start"/"Go"), `sport-tinted` (coral-tinted non-critical run action).
  Sizes `sm` 36px / `md` 44px (default) / `lg` 52px. Has `loading`, `leftIcon`,
  `rightIcon`, `fullWidth`. **Lifting CTAs use `primary`; running CTAs use
  `sport`.**
- **`IconButton`**: icon-only; enforces `aria-label` at compile time; square
  44px default.
- **`Banner`** (`info` | `warning`): inline, state-derived notices that live in
  a page section (race-elapsed, recovery, etc.). `info` = coral 6% tint
  (`role="status"`), `warning` = amber 8% tint (`role="alert"`). **There is no
  `error` variant** — transient errors go through **sonner toasts**, never a
  banner.
- **`BottomSheet`** (vaul): the standard editing surface (exercises, weight
  logging). Sheets for editing, dialogs for confirmation.
- **`ConfirmDialog`** for destructive confirmations.
- **Toasts:** `sonner` — `toast.success()` / `toast.error()`. This is the
  channel for transient feedback.
- **Icons:** `lucide-react`, imported individually. No other icon set.
- **Class merging:** `cn()` (`clsx` + `tailwind-merge`) for conditional classes.

---

## 8. Interaction & motion

- **Tap feedback:** `scale(0.97)` on `:active`, 150ms `cubic-bezier(0.4,0,0.2,1)`.
  Use `.pressable` or the primitives (which bake it in).
- **Haptics:** call the `haptic()` utility on button/card taps (Capacitor).
- **Count-up:** hero numbers animate from 0 on first load (`useCountUp`).
- **Entrance:** `ds-fade-up` / `ds-scale-in` with `ds-stagger-*` delays.
- **Number updates:** `.ds-stat-updated` flash; PRs use `.ds-badge-new-pr`.
- **Focus ring:** `focus-visible` only (mouse clicks shouldn't draw it) —
  `ring-2 ring-primary/40 ring-offset-2`. The primitives already do this.
- **Reduced motion:** `prefers-reduced-motion: reduce` is honoured globally
  (animations.css) *and* by the primitives. If you add a custom animation,
  gate it — either via the `useReducedMotion` hook or a CSS media query.

---

## 9. Dark mode

- Toggled via a `.dark` class on the root; all HSL tokens flip automatically, so
  if you used `bg-card`/`text-foreground` you're already covered.
- `THEME` constants are shared across themes; tints may need a higher alpha in
  dark mode (the 12–15% visibility floor) — follow the pattern in `Banner.tsx`.
- Shadows have dark-mode overrides in `tokens.css` — use the tokens, not raw
  shadows, and you inherit them.
- **Always eyeball both themes** before declaring done, especially tinted
  surfaces, banner arrows, and chart colours.

---

## 10. Accessibility floors (hard requirements)

- **Touch targets ≥ 44px** for anything interactive (iOS HIG). `Button md` and
  `IconButton` meet this by default.
- **WCAG AA contrast** for text. This is *why* `primary-strong`,
  `MACROS_TEXT_LIGHT`, and the darker semantic tokens exist — use them.
- **Body text ≥ 16px**, micro labels ≥ 12px.
- **Semantic roles:** `Banner` uses `status`/`alert`; respect ARIA. Icon-only
  controls need labels. Inputs/anchors need accessible names.
- **Keyboard:** focusable, Enter/Escape behave, focus returns to the trigger
  after a popover/sheet closes.
- **Reduced motion** respected (see §8).

---

## 11. How to make a design decision (the mental model)

When you're unsure, run the decision through these, in order:

1. **Does a token / primitive already cover this?** If yes, use it. Stop.
2. **Does it keep the sport-coding + semantic-colour meanings intact?** If your
   change uses purple for a run thing or invents a new accent, it's wrong.
3. **Is it calmer than what I first reached for?** Remove a gradient, soften a
   shadow, widen the padding, drop a decorative flourish.
4. **Does it hold up at the user-base scale?** Cold-start (empty data),
   light-trainer (2–3 days/week), lapsed/returning, vacation/illness gaps. If it
   only looks right for a fully-populated power user, redesign the empty/sparse
   state with equal care. "It's only one transient window" is an invalid
   argument — across 1000 users that window is one of the most-seen states.
5. **Both themes still good? AA still met? 44px still met?** If not, fix before
   shipping.
6. **Still unsure / it's a product call (e.g. naming, IA)?** Ask — don't guess.
   More effort doesn't substitute for a product decision.

**"Ship simple" ≠ "ship broken."** Ship the simplest thing that is *correct for
the user base*, which is usually more work than the easiest thing for you.

---

## 12. Worked example — good vs. bad

**Task:** "Add a button to start a run."

❌ **Wrong (generic instincts):**
```tsx
<div
  onClick={startRun}
  className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white
             rounded-full px-3 py-1 shadow-lg cursor-pointer"
>
  Start Run 🏃
</div>
```
Why it's wrong: new colour (blue) that isn't in the system, gradient where none
belongs, a `div` instead of a button (no a11y/focus/keyboard), `py-1` is under
44px, emoji, ad-hoc shadow, wrong discipline colour.

✅ **Right (uses the system):**
```tsx
import { Button } from "@/components/ui/Button";
import { Play } from "lucide-react";

<Button variant="sport" size="lg" fullWidth leftIcon={<Play className="size-5" />}
        onClick={startRun}>
  Start Run
</Button>
```
Why it's right: `sport` variant = coral (running discipline), `lg` is a 52px hero
target, real `<button>` with focus ring + press scale + reduced-motion baked in,
no new colours, no gradient, no emoji.

---

## 13. Pre-flight checklist (run before you submit)

- [ ] No new colours / gradients / decorative elements introduced.
- [ ] No hardcoded hex — everything via tokens (`bg-*`) or `THEME.*`.
- [ ] Sport-coding correct (purple = lift, coral = run) and semantic colours intact.
- [ ] Numbers use JetBrains Mono + `tabular-nums`; text uses Plus Jakarta Sans.
- [ ] Font weights follow the 600/700/800 tier rules (no 700+800 mixing).
- [ ] Used primitives (`Button`/`IconButton`/`Banner`/`BottomSheet`/`.ds-card`)
      instead of hand-rolled markup.
- [ ] Interactive targets ≥ 44px; press feedback + `focus-visible` ring present.
- [ ] Verified in **light and dark** mode.
- [ ] WCAG AA contrast met (used `primary-strong` / `MACROS_TEXT_LIGHT` where needed).
- [ ] Reduced-motion respected for any new animation.
- [ ] Empty / cold-start / sparse-data state designed, not just the happy path.
- [ ] `npm run lint`, `npm run build`, and `npm run test` pass.

---

*When this guide and your generic UI instincts disagree, the guide wins. When
the guide and `CLAUDE.md` disagree, `CLAUDE.md` wins (it's the deeper spec).
When something genuinely isn't covered here, ask before inventing.*

# Tropos Design Guide — for external collaborators (Codex et al.)

> **Who this is for.** You're contributing UI/code to Tropos but you haven't
> absorbed how the design system actually works. This file is the fast path.
> Read it before you touch anything visual. If your change conflicts with
> something here, the rule here wins — or you ask first.
>
> **The single most important sentence:** Tropos is a _calm, warm, iOS-style
> fitness app, dark by default with a fully supported warm light theme, two
> semantic sport colours, and a strict two-font / token-driven system._ It is
> **not** a neon, glassy, gradient-heavy "AI dashboard." Most generic UI
> instincts will pull you the wrong direction. Resist them.

---

## 0. The non-negotiables (memorise these first)

If you only remember ten things:

1. **Don't introduce new colours, gradients, or decorative elements.** The
   palette is closed and intentional. Adding a "nice blue" or a hero gradient
   is a regression, not an improvement.
2. **Purple = lifting/brand. Coral = running.** This sport-coding is everywhere
   (dots, labels, icons, CTAs). Never cross the wires.
3. **All numbers are Archivo (the numeral font) + `tabular-nums`.** Calories, weight, reps,
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

- **Aesthetic:** Calm iOS-inspired grouped surfaces in both themes. Dark is the
  first-run/runtime default; light remains a fully supported user choice.
- **Dark mode:** A deep, cool neutral (DS3, 2026-09-27): page `#0E0E11`,
  cards `#17171B`, raised surfaces `#212127`, text `#F4F4F6`. The page is a
  plain canvas — the brand-purple glow that used to sit at the top of every
  signed-in page is retired, so colour belongs to content. Light uses the
  warm grouped-background/card treatment. Every visual change must be
  reviewed in both.
- **One colour per job (DS3):** purple is lifting and the brand, coral is
  running, orange is food, teal is water, gold is a new best — and nothing
  else. A colour that means a sport or a domain is not decoration.
- **Brand colour:** Purple `#7B72E9`. Used **sparingly** — active tab
  indicators, CTAs, progress bars, accents. Never as a full-page background
  (the only purple fills are the primary button and the auth logo; no
  button carries a gradient).
- **Sport-coding:** Lifting = purple `#7B72E9`, Running = coral `#D4637A`.
  These two colours recur in calendar dots, section headings, icon tints, and
  contextual cards.
- **Logo:** Purple gradient hexagon with an upward chevron cutout — the app
  icon and the sign-in screens. Home carries no wordmark since DS3: it is
  titled with the date and "Today", like every other page names itself.

**The "calm" test:** if a screenshot of your change looks like it belongs in a
crypto trading app or a generic SaaS dashboard, it's wrong. It should look like
it belongs next to Apple Fitness / Strava / a well-made iOS health app.

---

## 2. Where the design system lives (source of truth)

| File                                 | What's in it                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/tokens.css`              | `--ds-*` design tokens: brand colour steps, typography scale, shadows, transitions, font weights.                                                                                                                                                                                            |
| `src/index.css`                      | The **canonical HSL colour variables** (`--primary`, `--card`, `--destructive`, etc.) for `:root` (light) and `.dark`, plus the Tailwind `@theme` bridge that exposes them as `bg-primary`, `text-muted-foreground`, etc. Also app-shell layout vars (`--tab-bar-height`, safe-area insets). |
| `src/lib/theme.ts`                   | The `THEME` **JavaScript object** — sport colours, semantic colours, macro colours, chart colours, gradients. Used in TS/inline styles where a CSS class can't reach. Also `MACROS_TEXT_LIGHT` + `useMacroPalette()`.                                                                        |
| `src/styles/components.css`          | Shared CSS primitives: `.ds-card`, `.ds-card-interactive`, `.ds-input`, `.ds-status-banner`, `.bottom-nav-frost`, auth shell, `.stat-number`, `.progress-ring`, `.pressable`.                                                                                                                |
| `src/styles/animations.css`          | Keyframes + classes: `ds-fade-up`, `ds-scale-in`, stagger delays, run-button pulse, skeleton shimmer, number-update flash, PR flash, tab bounce.                                                                                                                                             |
| `src/components/ui/`                 | React primitives: `Button`, `IconButton`, `Banner`, `BottomSheet`, `Dialog`, `ConfirmDialog`, `ChoiceSheet`, `Tooltip`, `Toggle`, `Spinner`, `AnimatedNumber`, `ErrorState`.                                                                                                                 |
| `CLAUDE.md` → "Tropos Design System" | The authoritative spec this guide summarises. If you need deeper detail, read that section.                                                                                                                                                                                                  |

**Rule:** never re-declare a colour or radius that already exists as a token.
If you find yourself typing a hex value, stop and find the token.

---

## 3. Colour system — read this twice

Tropos has **two** colour mechanisms. Knowing which to use is the #1 thing
external contributors get wrong.

### 3a. Tailwind semantic classes (HSL tokens) — _prefer these_

Defined in `src/index.css` as HSL vars and bridged to Tailwind. Use them as
normal Tailwind utilities. They automatically adapt to dark mode.

| Class                                                       | Meaning                                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `bg-background` / `text-foreground`                         | Page canvas + default text                                                                                                                |
| `bg-card` / `text-card-foreground`                          | Card surface + its text                                                                                                                   |
| `bg-muted` / `text-muted-foreground`                        | Subtle fill / secondary "iOS grey" text                                                                                                   |
| `bg-primary` / `text-primary`                               | Brand purple (light — **for tints, accents, icons and large numerals**; under 4.5:1 as small text)                                        |
| `text-lifting-strong`                                       | Brand purple as **small text** — the AA step (the brand and lifting are one purple; `text-primary-strong` is the fill, not the text step) |
| `bg-primary-strong`                                         | Darker brand purple — **for filled CTAs with white text** (clears WCAG AA where `bg-primary` is borderline)                               |
| `bg-destructive` / `text-destructive` / `bg-destructive-bg` | Errors (filled / text / tinted surface)                                                                                                   |
| `bg-success` / `text-success` / `bg-success-bg`             | Positive states                                                                                                                           |
| `bg-warning` / `text-warning` / `bg-warning-bg`             | Warnings                                                                                                                                  |
| `border-border`                                             | The standard hairline border                                                                                                              |

> ⚠️ **`bg-primary` vs `bg-primary-strong`:** if white text sits _on_ the
> colour (a filled button, a "Join"/"Follow" pill), use `bg-primary-strong`.
> If the colour is a light tint, use `bg-primary`. Purple TEXT smaller than
> 24px (18.66px bold) takes `text-lifting-strong`, never `text-primary` —
> `identityTextGuard.test.ts` counts the bare uses. The `Button` primitive
> already does this for you.

### 3b. The `THEME` object (JS constants) — for what classes can't reach

Imported from `@/lib/theme`. Used in inline styles, charts (Recharts), SVG, and
anywhere you need a colour in JS. **Running coral has no HSL token yet**, so
run-discipline colours _must_ come from `THEME`:

```ts
import { THEME } from "@/lib/theme";

// Sport-coding
THEME.running; // #D4637A  coral  — running
THEME.lifting; // #7B72E9  purple — lifting (same as brand)
THEME.brand; // #7B72E9
THEME.brandStrong; // #6560C8  filled CTA brand (AA-safe on white text)

// Semantic (harmonised)
THEME.semantic.hydration; // #52A3BD teal   — water
THEME.semantic.nutrition; // #D9884E orange — food/calories/macros
THEME.semantic.vitals; // #D4637A coral  — health/HR/recovery (== running)
THEME.semantic.positive; // #4DB872 green  — streaks/PRs

// Macros (dark-tuned; see 3d)
THEME.macros.protein; // pink   THEME.macros.carbs // gold   THEME.macros.fat // sage
```

### 3c. Tints via hex-alpha suffix (the `${THEME.x}14` pattern)

Tropos builds tinted surfaces by appending a 2-digit hex alpha to a colour
constant. You'll see this constantly — learn the conversions:

| Suffix | Alpha | Typical use                                          |
| ------ | ----- | ---------------------------------------------------- |
| `0F`   | ~6%   | info banner surface, action-pill tint                |
| `14`   | ~8%   | warning banner surface, light macro tint             |
| `1A`   | ~10%  | standard icon-background tint, `sport-tinted` button |
| `30`   | ~19%  | banner/card borders on a tinted surface              |

```tsx
// 6% coral surface with full-coral icon — the canonical run "info" banner
<div
  style={{
    background: `${THEME.running}0F`,
    borderColor: `${THEME.running}30`,
  }}
/>
```

`THEME.iconBg` (`rgba(123,114,233,0.10)`) is the pre-baked brand icon tint.

### 3d. Macro colours need a light-mode swap

The raw `THEME.macros.*` values are tuned for dark mode and **fail WCAG AA as
text on white**. For macro _text on a light card_, use the `useMacroPalette()`
hook (returns bright values in dark mode, the AA-safe `MACROS_TEXT_LIGHT`
values in light mode). Use the raw values only for dots/tints/bars.

### 3e. Semantic colour meanings are fixed

| Colour              | Always means                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purple `#7B72E9`    | Brand / lifting                                                                                                                                                                                                                                                                |
| Coral `#D4637A`     | Running / vitals / recovery                                                                                                                                                                                                                                                    |
| Orange `#D9884E`    | Nutrition / calories / macros                                                                                                                                                                                                                                                  |
| Teal `#52A3BD`      | Hydration / water                                                                                                                                                                                                                                                              |
| Green `#4DB872`     | Positive (streak, PR, success)                                                                                                                                                                                                                                                 |
| Coral-red `#FF6B4A` | Scanning, inside the scanner only — the shutter ring (`THEME.food.scan`) and the scan art in the Pro preview. The scanner's selected mode is a near-white chip (white on coral was 2.8:1). The Food page's camera button is food orange (owner call, CLAUDE.md Button mapping) |
| Amber `#D97706`     | Warning _banners_ only (`THEME.amber`) — distinct from nutrition orange                                                                                                                                                                                                        |

Never repurpose one of these for an unrelated feature.

### 3f. Uniformity stops where identity starts

The design system exists to make spacing, type scale, touch targets and
control behaviour the same everywhere. It is **not** a mandate to make every
surface look alike. A handful of elements are where the product has a face,
and consistency must yield to them:

| Element              | Keeps                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| Food hero            | Calorie ring, one orange arc on a grey groove, and three macro cards   |
| Home performance row | The ring in the band's colour with the score in it, the verb, the chip |
| Meal slot picker     | Filled orange pills (`SegmentedControl` `emphasis="solid"`)            |
| Sport coding         | Purple lifting / coral running, everywhere they appear                 |

A 2026-09 cohesion pass flattened the meal pills onto the neutral segmented
track, and a later release rendered both hero cards through a `compact`
prop. Between them the food surface lost the only colour it owned and the
weekly verdict became a row of digits. (DS3 made the performance card the
closing row of Home's "This week" card and dropped its gradient halo with
the app's other glows. What it kept is the list above: the verdict is
still a coloured ring, a verb and a chip, not digits.) Both were consistency applied past
the point where it helps. Before you unify something, ask whether the thing
you are unifying IS the identity of its surface; if it is, unify the
behaviour (roles, keyboard, target size) and leave the treatment alone.

### 3g. Em dashes: one rhythm is the problem, not one character

Copy that reaches for "statement — explanation" at every beat reads as
machine-written even when each line is fine on its own. Prefer the middot
the app already uses for `fact · fact`, or a full stop between two
independent statements. Keep the em dash for a genuine aside.
`emDashCopy.test.ts` ratchets the total and caps any single component, so
the count can only fall.

---

## 4. Typography

- **Display / text font:** Plus Jakarta Sans (everything that isn't a number).
- **Numeral font:** **Archivo** (every number) — chosen in the brand bake-off
  to replace JetBrains Mono (see `docs/visual-audit/bakeoff/DECISION.md`). It is
  proportional, not monospace, so digit alignment comes from tabular figures:
  the `.font-mono` rule in `index.css` forces `tnum` on every numeral element,
  and you should still add `tabular-nums` on numbers in columns. **The
  `font-mono` Tailwind utility / `--font-mono` token still carries numbers —
  the `mono` name is historical; it now resolves to Archivo.** Keep using
  `font-mono` for numbers; don't reintroduce a monospace face.
- **Scale** (1.25 modular; available as `text-display`, `text-h1`, … Tailwind classes):

| Token          | Size  | Use                                                              |
| -------------- | ----- | ---------------------------------------------------------------- |
| `text-display` | 48px  | Hero stat numbers (e.g. health score)                            |
| `text-h1`      | ~31px | Page titles ("Program", "Social")                                |
| `text-h2`      | 25px  | Large display headings                                           |
| `text-h3`      | 20px  | Page section headings ("This week", "Running"), hero card titles |
| `text-body`    | 16px  | Standard text (accessibility baseline — don't go below for body) |
| `text-small`   | 14px  | Secondary descriptions                                           |
| `text-micro`   | 12px  | Labels and captions, sentence case (floor)                       |

Sizes are at the designed text size. The iPhone app follows the phone's
text size (`systemTextSize.ts`, 1× to 2×): body and small text grow in
proportion, while the four heading steps grow by the same amount as body
text, as iOS titles do under Dynamic Type (`tokens.css`). At double text
a page title is 47px, not 62px.

**Onboarding question role (approved first release, 7 September 2026):**
The question heading uses the existing `text-h1` token with `font-extrabold`,
tight leading and natural wrapping. Standard route titles keep their existing
page-title treatment. The five named chapters orient the seven setup screens;
no additional typeface, colour or entrance animation is introduced.

**Weight rules (strict):**

- `800` extrabold → hero numbers + page titles
- `700` bold → section headings + card titles
- `600` semibold → pill text + button labels
- `500` medium → **small-text emphasis only**: secondary labels, meta rows
  and inline emphasis at `text-sm` / `text-xs`
- **Never mix 700 and 800 in the same visual tier.**
- **Never use `500` at `text-lg` or above.** Hierarchy at heading scale is
  600 / 700 / 800; 500 there reads as an accident. Pinned by
  `designSystemInvariants.test.ts`, which asserts zero rather than a
  ratchet — the codebase has never crossed this line.

`500` was undocumented for a long time and briefly treated as drift to be
burned down. It is not: of 269 sized uses, 113 are `text-sm` and 105 are
`text-xs`, with none above. It earned its place in the scale by being used
consistently; the guard now protects the boundary rather than the count.

**Headings and labels (DS3, 2026-09-27).** Everything is written in
sentence case; capitals are kept for table column headers. Two primitives,
picked by role:

- **`SectionHeading`** opens a group of sibling cards or rows. It is a real
  heading element: `page` size (20px bold, the H3 step) on a page or tab,
  `compact` (16px bold) inside a sheet, a card or a dense settings form,
  with an optional `action` (a text link such as "Weekly review") on the
  same row. It replaced the 12px uppercase, letter-spaced group label,
  which sat in the same register as a stat's caption one weight heavier —
  so a page read as a flat list of small shouting labels and a card's own
  title outranked the heading of its section.
- **`SectionLabel`** (caption tier) is the small label inside one card: a
  stat's name above its number, an eyebrow, a pill, a form-field label.
  12px semibold muted, no letter-spacing. Write it the way it is said
  ("Total volume"); it renders as written.

The label's legacy `section` tier (uppercase, bold, tracked) survives only
on two Food surfaces until the Food redesign, and a test keeps it there.
Nothing sits at 11px. Use the primitives rather than hand-rolling the
classes.

---

**Numerals against a target — slash spacing.** The default is the spaced
slash: `125 / 140 g` on a macro, and the target named in words where there
is room. Home's food card draws the Food page's calorie ring and macro
tiles, smaller and side by side (owner call, 2026-09-29), so the two
screens show the same object: both count down by default ("1,065 kcal
left", "86g left") and share one left/logged switch. Home shows the three
macros always, with full Protein, Carbs and Fat labels and their meat,
wheat and avocado icons; there is no collapsed P/C/F summary and no
Details disclosure.
Keep values and targets on separate lines where space requires it rather
than abbreviating the labels. Updated 2026-09-08. The whole-app role map — which treatment each UI role takes,
and the permitted exceptions — is `docs/cohesion-spec-2026-09.md`.

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
  `/run-summary`) render full-screen _without_ the nav Layout wrapper.

**Bottom navigation glass (owner-requested, 8 September 2026):** The web
navigation uses an inset frosted capsule, with the safe-area gap outside its
surface. This treatment is limited to `BottomNavigation`; data cards stay
solid. Reuse the existing palette, frost and shadow tokens, keep labels
opaque and the active pill contrast stable, and provide solid fallbacks for
reduced transparency and unsupported blur. It is a CSS approximation; native
Apple Liquid Glass would require a separate iOS navigation renderer.

---

## 6. Card patterns

| Pattern                                       | Recipe                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Standard card**                             | `bg-card` white, `rounded-xl` (12px), `p-3`–`p-4`, `shadow-card` (very subtle). Or use `.ds-card`.                                                                           |
| **Hero card** (Health Score, Water)           | `rounded-2xl` (16px), `p-4`, 48px icon container in a purple-tinted square.                                                                                                  |
| **Compact tile** (Weight, Steps)              | `rounded-xl`, `p-3`, `bg-card card-shadow`, 2-col grid (the card surface since DS3; it was `bg-muted`).                                                                      |
| **Today card** (`LiftCTACard` / `RunCTACard`) | Hero radius, sport wash at 12%, the session as a 25px title, its dose, a full-width Start (`primary` / `sport`); the rest of the card opens the day in Train. See CLAUDE.md. |

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
- **`ProgressRing`** (`src/components/ui/ProgressRing.tsx`): one ring for
  one share of a target (0–1), in the colour of what it measures, with its
  figure inside as children. The track is the neutral groove
  (`--muted-foreground / 0.22`), never a tint of the ring's own hue. The SVG
  is decorative: the figure beside or inside it carries the meaning, so say
  it in text or an `aria-label` on the surrounding control. Home's calorie
  ring and its Performance row use it. One ring per card; several quantities
  side by side are bars (DS3's macros), not a row of rings.
- **`EmptyState`** (`src/components/ui/EmptyState.tsx`): the canonical
  designed empty-state — a stroke-vector **brand hexagon** + one-line
  headline (`text-h3`) + optional one-line sub (`text-small`) + **at most one**
  action (`href` → `<Link>`, or `onClick` → `Button`). Pass the page's domain
  accent (`accent` — purple/coral/orange/teal) to tint the hexagon; pass an
  optional lucide `icon` to centre context inside it (else it shows the
  upward-chevron brand cutout). Subtle one-time draw-in, suppressed under
  reduced motion. Use it for genuine cold-start / no-data branches; complement
  (don't replace) an existing designed card on the same surface.
  - **Hexagon usage rule:** the hexagon mark appears in **empty-states and
    streak badges ONLY** — never as decoration on a populated surface, never
    as a loading placeholder, never inline in content. It is the brand
    signature; keep it scarce. Two owner-made exceptions, both the mark
    itself rather than decoration: it signs Home's header before the date
    (DS3, 2026-10-01), and it is the first-visit guide's face while the
    guide is talking (FV1, 2026-10-04: the walk's card and the one-time
    hints, `GuideMark`).
- **The first-visit guide** (`src/components/guide/`, FV1): `GuideWalk`
  dims the page around one card at a time, with the guide's card (the
  mark, a bold title, one or two sentences, Skip and Next) placed beside
  it; the first-visit walk starts with the mark lifting out of Home's
  header. `GuideHint` is the one-time hint: the same card without the dim,
  closed by Got it or any tap elsewhere. It finds its control by
  `data-guide-anchor` rather than wrapping it, because wrapping a control
  in a floating-ui reference replaces its own click handlers. The words
  live in `firstGuide.ts` and keep the house voice: the app never says
  "I", and nothing ends in an exclamation mark.
  - This is the **only** empty-state component — every empty/no-data branch
    routes through it (the older square-icon `components/EmptyState.tsx` was
    retired once all surfaces migrated). Don't reintroduce a bespoke
    empty-state; extend this primitive.
- **Toasts:** `sonner` — `toast.success()` / `toast.error()`. This is the
  channel for transient feedback.
- **Icons:** `lucide-react`, imported individually, with two drawn exceptions. The tab bar has its own set (`src/components/icons/TabIcons.tsx`, DS3): drawn together on one 24 grid with one stroke, each with a filled form for the open tab, because filling a stock outline filled some of them oddly. The avocado macro icon sits beside it. No other icon set.
- **Class merging:** `cn()` (`clsx` + `tailwind-merge`) for conditional classes.

---

## 8. Interaction & motion

- **Tap feedback:** `scale(0.97)` on `:active`, 150ms `cubic-bezier(0.4,0,0.2,1)`.
  Use `.pressable` or the primitives (which bake it in).
- **Haptics:** call the `haptic()` utility on button/card taps (Capacitor).
- **Count-up:** the moments' numbers count up as they appear, through
  `AnimatedNumber` (or `useCountUp` for a once-a-session count on Home).
  Under Reduce Motion `AnimatedNumber` is plain text from the first paint.
- **Entrance:** `ds-fade-up` / `ds-scale-in` with `ds-stagger-*` delays.
- **Number updates:** `.ds-stat-updated` flash; PRs use `.ds-badge-new-pr`.
- **Focus ring:** `focus-visible` only (mouse clicks shouldn't draw it) —
  `ring-2 ring-primary/40 ring-offset-2`. The primitives already do this.
- **Reduced motion:** `prefers-reduced-motion: reduce` is honoured globally
  for CSS (animations.css) and, through `MotionConfig`, for framer's
  POSITIONAL values only (x, y, scale, width, height). Opacity, stroke
  offsets, `pathLength` and count-ups are not covered: if you add one,
  gate it in the component with the `useReducedMotion` hook, as
  `ProgressRing` and `AnimatedNumber` do.

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

- **Touch targets ≥ 44px** for anything interactive. `Button md` and
  `IconButton` meet this by default.

  The three figures people quote are in three different logical units and
  are not interchangeable physical pixels, so keep them straight rather
  than averaging them: Apple asks for **44 × 44 pt**, Google for **48 × 48
  dp**, and WCAG 2.2 sets **24 × 24 CSS px** at AA (SC 2.5.8, with
  exceptions) and **44 × 44** only at AAA (SC 2.5.5, also with
  exceptions). Tropos targets **44 × 44 CSS px** on the web as a product
  decision — comfortably above the AA floor, matching the native platform
  we ship on. And the size alone does not make a control accessible: it
  still needs an accessible name, a visible focus state, and enough
  separation from its neighbours.

- **WCAG AA contrast** for text. This is _why_ `primary-strong`,
  `MACROS_TEXT_LIGHT`, and the darker semantic tokens exist — use them.
- **Body text ≥ 16px**, micro labels ≥ 12px. `SectionLabel` sits at 12px
  (see §4); `text-caption` (11px) is the scale's named floor for dense
  numerals and units, not for labels.
- **Semantic roles:** `Banner` uses `status`/`alert`; respect ARIA. Icon-only
  controls need labels. Inputs/anchors need accessible names.
- **Keyboard:** focusable, Enter/Escape behave, focus returns to the trigger
  after a popover/sheet closes.
- **Reduced motion** respected (see §8).

---

## 10a. Every surface owes six states, not one

A polished happy state is one sixth of a feature. Before a surface is
done, decide what it says in each of these — and say the thing that is
true, which is the whole point of separating them.

| State                    | What it must tell the person                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **First use**            | What this is for, and one useful first step. Reach for the `EmptyState` primitive (§7); do not hand-roll a centred icon block.                                                                                                                                                       |
| **No results**           | What did not match, and how to recover — broaden, clear a filter, or add it manually. An illustration alone is not recovery.                                                                                                                                                         |
| **Loading / saving**     | That something is in progress. **A zero is a claim, not a placeholder**: "0 eaten" is byte-identical to the display for someone who has genuinely eaten nothing. Show a `Skeleton` while a figure is unknown, and keep a figure you already have rather than flickering back to one. |
| **Offline / queued**     | Whether the entry is saved on this device and waiting to sync — and say this ONLY where the app actually provides that guarantee. Claiming a durability we do not have is worse than saying nothing.                                                                                 |
| **Error / interruption** | What failed, what was preserved, and the next safe action. A failed map must not take the run controls with it.                                                                                                                                                                      |
| **Success / correction** | What changed, in neutral specific copy, plus Undo or an edit route. No automatic sharing, no extra celebration dialog.                                                                                                                                                               |

The trap this table exists to catch is the middle one: a loading state
that is height-stable and confident reads as final. Home renders past the
profile skeleton with live data still arriving, so each card owns its own
pending treatment — `WeightStepsTiles` and `TodayEnergy` are the
reference implementations.

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

**"Ship simple" ≠ "ship broken."** Ship the simplest thing that is _correct for
the user base_, which is usually more work than the easiest thing for you.

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

<Button
  variant="sport"
  size="lg"
  fullWidth
  leftIcon={<Play className="size-5" />}
  onClick={startRun}
>
  Start Run
</Button>;
```

Why it's right: `sport` variant = coral (running discipline), `lg` is a 52px hero
target, real `<button>` with focus ring + press scale + reduced-motion baked in,
no new colours, no gradient, no emoji.

---

## 13. Pre-flight checklist (run before you submit)

- [ ] No new colours / gradients / decorative elements introduced.
- [ ] No hardcoded hex — everything via tokens (`bg-*`) or `THEME.*`.
- [ ] Sport-coding correct (purple = lift, coral = run) and semantic colours intact.
- [ ] Numbers use Archivo (the numeral font, via `font-mono`) + `tabular-nums`; text uses Plus Jakarta Sans.
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

_When this guide and your generic UI instincts disagree, the guide wins. When
§14's decision notes and an earlier section disagree, §14 wins: it records the
owner's dated calls. When something genuinely isn't covered here, ask before
inventing._

**Daily logging simplification (user direction, 2026-09-09):** Keep decorative food photos out of the calorie summary; retain meal photos on meal entries. Home session cards show the session and dose; rationale lives behind “Why this run” in day details. Water and weight saves update the tile, with editing available by reopening; persistent sync errors remain visible.

**Set types and the set table (owner direction, 2026-10-04):** A set's type is picked from its badge, as Hevy and MacroFactor do it: tap the number (or W, D or F) and a sheet lists Working set, Warm-up, Drop set and To failure, each with one line on what it does in Tropos. The words live in `setLabels.ts` beside the numbering, and the sheet works on a done set too, working the session's bests out again. Warm-ups are lettered, not numbered: the sets that count are "Set 1 of 3" however long the ramp, and a warm-up is optional, so starting the working sets passes over the ramp and never holds the exercise open (`isSetOutstanding`). Previous shows the same counted set last session. A done row turns green with the filled tick; the row being logged keeps the lifting tint.

**Lift reasons (owner choice, 2026-10-03):** A lift day's details carry the same closed disclosure, “Why this session”: under the session card on Train's lift tab (on a day still to train this week), in the day sheet's lift block, and under the planned lift in Home's day details. One control draws both (`PurposeDisclosure`). The words come from `liftSessionPurpose.ts`, which states only what the plan stores — the training focus, a lighter week, the last full week before one, and weights holding in an easing block's first weeks — and says nothing without a programme. Home's Today cards stay free of reasons.

**The rules sheet (owner lock Lift4 (3), 2026-10-05):** "Why this session" keeps its place on all three surfaces, but opens one sheet rather than a disclosure: the session's reasons first, then "How your plan works", the plan's rules for this person (`liftRules.ts`, its numbers read from the engine's constants), ending on "Stuck on a lift? A variation often gets it moving." Train also has an ⓘ beside the week label that opens the same rules on any day. The sheet loads when first opened (`LiftRulesSheet`). "Why this run" stays a disclosure.

**Daily logging refinement (user direction, 2026-09-09):** The Food calorie
summary may use a subtle, static halo made from existing theme tokens to
restore depth after the photo removal. Keep the ring and its contrast intact;
no new palette, illustration or motion. Water keeps equal icon-only minus/plus
controls (revised 2026-09-20, owner call from the options page: that now
names the FULL-WIDTH card only — the compact Home tile keeps ONE filled plus
in its label row, with Undo in the toast and a Remove row in the sheet, because
two 44 px controls cannot share a 151 px row with anything and four passes
had proved it); presets add immediately and Other amount expands inside the
same sheet. Avoid extra quick-add settings and a separate total-edit flow in that
sheet. Home has no persistent streak-recovery or rest-day banner; native timed
notifications are a deferred feature in `POST_LAUNCH.md`.

## 14. Decision notes and component specs (moved from CLAUDE.md, 2026-10-05)

These sat in CLAUDE.md's design-system section until 2026-10-05, loaded on every turn. They carry the owner's dated design decisions (DS3 and after), the training-plan primitives and the button mapping. Some of it restates §1–§10 above; where the two disagree, this section wins.

### 14a. Visual Identity

- **Aesthetic:** Dark is the DEFAULT theme — a deep, cool neutral: page #0E0E11, cards #17171B, raised #212127, text #F4F4F6 (DS3, 2026-09-27; it was #121214 / #1A1A1F under DS2). It is what new users and the signed-out/Login state see. There is no ambient glow: DS3 retired the brand-purple wash that sat at the top of every signed-in page (`AmbientGlow`), so colour belongs to content.
- **DS3 redesign (owner-approved 2026-09-27, lock row DS3 in the plan file):** one colour per job, one big thing per screen, drawings where they help. It ships screen by screen — foundations, Home, Train and the workout, Running, Analytics, moments and polish — and the Food page had its own pass. The owner kept Food's layout and its one timeline (Food8) on 2026-09-28, and chose two changes from the mockups: a week strip above the calorie card (`FoodWeekStrip`, Home's strip with each day a ring of calories eaten against that day's target), and the calorie ring in the food orange instead of purple. On 2026-09-29 Home's food card took the Food page's own ring and macro tiles, smaller and side by side (`size="compact"` on `CalorieRing` and `MacroColumn`), with the one left/logged switch shared: the two screens draw the same object, so change it in one place. The same day the ring went quiet: its number is the text colour, "kcal left" / "kcal logged" is plain grey text under it (no tag, no swap arrow), and the arc is one solid orange on a grey groove with no gradient, track shadow or pulsing glow; Home's macros sit on the card with no box of their own. The second view says "logged", not "eaten": the number counts what is in the diary, not what the person ate. The stored mode key is still `"eaten"`. Read the DS3 row before re-deciding any of it.
- **Light mode:** The opt-in alternate (selectable in Settings → writes `profile.darkMode = false`). It's a clean, warm, iOS-inspired look (#F2F2F7 grouped background, cards on white — minimal and calm with subtle depth, NOT a dark-glass app rendered light). Default-dark is applied pre-React in `public/init.js` (dark unless an explicit `"false"` is stored) and mirrored by the `profile.darkMode` defaults in `src/lib/auth.tsx`.
- **Brand colour:** Purple #7B72E9 — used sparingly for accents, active tab indicators, CTAs, progress bars. Never as a full background: its only fills are the primary button and the auth logo, and no button carries a gradient (the paywall's purple-to-teal ones went in the plain-text cleanup).
- **Sport-coding:** Lifting = purple (#7B72E9), Running = coral (#D4637A). These two colours appear in calendar dots, section headings, icon tints, and contextual cards.
- **Logo:** a hexagon with rounded corners and an upward chevron cut out of it, white on a purple field that lightens toward the top on the app icon, and brand purple in the app. The owner chose this refinement of the bake-off mark on 2026-10-01 (`docs/visual-audit/bakeoff/DECISION.md`, decision 4). It is the app icon (with dark and tinted versions for iOS's home-screen modes), the sign-in screen's logo (the icon itself), and the launch image (the hexagon alone). Home no longer carries the "TROPOS" wordmark: DS3 titles it with the date and "Today", and the user's initials open Settings. The mark itself signs Home, small, before the date (`BrandMark`), so "Today" keeps the left edge the cards below it start on. The geometry lives in `src/lib/brandMark.ts` and `src/assets/brand/app-icon.svg`, held together by `BrandMark.test.tsx`; after changing it, run `node scripts/art/gen-app-icon.mjs` (every app and web icon) and `node scripts/art/gen-splash.mjs` (the launch image).
- **Launch animation:** `LaunchSplash` takes over from the launch image (index.html paints the same hexagon, `#boot-splash`, until the bundle runs). Once its first frame is up it takes the native launch image down (`nativeLaunchImage.ts`; the two frames are the same), so the rise is seen and not played underneath it. The chevron rises into the hexagon, cut out so it shows whatever is behind it; if the app is still loading a beat later, the mark breathes until it leaves. Once the app is ready (on Home, once Home's header mark holds still and Home has drawn today's session and food, `data-page-ready`, waited for at most a second) the mark flies into Home's header mark on a soft arc that leaves upward, on a spring with no bounce, as the page shows; anywhere but Home it lifts a little as the overlay fades. Every movement is a transform or an opacity, played by the Web Animations API on a layer of its own, so it keeps its frames while the app starts underneath. Reduce Motion: the chevron fades in where it stays, nothing breathes, and the overlay fades. Its ground is the launch colour in both themes (`--launch`, the dark page), as the launch image is, so a light-mode user's page turns light only as it is revealed, never under the logo. It never shows under automation (`navigator.webdriver`), so specs and captures see the app as before. The four copies of the first frame (launch PNG, index.html, the overlay's CSS size, `brandMark.ts`) are pinned together by `launchSplash.test.ts`.

### 14b. Colour System (src/styles/tokens.css + src/lib/theme.ts)

- Purple brand: #7B72E9 (primary), #9590E0 (light), #6560C8 (dark)
- Running coral: #D4637A
- Nutrition orange: #D9884E / #e87316
- Hydration teal: #52A3BD
- Success green: #4DB872 / #22b558
- Icon backgrounds: rgba(123, 114, 233, 0.10) — subtle purple tint
- Card backgrounds: white (light) / #17171B (dark)
- Page background: `240 6% 93%` ≈ #ECECEE (light) / #0E0E11 (dark). The dark page is also the cold-start colour (splash, manifest, theme-color, and the launch overlay's `--launch` in both themes), derived from the token and pinned by `coldStartChrome.test.ts`: move the token, re-run `node scripts/art/gen-splash.mjs`, and update the three hex copies and the `--launch` token it names
- Raised surface (`--muted`: chips, tracks, tiles inside a card): #212127 (dark)
- New bests: gold, the `--achievement` family (`text-achievement-strong` for small text). Gold means a personal best and nothing else
- Text muted: the theme-aware `--muted-foreground` token (light `240 3.8% 43%`, dark `240 5% 65%` ≈ #A1A1AA) — tuned to clear 4.5:1 on card, muted AND page background in both themes. The old fixed #8E8E93 was deleted in the DS2 consolidation (2026-08-22, owner-decided): one grey serving both themes measured 2.53–3.26:1 across the light surfaces it rendered on. No fractional `text-muted-foreground/<n>` anywhere — de-emphasis is the type scale's job (banned + pinned in `tokenContrast.test.ts`). In JS/style contexts use `"hsl(var(--muted-foreground))"`.

### 14c. Typography (Plus Jakarta Sans + Archivo)

- **Display font:** Plus Jakarta Sans (all UI text)
- **Numeral font:** Archivo (stat numbers — calories, weight, reps, volume). Proportional, not monospace; tabular figures forced on `.font-mono`. Replaced JetBrains Mono (brand bake-off — `docs/visual-audit/bakeoff/DECISION.md`). The `font-mono` utility / `--font-mono` token still means "numbers"; the name is historical.
- **Scale (1.25 modular):**
  - Display: 3rem/48px — hero stat numbers (health score)
  - H1: ~31px — page titles ("Program", "Social", "Analytics")
  - H2: 25px
  - H3: 20px — page section headings (`SectionHeading`, "This week", "Running") and hero card titles
  - Body: 16px — standard text
  - Small: 14px — secondary descriptions
  - Micro: 12px — labels and captions, in sentence case
- **Weight rules:** 800 (extrabold) for hero numbers and page titles. 700 (bold) for section headings and card titles. 600 (semibold) for pill text and button labels. Never mix 700 and 800 in the same visual tier.
- **Numeric displays:** Always use font-mono + tabular-nums for alignment
- **Medium (500, `font-medium`) IS a tier — the small-text emphasis
  weight.** Use it at `text-sm` and `text-xs` for secondary labels, meta
  rows and pill text; hierarchy at `text-lg` and above is carried by
  600 / 700 / 800. It was previously held under a count ratchet on the
  theory that it was off-scale drift. Counting where it actually lands
  settled that: of 269 sized uses, 113 are `text-sm`, 105 are `text-xs`,
  and **zero** are `text-lg` or above. A convention that consistent
  across ~96 components is the scale, not drift. The count ratchet is
  gone; `designSystemInvariants.test.ts` now pins the boundary that
  matters — font-medium never appears at heading scale.

### 14d. Card Patterns

- **Cards render through the `Card` primitive** (`src/components/ui/Card.tsx`;
  pressable cards take the same look from `cardClasses` in its `.ts`
  sibling). Two sizes, decided once: **hero** = rounded-2xl + p-4,
  **compact** = rounded-xl + p-3. The radius curve is DS2's (`--radius`
  10px), so rounded-2xl is 22px and rounded-xl 16px, not Tailwind's
  defaults. The old "standard card, padding
  3-4" was the drift — 45 `bg-card` surfaces sat on some third pairing.
  `designSystemInvariants.test.ts` ratchets hand-rolled off-pairing
  `bg-card` surfaces down and bans the `shadow-card` class outright: it is
  a Tailwind shadow COLOUR, not a shadow, and cards that used it were flat.
  The elevation utility is `card-shadow`.
- **Hero card (Health Score, Water):** `Card` (hero), larger icon (48px container), icon in purple-tinted bg square
- **Compact tile (Weight, Steps):** the compact pairing on the card surface (`bg-card card-shadow`), 2-col grid. It sat one step darker than the page (`tone="muted"`) until DS3 deepened the dark surfaces, where a muted tile read as a hole beside the cards around it.
- **Today card (`LiftCTACard` / `RunCTACard`, DS3):** the hero radius with the sport's 12% wash (`bg-lifting/12`, `bg-running/12`), the session as a 25px title, its dose ("5 exercises · about 50 min", "5 km · about 30 min") and a full-width Start (`primary` for a lift, `sport` for a run). Start begins the session (`/program?day=N&start=1`, `/run?template=…`); the rest of the card is a sibling button that opens the day in Train to look it over, because a button cannot sit inside a button. A lift shows the cut-out drawing of its first exercise that has one (`formArtCutouts`). A finished or skipped day shows its status instead of Start. No rationale and no plan position ("Base · week 3 of 16") on Home: owner direction 2026-09-09, pinned in `SessionPurpose.test.tsx`. `RestDayCard` is a plain hero card naming tomorrow's session.
- **Quick actions:** there is no pill row. Today's actions are the Start
  buttons on the Today cards, and food logging is the "Log food" button in
  `TodayEnergy`'s header.
- **Inline banners:** the `Banner` primitive (`src/components/ui/Banner.tsx`), three variants — `info` (coral, running context), `warning` (amber), `neutral` (muted, no domain colour) — on the compact-card pairing, `rounded-xl p-3`. The sustained-offline notices render through `neutral` and render NOTHING while idle: the permanent live-region wrapper they used to keep was an empty first child in the page rhythm, pushing Food's and Train's headers down a step. Pinned in `designSystemInvariants.test.ts`. The global online/offline strip in `Layout` (`ds-status-banner`) is app-shell chrome, not an inline banner.
- **Section headings:** a group of cards or rows opens with `SectionHeading` (`src/components/ui/SectionHeading.tsx`) — a real heading in sentence case: `page` size (20px bold, the H3 step) on a page or tab, `compact` (16px bold) inside a sheet, a card or a dense settings form, with an optional `action` on the same row. DS3 retired the 12px capital-letter group label. `SectionLabel`'s `tier="section"` now marks a small group inside a Food sheet or list only (the Details sheet, the food suggestions): 12px bold, sentence case since the Food pass. Its surfaces are pinned by `designSystemInvariants.test.ts`.
- **Labels inside a card:** `SectionLabel`'s caption tier — 12px semibold muted, **sentence case**, no letter-spacing. Write the text the way it is said ("Total volume"); it renders as written. Capitals are kept for table column headers. No hand-rolled label classes (ratcheted in `designSystemInvariants.test.ts`)

### 14e. Training plan primitives

The Programme Run section is a **hybrid training cockpit**, not a settings
list. It is built from named, reusable training-plan primitives. These are
NOT considered decorative one-off patterns — they are components, reused
consistently, and part of the design system.

Primitives (all in `src/components/program/`, fed by the pure view model in
`src/lib/runProgrammeViewModel.ts`):

- **`RaceCockpitCard`** — race-prep identity card: readable distance heading
  (Marathon / Half Marathon / 10K / 5K), target date, days-out countdown,
  week N of M, current phase, and a phase rail. The rail reflects the REAL
  engine phases (`getPhaseForWeek`): **Base · Build · Taper · Race** — no
  invented "Peak" segment, so the active highlight always maps to a phase
  the scheduler can emit. Renders ONLY in the race-goal overlay.
- **`SessionCommandCard`** — the "what's next" command surface. Eyebrow +
  title (the card's one big line, H2) + one quiet meta line + a single
  primary action (its own control, NOT the whole card) + an overflow that
  opens the day sheet. Temporal eyebrow ("Up next" / "Due today" /
  "Tomorrow" / "Pending") — never "Next · Pending". DS3: a lift day's
  eyebrow leads with its category and its title is the focus ("Pull · Up
  next" over "Lat focus", as on Home); its picture sits at the right, as
  on Home's cards: a lift day's muscles (`figure`), or a run's type in a
  tile (`icon`, from `runTemplateIcon`); the halo went with the app's
  other glows. A free runner's Run tab leads with the same card ("Start a
  run" over "Pick your pace today"). Train's day list below it draws each
  exercise through `ExerciseRowSummary` (`ExerciseThumb`: the cut-out
  drawing, else the category's muscles, else a dumbbell), and Train shows
  one advice notice at a time (`programNotices`).
- **`ProgrammeWeekSelector`** — the one day-navigation primitive per tab
  (`2b4e07b8`, "competing navigators" unification): circular sport-coloured
  day cells (purple lift / coral run) in the Home WeekStrip visual language
  (a done day is filled with its sport at 30% with a check, as Home fills a
  logged day; it was the success green until DS3),
  a real selected-key controller driving the content beneath it. Lift tab =
  split-ordered rotation cursor; Run tab = date-pinned 7-day selector
  (ADR-0002's dual ontology, per tab). Extras (logged runs that claimed no
  slot) surface as day-cell indicators here and in full in `DayActionSheet`
  via `unclaimedByDate`. Its predecessor **`HybridWeekRail`** (two-lane
  week-at-a-glance) was superseded by that unification and sat orphaned —
  rendered by nothing, tests green — until deleted on 2026-08-08; its
  `extras-pill-v1` coachmark went with it (the capture rigs' pre-dismissals
  of that key are now inert).
- **`DayActionSheet`** — per-day command sheet (run + lift blocks of equal
  visual weight). Race-day detection is by template **type** (`type ===
"race"`), never `templateId === "race"` (race ids are `5k_race` …
  `marathon_race`). Template swap is scoped per-day ("Changes this day
  only.").

Locked model (Run9a): the Run surface is **two states only** — freeform
substrate + optional race-goal overlay (`resolveRunPlanSurface`). There is
NO user-facing freeform/structured/race_prep toggle and no mode chips. Do
not reintroduce structured mode or structured-mode transitions.

Constraints these primitives must keep:

- Closed palette: **coral = running, purple = lifting**; existing semantic
  tokens for success/warning/destructive. No new colours unless added as
  tokens. No decorative gradients.
- 44px+ touch targets (use the `Button` / `IconButton` primitives).
- Light + dark mode; reduced-motion respected (`motion-safe:` prefixes).
- Active plan editing deep-links to `/settings/run-plan` — the focused
  run-plan editor (Set1.2 nested-settings IA; originally
  `/settings/training` per Run8 PR1a, destination superseded but the
  "deep-link out, don't edit inline" decision unchanged). The entry copy
  reads as "Edit run plan", not a generic settings jump.

### 14f. Spacing

- **Page horizontal padding:** px-4 (16px)
- **Card internal padding:** p-3 (12px) for compact, p-4 (16px) for hero cards
- **Stack rhythm (vertical):** three steps and nothing between them. space-y-2 (8px) within a group — the cards under one section heading, rows inside a card; space-y-3 (12px) for a break inside a card; space-y-4 (16px) between page sections, which `PageShell` owns. No half steps (`space-y-2.5` was Home's group rhythm beside `space-y-8` on Analytics — the same role at 10px and 32px), and a section heading carries no margin of its own: its group's stack places it. Ratcheted in `designSystemInvariants.test.ts`; the five route pages and the shell are pinned to the scale outright.
- **Grid gap:** gap-2 (8px) for compact grids
- **Icon container:** w-9 h-9 (36px) for standard, w-12 h-12 (48px) for hero
- **Icon inside container:** w-4 h-4 (16px) standard, w-5 h-5 (20px) hero

### 14g. Interactive Patterns

- **Tap feedback:** scale(0.97) on active, 150ms cubic-bezier transition
- **Haptic:** Called on all button/card taps via haptic() utility
- **Count-up animation:** the moments' numbers count up as they appear: Home's streak and performance score (`useCountUp`, once a session), the Food ring and macros (on Food and on Home's food card, which draws the same ring and tiles), the workout finish screen's three figures and the weekly recap's first card (`AnimatedNumber`, which is plain text from the first paint under Reduce Motion)
- **Water card:** Fill-from-bottom gradient animation, wave SVG, bubble particles, ripple on add
- **Bottom sheet:** Vaul drawer for editing (exercises, weight logging)
- **Tab navigation:** Horizontal scrolling tabs with active pill indicator

### 14h. Glow & motion rules (WKWebView-safe — 2026-07 visual pass)

- **Glow recipe (non-negotiable):** a glow is a STATIC blurred layer whose
  **opacity/transform** animates — never animate blur radius or any filter
  value (filter animation stutters in WKWebView; opacity/transform composite
  on the GPU). Reference implementation: `src/components/BodyMapGlow.tsx`
  (blurred overlay `Model` behind the body diagrams — analytics heat map +
  exercise guide share it).
- **One ambient loop per surface, maximum.** On the muscle heat map, only
  the single most-trained muscle pulses; nothing else loops. `prefers-
reduced-motion` always gets the settled static state — no entrance, no
  loop.
- **Warning register:** warnings use `THEME.warning`, and since the D19
  split (2026-08-22, owner-delegated) that is the AMBER family —
  `#D97706`, one value with `THEME.amber`, matching the CSS ramp that was
  already amber (`--warning` light ≈ amber-700, dark = amber-500). Orange
  (`THEME.semantic.nutrition`, `#D9884E`) is the FOOD domain identity and
  is now visually distinct from warnings. Warning TEXT takes
  `hsl(var(--warning-strong))`, never the bare identity (amber-600 is
  ~3.1:1 on white — fill/icon only). When touching a `THEME.warning`
  call site, check the SEMANTIC first: the D19 sweep found half of them
  meant "food" and repointed those to `semantic.nutrition` — a new
  warning-token use on a food surface recreates the old collision in the
  other direction. `danger`/`semantic.vitals` and
  `success`/`semantic.positive` remain value-aliases (pixel-correct,
  name-only debt, pinned in `colorCanonical.test.ts` alongside the
  warning≠nutrition inequality that IS the D19 contract).
- **Framer Motion is gated globally only for POSITION; CSS animations
  are not gated at all.** `MotionConfig reducedMotion="user"` in
  `App.tsx` settles positional values (x, y, scale, rotate, width,
  height) and nothing else: opacity, a stroke offset, `pathLength` and a
  motion-value count-up all still animate under Reduce Motion. A non-positional animation
  asks `useReducedMotion` in its own component (`ProgressRing`,
  `CalorieRing`, `EmptyState`, `AnimatedNumber` are the patterns). A
  Tailwind `animate-*` class runs under Reduce Motion unless it carries
  the `motion-safe:` variant. Every skeleton pulse and ping does;
  `animate-spin` spinners are progress feedback and stay unprefixed
  (`UNGUARDED_ANIMATION_BASELINE = 8` in `designSystemInvariants.test.ts`
  is exactly the spinner set).
- **Empty states go through the `EmptyState` primitive**
  (`src/components/ui/EmptyState.tsx`; `compact` for in-card use) — no
  hand-rolled centered-icon-tile blocks. The primitive owns the brand
  hexagon, accent tinting, and reduced-motion handling.

### 14i. Button variants (canonical CTA mapping)

Every **CTA / action button** uses the shared `Button` primitive
(`src/components/ui/Button.tsx`) — never a hand-rolled `<button>` with bespoke
Tailwind. The primitive already supplies the 44px floor, focus-visible ring,
0.97 press, loading state, and `type="button"` default, so reusing it is also
how the "every interactive element clears 44px" invariant is satisfied. Pick
the variant by the action's role:

| Action role                   | Variant                         |
| ----------------------------- | ------------------------------- |
| Main lifting / brand CTA      | `primary`                       |
| Main running CTA              | `sport` (coral)                 |
| Secondary action              | `secondary` or `outline`        |
| Low-emphasis action           | `ghost`                         |
| Destructive action            | `destructive`                   |
| Running non-critical action   | `sport-tinted` (coral 10%)      |
| Nutrition-primary CTA         | `nutrition` (orange)            |
| Nutrition low-emphasis action | `nutrition-tinted` (orange 10%) |

The `nutrition` / `nutrition-tinted` variants are the food-domain analogue of
`sport` / `sport-tinted`, resolving via the `--nutrition` / `--nutrition-strong`
tokens (warm orange #D9884E identity; #B45309 amber-700 AA white-text/text step).
They exist to close the design-system gap — nutrition was the only documented
domain/sport colour with no first-class token + variant, which is what kept
leaking one-off hex orange past the hex guardrail. **This is NOT a licence to
paint Food buttons orange.** Orange is a domain/data identity (section labels,
macro rings, calorie data), not a per-screen button colour: reserve the filled
`nutrition` variant for genuinely nutrition-PRIMARY, glanceable actions where
orange IS the meaning, and keep ordinary Food CTAs (Add, Save, Log) on `primary`.

**Exceptions, owner calls:** three Food-page buttons are `nutrition`. Brand
purple stays for Pro there ("Try Pro free"). Other Food CTAs follow the rule
above until the owner says otherwise.

- **2026-09-22 — the "Your usual" row's Log.** Every other food control on
  that page is orange, and a purple Log sat directly above the orange meal
  pills.
- **2026-09-23 — the camera button beside the composer's text box.** It
  replaced the coral camera icon inside the field (itself the June Wave 2
  shrink of a full-width scan CTA): photo scanning is one of the page's main
  actions, and a 20px grey icon read as decoration. It is a filled square,
  camera only: it carried the word "Scan" for a day, and the owner found a
  camera beside "Scan" read as two different actions. Its accessible name is
  "Scan a meal". Coral (`THEME.food.scan`) now stays inside the scanner.
  Every account gets the same button; a free account's opens the scanner on
  Barcode, which is always free (F2b), with the photo tabs holding the Pro
  offer. The scanner opens by growing out of it (`ScanGrow`).
- **2026-09-23 — the scan result sheet's Log** ("Log to Breakfast"). It
  matches the usual row's Log: logging food is the page's one action, and
  the sheet opens over the orange camera button that started it.

Scope note: this is for **buttons** — visual CTA/action controls. It is NOT a
mandate to wrap every `<button>` element: pressable cards, list/table rows,
day-cells, chips, and icon taps are legitimately their own controls (use
`IconButton` for icon taps; `SegmentedControl` for single-select pill groups).
Unlike the hex guardrail, "use `Button`" can't be lint-enforced (a linter can't
tell a CTA from a pressable card), so this is a per-PR convention: when adding
or touching a CTA button, route it through `Button` with the variant above.

### 14j. Design Principles (for Claude Code when improving UI)

- **Keep the existing colour scheme** — the purple/coral/orange/teal semantic system is intentional and should not be changed
- **Calm over flashy** — subtle shadows, soft tinted backgrounds, no harsh contrasts
- **Breathing room over density** — generous padding, clear visual hierarchy
- **iOS conventions** — grouped background, card-based layout, safe area padding, 44px minimum touch targets
- **Consistent numeric treatment** — all numbers in Archivo (the numeral font) with tabular-nums
- **Sport-coding everywhere** — lift content uses purple tints, run content uses coral tints
- **Semantic colour consistency** — orange always = nutrition, teal always = hydration, coral always = vitals/running, purple always = brand/lifting
- **Progressive disclosure** — cards link to detail views, sheets for editing, don't overload screens
- **When polishing:** Focus on typography weight consistency, spacing regularity, shadow subtlety, and icon container sizing. Don't introduce new colours, gradients, or decorative elements.

### 14k. Current Known Design Considerations

- The water card has a complex animated fill effect (WaterWave + WaterBubbles) — treat carefully when modifying
- Group headings are sentence-case `SectionHeading`s and in-card labels are sentence-case captions (DS3). Nothing sits below the 12px micro floor except `text-caption` numerals and units
- New-best and PR badges are gold (`--achievement`), never the food orange
- People's names (owner, 2026-10-05, from the break-social pass). A name reads in its own direction (`dir="auto"`) but keeps to the start of its row. A profile's heading wraps to two lines before it truncates. On a card narrower than 20.5em (under 360px at normal text size) a post's Follow is an icon (`InlineFollow`), so the author's name and time keep the room. At large text sizes the feed card, exercise rows and leaderboard rows wrap rather than clip: the card is a query container measured in em, its stats go from three columns to two to one, and the capture spec measures every dataset at 200% text. Display names are 2–50 characters in the app, the server's sanitizer and every rules cap on a copied name, pinned by `displayNameLimit.cross.test.ts`. The worst cases live at `/dev/break-social`

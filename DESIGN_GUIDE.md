# Tropos Design Guide — for external collaborators (Codex et al.)

> **Who this is for.** You're contributing UI/code to Tropos but you haven't
> absorbed how the design system actually works. This file is the fast path.
> Read it before you touch anything visual. If your change conflicts with
> something here, the rule here wins — or you ask first.
>
> **The single most important sentence:** Tropos is a _warm, iOS-style
> fitness app, dark by default with a fully supported warm light theme, five
> colours that each mean one thing, and a strict two-font / token-driven
> system_, in which every screen leads with one hero about the person, colour
> sits on the person's own data, and the moments worth celebrating get the
> whole screen (DS4, 7 November 2026, measured from the apps people come back
> to: §14m). It is **not** a neon, rainbow-gradient "AI dashboard",
> and it is **not** a column of grey cards of the same weight either. The
> second is the failure this app fell into before DS4.

---

## 0. The non-negotiables (memorise these first)

If you only remember thirteen things:

1. **Five colours, one meaning each, and colour goes on the person's data
   (DS4).** Purple is lifting and the brand, coral running, orange food, teal
   water, gold a new best. An everyday screen carries at most 8% colour on
   dark and 15% on light, in at most three hues with one leading, and its
   biggest patch of colour is data (a ring, week segments, a route, a
   figure's lit muscles), never a button. A generic action (Follow, Edit
   profile, Done, Save) is neutral, and so is a screen's one full-width
   filled button (Start workout is white on dark). A gradient stays within one hue and fades
   into its surface. Adding a "nice blue" or neon is a regression; glass is
   for what floats, never for a card of the person's data (DS6, §14o).
   §14m.
2. **Purple = lifting/brand. Coral = running.** This sport-coding is everywhere
   (dots, labels, icons, CTAs). Never cross the wires.
3. **Numbers come in two tiers, both with tabular figures.** A figure that
   stands on its own at display size (the calorie ring's 2,336, a tile's
   81.7, a hero stat, a timer, a set log's inputs) is Archivo:
   `font-figure tabular-nums`. A number inside a line of text ("3 sets ×
   8 reps · 52.5 kg", "about 59 min", "Last: 105 kg × 5") is the text
   face at the words' own weight: `font-mono tabular-nums`. See §4. A
   screen's hero sets its headline at 25-38 px or its figure at 40-48 px;
   display type (64-120 px, Archivo's wide heavy cut) is for finish,
   new-best, streak and live screens only (§4, §14m).
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
9. **One hero per screen, and everything else steps down (DS4).** The
   hero is the thing about the person right now: 30-60% of the first screen,
   its top in the first 260 pt, holding the screen's largest text. No large
   page title sits above it; the hero names the screen. The next block is at
   most 0.8x its height (0.65x on Home), and navigation and controls take at
   most 20% of a tab's main screen. Calm (subtle shadows, generous padding,
   the colour budget) belongs to the chrome and to everyday screens, never
   to the hierarchy. When in doubt, ask what the screen's hero is, not what
   to remove. §14m.
10. **Design for 1000+ users, not "the one current user."** Cold-start states,
    light-trainers, lapsed users, vacation gaps are all real segments. A design
    that breaks for them is a bug, not an edge case.
11. **Day 1 is full.** A first-use screen leads with the first action,
    draws a metric at zero at full size and keeps its hero at least 75% of
    its usual size. The hexagon `EmptyState` is for no results and errors,
    not a first use (DS4, §14m).
12. **The moments that matter get the whole screen.** A first, a new best,
    a streak milestone and a finished plan get a full-screen reward: one
    object in the achievement's own colour, about half the screen's width
    in its top 40%, one display figure, one sentence, one button, on the
    plain page. A routine session gets a calm summary with its picture.
    Rewards never open over Home (DS4, §14l, §14m).
13. **Pictures before code.** A visual change starts as a mockup or a
    capture, and its PR shows before and after at 393 and 320 px in both
    themes. A change nobody can see in a screenshot is not a design
    improvement, however correct.

---

## 1. Visual identity

- **Aesthetic:** Calm iOS-inspired grouped surfaces for the chrome in both
  themes, one hero per screen, colour on the person's data, and our own art
  as the pictures (DS4, §14m). Dark is the first-run/runtime default; light
  remains a fully supported user choice.
- **Dark mode:** A deep, cool neutral (DS3, 2026-09-27): page `#0E0E11`,
  cards `#17171B`, raised surfaces `#212127`, text `#F4F4F6`. The page is a
  plain canvas — the brand-purple glow that used to sit at the top of every
  signed-in page is retired, so colour belongs to content: the person's
  data and the screen's hero carry it (DS4). Light uses the
  warm grouped-background/card treatment. Every visual change must be
  reviewed in both.
- **One colour per job (DS3):** purple is lifting and the brand, coral is
  running, orange is food, teal is water, gold is a new best — and nothing
  else. A colour that means a sport or a domain is not decoration.
- **Brand colour:** Purple `#7B72E9` means lifting and the brand (DS4 call
  1). It colours lifting data (week segments, a figure's lit muscles,
  progress on a lifting goal), a brand moment and the smaller lifting
  controls; a generic action (Follow, Edit profile, Start a circle, Done,
  Save) is neutral, because a colour that is on every button means nothing.
  A screen's one full-width filled button is neutral too, white on dark and
  ink on light, Start workout included (owner, 7 November 2026): filled in
  purple it became the largest patch of colour on Home and took the screen
  to the 8% ceiling, where the rule is that the largest colour is the
  person's data (§14m rule 10). Never a full-page background, and no button
  carries a gradient.
- **Sport-coding:** Lifting = purple `#7B72E9`, Running = coral `#D4637A`.
  These two colours recur in calendar dots, section headings, icon tints, and
  contextual cards.
- **Logo:** A white T on the purple gradient field, its stem rising into
  its bar with a chevron-shaped gap between them (DS7): the app icon. The
  welcome and sign-in screens carry the lockup, the mark in brand purple
  beside the name (DS8, §14p). Home carries no wordmark since DS3, and no
  large title since DS4: its hero names it, with the date as the kicker
  and the mark beside it; "Today" stays its h1 for screen readers.

**The "calm" test:** if a screenshot of your change looks like it belongs in a
crypto trading app or a generic SaaS dashboard, it's wrong. It should look like
it belongs next to Apple Fitness / Strava / a well-made iOS health app.

**The "blank" test (DS4):** if a screenshot could pass for a settings page or
a form (every card the same weight, the biggest type a page title, no
picture, the same empty-state icon as the last screen), it's also wrong. The
one thing that matters on the screen should be obvious from across a room. A
screen passes both tests or neither; §14m has the numbers to check it with.

---

## 2. Where the design system lives (source of truth)

| File                                 | What's in it                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/tokens.css`              | `--ds-*` design tokens: brand colour steps, typography scale, shadows, transitions, font weights.                                                                                                                                                                                            |
| `src/index.css`                      | The **canonical HSL colour variables** (`--primary`, `--card`, `--destructive`, etc.) for `:root` (light) and `.dark`, plus the Tailwind `@theme` bridge that exposes them as `bg-primary`, `text-muted-foreground`, etc. Also app-shell layout vars (`--tab-bar-height`, safe-area insets). |
| `src/lib/theme.ts`                   | The `THEME` **JavaScript object** — sport colours, semantic colours, macro colours, chart colours, gradients. Used in TS/inline styles where a CSS class can't reach. Also `MACROS_TEXT_LIGHT` + `useMacroPalette()`.                                                                        |
| `src/styles/components.css`          | Shared CSS primitives: `.ds-card`, `.ds-card-interactive`, `.ds-input`, `.ds-status-banner`, `.bottom-nav-frost`, auth shell, `.stat-number`, `.progress-ring`, `.pressable`.                                                                                                                |
| `src/styles/animations.css`          | The skeleton shimmer and pulse, Social's live pulse ring, and the global reduced-motion reset. Nothing else: what moves is framer-motion in its component (§8).                                                                                                                              |
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

| Element             | Keeps                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Food hero           | Calorie ring, one orange arc on a grey groove, and three macro cards   |
| Performance verdict | The ring in the band's colour with the score in it, the verb, the chip |
| Meal slot picker    | Filled orange pills (`SegmentedControl` `emphasis="solid"`)            |
| Sport coding        | Purple lifting / coral running, everywhere they appear                 |

A 2026-09 cohesion pass flattened the meal pills onto the neutral segmented
track, and a later release rendered both hero cards through a `compact`
prop. Between them the food surface lost the only colour it owned and the
weekly verdict became a row of digits. (DS3 made the performance card the
closing row of Home's "This week" card and dropped its gradient halo with
the app's other glows. What it kept is the list above: the verdict is
still a coloured ring, a verb and a chip, not digits. Trim1 call 1, 11
November 2026, took that row off Home so the score is shown in one
place, and call 5 made that place the Performance card at the top of
the Analytics overview: the ring with the score in it, the verb and the
chip are there, and the bare digits that card had drawn since DS3 are
in the ring.) Both were consistency applied past
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

- **Display / text font:** Plus Jakarta Sans — every word, and every number
  inside a line of text.
- **Figure font:** **Archivo**, for a figure that stands on its own — chosen
  in the brand bake-off to replace JetBrains Mono (see
  `docs/visual-audit/bakeoff/DECISION.md`).
- **Two number tiers** (owner, 26 October 2026; §14c):

  | Tier   | Class                      | Face              | Where                                                                                                                                                                                                      |
  | ------ | -------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Figure | `font-figure tabular-nums` | Archivo           | A number that is the thing on its own line or tile, at text-lg and up: the calorie ring, the macro grams, the weight and water tiles, "0 of 5", hero stats, chart and ring centres, timers, set-log inputs |
  | Inline | `font-mono tabular-nums`   | Plus Jakarta Sans | A number inside a sentence, a meta line, a caption, a "Last:" line, a chip or a list row's small text, at the weight of the words beside it                                                                |

  The test: if the number reads as part of a sentence, it is inline; if it
  is its own block and the words are its caption, it is a figure. A figure
  below text-lg is a ring's centre, and each one is named in
  `designSystemInvariants.test.ts`, as is any inline number at text-xl or
  above. Inline numbers never carry a weight of their own: "3 sets" is one
  run of text, not a bold 3 beside a regular "sets".

- **Hero sizes and the display register (DS4, §14m).** A screen's hero holds
  its largest text, at least 1.2x the next size, page titles included. On
  Home and detail screens that is a headline at 25-38 px or a figure at
  40-48 px, and nothing on those screens goes above 48 px. Type at 64-120 px
  (the display register) appears only on finish, new-best, streak and live
  screens: one element per screen, in the hero, in Archivo's wide heavy cut
  (width 110-125%, weight 850-900, italic, capitals), loaded from the
  installed package's `wdth.css` / `wdth-italic.css`, so the two-family rule
  holds. Its kicker is Archivo at width 75-80%, weight 800, capitals, 13 px,
  0.14em tracking. A screen uses at most six text sizes. Display words wrap
  at 320 px and at double text; they never clip.

- Both faces are proportional, so digit alignment comes from tabular
  figures: the `.font-mono, .font-figure` rule in `index.css` forces `tnum`
  on both. **`font-mono` means "a number", not a monospace face**; it
  resolves to the text face. Don't reintroduce a monospace face.
- **Units.** A unit inside a figure is a word: step it back to the text
  face with `font-sans` (which resolves to Plus Jakarta Sans), smaller
  than the figure and on its baseline — "81.7 kg", "0 ml", "91g". Food
  grams stay unspaced ("128g"); every other unit takes one space. Inside a
  `Button`, keep a number and its unit in one span: the button lays its
  children out with a gap, which turns "250 ml" into "250 ml".
- **Scale** (1.25 modular; available as `text-display`, `text-h1`, … Tailwind classes):

| Token          | Size  | Use                                                              |
| -------------- | ----- | ---------------------------------------------------------------- |
| `text-display` | 48px  | Hero stat numbers (e.g. health score)                            |
| `text-h1`      | ~31px | Page titles ("Program", "Social")                                |
| `text-h2`      | 25px  | Large display headings                                           |
| `text-h3`      | 20px  | Page section headings ("This week", "Running")                   |
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

**One style per role (owner, 26 October 2026; §14c).** Every kind of text
has one treatment across the app, so a screen reads as one system:

| Role                             | Treatment                                                                                                                   | Where it comes from                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Page title                       | `text-h1` (31px) 800, tight tracking                                                                                        | `PageShell`, `SettingsSection`                      |
| Hero title                       | `text-hero` (36px) 800 on Home's hero (DS4); `text-h2` (25px) 800 on Train's Up next card; one a screen                     | `SessionHero`, `SessionCommandCard`                 |
| Section heading                  | 20px 700 on a page or tab; 16px 700 inside a sheet, card or form                                                            | `SectionHeading` (`page` / `compact`)               |
| Card title                       | 16px 700 (`text-base font-bold`), one step under the section heading above the card                                         | the `compact` step, or the same classes on the card |
| Eyebrow on a hero card           | 14px 700 in the sport's `-strong` colour ("Planned for today", "Up next")                                                   | the session cards                                   |
| Tile label, stat name            | 12px 600 muted, sentence case ("Water", "Weight", "Steps", "Lifts")                                                         | `SectionLabel` (caption)                            |
| Meta line                        | 14px muted, facts joined by " · ", each fact whole; 12px in dense lists; 500 and the foreground on a hero card's sport wash | `MetaLine`                                          |
| Caption, helper                  | 12px muted (14px for a description under a title)                                                                           | `text-xs` / `text-sm text-muted-foreground`         |
| Button label                     | 600, sized by the button                                                                                                    | `Button`                                            |
| Chip, segment                    | 14px 600; a day's number in a strip of days 14px 600 (Home's week is segments and letters since DS4)                        | `SegmentedControl`, `FoodWeekStrip`                 |
| Figure caption on the run screen | 12px, sentence case, no letter-spacing ("Time", "km", "/km · live", "Pause")                                                | `HUD_CAPTION`                                       |

**Capitals.** Text is written in sentence case, units in their symbols'
own case ("km", "kcal", never "KM"). Spaced capitals (`uppercase` with a
wide `tracking-*`) appear in one place, and nowhere else: **table column
headers**, the workout's set table, "SET · PREVIOUS · KG · REPS". A column
header labels a column of numbers rather than reading as a sentence, and
the lifting apps the set table follows (Hevy, Strong) set theirs the same
way.

The brand name is not a second place. Beside the mark on the welcome and
sign-in screens it is "Tropos" in title case, set as a logo in Archivo at
weight 800 (`.ds-wordmark`; DS8, §14p), and it is written nowhere else at
that size.

The run screen is not an exception: its captions, its controls' captions
("Lock", "Pause", "Finish") and its splits are sentence case like the rest
of the app. `designSystemInvariants.test.ts` holds the one place as an
exact list; a second is a decision for this section first.

**Line breaks.** Headings balance their lines and running text avoids a
lone last word: one base rule in `index.css` (`text-wrap: balance` on
h1–h4, `pretty` on p, li, dd, figcaption, legend). A number and its unit
never part: in a string, `keepTogether()` (`utils/formatters.ts`); in
JSX, a `whitespace-nowrap` span around the fact; a dot-joined line of
facts is a `MetaLine`.

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

| Pattern                             | Recipe                                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Standard card**                   | `bg-card` white, `rounded-xl` (12px), `p-3`–`p-4`, `shadow-card` (very subtle). Or use `.ds-card`.                                                                                           |
| **Hero card** (Health Score, Water) | `rounded-2xl` (16px), `p-4`, 48px icon container in a purple-tinted square. DS4: a screen's hero is not just another card (§14m).                                                            |
| **Compact tile** (Weight, Steps)    | `rounded-xl`, `p-3`, `bg-card card-shadow`, 2-col grid (the card surface since DS3; it was `bg-muted`).                                                                                      |
| **Home hero** (`SessionHero`, DS4)  | Open on the page, no card: the session as a 36px title, its focus and minutes, its picture, one line against last time, a full-width `neutral` Start; the rest opens the day in Train. §14d. |

- Use `.ds-card` for static grouped surfaces and `.ds-card-interactive` **only**
  on a real `<button>`/`<a>` (never a wrapped `div`) for pressable cards.
- Shadows live as tokens (`--ds-shadow-card`, `-hover`, `-elevated`). Don't write
  ad-hoc `box-shadow`.
- **DS4 (§14m):** one card radius of 16 pt across the app, 10-12 for what sits
  inside a card; no larger "hero" radius, because a detail or reward hero
  leaves the card and a Home hero is dressed differently from its siblings.
  8-12 pt between cards in a group, about 32 pt between sections. A row that
  stands for a session, a person or an award carries its own picture
  (36-80 pt); rows are 56-64 pt unless they hold a thumbnail or a big
  number.
- **Food:** the owner's pick of 11 Nov 2026 (Food11 in the plan file,
  which names its evidence and what each call replaced; read it before
  changing any of this). From the top: no large title, the date switcher
  as the header row with the targets gear at its end; the calorie wheel
  on the page, 264 pt and in no card, in one soft light of the food
  orange, with the target in its label ("kcal left of 2,200"), a small
  mark that says it can be tapped (Home's wheel has none) and Details
  under it; the week as seven short bars, edge to edge, the deeper orange
  in light; the three macros as one row with no boxes (`FoodMacroRow`);
  then one 48 pt field that asks for no meal (the owner, 11 Nov 2026;
  §14 has it), holding the pencil while the field is at rest, the text
  and, at its end, the camera for Scan: an icon in the food orange, 24 pt in
  a 48 pt tap area, with no fill (the owner, 11 Nov 2026: as the food
  apps do it; it replaces the filled square beside the field of 23 Sep
  2026, and §14 has the count);
  then the diary, a picture on every row. The wheel, the macro bars and
  the Details sheet's bars are drawn as what is logged in both the left
  and the logged view (`loggedFill`), on Home's food card too, so a day
  with nothing logged is a grey track and going over is a second lap
  whose head stands clear of the first. The usual foods are ranked for
  the meal being added to. A food logged today flies to the wheel
  (`FoodLogFlight`, `nextFlight`): 400 ms in the air, the arc growing
  from 250 ms, 600 ms in all; never on an edit, a delete, another day or
  under Reduce Motion. The edit sheet's four meals are on the neutral
  track, and the segmented control has no filled-pill look.
  Measured on the built page (the pull requests carry each step's
  figures): the hero is 39% of the first screen from 92 pt, its figure
  48 pt and 2.4 times the next largest text, 6 text sizes, one hue, and
  colour at 4.7% in dark, most of it the person's data, with no filled,
  coloured control on the measured screen (the usual row's Log, for an
  account that has a usual, is the page's one). The §14m checks the
  scorer runs all pass;
  the first screen has 62 words against the ceiling of 60. The paywall's
  scan demo draws this page with the page's own wheel, week strip and
  macros (`ScanDemo.tsx`), so a change to the first screen is a change to
  make there too.
- **Badges:** the owner kept the current hexagon set (8 Nov 2026), after
  samples with three silhouettes and the number in the art, and with the
  emblem plus a ribbon. §14m rule 27 carries the note.

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
- **`SegmentedControl`**: the one single-select pill group (Train's
  Lift/Run, Social's Together/Feed, Analytics' tabs and ranges). The
  selected segment is a filled pill under a white label, with no outline,
  as iOS draws its dark-mode control: grey (`--segment-selected`) by
  default, coral (`--running-fill`) or purple (`--lifting-fill`) for
  `tone="running"` / `"lifting"`. The fill is the selected state, so it
  clears 3:1 against the track in both themes and its label 4.5:1
  (`controlBoundaries.test.ts`). A coloured label on the grey cannot keep
  the sport coding at AA, which is why the sport rides in the fill.
  `emphasis="solid"` is the Food meal pills (§3f). `emphasis="tabs"` is
  a page's second level under a track control (Social's Feed, then
  Following / Spaces / Explore): text tabs on a hairline, the selected one
  in the foreground over a 2px primary underline. Owner, 2026-11-03, after
  the Mobbin social review: two stacked tracks read as one control twice
  and took a quarter of the screen. Nowhere else.
- **`.ds-input`**: every text field, textarea and select. Light: a white
  box with the 3:1 control edge. Dark: a filled box on `--muted` with the
  `--border` hairline, no bright outline; its label or placeholder names
  it. Focus turns the edge primary, or food orange in the Food composer.
- **`BottomSheet`** (vaul): the standard editing surface (exercises, weight
  logging). Sheets for editing, dialogs for confirmation.
- **`ConfirmDialog`** for destructive confirmations.
- **`ProgressRing`** (`src/components/ui/ProgressRing.tsx`): one ring for
  one share of a target (0–1), in the colour of what it measures, with its
  figure inside as children. The track is the neutral groove
  (`--muted-foreground / 0.22`), never a tint of the ring's own hue. The SVG
  is decorative: the figure beside or inside it carries the meaning, so say
  it in text or an `aria-label` on the surrounding control. Home's calorie
  ring uses it. One ring per card; several quantities
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
  - **Hexagon usage rule:** the hexagon appears in **empty-states and
    streak badges ONLY** — never as decoration on a populated surface, never
    as a loading placeholder, never inline in content. It was the logo's
    shape until DS7 (2026-11-11) and stays these two surfaces' shape; keep
    it scarce. The mark itself (the T, since DS7) has two owner-made
    places in the app, neither decoration: it signs Home's header before the date
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
  `AnimatedNumber` (`StatFigure`'s `count` draws one; `useCountUp` is for
  a once-a-session count on Home). Under Reduce Motion `AnimatedNumber` is
  plain text from the first paint.
- **Entrance:** a page's header and sections take the framer variants in
  `src/components/ui/pageMotion.ts` (`pageItemVariant` inside
  `pageStaggerContainer`), which `PageShell` applies, but they do not
  rise in: the shell starts settled (`initial={false}`) and framer hands
  that on to every section that takes the variants, one that mounts
  later included, so a page is simply there (`PageShell.test.tsx` pins
  it). Content replacing its placeholder fades in instead (`ArrivalFade`,
  under Pol1 below).
- **Numbers and records:** no flash class. A figure counts up (above), a
  set ticked on screen pops its check (`SetCheck`, under Pol1 below) and a
  new best is the gold card docked above the workout's bottom bar
  (`NewBestMoment`).
- **Focus ring:** `focus-visible` only (mouse clicks shouldn't draw it) —
  `ring-2 ring-primary/40 ring-offset-2`. The primitives already do this.
- **Reduced motion:** `prefers-reduced-motion: reduce` is honoured globally
  for CSS (animations.css) and, through `MotionConfig`, for framer's
  POSITIONAL values only (x, y, scale, width, height). Opacity, stroke
  offsets, `pathLength` and count-ups are not covered: if you add one,
  gate it in the component with the `useReducedMotion` hook, as
  `ProgressRing` and `AnimatedNumber` do. A framer enter or exit that
  fades wraps its targets in `useMotionSafe`, which takes the opacity out
  (`Collapse`, `DayPeekCard`).
- **A change seen on screen moves; the same state arriving by mount does
  not** (Pol1, 2026-10-11). A set ticked on screen pops its check
  (`SetCheck`); a done set on a resumed session or a return to its
  exercise just shows. Content replacing its placeholder fades in where
  the placeholder was (`ArrivalFade` with `useArrivedAfterLoading`);
  content that was ready, or comes back on a tab or view switch, just
  shows.
- **Transient workout cards dock above the bottom bar** (Pol1): the rest
  timer and the new-best moment take their room from the bottom of the
  list, so nothing above them moves under the thumb that ticked the set.
- **The workout screen fixes only its top bar and exercise strip** (owner,
  2026-10-12). Finish sits by Close in the top bar, as Hevy and Strong put
  it, and the exercise's name, set count and effort cue head the list and
  scroll away with it; another exercise opens at its head. Fixed, they
  took about 290 px of a 715 px phone, and the set being logged went out
  of sight.

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
| **First use**            | The first step, as the screen's hero, and when the screen fills ("Lower A on Monday"). Draw the goal at full size: a metric at zero, the week outlined, the next badge dimmed. The `EmptyState` primitive is for no results and errors, not a first use (DS4, §14m).                 |
| **No results**           | What did not match, and how to recover — broaden, clear a filter, or add it manually. An illustration alone is not recovery.                                                                                                                                                         |
| **Loading / saving**     | That something is in progress. **A zero is a claim, not a placeholder**: "0 eaten" is byte-identical to the display for someone who has genuinely eaten nothing. Show a `Skeleton` while a figure is unknown, and keep a figure you already have rather than flickering back to one. |
| **Offline / queued**     | Whether the entry is saved on this device and waiting to sync — and say this ONLY where the app actually provides that guarantee. Claiming a durability we do not have is worse than saying nothing.                                                                                 |
| **Error / interruption** | What failed, what was preserved, and the next safe action. A failed map must not take the run controls with it.                                                                                                                                                                      |
| **Success / correction** | What changed, in neutral specific copy, plus Undo or an edit route. No automatic sharing, and no extra celebration dialog for a routine save. A first, a new best, a streak milestone and a finished plan are rewards and get the full screen (§0 rule 12).                          |

A placeholder holds the loaded content's shape, at every text size: set
a line of text's placeholder in that line's own classes (`LineBar` in
`LoadingSkeleton.tsx`) and a chart's at the chart's aspect ratio, rather
than a bar in pixels that matches one size and shoves everything under it
at the others (Pol1: Analytics' placeholder had drifted from its page,
and the score arriving dropped the page about 70 px).

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
3. **What is this screen's hero, and does everything else step down?** One
   thing about the person, holding the largest text, in its domain's colour,
   with a picture, true on day 1. A screen with no hero needs one before it
   needs polish; if two things compete, demote one. Then calm the chrome
   around it: within the colour budget, one filled button, no ornament that
   is not the person's data or our art (DS4, §14m).
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

- [ ] No new hues; colour within the budget (8% dark, 15% light) and on data, not buttons; any gradient within one hue (§0 rule 1).
- [ ] One hero, holding the largest text; no large title above it; one filled button (§0 rule 9).
- [ ] The day-1 state is drawn full, not an icon block (§0 rule 11).
- [ ] Before and after captures at 393 and 320 px, light and dark, in the PR (§0 rule 13).
- [ ] No hardcoded hex — everything via tokens (`bg-*`) or `THEME.*`.
- [ ] Sport-coding correct (purple = lift, coral = run) and semantic colours intact.
- [ ] A figure that stands on its own uses Archivo (`font-figure`); a number inside a line of text uses the text face at the words' weight (`font-mono`); both `tabular-nums` (§4). Words use Plus Jakarta Sans.
- [ ] Font weights follow the 600/700/800 tier rules (no 700+800 mixing).
- [ ] Each piece of text takes its role's one treatment (§4 "One style per
      role"): a card title is 16px bold, labels are sentence case, a unit
      in a figure is `font-sans`, and a number never parts from its unit.
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

**Set types and the set table (owner direction, 2026-10-04):** A set's type is picked from its badge, as Hevy and MacroFactor do it: tap the number (or W, D or F) and a sheet lists Working set, Warm-up, Drop set and To failure, each with one line on what it does in Tropos. The words live in `setLabels.ts` beside the numbering, and the sheet works on a done set too, working the session's bests out again. Warm-ups are lettered, not numbered: the sets that count are "Set 1 of 3" however long the ramp, and a warm-up is optional, so starting the working sets passes over the ramp and never holds the exercise open (`isSetOutstanding`). Previous shows the same counted set last session. A done row turns green with the filled tick; the row being logged keeps the lifting tint. (Revised 2026-10-12, owner: "tone down colours". A done row keeps the card's colour and says done with its filled green tick alone, the row being logged is the table's one tinted row, the warm-up badge is grey, not amber (amber is a status colour, and every exercise opens on three or four warm-ups), and Previous is grey, not purple, still a tap to fill.)

**Lift reasons (owner choice, 2026-10-03):** A lift day's details carry the same closed disclosure, “Why this session”: under the session card on Train's lift tab (on a day still to train this week), in the day sheet's lift block, and under the planned lift in Home's day details. One control draws both (`PurposeDisclosure`). The words come from `liftSessionPurpose.ts`, which states only what the plan stores — the training focus, a lighter week, the last full week before one, and weights holding in an easing block's first weeks — and says nothing without a programme. Home's Today cards stay free of reasons.

**The live run screen (owner call, 2026-10-12, the run screen pass):** its accent is the run's coral: the timer, the km bar, the best lap, Resume, the step card, the route and the position dot on the live map, and the GPS search. It was teal, water's colour, from before DS3. Teal stays only as the first step of the heart-rate zone scale, which is a scale, not the accent. `runScreenCoral.test.ts` holds it.

**The rules sheet (owner lock Lift4 (3), 2026-10-05):** "Why this session" keeps its place on all three surfaces, but opens one sheet rather than a disclosure: the session's reasons first, then "How your plan works", the plan's rules for this person (`liftRules.ts`, its numbers read from the engine's constants), ending on "Stuck on a lift? A variation often gets it moving." Train had an ⓘ beside the week label too, opening the same rules on any day; the owner took it out on 2026-10-26 ("there's two and it's not needed"), so "Why this session" is Train's one way in. The sheet loads when first opened (`LiftRulesSheet`). "Why this run" stays a disclosure.

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
- **The Food hero keeps its wash and three macro cards (owner, 1 November 2026).** A 31 October pass put the ring and the macros on one plain card to calm the page; the owner compared the two on a phone and kept the earlier look, which was restored. Don't flatten the Food hero again without asking. The same day the welcome screen got back its three rows (Lifting, Running, Food, each with its drawing) in place of the pass's single photo. On 11 November 2026 the owner chose the welcome's picture over those rows (DS8, §14p).
- **Light mode:** The opt-in alternate (selectable in Settings → writes `profile.darkMode = false`). It's a clean, warm, iOS-inspired look (#F2F2F7 grouped background, cards on white — minimal and calm with subtle depth, NOT a dark-glass app rendered light). Default-dark is applied pre-React in `public/init.js` (dark unless an explicit `"false"` is stored) and mirrored by the `profile.darkMode` defaults in `src/lib/auth.tsx`.
- **Brand colour:** Purple #7B72E9 — lifting and the brand (DS4 call 1): lifting actions and data, active tab indicators, progress on a lifting goal. Generic actions are neutral. Never as a full background: its only fills are the primary button on a lifting or brand action and, as `--lifting-fill` under a white label, the selected segment of a lifting `SegmentedControl` (§7), and no button carries a gradient (the paywall's purple-to-teal ones went in the plain-text cleanup).
- **Sport-coding:** Lifting = purple (#7B72E9), Running = coral (#D4637A). These two colours appear in calendar dots, section headings, icon tints, and contextual cards.
- **Logo:** a T whose stem rises into its bar: a bar notched under its middle and a stem pointed to fit, with an upward chevron as the gap between them. White on a purple field that lightens toward the top on the app icon, and brand purple in the app. The owner chose it on 2026-11-11 (DS7; `docs/visual-audit/bakeoff/DECISION.md`, decision 5) over the hexagon of decision 4, from the top apps' marks: a letter of the name, one shape straight on the field. It is the app icon (with dark and tinted versions for iOS's home-screen modes), the mark in the welcome and sign-in screens' lockup (DS8, §14p), the mark on share cards, and the launch image (the bar alone). The hexagon is no longer the logo; it stays the shape of badges and empty states (§7). Home no longer carries the "TROPOS" wordmark: DS3 titles it with the date and "Today", and the user's initials open Settings. The mark itself signs Home, small, before the date (`BrandMark`), so "Today" keeps the left edge the cards below it start on. The geometry lives in `src/lib/brandMark.ts` and `src/assets/brand/app-icon.svg`, held together by `BrandMark.test.tsx`; after changing it, run `node scripts/art/gen-app-icon.mjs` (every app and web icon) and `node scripts/art/gen-splash.mjs` (the launch image).
- **Launch animation:** `LaunchSplash` takes over from the launch image (index.html paints the same bar, `#boot-splash`, until the bundle runs). Once its first frame is up it takes the native launch image down (`nativeLaunchImage.ts`; the two frames are the same), so the rise is seen and not played underneath it. The stem rises into the bar; if the app is still loading a beat later, the mark breathes until it leaves. Once the app is ready (on Home, once Home's header mark holds still and Home has drawn today's session and food, `data-page-ready`, waited for at most a second) the mark flies into Home's header mark on a soft arc that leaves upward, on a spring with no bounce, as the page shows; anywhere but Home it lifts a little as the overlay fades. Every movement is a transform or an opacity, played by the Web Animations API on a layer of its own, so it keeps its frames while the app starts underneath. Reduce Motion: the stem fades in where it stays, nothing breathes, and the overlay fades. Its ground is the launch colour in both themes (`--launch`, the dark page), as the launch image is, so a light-mode user's page turns light only as it is revealed, never under the logo. It never shows under automation (`navigator.webdriver`), so specs and captures see the app as before. The four copies of the first frame (launch PNG, index.html, the overlay's CSS size, `brandMark.ts`) are pinned together by `launchSplash.test.ts`.

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

- **Display font:** Plus Jakarta Sans (all UI text, and every number inside a line of text)
- **Figure font:** Archivo (a figure that stands on its own — the calorie ring, a tile, a hero stat, a timer). Proportional, not monospace; tabular figures forced on `.font-mono` and `.font-figure`. Replaced JetBrains Mono (brand bake-off — `docs/visual-audit/bakeoff/DECISION.md`). The `font-mono` utility means "a number inside text" and resolves to the text face; `font-figure` resolves to Archivo.
- **Two number tiers (owner, 2026-10-26).** The owner, on phone captures of
  Home and Train: "I feel like the writing of the text is weird a lot,
  does this make sense? The numbers saying what weight to do then the reps
  and such misalign and same with a lot of the typography's and such." On
  the proposal — figures keep Archivo, numbers inside text take the text
  face — "Yeah you figure it out." What was wrong: every number was
  Archivo, so "3 sets × 8 reps · 52.5 kg" and "Last: 52.5 kg × 10, 10, 10"
  set Archivo digits, taller and heavier-looking, between Plus Jakarta
  Sans words; "~59 min" and "about 59 min" did the same in the session
  cards. Decided:
  1. A figure that stands on its own at display size keeps Archivo
     (`font-figure`): the calorie ring, the macro grams, the weight,
     water and steps tiles, "0 of 5", hero and analytics stats, ring and
     chart centres, the run HUD's readouts, the rest timer, the set log's
     inputs, finish-screen stats.
  2. A number inside a line of text is the text face at the same weight
     as the words beside it, with tabular figures (`font-mono`): meta
     lines, captions, sentences, "Last:" lines, durations, counts, chips
     and small list text.
  3. A unit sits on its number's baseline in the text face, without an
     odd size drop or a gap: the macro tiles' "g" is 14px medium under a
     20px figure (16px under 24px on the Food page), not a 12px bold
     subscript, and still unspaced ("91g"); the water chips read "250 ml"
     with one space, not the button's gap; "0 ml" matches "81.7 kg" beside
     it. `font-sans` resolves to Plus Jakarta Sans, so a unit stepping out
     of a figure never lands on the system font.
     `designSystemInvariants.test.ts` pins the tokens and both size
     boundaries; the share card (`ShareCardRenderer`) keeps its own
     rasterised look.
- **One style per role (owner, 2026-10-26).** After the number tiers the
  owner asked "what's next in the same vein?", and said "Go" to giving
  every kind of text one style across the app. A dark-mode probe of the
  main screens at 393 px measured each role's variants first. What was
  wrong: a card's title came at four sizes (20px bold on Analytics' chart
  cards, the same size as the "Lifting" heading above them; 18px on Home's
  Food card; 16px on Home's Performance row; 14px semibold or bold on
  race predictions, training load, elevation, PRs); the run screen and a
  dozen other places still set spaced capitals that DS3 had retired; six
  figures set their unit in Archivo; facts broke across lines ("15 / kg"
  on Train at 320 px). Decided:
  1. The role table in §4: one treatment per role. A card title is 16px
     bold, one step under its section heading; the session card keeps the
     one hero title.
  2. Same role, same weight: the session card's dose is 500 on Home and
     Train alike, a day's number in a strip of days is 600 on Home, Food
     and Train.
  3. Capitals in one place only, table column headers (§4 Capitals);
     the brand name is title case, the run screen is sentence case, and the
     hold-to-finish control reads "Finish" with the accessible name "Hold
     to finish run".
  4. A unit inside a figure is the text face (`font-sans`, 14px medium),
     pinned per figure in `designSystemInvariants.test.ts`.
  5. Facts stay whole and helpers keep no lone last word (§4 Line
     breaks).
- **Scale (1.25 modular):**
  - Display: 3rem/48px — hero stat numbers (health score)
  - H1: ~31px — page titles ("Program", "Social", "Analytics")
  - H2: 25px
  - H3: 20px — page section headings (`SectionHeading`, "This week", "Running"); a card's own title is 16px bold, under it
  - Body: 16px — standard text
  - Small: 14px — secondary descriptions
  - Micro: 12px — labels and captions, in sentence case
- **Weight rules:** 800 (extrabold) for hero numbers and page titles. 700 (bold) for section headings and card titles. 600 (semibold) for pill text and button labels. Never mix 700 and 800 in the same visual tier.
- **Numeric displays:** a stand-alone figure is `font-figure tabular-nums` (Archivo); a number in a line of text is `font-mono tabular-nums` (the text face, at the words' weight). See §4 and the owner decision below.
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
- **Home hero (`LiftCTACard` / `RunCTACard` / `RestDayCard`, drawn by `SessionHero`; DS4, the Today card of DS3):** open on the page rather than in a card, over a soft glow of the sport's colour: the session as a 36px title (`text-hero`), its focus and minutes ("Back and biceps · about 26 min", "5 km · about 30 min"), its picture (the lead lift's drawing, a runner for a run), one line with a number and its comparison (`homeHero.ts`: "Barbell row 35 kg × 8", "2.5 kg more than last time"; a lift with no last time, the day's size and "Pick a weight you could lift 3 more times than the reps ask."), and a full-width `neutral` Start. The kicker beside the date gives the plan's position ("Week 9 of 12") or a first session ("Your first workout"). A rest day's hero is "Rest day" and the next session, with no Start. A day with two sessions draws the second as a compact card under the hero, its Start in its sport's colour. The week sits in the card under it: the sessions done of the plan's, the next session, and seven segments (done lifts purple, done runs coral, planned outlined in their sport's colour, today outlined in the foreground), each opening its day's peek. Start begins the session (`/program?day=N&start=1`, `/run?template=…`); the rest of the card is a sibling button that opens the day in Train to look it over, because a button cannot sit inside a button. A lift shows the cut-out drawing of its first exercise that has one (`formArtCutouts`). A finished or skipped day shows its status instead of Start. A session under way on the phone (a workout closed with its sets kept, a run left before it was saved) shows the In progress strip in Start's place, "In progress · 5 sets · 18:40" and Resume (`InProgressStrip`, Hevy and Strong's pattern); a session under way that is not the card's leads the stack on a strip of its own, and Train's day card draws the same primitive. Which card it goes on is `todaySession.ts`'s rule, and only a session Resume will actually open is offered (`sessionsInFlight.ts`). No rationale and no plan position ("Base · week 3 of 16") on Home: owner direction 2026-09-09, pinned in `SessionPurpose.test.tsx`. DS4 call 5 (2026-11-07) lets Home's hero show the plan position and today's main lift against last time ("Week 9 of 12"; "35 kg × 8 · last time 32.5 kg"); reasons stay behind "Why this session". It landed with the Home hero, and `SessionPurpose.test.tsx` now pins the position on the kicker and the reasons off the hero.
- **Home's week card (Trim1 call 1, 11 November 2026):** one card under the hero says the week once. The week's sessions as a figure with its caption and the next session ("3 of 5 sessions this week", "Long run tomorrow"), the seven segments, then one muted line of what the count is made of: "Lifts 2 of 3", "Runs 1 of 2", "Food logged 4 of 7 days", with the Weekly review link beside it while a review waits. Lifts and runs are listed only when the week holds both; with one of them the figure above is already its count. No bars: the segments are the card's picture. It replaces the "This week" card that closed Home (DS3), three columns with bars over the Performance row, which read the same counts a second time. The owner: "streamline all". Home's always-on blocks went from seven to five.
- **Analytics' Performance card (Trim1 call 5, 11 November 2026):** the one place the score is shown, at the top of the Analytics overview. A ring in the band's colour with the score in it (96px at the default text size and sized in rem, so the figure still fits at larger text; brand purple, or amber when the week says back off), the change on last week as the chip, the verb and its line ("Sharpening. Lifting and running both strong this week"), and the last six weeks as one line. Until the baseline has formed the verb gives way to "Early read" in brand purple. Under the card one row, "Score details", opens in place what the score is made of: the seven days against the usual week, the index over twelve weeks (the card's six-week line gives way to it while open), the training load with its own range, the four factors, the load band and average, the running suggestions and the Weekly Review's row. `?score=details` holds it open, and the links that opened the old page (`?view=performance`, `#performance`) land there. It replaces three showings: Home's row, this card's bare digits, and a Performance page that opened on a gauge of the same score under a second set of words and its own five-colour scale. Analytics went from six views to five. The page's body sat behind a second "Score details" fold; one tap shows all of it now (Hist6).
- **The shelf: badges and medals on the profile (Trim1 call 3(c), 11 November 2026):** a profile shows a person's badges under a "Badges" heading and their medals under "Medals", one after the other. On anyone's profile the badges are the newest four. On your own, "See all" opens the whole collection in place, as the medals' case opens: the next badge, your streak figures and every badge with its date or its progress, under one line saying only you see it, since the page otherwise shows your profile as other people do. `?badges=all` holds it open; the streak sheet's "See your badges" and any link to the old tab (`/history?tab=badges`) land there with the shelf brought to the top. The collection was a third tab under Analytics, which Hist5b called an interim place. Analytics has two tabs, Analytics and Bests. The three full-screen reveals (a badge, a medal, a league result) are unchanged.
- **Quick actions:** there is no pill row. Today's actions are the Start
  buttons on the Today cards, and food logging is the "Log food" button in
  `TodayEnergy`'s header.
- **Inline banners:** the `Banner` primitive (`src/components/ui/Banner.tsx`), three variants — `info` (coral, running context), `warning` (amber), `neutral` (muted, no domain colour) — on the compact-card pairing, `rounded-xl p-3`. The sustained-offline notices render through `neutral` and render NOTHING while idle: the permanent live-region wrapper they used to keep was an empty first child in the page rhythm, pushing Food's and Train's headers down a step. Pinned in `designSystemInvariants.test.ts`. The global online/offline strip in `Layout` (`ds-status-banner`) is app-shell chrome, not an inline banner.
- **Section headings:** a group of cards or rows opens with `SectionHeading` (`src/components/ui/SectionHeading.tsx`) — a real heading in sentence case: `page` size (20px bold, the H3 step) on a page or tab, `compact` (16px bold) inside a sheet, a card or a dense settings form, with an optional `action` on the same row. DS3 retired the 12px capital-letter group label. `SectionLabel`'s `tier="section"` now marks a small group inside a Food sheet or list only (the Details sheet, the food suggestions): 12px bold, sentence case since the Food pass. Its surfaces are pinned by `designSystemInvariants.test.ts`.
- **Labels inside a card:** `SectionLabel`'s caption tier — 12px semibold muted, **sentence case**, no letter-spacing. Write the text the way it is said ("Total volume"); it renders as written. Capitals are kept for table column headers. No hand-rolled label classes (ratcheted in `designSystemInvariants.test.ts`)

### 14e. Training plan primitives

**Your plan workspace (owner-authorised, 2026-10-29).** Train's neutral
"Your plan" header action opens `/program/plan`. It shows the current local
Monday-to-Sunday agenda with actual dated activity and planned lift day-types,
plus the separate rotation-based next lift or a real Resume action near the
top. Future named lifts are never pinned to calendar dates (ADR-0002). The
original Lift/Run execution tabs each keep their one selector; the workspace
adds no third tab or second date navigator. "Move a run" opens a two-step
sheet over the agenda: source/destination, then review and any spacing-warning
acknowledgement. It changes one dated run only. "Usual weekly layout" opens
the existing recurring editor. Unknown/failed activity reads must not claim an
empty/rest week; queued changes must distinguish waiting, applied and refused
outcomes. The implementation specification is
`docs/product/training-plan-workspace/SPEC.md`.

The Programme Run section is a **hybrid training cockpit**, not a settings
list. It is built from named, reusable training-plan primitives. These are
NOT considered decorative one-off patterns — they are components, reused
consistently, and part of the design system.

Primitives (all in `src/components/program/`, fed by the pure view model in
`src/lib/runProgrammeViewModel.ts`):

- **`RaceCockpitCard`** — race-prep identity card: readable distance heading
  (Marathon / Half Marathon / 10K / 5K), one date line ("28 Dec 2026 · 63
  days out · week 1 of 10"), "Edit run plan" at the top right, and a phase
  rail. There are no Week or Phase tiles: the date line carries the week,
  the rail the phase. The rail reflects the REAL
  engine phases (`getPhaseForWeek`): **Base · Build · Taper · Race** — no
  invented "Peak" segment, so the active highlight always maps to a phase
  the scheduler can emit. Renders ONLY in the race-goal overlay.
  Under the rail sits a closed disclosure, "The weeks ahead"
  (`RaceWeeksAhead`, R23 in Pgm8, 2026-10-11): one row a week to race
  week, each week's long run and quality sessions by name and "Lighter
  week" on a step-back week, with no days, no easy runs and no base, build
  or peak (E3a). It is worked out when opened. Below it, quiet neutral
  rows (a muted fill, an icon, a chevron, 44px): Adjust this week (not in
  recovery or after the race), Train together, and Race community when
  the goal is bound to a race space. A Circle and a race space are social,
  so their rows are neutral, never a coral button.
- **One way into each (owner, 2026-10-26).** The owner, on the Run tab
  and Settings → Run plan: "edit plan also appears as I edit plan and
  adjust". So the Run tab offers each once. With a race card on screen,
  its "Edit run plan" is the way into `/settings/run-plan` and its Adjust
  this week row the way into the week's sheet; the tab's footer "Edit run
  plan" shows only when there is no race card (a free runner, or a race
  plan that is over or recovering). Settings → Run plan no longer has an
  Adjust this week row. This changes Run13 (1), which put the sheet's
  entry in both the cockpit and `/settings/run-plan`; the plan file's
  Run13 row is updated on its own lock branch.
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
  run" over "Pick your pace today").
- **Run and Lift pick the day the same way (owner, 2026-10-26).** The
  owner: "the lifting and running are very different for selecting the
  current day for example start exercise but then for run its a lot
  smaller and looks weird", and left the answer to the review ("you
  figure it out"). So every Run tab state is a `SessionCommandCard`, the
  Lift tab's size. The tab opens on today's run, or, when today has none
  to start, on the week's next one ("Up next · Tue 27 Oct"), as the Lift
  tab opens on its next session; the week strip still rings today
  (`defaultRunDayKey`). Runs stay date-pinned (ADR-0002), so there is no
  Make this next. A day with no run to start is the same card: its date
  as the eyebrow, "Rest day" or "Lift day" as the title, and Start free
  run. Today's run says "Start run" and goes straight into the run
  (`?start=1`), as the Lift tab's Start begins its workout; another day's
  says "View run" and opens the run's own card. The run card's meta is
  the dose, the pace when there is one, and the zone: "30 min · Z2
  112–130 bpm". That changes Run21 (1)'s "Z2 · Easy" on this card only:
  the feel line just above it starts with the effort's name, and the
  day's sheet keeps "Z2 · Easy · 112–130 bpm". A tomorrow's run with
  none before it is "Up next", not "Tomorrow". Train's day list below it draws each
  exercise through `ExerciseRowSummary` (`ExerciseThumb`: the cut-out
  drawing, else the category's muscles, else a dumbbell), and Train shows
  one advice notice at a time (`programNotices`).
- **`OutgrownDayNotice`** (slice 4; the owner chose B on 2026-11-12, from
  `docs/visual-audit/lift-day-outgrown-2026-11-12/`) — a warning `Banner`
  under a lift day's card, above "Why this session", when a day still to
  train prices past 125% of the length its plan is fitted to: "Pull A
  takes about 95 min", then the length and the two choices. "Rebuild for
  45 min" (secondary, small) asks first in a `ConfirmDialog`, since it
  builds every lift day again; "Keep this day" (ghost) hides it on the
  device until the day or the length changes. Never inside the card: its
  action slot holds Start workout, and a row at the top of the list hid
  it (option A). It gives way to the week-level lighter-week notice.
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
not reintroduce structured mode or structured-mode transitions. Settings →
Run plan asks the one question the model has, whether there is a race:
a coral `SegmentedControl`, "No race | Training for a race", the same
control as the race's Distance. It never names the stored mode.

Constraints these primitives must keep:

- Closed palette: **coral = running, purple = lifting**; existing semantic
  tokens for success/warning/destructive. No new colours unless added as
  tokens. No decorative gradients; a gradient within one hue that fades into
  its surface is allowed (DS4, §14m).
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
- **Motion calls, owner-delegated (2026-11-09),** from the audits run
  with Emil Kowalski's animation-performance, choreograph, gestures and
  remove-animations skills:
  - A page arrives at once: no route fade, and the tab bar's pill moves
    with the tab, as a native tab bar's does.
  - The rest card fades in over 150 ms after a set, with no rise.
  - Train's day change: the old day goes at once and the new one comes in
    16 px from its side over 180 ms; taps are never held.
  - The live run map takes pans and pinches; a tap on it raises the panel.
  - Hold to finish: a hold let go early only resets the ring; a tap opens
    the Stop dialog.
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
  and transitions are gated globally in full.** `MotionConfig reducedMotion="user"` in
  `App.tsx` settles positional values (x, y, scale, rotate, width,
  height) and nothing else: opacity, a stroke offset, `pathLength` and a
  motion-value count-up all still animate under Reduce Motion. A non-positional animation
  asks `useReducedMotion` in its own component (`ProgressRing`,
  `CalorieRing`, `EmptyState`, `AnimatedNumber` are the patterns), and a
  framer target that fades goes through `useMotionSafe`. CSS needs no
  such step: under Reduce Motion the reset in `animations.css` gives
  every animation and transition 0.01 ms and one iteration, so a
  Tailwind `animate-*` class stops there with or without the
  `motion-safe:` variant, an unprefixed `animate-spin` spinner included,
  which stands still. Every skeleton pulse and ping carries the
  prefix all the same, saying so where the class is written; the
  spinners stay unprefixed (`UNGUARDED_ANIMATION_BASELINE = 8` in
  `designSystemInvariants.test.ts` is exactly the spinner set).
- **No-results and error states go through the `EmptyState` primitive**
  (`src/components/ui/EmptyState.tsx`; `compact` for in-card use) — no
  hand-rolled centered-icon-tile blocks. The primitive owns the brand
  hexagon, accent tinting, and reduced-motion handling. A first use is not
  an empty state (DS4, §0 rule 11): it leads with the first action and draws
  the goal at full size, so a new account's screens do not all end in the
  same hexagon (8 of 27 captured screens did, before DS4).

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
leaking one-off hex orange past the hex guardrail.

**An action takes its domain's colour wherever it appears** (Polish3, call 3).
The colour says what the button does, not which page it sits on. The role
picks the emphasis (filled for the main action, tinted for a secondary one,
neutral for a low one) and the domain picks the hue.

**DS4 (owner, 7 November 2026): a screen's one full-width filled button is
neutral** (white on dark, ink on light), whatever its domain: Start workout,
Start run and Food's main Log button included. A full-width filled button in
a domain colour was the largest patch of colour on the screen, and the
measured rule is that the largest colour is the person's data (§14m rule
10). The domain keeps its colour on the button's icon, on tinted and text
actions ("Log food" in orange on Home's food card), and on the data around
it. The table below still names each domain's variants for those smaller
controls; the filled column applies where a domain button is not the
screen's one full-width main action. It landed with the Home hero build:
the `neutral` variant (`bg-foreground text-background`), and
`designSystemInvariants.test.ts`, which pins the variants and names the
screens' one full-width neutral button (`NEUTRAL_MAIN_ACTIONS`: Home's
Start workout and Start run). A day's second session, on its compact card
under the hero, keeps its sport's filled Start at its own size. The live
workout's bar (Complete set, Next exercise, Finish workout) is the same
neutral button at Start's 44 pt (8 November 2026); its purple is on the
progress bar, the current exercise's ring and the rest's arc.

| The action                          | Filled      | Tinted             |
| ----------------------------------- | ----------- | ------------------ |
| Logging food, on any page           | `nutrition` | `nutrition-tinted` |
| Starting, logging or planning a run | `sport`     | `sport-tinted`     |
| Starting a lift; a brand action     | `primary`   | `lifting-tinted`   |

So "Log meal" is orange on Analytics' empty state and in the manual logger,
"Log food" is orange on Home's food card and in a search result's serving sheet,
and "Log recovery food" is orange after a run, where Done stays coral. Food10's
"every Log is orange" was the first case of this rule: it scoped the Food
page, and the rule under it holds on every page.

What the orange is NOT is a page colour. An action that does not log food
keeps its role's variant wherever it sits, the Food page included: Try
again, Turn on (AI analysis), Set focus, Pro ("Try Pro free" stays brand
purple), Cancel, and the Save that corrects an entry already in the diary.
An action that belongs to no domain (a settings form's Save, account
actions, Retry, Follow, Edit profile, Start a circle, Done) is neutral:
`secondary`, `outline` or `ghost` (DS4 call 1: purple means lifting and the
brand, and a colour on every button means nothing). The neutral filled
variant (`neutral`, white on dark, ink on light) arrived with the Home hero
build, the first screen that needs one. A screen has one filled button
(DS4, §14m). Water has no Button variant: its
one filled control, the tile's +, is the hydration teal.

`designSystemInvariants.test.ts` holds the rule for the actions it can name
from their label: a control that logs food (Log food, Log meal, Log this
portion, Log to Breakfast…) carries a nutrition variant, "Start run" a sport
one and "Start lift" / "Start workout" the primary, whether it is a
`Button`, a `Link` wearing `buttonClasses` or an empty state's CTA.

**How the rule arrived: four owner calls on the Food page**, kept as the
record of what each button was for:

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
- **2026-10-13 — Copy yesterday's "Log selected meals"** (Food10 (2),
  decided under the owner's delegation). The page's third way to log food
  says it in the same colour as the other two.
- **2026-11-07 — Food: the owner kept the original screen (title, week
  strip, macro cards with their icons and colours, draining ring, filled
  meal pill) and took three fixes.** Its buttons stay as they were: the
  filled orange meal pill, Scan and the usual row's Log, so Food has more
  than DS4's one filled button (§14m rule 21). The fixes and the rules it
  still misses are in §6.
- **2026-11-11 — Food11: the meal is a chip, not a filled pill.** The
  owner picked a new Food page (§6 has it whole). Of the buttons above:
  the filled orange meal pill is gone, with the row of four meals it sat
  in, for one neutral chip in the field whose dot is the food orange;
  the edit sheet's meal picker is on the neutral track. The usual row's
  Log and Copy yesterday's Log are unchanged. Scan has the next entry.
- **2026-11-11, later — the field asks for no meal.** The owner: "Take
  out the side bar that selects breakfast lunch dinner snacks and just
  have the food log?" The chip above is gone, a day after it went in.
  The clock files a log under a meal (breakfast before 10:00, lunch
  before 15:00, snacks before 17:00, then dinner, kept current while
  Food stays open), and the sheet a diary row opens moves it. Of ten
  food apps' logging flows, none has a row of meals; the four whose
  diary is a time-ordered log, as Food's is, ask for no meal. The field
  is one row at every width: the two-row layout below 19.5em existed to
  fit the chip. What it costs: a snack between 10:00 and 15:00 is filed
  as lunch until it is moved on its row, and that cancels the day's
  lunch reminder. This replaces Food11 call 3's chip.
- **2026-11-11 — Food11: Scan is an icon inside the field.** The owner
  asked for scanning to be placed as the food apps place it. Of ten apps
  surveyed, none draws a filled, coloured camera button on its day
  screen and five keep the camera one tap away in a plus menu. Of five
  text fields with a scan control seen in four of them, three hold it
  inside the field as an icon (MacroFactor, Yazio, Lifesum's AI box),
  two set a plain icon beside the field (Lifesum's search, Fitbit) and
  none has a filled button. So the camera is at the end of the
  composer's field: 24 pt, the food orange (the deeper orange on the
  light field), a 48 pt tap area, and it stays there while there is
  text, with send before it. This replaces the 23 September filled
  square. That square had replaced a 20 pt icon that read as decoration;
  this one is larger and keeps its colour, where the three apps draw
  theirs grey or black. The usual row's Log is now Food's one filled
  control.

Scope note: this is for **buttons** — visual CTA/action controls. It is NOT a
mandate to wrap every `<button>` element: pressable cards, list/table rows,
day-cells, chips, and icon taps are legitimately their own controls (use
`IconButton` for icon taps; `SegmentedControl` for single-select pill groups).
Unlike the hex guardrail, "use `Button`" can't be lint-enforced (a linter can't
tell a CTA from a pressable card), so this is a per-PR convention: when adding
or touching a CTA button, route it through `Button` with the variant above.

### 14j. Design Principles (for Claude Code when improving UI)

- **Keep the existing colour scheme** — the purple/coral/orange/teal/gold semantic system is intentional and should not be changed; DS4 keeps each colour to its one meaning and puts it on the person's data
- **One hero, calm chrome (DS4)** — each screen leads with one hero holding its largest text; the chrome around it keeps subtle shadows, soft tinted backgrounds and no harsh contrasts
- **Breathing room over density** — generous padding, clear visual hierarchy
- **iOS conventions** — grouped background, card-based layout, safe area padding, 44px minimum touch targets
- **Consistent numeric treatment** — stand-alone figures in Archivo (`font-figure`), numbers inside text in the text face (`font-mono`), all with tabular-nums
- **Sport-coding everywhere** — lift content uses purple tints, run content uses coral tints
- **Semantic colour consistency** — orange always = nutrition, teal always = hydration, coral always = vitals/running, purple always = brand/lifting
- **Progressive disclosure** — cards link to detail views, sheets for editing, don't overload screens
- **When improving a screen:** start with its hero (§0 rule 9): what it is, its size and rank, its colour on data, its picture, its one sentence with a number, and how it looks on day 1. Then check the screen against §14m's numbers. Only then polish the chrome: typography weight, spacing, shadows, icon containers. A pass that only removes things has not done the job (DS4).

### 14k. Current Known Design Considerations

- The water card's fill rises by `translateY`, and its waves and bubbles move by `Element.animate` on transform and opacity, so the compositor runs them (WaterWave + WaterBubbles). Keep it that way when modifying
- Group headings are sentence-case `SectionHeading`s and in-card labels are sentence-case captions (DS3). Nothing sits below the 12px micro floor except `text-caption` numerals and units
- New-best and PR badges are gold (`--achievement`), never the food orange
- The streak flame is brand purple (Polish3, call 4). Its tiers are steps of the purple ramp, deeper as the streak runs longer (1, 7, 30 days), and at 100 days its heart is the platinum of the top badge tier. The table is `src/features/streaks/flameTiers.ts`, built from `THEME.purpleRamp` and `THEME.tier.platinum`; `eslint.config.js` bans any hex literal in it (`PALETTE_TABLES`). Gold is never a tier colour
- A challenge's bar fills in its sport's colour (Polish3, call 6): coral for a running challenge, purple for a lifting one, brand purple for a mixed or time one (`challengeSport.ts`). The tier metal is a marker, never the bar's fill and never text: a reached tier's dot is the metal, and the trophy badge and a leaderboard row's tier word are drawn in the text colour inside a ring of it, as the leaderboard ranks are
- People's names (owner, 2026-10-05, from the break-social pass). A name reads in its own direction (`dir="auto"`) but keeps to the start of its row. A profile's heading wraps to two lines before it truncates. On a card narrower than 20.5em (under 360px at normal text size) a post's Follow is an icon (`InlineFollow`), so the author's name and time keep the room. At large text sizes the feed card, exercise rows and leaderboard rows wrap rather than clip: the card is a query container measured in em, its stats go from three columns to two to one, and the capture spec measures every dataset at 200% text. Display names are 2–50 characters in the app, the server's sanitizer and every rules cap on a copied name, pinned by `displayNameLimit.cross.test.ts`. The worst cases live at `/dev/break-social`
- **Settings lists the two plan editors, and has no page that only links on (Trim1 calls 2 and 7, 11 November 2026).** The owner: "streamline all". Ten rows in three groups: Your plan (Lift plan, Run plan, Nutrition, Shoes), App (Notifications, Units & appearance, Social & privacy, Apple Health) and Account (Account, with the plan as its value; Support & legal). Programme was a page that changed nothing itself; Workouts held three controls, Subscription one button and Your data four rows. Each control now sits beside what it belongs to: the rest timer and Reset programme on Lift plan, voice cues on Run plan, the plan, the exports and recently deleted meals on Account. This reverses Set2 (1) and (2). A page whose rows only open other pages is not added back: list the destinations where the person already is.

### 14l. Social and rewards may be loud (Soc15 call 1, 3 November 2026)

- **DS4 (7 November 2026) refines this.** Measured on 29 reward screens, a reward is loud through one object in the achievement's own colour on the plain page (about 5-15% of the screen), not a full-screen flood: 5 of 29 flood, and Nike Run Club's flood fails contrast. The full-screen reward is for a first, a new best, a streak milestone and a finished plan (§0 rule 12, §14m).

- **The owner's call.** Calm stays for logging and Home. Social and rewards may be loud: colour, motion, a full-screen reveal for a medal. Social has to pull people back the way Strava, Hevy and Nike Run Club do, and it starts with the moments that happen to you ("Kudos on your first activity!", a streak slide). §0's calm rule still holds everywhere else.
- **Moments on posts come from real data, never free text.** A moment is a kind and its numbers (`src/lib/postMoments.ts`): a new PR, the longest run yet, a first 5K, 10K, half or marathon, a fastest 1K, 5K or 10K, a streak reaching 7, 14, 30, 50, 100, 200 or 365 days, a plan's week done or the programme complete, a first session. The finish screens work them out from what they already hold, a post carries at most three (most significant first), and firestore.rules refuses any other shape. The card words them in the reader's units (`postMomentLines.ts`), so nothing a person types becomes a moment.
- **Medals and their reveal are the loud register call 1 allows.** A medal is a person's highest tier in one challenge edition, kept in the trophy case on their profile after ChallengeFinaleCard has gone (`functions/lib/medals.js` is its one writer; `src/features/challenges/medals.ts` reads it). It is drawn, not iconised (`MedalArt`): a round medal in the tier's metal from the badges' own `TIER_PALETTES`, on a ribbon in the challenge's sport colour, with the sport's icon, the tier's goal and the edition. It is to be illustrated with Gemini like the badges, one image per challenge definition and tier, round with the badges' black enamel and metal relief (`docs/badges/MEDAL_ART_BRIEF.md`, `MEDAL_ART`); the drawn medal stays as the fallback, and the ribbon, the goal and the edition are always drawn in code over the art. A new medal or tier is revealed once, full screen on the dark stage, with the tier's light, rays, confetti and the medal swinging in on its ribbon, Share and Done; Reduce Motion fades it in where it stays and throws nothing. The reveal is a coordinator surface (ADR-0004) on Social only: rewards still never open over Home.
- **A medal opens as a badge does** (owner, 3 November 2026). The reveal opens on the badges' sealed capsule in the medal's tier, and the person taps it open with the badge's own ceremony, one implementation for both (`SealStage` and `SealPrompt` in `src/features/streaks/SealCeremony.tsx`, run by `useSealBreak`): three taps, each a crack, a rising tick and a haptic, then the shatter, the chime and the confetti. The medal blooms out of the break with the tier's rays, in place of the swing on its ribbon, and its title, figure, dates, Share and Done follow, laid out unseen from the start so the break moves nothing on the screen. Reduce Motion takes one tap and throws nothing. The medal stays a round coin; the seal is the badges' capsule.
- **How a moment draws.** A row above the post's actions, as Strava's are: an icon tile, a bold line and the figures under it. A best (a PR, the longest run, a first distance, a fastest effort) is gold, the `--achievement` family, because gold means a new best and nothing else (§14b). A streak keeps its flame's brand purple (§14k), and a plan's week and a first session take the same. At large text the tile stands above the words. Older posts keep their PR and challenge lines as they were.
- **A run's card shows its route on a real map** (Soc15 call 5, 4 November 2026). Strava, Nike Run Club and Garmin draw a run on the streets it went down; a coral line on a wash said nothing about where. Once a run is posted online, the author's app draws the post's route on the basemap the live maps use (OpenFreeMap's Positron and Dark) and names both images on the post (`routeMapUpload.ts`, `routeMapImage.ts`). The card shows the one for the theme on screen in a 5:2 box, the image's own ratio, so nothing is cropped at any text size, and fades it in over the drawn route (`RouteMapHero`; Reduce Motion skips the fade). The drawn route stays when there is no image or it fails to load, and it is never drawn over the image. The line is the drawing's: coral, layered for its glow, a hollow start ring and a solid finish dot. The distance keeps its row under the map. The map shows exactly what the post's preview may (`sharedRouteTrace`: privacy zones cut, ends clipped unless the runner shows them, nothing while the route is withheld), and the credit the live maps fold behind their (i) is drawn into the image's bottom-right corner (`burnBasemapCredit`). A post queued offline, a run on a Space post, a share image and posts from before keep the drawn route.
- **Photos on posts** (Soc15 call 2, owner, 3 November 2026). Strava, Hevy and Nike Run Club let a post carry the person's own photos; a Tropos post could not. A shared session now carries one to four, checked automatically before anyone else sees them and reportable like the rest of the post. They go on a post that exists, as its map does: Add photos sits under Undo on the finish screen's posted row, where most posts are made because sharing is mostly automatic, and on your own post's page at any time (`PostPhotosSheet`: add up to four in one pick, take any off). The share sheet has no picker; a post waiting offline offers nothing until it is posted, and offline the button is off with "Photos need a connection." Each photo is saved again on the phone at a 1600 px longest edge, JPEG 0.82 (`imageEncode.ts`, which leaves its EXIF, the place it was taken included, behind), uploaded under a random id, screened, and only then named on the post; a refused photo gets the screen's own sentence, any other failure a plain one with Try again, and the photos that passed are added all the same. On the card the photos are one block under the session's numbers and route and before its moments, the same place on a run's, a lift's and a hybrid card, rounded to the card's inner media radius (`rounded-xl`) with a 4px gap: one is the card's width at 4:3; two side by side, square; three one large on the left and two stacked on the right inside 4:3, so the card is as tall as with one; four a 2×2 of squares. Every tile is a box of a fixed ratio before its photo arrives, object-cover, lazy and async, so nothing moves as it loads, and a photo that fails to load leaves a quiet tile (`PostPhotoGrid`). A tap opens the viewer on the media stage (`PostPhotoViewer`): the photo whole, "2 of 3", Close, the arrows, a swipe and the arrow keys between photos, Escape and the device's back to close, focus kept inside and handed back to the photo tapped, and each photo named "Photo 2 of 3 from Maya Chen's run". A photo slides in from its side; Reduce Motion only fades it. The moderation queue shows a reported post's photos as thumbnails; Hide content makes the post private as before. Food9 is unchanged and separate: a meal photo stays on the device.
- **An invite carries who sent it, and joining from it follows both ways** (Soc15 calls 4 and 5, 4 November 2026). Strava, Duolingo and Hevy credit the person who invited you and connect you at once; Tropos's invite link was the bare front door and carried nobody. Each person has one invite code, eight characters with no 0, O, 1, I, L or U, shown grouped ("K7P4-9M2H"). People's Bring a friend shares `https://troposfit.com/?invite=<code>` and shows the code under "Your code" with Copy code, to read out or paste after installing. Compatible signed iPhone builds can open invite-only Universal Links once Associated Domains and the hosted association are configured (see `docs/ios-invite-links.md`). A link opened before installation does not transfer its code automatically: the browser shows Copy invite code and explains where to paste it, or to reopen the original message’s link afterward. The web app keeps a link's code on the device until setup uses it (`pendingInvite.ts`); the welcome and sign-up screens say "Maya invited you to Tropos" (the first word of the inviter's public name, from a signed-out lookup that names no one it should not) or "A friend invited you to Tropos", with "They'll follow you once you've set up your plan." under it. Setup's last step has an optional "Invited by a friend?" under the name, closed unless a code is waiting; the code is used once the plan is made and a toast says what it made. People offers the same field to an account in its first 14 days that has not used one. **STATUS 5 November 2026 (owner, on a privacy flag):** using an invite counts as the new person accepting the inviter, so the inviter follows them at once; the new person follows the inviter at once only when the inviter has Approve followers off ("You and Maya now follow each other", and the inviter is told "Sam joined from your invite. You follow each other now" under its own switch, Invites, on by default). With approval on, the default, the new person's follow waits as a request marked as from the invite: their toast says "Maya follows you now. Your request to follow them is waiting", and the inviter's notification says "Sam joined from your invite and asked to follow you", with Accept beside it, so a code posted publicly reaches no followers-only post. Bring a friend says which the person's own setting makes. A refusal says why in a sentence (`invites.ts`), and an unknown code, a block either way and a restricted or deleting inviter read the same, so nothing says who has blocked whom. Circles keep their own invite codes.
- **Weekly leagues** (Soc15 call 3, owner, 3 November 2026; built 5 November 2026). Duolingo's league gives a week a stake: a group of strangers, a countdown, a promotion zone and a result. Tropos's is opt-in and scored against each person's own plan. **Opt-in:** a league shows a first name, a photo and a week's points to about twenty people who may be strangers, so nobody is in one until they tap Join, under a line that says exactly that ("Your first name, photo and weekly points show to the people in your group. Nobody else sees them, and you can leave at any time."). A restricted account sees why it cannot join in Join's place; Leave the league, behind a confirmation, takes the person's row out of the group at once. **Scoring:** points are the share of your own plan done this week, out of 100 (`functions/lib/leagueRules.js`, the planned count `functions/lib/leaguePlanned.js` pinned to `trainingWeek.ts`), so a three-day week done beats six runs half done, and sessions beyond the plan add nothing. **The card** sits in Together's This week, under the weekly challenge, both being this week's and ending on Sunday; it keeps the page's one filled button for the challenge, so Join is the quiet secondary pill. Its four states: not joined (the line above and Join), locked ("Leagues open when 10 people have joined. 3 so far." over a bar of the count), waiting ("Your group starts on Monday."), and in a group, where the card wears its tier's light: the drawn badge, "4th of 18" and the points as figures, a bar of the points in the tier's metal, "3 of 4 sessions" and "Ends Sunday". The whole card opens `/league`. **The page:** the badge large in its light, the countdown to the end of your own week ("Ends in 2 days 4 h"), every row (rank, face, first name, "3 of 4 sessions", tier, points), your row picked out as the friends board picks it out, a line under the places that move up ("Top 5 move up a tier", in the success green) and one above those that move down, and Leave the league. Someone blocked either way is left out of your view; the places still count them, so the numbers can skip. **The tiers are drawn, not iconised** (`TierBadge`): a shield in the tier's metal with the tier's mark, one, two and three chevrons for Bronze, Silver and Gold, a star for Platinum and a cut stone for Diamond, so shape as well as colour tells them apart. The first four metals are the badges' own; Diamond's is the brand's purple ramp, pale like the others, as the streak flame's tiers rise through it, so the closed palette gains no colour (`leaguePalettes.ts`). **The result** is revealed once per result per device, full screen on the dark stage, the first time Social opens after Monday's turn (`league-result`, ADR-0004): the new tier's badge in its light, "You moved up to Silver", the place and points, See your league and Done. A rise gets the rays, a spring and confetti; a week held gets the light; a fall gets a softer light, the badge settling in and "A new week has started", and never more than the facts. Reduce Motion fades the badge in and throws nothing. No mid-week nudges: the one notification is Monday's result, under its own switch (Leagues, on by default). **Since Soc16 (owner, 10 November 2026)** the league closes This week, under the challenges the person joined, and the waiting card is quiet: "Weekly league" (not "You're in the league", which a league that has not opened is not), "Leagues open when 10 people have joined." with "4 so far." and its bar only from 3, the bar in bronze, the tier the person starts in, beside the badge; the line on how groups are made lives on the league page.
- **Plan groups** (Soc15, built 5 November 2026). Strava's clubs and Runna's race spaces tell you who else is running your race; Tropos knows which race each plan is for. A plan group is the people on Tropos whose race goal is bound to the same race's space while that race is ahead. They share its date, so they are the same number of weeks out. Only someone in one sees anything of it, and only until their race day. **The card** sits last in Together's This week, under the league: the race's own photo in a 56px rounded tile (the coral flag tile when it has none), "You and 11 others are training for Manchester Marathon" in bold, and "9 weeks to go" under it in the running coral's strong ink ("1 week to go", then "Race week" inside the last seven days), all over the running coral's light, as the league card wears its tier's. The whole card opens the race's space. With fewer than two others (a count under 3, the viewer included), or with no count to read, it says "You're training for Manchester Marathon": a small group is not shown as a number, and a missing count is never a zero. While the count is read, a placeholder holds the card's height. At large text the words drop under the photo rather than stand a word a line beside it. **The hero** of the race's space, for the same person, gains a line under the space's size: "12 people on Tropos are training for this race", and nothing under 3. The hero is 176px and grows when its words need more (larger text, this second line), so they never run up under Back. **The count** is `raceCohorts/{spaceId}`, a number the server recounts and never increments; it names no one, so nobody is left out of it. The weeks are whole weeks from the viewer's own today to their race day (their day of a two-day race), as the "Training for" chip counts them (`planGroup.ts`). **No faces yet.** The people who chose to show "Training for this race" on their profile could stand beside the hero's count, but the app cannot tell a restricted account or the hidden App Review account from anyone else without new rules, and the query needs a collection-group index the emulator cannot check, so the hero shows the number alone. **Since Soc16 (owner, 10 November 2026) the card is Together's hero** (`RaceHero`), the first thing on the page while the person trains for a race: the race's photo the width of the page and at least 280px tall under the coral wash and the dark scrim, "Your race · 9 weeks to go" as its kicker, the race's name as the page's largest words (`text-hero`), its date and place, and, from a group of 3, "You and 11 others on Tropos are training for it". It draws at once and the group's line joins it once the count is read; under 3, or with no count, the line is left out. Without a race the weekly challenge's photo card leads the page.
- **Together's order** (Soc16, owner, 10 November 2026: "Ok fine I agreed just build it", on a critique of the page). Laid out by the person's question, not by code module: the hero (their race, or the weekly challenge's card), This week (the weekly challenge, the challenges they joined, then the league), Circles, then Discover led by races and Spaces, then the community goal and the challenges to join. Every challenge row carries the medal it is working toward (`MedalArt`, `rowMedal.ts`): bronze for one not joined, the next tier for one joined, gold once gold is theirs; the community goal awards none and keeps its strip. A challenge's header, on the weekly card and in its sheet, is that medal at poster size in a soft light of its sport beside its name and time left (`ChallengeMedalBand`), not a photograph. No count of people under 3 on the page: the community goal's runners, the waiting league's joined count; a Circle of one says nothing of its size (a pair is a Circle, so a Circle's size shows from 2). Ended Circles fold under one "Ended circles" row. The page's one filled button is neutral: the weekly challenge's action, or Start a circle while there is no Circle.
- **The live pulse** (Soc15, built 5 November 2026). One line that says other people are training today, the last of the lock's list before plan groups. It sits on Social's Feed, the first line under the source control whichever source is on screen, so the control never moves under a thumb when it arrives: "Today: 14 sessions on Tropos" in the small muted line the Feed's other notes use, the figure `font-mono tabular-nums` and semibold, grouped as the reader's locale groups (`toLocaleString`). Before it a brand-purple dot, and a ring of the same purple that grows out of it and fades every 2.4 s (`ds-live-pulse`: transform and opacity only, §14h, and the Feed's one ambient loop); under Reduce Motion the ring is not drawn and the dot stays still. The count is every saved session the challenges would credit, on its own local day, across Tropos (`functions/lib/pulse.js`); the line reads the viewer's own local today live and moves as sessions are saved. Below 10 sessions, while the day's first answer is coming and when it cannot be read, nothing is drawn, not a zero: "Today: 1 session" reads as an empty room, and every new Tropos lives there first. It is not a live region, so a screen reader is not told of every session. Social only: Home stays calm (call 1).

### 14m. The measured rules (DS4, 7 November 2026)

- **Why.** The owner said Tropos looked "vibe coded blank" next to Strava, Hevy and Duolingo and asked for rules derived from the apps people come back to before any were written. Five passes on Mobbin measured screens with code: hierarchy and type (80 reference screens, 18 apps), colour (145, 21), layout (68, 17), imagery, rewards and first use (74, 16), and words (322 lines, 82 screens, 16 apps), each against Tropos's own frames of main captured on the emulator rig. The rules below carry the number to check on a screenshot; the evidence, cited screens and method are in `docs/design-rules-2026-11/`, and the words rules are in CODING_STANDARDS' house voice. DS4 in the plan file is the decision.
- **What it found.** Tropos was not short of colour (3.1% of an everyday screen against 2.4%) but its biggest colour was a button on 17 of 32 frames, where the apps' is the person's data (6 of 85). Its hierarchy was upside down: the "Today" title out-ranked the session, large titles sat on 78% of its screens against 13%, and chrome took 31% of the screen against 14%. Home had no hero picture, 7 of 12 lists had no picture per row, and all 30 badges shared one silhouette. The finish screen was 2.1% colour in about 9 blocks where a reward is about 13% in one object. The research also overturned a first round of mockups: a purple flood on Home (35% colour against the 8% ceiling), 76 px type on Home (against 48), and a flooded nine-block finish screen.
- **Hierarchy.** (1) Every main screen and every finish or reward screen has one hero: 30-60% of the first 852 pt, its top within the first 260 pt (63 of 80 reference screens). (2) The hero holds the largest text, at least 1.2x the next size; no large page title sits above a hero, which names the screen itself, with the date as a small kicker (DS4 call 2 for Home). (3) The next block is at most 0.8x the hero's height, 0.65x on Home (reference median 0.60; Tropos Home was 0.97). (4) A detail or reward hero leaves the card (in a card: 3 of 18 detail and 2 of 12 reward heroes); a Home hero is dressed differently from the cards under it.
- **Type.** (5) Home and detail heroes: a headline at 25-38 px or a figure at 40-48 px, nothing above 48 px on those screens (no reference Home exceeds about 50 pt). (6) The display register, 64-120 px, only on finish, new-best, streak and live screens (10 of 79 reference screens; 0 of 30 Home screens), one element, in the hero, Archivo's wide heavy cut, capitals. (7) At most six text sizes per screen (median 5). (8) A unit on a big figure is a caption or sits on its baseline at 0.4-0.7 of the figure's height, as Tropos already does.
- **Colour.** (9) An everyday screen carries at most 8% colour on dark and 15% on light (saturated pixels; 80 of 86 reference screens). (10) The biggest patch of colour is data: a ring, week segments, a route, a figure's lit muscles; never a button. (11) At most three hues per screen, one holding at least 60% of the colour (leading hue median 92%). (12) One meaning per colour, generic actions neutral (8 of 8 apps that give colours meanings); a domain action keeps its domain's colour on its icon and its tinted or text form (§14i), and the screen's one full-width filled button is neutral, Start workout included (owner, 7 November 2026). (13) A gradient stays within one hue (30° or less) and fades into its page or card (15 of 15 everyday reference gradients; Food's orange-into-purple hero wash was the only multi-hue one in 178 screens). (14) On dark, colour is strokes and glows on a near-neutral ground; filled areas stay small (median 0.4% of a dark reference screen; 0 of 31 flood). (15) Each colour keeps its hue in both themes, and dark is never louder than light. (16) An empty metric is a full-size grey track; colour arrives with data.
- **Layout.** (17) Chrome (title, control rows, tab bar) takes at most 20% of a tab's main screen and 12% of a pushed one (reference median 14.4%; Tropos 31%). (18) At most one control row under the title, its track 32-40 pt with the 44 pt hit area from padding. (19) The tab bar sits on the home indicator, its bottom chrome within 90 pt of the screen edge (reference about 82; Tropos 106). (20) One card radius, 16 pt; 10-12 inside a card; 8-12 pt between cards in a group and about 32 between sections. (21) One filled button per screen, about 45 pt tall (63 of 65). (22) List rows 56-64 pt, taller only with a thumbnail or a big number. (23) A screen about one session or place opens on a full-bleed band 25-75% tall: a run's map, a Space's photo, the finish screen (19 of 65 reference screens; Tropos had none).
- **Imagery and badges.** (24) Home, a session's detail and the finish screen each carry one picture of at least 10% of the first screen (9 of 15 reference home screens; 9 of 9 detail screens). (25) Every row that stands for a session, a person or an award has its own picture, 36-80 pt. (26) At least 80% of the imagery is the person's own (data, routes, photos) or Tropos's own art (the rendered form figures, the body map, badges, medals); no stock photography anywhere. **Since Soc16 (owner, 10 November 2026)** that reads: photographs only for places and communities, a race's real place and a Space's cover (Runna's race pages, Strava's clubs); a challenge's picture is its own medal (`ChallengeMedalBand`, as Strava's, Nike Run Club's and Garmin's challenges are badge art); never a photograph on Home, Train, Food, History or Profile beyond the person's own. (27) A badge collection has at least three silhouettes (reference median 4); a badge for a count or a distance carries its number in the art (72% of 103); a locked badge is the same art greyed with its progress, as Tropos already draws it. All 30 badges are redrawn this way (DS4 call 4) in four families (lifting, running, food and water, consistency), through the Gemini pipeline that made them. Owner, 8 Nov 2026: the badges stay as the current hexagon set (sampled three silhouettes with the number in the art, and with the emblem plus a ribbon; the owner kept the originals). (28) Tab icons are drawn at 20-24 pt.
- **Rewards.** (29) A full-screen reward is for a first, a new best, a streak milestone and a finished plan (firsts in 6 apps, streaks in 7); a routine session gets a calm summary with its picture (DS4 call 3). (30) A reward screen holds one object about half the screen's width in its top 40%, one display figure, at most one sentence, one main button and at most six blocks. (31) Its colour is the achievement's own, on the object over the plain page, about 5-15% of the screen (reference median 13%). (32) Confetti only for a first, a new best and a finished plan.
- **First use.** (33) Day 1 leads with the first action (7 of 8 reference home screens); a metric at zero is drawn full size at zero (15 of 18); the hero keeps at least 75% of its size; the icon-only "nothing yet" block stays for no results and errors.
- **Mockups.** `docs/visual-audit/ds4-2026-11-07/` holds the current frames and mockups that pass these numbers, each with its measured colour share, hero share and largest text.
- **Order of work.** Home's hero in its four states (lift, run, rest, first day), the week strip folded into it; the lift and run finish screens and the share card; Food; the profile, the streak and the badges; the plan on Train; a reading under every History chart. One PR each, with before and after captures (§0 rule 13).

### 14n. Habit loops, setup, logging and selling (DS5, 10 November 2026)

- **Why.** The owner asked what makes the apps people come back to easy, fun and hard to put down, and for the answer to be added to these rules. DS4 measured how a screen looks. This pass counted what a flow does: 168 preview screens from 51 apps over 16 Mobbin searches, each read by eye, against Tropos's code on main. The counts, their small samples and their limits are in `docs/design-rules-2026-11/rules-engagement.md`. Nothing here was measured in pixels, so nothing here overrides a number in §14m.
- **What it found.** Tropos already has the mechanics: of the eleven rules it meets nine, partly meets two and breaks none. What brings people back is a count they can see, forgiveness when it breaks, a next thing that is always named, a log that takes one tap and a reminder they agreed to in words they had read. The gap to the reference apps is how quietly Tropos draws these, which is §14m's work. So most of these rules are floors Tropos already stands on, written down so a later change cannot lower one.
- **The streak.** (45) The streak's own screen shows its days, as a week row or a month, beside the count (10 of 15). (46) The count stands against something: your best, or the next tier and how far off it is (8 of 15). Tropos shows neither on the sheet; add both with the streak's DS4 redesign. (47) A missed day is absorbed, or answered with a next step; it is never blamed, and protection is never sold (5 of 5 comeback screens; Streak1 holds).
- **Asking.** (48) A permission is asked with its reason; a notification ask also shows the notification in its real words and at its real time; saying no is one plain tap (reason first on 10 of 10; shown on 6 of 11; plain decline on 8 of 10).
- **Setup.** (49) One thing a screen, the reason under the question, progress shown, and no more than eight steps (reference flows run 12 to 34 screens). (50) Setup ends on your plan in your own numbers, changeable there, behind one button (10 of 10).
- **Logging.** (51) A set row arrives filled in; one tap on the row logs it and the row changes at once (6 of 6). (52) Adding food opens on what you ate before; a row adds in one tap and carries its calories (7 of 8; 7 of 8; 6 of 8).
- **The week.** (53) Seven days in a row with done against planned (7 of 9 draw the days; 5 of 9 set a target).
- **Selling.** (54) A paywall states the price and the period beside its button, says how to cancel and can be left; a trial names the day it charges and the reminder before it (9, 8 and 10 of 10).
- **Never.** (55) No paid or earned-currency streak protection, no countdown or "streak lost" interruption, no second prompt that argues with a no, no multiplier without a source the person can open, no drawn copy of a system dialog, no struck-through price, no setup question that serves the business and not the plan, no marketing opt-in that arrives ticked, and no limit on how much someone may train or log. Each was seen in the sample.
- **Not reopened.** All five training apps with a streak count it in weeks; the nine that count days are habit, language, food and wearable apps. Tropos counts days and keeps them alive on a weekly cadence (Streak1). The evidence is recorded for whoever reopens Streak1, and that is an owner call.

### 14o. Lit edges, glass on what floats, one light on the hero (DS6, 10 November 2026)

- **Why.** The owner asked why Tropos lacks the definition an app like Opal has, and whether glass and neon need to stay banned. Pixel samples from his screen recordings of both apps the same day answered it: a dark Tropos card was `#17171B` on a `#0E0E11` page with no edge, 1.06:1 against the page; Opal's card fill is about the same against its page (1.11:1) but carries a 2 px lit rim at 1.7:1. Most of that definition is neither glass nor neon. He was shown Home three ways and chose the fuller one (lock row DS6 in the plan file).
- **Lit edges on every dark surface.** A card, a compact tile, a chip and a pill button take a hairline of light along the top and a faint outline all round. They come from the shadow tokens (`--ds-shadow-card` and its hover step), so `card-shadow` stays the one place a card's elevation is set and no component writes its own edge. On a dark page the edge is light, not shadow: a black shadow cannot show there. A fill may fall from a slightly lighter top to the surface colour, inside one neutral. The light theme keeps its shadows.
- **Tracks are cut in.** A track that holds progress (the week's segments, a ring's groove, a slider's rail) is darker than its surface, with an inner shadow above and a hairline of light below, so what fills it sits in something.
- **Where each is set.** `card-shadow` is a card's edge. `chip-edge` is a chip's or a pill's: the muted and tinted `Button` and `IconButton` variants carry it, and so does the streak chip. `track-cut` is a track's, fill and cut together (`--track`, `--ds-shadow-track`), and a ring asks for its groove with `ProgressRing`'s `cut`. The two utilities draw through Tailwind's shadow variable, so a focus ring or a selection ring on the same element is drawn with the edge and not in its place; their tokens are a transparent shadow in the light theme, never `none`, which would void that list. A card that has `card-shadow` carries no border in the dark theme: the two stack into a doubled edge.
- **A track on the page is not cut.** On a card the cut track measures 1.11:1 against it, as the lighter one did (1.12:1), and a lifting fill rises from 4.1:1 to 5.1:1 against its track. The page is already near black: a cut track there measures about 1.03:1 and all but goes, so a track that sits on the page (setup's progress, Food's week bars) keeps its lighter fill. The calorie ring keeps its plain grey groove (DS3's quiet-ring call): on Food it sits on a wash, not a card.
- **Glass on what floats, and only there.** A surface that sits over scrolling content and moves or can be dismissed may be frosted: the tab bar (so since 8 September 2026), header chips over a hero, a sheet and its handle, a toast, and the workout's docked rest and new-best cards. It is a static backdrop blur with a translucent fill and a lit rim. A card that holds the person's numbers in the page's flow is never glass. Every frosted surface keeps opaque labels, a solid fallback under Reduce Transparency and where backdrop blur is unsupported, and the §10 contrast floors measured over the busiest content that can pass behind it. The blur is never animated (§14h).
- **One light on the hero.** A screen's hero picture may stand in one soft light of its session's colour, a static radial that fades into the surface, with a floor under the figure. One per screen, behind the hero only, counted in rule 1's colour budget, and quieter than the reward register's light so a finish still reads as an event.
- **Still out.** Neon (a saturated outline or glow on chrome, text or buttons), a "nice blue", a two-hue or rainbow gradient, a coloured wash over a whole page, and glass on data.
- **Check on a phone.** Backdrop blur costs paint in a web view. Each frosted surface is checked on a phone while content scrolls behind it, and one that drops frames goes back to solid with its rim.
- **Order of work.** The card and tile tokens; chips, pills and tracks; the tab bar's rim and a fade under it; sheets and toasts; the workout's docked cards; the hero light on Home and Train. One PR each, with before and after captures (§0 rule 13). The captures are in `docs/visual-audit/ds6-2026-11-10/`; from the second step they are the real components, built with the app's stylesheet into a harness page, since the emulator rig cannot run where they were made.

### 14p. The signed-out screens (DS8, 11 November 2026)

- **Why.** The owner said the welcome and sign-in screens could be better and that the top apps' "got a lot of personality". Both were a centred frosted card: the app icon in a tile, the name in spaced capitals, a centred heading and, on the welcome, three grey rows. He was shown three welcome directions and a sign-in screen on a canvas and chose the third welcome and the sign-in, with a different drawing: "the deadlift looks weird showing just the back" (lock row DS8 in the plan file).
- **The welcome's picture is the product.** `WelcomePreview` draws what the first questions lead to: an example week of lift and run days, today's session with its drawing, and a daily calorie target. It is one image to a screen reader, named as an example, and never the visitor's own numbers. It is sized from the column's width and not the text size, as a picture is, and on a short screen it gives up its lower edge before "Get started" leaves the first screen.
- **The forms open on a lifter who faces you.** `SignInFigure` stands to the right of the heading on sign-in and sign-up: front on, never from behind. It is the overhead press, playing its rep through the hero's flipbook (`HeroMotion`) when the screen opens and then resting, and still under Reduce Motion. The heading runs under the bar and stops short of the body. Under 14rem of column the lifter gives way to the words. A different drawing is one constant in `authArt.ts`; it needs a flipbook.
- **The lockup.** `AuthLockup`: the mark at 26 px in brand purple beside "Tropos" in Archivo 800 at 23 px, title case, top left on all three screens. A logo, so a fixed size.
- **On the page, in one light.** No card and no glass (§14o): the content sits on the plain page, left-aligned, in a column a phone wide. The one light on each screen is behind its picture. The buttons are as they were: "Get started", "Create account" and "Sign In" are the brand's filled purple, as setup's Continue is, so the way in is one colour from the welcome to the plan. DS4's neutral main button (§14i) has not been taken to the signed-out and setup flow; that is one owner call for the whole flow, not a button at a time.
- **Signed out is dark.** `public/init.js` and sign-out both put a signed-out app in the dark theme, so these screens are reviewed in dark. They hold in light, with the hero's own light, should that change.
- **Measured from the screen, not a container.** The picture's unit and the lifter's giving way read `--auth-column` (the screen less the page's margins, up to the column's limit). Container query units arrived in iOS 16 and the app runs on 15.4.
- **Light to load.** The drawings are named by path (`authArt.ts`, held to the released cut-outs by `authArt.test.ts`), and `eagerGraph.test.ts` keeps Login from importing the exercise database or framer: these screens are fetched before anyone has signed in.
- **The launch's ground stays black (11 November 2026).** The owner was shown the launch opening on the icon's purple beside today's black and left the call to the agent. It stays black: six surfaces paint before the app's first frame, and `coldStartChrome.test.ts` holds them all to the dark canvas, because the native launch image can lift before the web layer has drawn and a second colour in that chain is a flash on a slow start. The brand's colour at launch is the mark itself. Reopen it only with a phone to check a cold start on.
- **Captures.** `docs/visual-audit/welcome-2026-11-11/`: before and after at 393 and 320 px, and at 1.35x and 2x text.

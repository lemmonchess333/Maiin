# Animation plans

Written by the `improve-animations` skill from the audit of 1ad7dd6a
(2026-10-05). Each plan is self-contained: the current code verbatim, the
exact target values, steps, boundaries and a feel check. An agent with no
other context can build one. To build a plan, hand it to an agent (or ask
Claude to "build plan 003") and review the diff against the plan's
**Verification** section.

| #   | Plan                                                                           | Severity | Category              | Status |
| --- | ------------------------------------------------------------------------------ | -------- | --------------------- | ------ |
| 001 | [Stop staggered skeletons going blank](001-skeleton-reduced-motion.md)         | HIGH     | Accessibility         | DONE (#2577) |
| 002 | [Let framer own the buttons it animates](002-button-transition-motion-driven.md) | HIGH     | Performance           | DONE (#2578) |
| 003 | [Tab switches: a 150ms fade, no slide or stagger](003-tab-switch-entrance.md)  | HIGH     | Purpose & frequency   | DONE (#2579) |
| 004 | [Food's day switch shows the figures, no redraw](004-food-day-switch.md)       | HIGH     | Purpose & frequency   | DONE (#2581) |
| 005 | [Tab bar press: the house 0.97, no bounce](005-tab-bar-press.md)               | HIGH     | Physicality           | DONE (#2580) |

## Order

1. **001** first. It is the smallest, it is a real accessibility bug (blank
   loading screens under Reduce Motion), and it touches nothing else.
2. **002** next. It is one CSS rule plus an attribute, and it fixes the
   laggy swipe-to-delete.
3. **003**, then **005**. Both are about the tab bar experience. Do 003
   first so 005's feel check isn't muddied by the page slide.
4. **004** last. It is the largest (five files), and its feel check is
   cleanest once 003 has removed the page-level entrance.

## Dependencies

None are hard. Every plan can be built alone, in any order, from 1ad7dd6a.
Two overlaps to know about:

- **003 and 004** both stop a Food entrance replaying. 003 stops
  PageShell's stagger. 004 moves Food's hero `key` off the stagger
  wrapper. Either works without the other. They touch different lines of
  different files (003: `PageShell.tsx`; 004: `Food.tsx:495-505, 1844`).
- **002 and 005** both concern press feedback. 002 is about `button` /
  `role="button"` elements. The tab bar cells are `<a>` links, which the
  global button rule never reaches, so the two do not interact.

## Follow-ups found while planning (not planned)

- **Move the global button transition (`src/index.css:601-608`) into
  `@layer base`.** It is unlayered, so it beats every Tailwind
  `transition-*` utility on every button. As a result:
  - `transition-transform duration-150` in `src/components/ui/buttonClasses.ts:31`
    and `src/components/ui/IconButton.tsx:56` is dead;
  - so is `transition-all` on many option cards.

  Moving it would bring all of those back at once. Some buttons would
  lose their colour fade (`transition-transform` alone), and some would
  start transitioning every property (`transition-all`). That needs its own
  audit, button by button. 002 fixes only the framer-driven half.
- **Delete the unreachable `hidden` variants after 003.** These are
  `pageItemVariant.hidden` in `src/components/ui/pageMotion.ts`, Home's six
  inline `hidden` states and `fadeUp.hidden` in `StackedCTACards.tsx`.
  Harmless, but dead.
- **`FoodHeroCard`'s log effect re-runs on every Food render.** Food passes
  `dailyTotals` as a fresh object literal (`src/pages/Food.tsx:1849-1854`),
  and it is in the effect's deps (`FoodHeroCard.tsx:203-210`). Each re-run's
  cleanup clears the pending timers, and the re-run then finds nothing
  changed and sets none. So a Food re-render within 600ms of a log (say, the
  server acknowledging the write) would drop the log haptic. One within
  800ms / 2.2s would leave the celebration glow / "Goal hit ✓" on screen.
  **Found by reading, not reproduced.** Confirm on a device before fixing.
  Depending on the four numbers instead of the object is the likely fix.
- **Food's first-open draw-in.** The ring draws and six numbers count up
  every time Food opens, which is several times a day. 004 deliberately
  keeps it, as the designed log moment. Whether it should also settle on
  open is an owner call.

## Audit findings not yet planned

From the same audit, vetted against the code. Ask for any of them to be
planned:

| #   | Severity | Where                                                                                                                   | Finding                                                                                                 |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 6   | MEDIUM   | `WorkoutSession.tsx:1960` and 21 other sites                                                                            | Set ticks press to 0.90 (two run controls to 0.92) against the house 0.97                               |
| 7   | MEDIUM   | `Program.tsx:798, 1220`                                                                                                 | Train's day pager ignores taps while the previous day is still sliding out                              |
| 8   | MEDIUM   | `TrendWeight.tsx:341`, `CalorieBalanceChart.tsx:210`, `ElevationProfile.tsx:70`                                         | Three charts sweep in for up to 1.5s under Reduce Motion; seven others already don't                    |
| 9   | MEDIUM   | `FoodComposerCard.tsx:259`                                                                                              | The first typed character animates the composer's padding, so the text shifts while typing              |
| 10  | MEDIUM   | `DayPeekCard.tsx:333`, `WorkoutSession.tsx:1463`, `GuidedRunOverlay.tsx:79`                                             | Size animations on frequent actions shift layout; the guided-run bars ease every second, which stutters |
| 11  | MEDIUM   | `StreakFlame.tsx:185`, `animations.css:20`                                                                              | Two always-on loops on Home; the start-run glow repaints every frame                                    |
| 12  | MEDIUM   | about 31 sites                                                                                                          | Duration-only transitions fall back to a slow-start curve or a bouncy default spring                    |
| 13  | LOW      | `Program.tsx:1709` and 3 overflow menus                                                                                 | The press-and-hold menu grows from its centre; the ⋯ menus appear with no motion                        |

Missed opportunities, also from the audit:

- Onboarding's eight steps cut hard.
- The run summary appears all at once, where the workout finish staggers.
- The switch knob jumps between sides.
- On an exercise's last set, the table swaps before the tick shows.

# 004 — Food's day switch: show the day's figures, don't redraw them from zero

- **Status**: IN PR (#2581)
- **Commit**: 1ad7dd6a
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 5 source files, 2 test files, about 60 lines

## Problem

On Food, each tap on a day in the week strip remounts the whole hero card,
because its wrapper is keyed on the date:

```tsx
/* src/pages/Food.tsx:1844-1857 — current */
      <motion.div variants={pageItemVariant} key={selectedDate}>
        <FoodHeroCard
          selectedDate={selectedDate}
          isToday={isToday}
          dailyTargets={dailyTargets}
          dailyTotals={{
            calories: dailyTotals.calories,
            protein: dailyTotals.protein,
            carbs: dailyTotals.carbs,
            fat: dailyTotals.fat,
          }}
          onTapDrillDown={() => setHeroSheetOpen(true)}
        />
      </motion.div>
```

A fresh mount replays every first-appearance animation in the card:

- the calorie ring redraws from empty over 0.6s, after a 0.1s delay
  (`src/components/food/CalorieRing.tsx:150-158`);
- the over-target lap redraws over 1.5s, after a 0.6s delay
  (`CalorieRing.tsx:174-182`);
- the centre number counts up from 0 (`AnimatedNumber`, `CalorieRing.tsx:214-218`),
  and its label block fades and rises in (`CalorieRing.tsx:197-205`);
- each macro tile's number counts up from 0, and its bar grows from 0%
  (`src/components/food/MacroColumn.tsx:280-284, 335, 353`);
- the wrapper itself fades and rises 12px (`pageItemVariant`), because the
  key remounts it inside PageShell.

So browsing back through a week means watching six counters race up from
zero on every tap. A day switch is a browse, done many times in a row. The
figures are already known, so the person should see them immediately. The
draw-in reads as a log moment (`LOG_MOMENT_MS`, "all log-moment animations
share this duration") and here is fired by navigation instead.

**The remount itself is load-bearing and stays.** Every "this changed
because the person logged something" check in the card starts fresh on
mount. That is why a day switch fires no haptic and no celebration:

- `FoodHeroCard.tsx:117-118`, `130-136`: `firstMountRef` skips the log haptic
  on mount ("Skip haptic on first mount / day switch").
- `FoodHeroCard.tsx:153-165`: the all-macros celebration compares the
  previous totals with today's.
- `MacroColumn.tsx:141-188`: each tile pops its icon on a logged increase,
  and pulses with a haptic when the intake crosses the target.

Without the remount, switching from a light day to a heavy one would read
as a log: a haptic, icon pops, a target-crossed pulse, and, landing on
today, possibly a false "Goal hit ✓" that also writes the celebrated-date
key. So the fix keeps the remount and makes a remounted card **start
settled**.

## Target

- The Food page's first appearance is unchanged: the ring draws in and the
  numbers count up, as designed.
- After the first day switch in a visit, every hero mount starts at its
  figures. The ring is already drawn, the numbers already read their value,
  the bars are already filled, and the centre label is just there. No
  haptic, no pop, no celebration, because the remount still resets every
  guard.
- Logging food on the visible day still animates from the old figure to
  the new one, exactly as now. The card is not remounted by a log, so
  nothing changes there.
- Only the hero remounts on a day switch, not its wrapper. So the wrapper's
  `pageItemVariant` fade no longer replays.

The mechanism is one boolean prop, `drawIn`, default `true`. It runs
Food → `FoodHeroCard` → `CalorieRing` and `MacroColumn` → `AnimatedNumber`
(there called `fromZero`). Every other caller of these components passes
nothing and keeps today's behaviour.

## Repo conventions to follow

- **Adjust state during render** is the house way to react to a changed
  value without an effect. Food already does it for the date, right where
  this plan hooks in (`src/pages/Food.tsx:495-505`):
  ```tsx
  /* src/pages/Food.tsx:495-505 — current */
    const [prevDate, setPrevDate] = useState(selectedDate);
    if (prevDate !== selectedDate) {
      setPrevDate(selectedDate);
      if (targetMeal) setTargetMeal(null);
      // Clear any in-flight typed text on date change. Without this,
      // typing "2 eggs" for today, then tapping yesterday on the date
      // bar, would silently submit "2 eggs" against yesterday — a
      // trust-destroying bug because the calorie totals on both days
      // shift and the user can't see why.
      if (nlInput) setNlInput("");
    }
  ```
- **"Start settled" already exists for Reduce Motion** in each child.
  Every `initial` is written `reduce ? <final> : <zero>`. This plan widens
  that condition. It does not add a new path.
- Optional props are documented with a `/** … */` line in the props
  interface, as every prop in these files is.
- Tests must not spell a thousands separator. Keep figures under 1000, or
  build the string with `group()` from `src/test/localeGrouping.ts`.

## Steps

1. **`src/components/ui/AnimatedNumber.tsx`.** Add a prop that starts the
   count at the value.
   - In `interface Props` (lines 5-13), after `ease?`, add:
     ```ts
       /** Count up from zero when it first appears (the default). False
        *  starts at `value`, for a number replacing one already on screen. */
       fromZero?: boolean;
     ```
   - In the destructuring (lines 26-32), add `fromZero = true,` after
     `ease = DEFAULT_EASE,`.
   - Line 34: `const count = useMotionValue(0);` →
     `const count = useMotionValue(fromZero ? 0 : value);`
   - In the doc comment above the function (lines 17-25), make the first
     sentence read: "A number that counts to its value: from zero when it
     first appears (unless `fromZero` is false), then from wherever it was
     when the value changes." Re-wrap the comment to the same width.

2. **`src/components/food/CalorieRing.tsx`.**
   - In `CalorieRingProps` (lines 11-30), after `ringDurationMs?: number;`, add:
     ```ts
       /** Draw the ring and count the number up from zero when it mounts
        *  (the default). False mounts it already drawn, at its figures —
        *  Food's hero after a day switch, which is a browse, not a log. */
       drawIn?: boolean;
     ```
   - In the destructuring (lines 60-69), add `drawIn = true,` after
     `ringDurationMs = 1500,`.
   - Directly after `const reduce = useReducedMotion();` (line 71), add:
     ```ts
       const settled = reduce || !drawIn;
     ```
   - Line 151: `strokeDashoffset: reduce ? strokeDashoffset : CIRCUMFERENCE,`
     → `strokeDashoffset: settled ? strokeDashoffset : CIRCUMFERENCE,`
   - Line 175: `strokeDashoffset: reduce ? overlapOffset : CIRCUMFERENCE,`
     → `strokeDashoffset: settled ? overlapOffset : CIRCUMFERENCE,`
   - Leave both `transition` blocks (durations and delays) on `reduce`. They
     govern later changes (a log), which must still animate.
   - Line 197: `<AnimatePresence mode="wait">` →
     `<AnimatePresence mode="wait" initial={drawIn}>`. This only suppresses
     the centre label's mount fade. The mode-toggle crossfade still runs.
   - In the `<AnimatedNumber` at line 214, add `fromZero={drawIn}`.

3. **`src/components/food/MacroColumn.tsx`.**
   - In `MacroColumnProps` (lines 23-47), after `barDurationSec?: number;`, add:
     ```ts
       /** Fill the bar and count the number up from zero when it mounts
        *  (the default). False mounts it at its figures. */
       drawIn?: boolean;
     ```
   - In the destructuring (lines 51-63), add `drawIn = true,` after
     `barDurationSec = 0.6,`.
   - Directly after `const reduce = framerReduce === true;` (line 66), add:
     ```ts
       const settled = reduce || !drawIn;
     ```
   - Lines 335 and 353: in each bar's `initial`, the condition `reduce ?`
     becomes `settled ?`. Nothing else on those lines changes:
     ```tsx
               initial={{ width: settled ? `${barFillPct * 100}%` : "0%" }}
     ```
     ```tsx
                 initial={{ width: settled ? `${overshootPct * 100}%` : "0%" }}
     ```
   - Leave the `transition` blocks and the pulse effect (lines 152-188) on
     `reduce`.
   - In the `<AnimatedNumber` at line 280, add `fromZero={drawIn}`.

4. **`src/components/food/FoodHeroCard.tsx`.**
   - In `FoodHeroCardProps` (lines 41-53), after `onTapDrillDown?: () => void;`, add:
     ```ts
       /** Draw the ring and tiles in from zero on mount (the default).
        *  Food passes false once the person has switched day: the card is
        *  remounted per day, and a remount is a browse, not a log. */
       drawIn?: boolean;
     ```
   - In the destructuring (lines 66-71), add `drawIn = true,` after
     `onTapDrillDown,`.
   - Pass `drawIn={drawIn}` to the `<CalorieRing` at line 327 and to each of
     the three `<MacroColumn` at lines 407, 421 and 435.
   - Do not touch `firstMountRef`, `prevTotalsRef`, the haptic effect or the
     celebration.

5. **`src/pages/Food.tsx`.**
   - Replace lines 495-505 with:
     ```tsx
       const [prevDate, setPrevDate] = useState(selectedDate);
       /* The hero draws in when Food opens. A day switch remounts it (the
          `key` below, which also resets its log haptic and celebration
          guards), and from then on it arrives at the day's figures rather
          than counting up from zero on every tap of the week strip. */
       const [heroDrawIn, setHeroDrawIn] = useState(true);
       if (prevDate !== selectedDate) {
         setPrevDate(selectedDate);
         if (heroDrawIn) setHeroDrawIn(false);
         if (targetMeal) setTargetMeal(null);
         // Clear any in-flight typed text on date change. Without this,
         // typing "2 eggs" for today, then tapping yesterday on the date
         // bar, would silently submit "2 eggs" against yesterday — a
         // trust-destroying bug because the calorie totals on both days
         // shift and the user can't see why.
         if (nlInput) setNlInput("");
       }
     ```
   - Move the key from the wrapper to the card. Line 1844
     `<motion.div variants={pageItemVariant} key={selectedDate}>` →
     `<motion.div variants={pageItemVariant}>`. Then in the
     `<FoodHeroCard` directly below, add as its first two props:
     ```tsx
               key={selectedDate}
               drawIn={heroDrawIn}
     ```

6. **Tests.**
   - In `src/components/ui/__tests__/AnimatedNumber.test.tsx`, add:
     ```tsx
     describe("AnimatedNumber — fromZero", () => {
       /* Food's hero remounts per day. A remount that counted from zero
          made browsing a week six racing counters per tap. Asserted
          straight after render, with motion on (the setup's matchMedia
          default): the first paint is the figure, not 0. */
       it("false paints the figure on the first frame", () => {
         const { container } = render(
           <AnimatedNumber value={640} fromZero={false} />
         );
         expect(container.querySelector("span")?.textContent).toBe("640");
       });

       it("the default still starts at zero", () => {
         const { container } = render(<AnimatedNumber value={640} />);
         expect(container.querySelector("span")?.textContent).toBe("0");
       });
     });
     ```
   - In `src/components/food/__tests__/FoodHeroCard.test.tsx`, add a
     describe that renders the card as `renderHero()` does, but with
     `drawIn={false}`. Set `window.localStorage.setItem(MODE_STORAGE_KEY, "left")`
     before rendering. With the suite's figures, protein reads
     150 − 50 = 100 left. Then:
     - assert `container.querySelector('[data-macro="protein"]')!.textContent`
       matches `/100g/` straight after render;
     - in a second test, with `drawIn` omitted, assert the same tile does
       **not** match `/100g/` straight after render, because it starts
       at 0.

## Boundaries

- Do NOT remove the remount. The `key` moves from the wrapper to
  `FoodHeroCard`, and that is all. The remount is what keeps day switches
  from firing log haptics, icon pops and a false celebration.
- Do NOT change `LOG_MOMENT_MS`, any duration, delay or easing, or the
  first-open draw-in.
- Do NOT change Home's compact ring or tiles (`size="compact"`). They pass
  no `drawIn` and keep today's behaviour.
- Do NOT touch `HeroDrillDownSheet`.
- Do NOT "fix" the effect deps in `FoodHeroCard.tsx:203-210`. `dailyTotals`
  arrives as a fresh object on every Food render. That is a separate issue,
  listed in `plans/README.md`.
- Do NOT add dependencies.
- If the code at a cited line does not match this plan (drift since
  1ad7dd6a), STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npx vitest run src/components/ui/__tests__/AnimatedNumber.test.tsx src/components/food src/pages/__tests__/Food` passes.
  - `npx tsc -b` passes.
  - `npm run lint` passes: read the `✖` summary line or the exit code. The
    new `useState` in Food must not draw a `set-state-in-effect` warning,
    because it is set during render, not in an effect.
  - `npm run verify` passes.
- **Feel check**: run `npm run dev` with the mobile emulator, signed in,
  with meals on several days this week, one of them over target:
  - Open Food. The ring draws in and the numbers count up once, as today.
  - Tap yesterday, then the day before, then back. Each day's ring, centre
    number and three tiles are simply there on the tap, with no counting and
    no bars growing. The card does not fade or rise.
  - Tap from a near-empty day to the over-target day. There is no haptic,
    no icon pop and no tile pulse.
  - On today, after all three macros have been hit, tap away and back to
    today. "Goal hit ✓" does not appear.
  - Log a food on the visible day. The ring sweeps and the numbers count from
    the old figure to the new one, and the log haptic lands at the end of the
    sweep, as before.
  - Toggle the ring between left and logged. The centre label still
    crossfades.
  - In the Animations panel at 10%, a day tap shows no `stroke-dashoffset`
    or `width` animation in the hero.
  - Under emulated `prefers-reduced-motion: reduce`, behaviour is the same
    as today, since everything was already settled.
- **Done when**: `key={selectedDate}` sits on `<FoodHeroCard`, not on the
  `motion.div`. After the first day tap of a visit, the hero shows the new
  day's figures on the first frame. A day switch fires no haptic. The two
  new tests pass.

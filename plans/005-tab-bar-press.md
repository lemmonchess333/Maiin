# 005 — Tab bar press: the house 0.97 tap, without the bounce, grow and hop

- **Status**: IN PR (#2580)
- **Commit**: 1ad7dd6a
- **Severity**: HIGH
- **Category**: Physicality / purpose & frequency
- **Estimated scope**: 3 files, about 50 lines (mostly deletion)

## Problem

The tab bar is the most-pressed control in the app. Each tab stacks three
animations on its icon:

```tsx
/* src/components/BottomNavigation.tsx:132-174 — current */
                    <motion.div
                      className="relative z-10"
                      /* `tabIndex={-1}` is load-bearing, not tidying.
                         framer-motion's press gesture writes
                         `target.tabIndex = 0` onto any element carrying
                         `whileTap` that is not natively focusable and has
                         no tabindex of its own (motion-dom's
                         `isElementKeyboardAccessible`). This div is
                         decoration inside the `<a>` that IS the control,
                         so without the opt-out every tab in the bar put a
                         second stop in the order announcing nothing —
                         five of them, on every authenticated screen. */
                      tabIndex={-1}
                      whileTap={
                        prefersReducedMotion ? undefined : { scale: 0.85 }
                      }
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 17,
                      }}
                    >
                      <motion.div
                        initial={false}
                        animate={{
                          scale: !prefersReducedMotion && isActive ? 1.06 : 1,
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                        }}
                      >
                        {/* DS3's own tab icons: an outline, and a
                            filled form drawn for the open tab. */}
                        <Icon
                          active={isActive}
                          className={cn(
                            "size-[22px]",
                            isActive && "ds-tab-active-icon"
                          )}
                        />
                      </motion.div>
```

```css
/* src/styles/animations.css:38-52 — current */
/* ─── TAB BAR ICON BOUNCE ───────────────────────────────────── */
@keyframes ds-tab-bounce {
  0% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-3px);
  }
  100% {
    transform: translateY(0);
  }
}
.ds-tab-active-icon {
  animation: ds-tab-bounce 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
```

1. **The press is a spring to 0.85, damping 17.** That is a 15% squash,
   five times the house's 3%. A spring that loosely damped overshoots
   on release, so every tab tap wobbles.
2. **The open tab's icon grows to 1.06** on its own spring.
3. **The open tab's icon hops 3px** with an overshooting curve
   (`cubic-bezier(0.34, 1.56, 0.64, 1)`). This class is used nowhere else.

None of it tells the person anything. The filled icon form, the colour and
the gliding pill (`layoutId="nav-active-pill"`, lines 122-130) already say
which tab is open. At this frequency the decoration reads as a toy. The
press also only fires when the finger lands on the icon itself, because
framer's press gesture listens on the icon wrapper. Tapping the label or
the cell's padding gets no press feedback at all.

## Target

The house tap feedback from `DESIGN_GUIDE.md` §8: "`scale(0.97)` on
`:active`, 150ms `cubic-bezier(0.4,0,0.2,1)`". It goes on the icon and is
triggered by pressing anywhere in the cell. There is no grow and no hop.

```css
/* target — src/styles/components.css, inserted after the
   `.bottom-nav-link:focus-visible` rule (lines 73-76) */
/* Tab press: the house tap feedback (DESIGN_GUIDE §8) on the icon, from
   anywhere in the cell. It was a loose spring to 0.85 plus a grow and a
   hop on the open tab: on the most-pressed control in the app that read
   as a toy, and the filled icon and the pill already say which tab is
   open. The pill (layoutId) is not scaled, so its glide measures true. */
.bottom-nav-icon {
  transition: transform var(--ds-transition-fast);
}
.bottom-nav-link:active .bottom-nav-icon {
  transform: scale(0.97);
}
```

`--ds-transition-fast` is `150ms cubic-bezier(0.4, 0, 0.2, 1)`
(`src/styles/tokens.css:112`), which is exactly the house press.

```tsx
/* target — src/components/BottomNavigation.tsx, replacing lines 132-174
   and the matching `</motion.div>` at line 189 */
                    <div className="bottom-nav-icon relative z-10">
                      {/* DS3's own tab icons: an outline, and a
                          filled form drawn for the open tab. */}
                      <Icon active={isActive} className="size-[22px]" />
                      {/* Notification badge */}
                      {/* …the existing badge comment and hasBadge block,
                          unchanged… */}
                    </div>
```

Under Reduce Motion, the global reset (`src/styles/animations.css:73-81`)
cuts the transition to 0.01ms, so the press is an instant 3% step. That is
the same as every `.pressable` and `Button` in the app. Today Reduce Motion
gets no press feedback on tabs at all. A 3% scale is feedback, not
movement, so it is kept.

## Repo conventions to follow

- `.pressable` (`src/styles/components.css:134-140`) is the house press, and
  this rule mirrors it. The descendant selector exists only because the
  pressed element (the `<a>`) is not the scaled one (the icon).
- Tab bar styling lives with the other `.bottom-nav-*` rules in
  `src/styles/components.css:30-113`.
- `src/lib/__tests__/stylesUsage.test.ts` fails on a declared class or
  keyframe nothing uses. That is why the bounce class and its keyframe
  must both go.

## Steps

1. `src/components/BottomNavigation.tsx`: replace the outer icon wrapper's
   opening `<motion.div …>` (lines 132-153) with
   `<div className="bottom-nav-icon relative z-10">`. Delete the
   `tabIndex={-1}` and its comment. A plain `div` is not focusable, and
   without `whileTap` framer no longer writes a tabindex.
2. Same file: delete the inner `<motion.div initial={false} animate={{ scale … }} …>`
   (lines 154-164) and its closing `</motion.div>` (line 174). Keep the
   comment and the `<Icon>` that were inside it.
3. Same file: the `<Icon>` (lines 167-173) becomes
   `<Icon active={isActive} className="size-[22px]" />`.
4. Same file: the closing `</motion.div>` of the outer wrapper (line 189,
   just after the `hasBadge` block) becomes `</div>`.
5. Same file: keep the `motion` and `LayoutGroup` imports, because the pill
   still uses them. Keep `prefersReducedMotion`, because the pill branch
   (lines 118-131) still reads it. Keep `cn`, because the `<Link>` className
   still uses it. Run `npm run lint` to confirm nothing is left unused.
6. `src/styles/animations.css`: delete lines 38-52 (the
   `TAB BAR ICON BOUNCE` comment, `@keyframes ds-tab-bounce` and
   `.ds-tab-active-icon`) and the blank line after them.
7. `src/styles/components.css`: insert the CSS block under **Target** after
   the `.bottom-nav-link:focus-visible` rule (ends line 76), with one blank
   line before and after it.

## Boundaries

- Do NOT touch the active pill (lines 113-131). Its `layoutId` glide on a
  600/38 spring is the one tab-bar animation with a job: it shows where you
  went.
- Do NOT scale the `<Link>` or the pill. Scaling an ancestor of a
  `layoutId` element mid-glide corrupts framer's measurement, and the pill
  snaps at the end.
- Do NOT change the haptic, `preloadTab` or any of the cell's classes.
- Do NOT add a press effect to the label separately.
- Do NOT add dependencies.
- If the code at the cited lines does not match this plan (drift since
  1ad7dd6a), STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npx vitest run src/components/__tests__/phantomTabStops.test.tsx src/components/icons/__tests__/TabIcons.test.tsx src/lib/__tests__/stylesUsage.test.ts`
    passes. `phantomTabStops` proves the bar still adds no stray tab stops.
  - `grep -rn "ds-tab-active-icon\|ds-tab-bounce" src` prints nothing.
  - `npx tsc -b` and `npm run lint` pass. For lint, read the `✖` summary line
    or the exit code.
  - `npm run verify` passes.
- **Feel check**: run `npm run dev` with the mobile emulator, signed in:
  - Press and hold a tab's label, then its icon, then the empty space beside
    it. Each time, the icon settles slightly smaller within 150ms and stays
    there while held, with no wobble. On release it returns with no
    overshoot.
  - Tap through all five tabs. The pill glides between cells as before. The
    newly open icon neither grows nor hops: it just switches to its filled
    form.
  - In the Animations panel at 10% playback, the icon's transform goes
    `none` → `scale(0.97)` along a smooth ease with no overshoot past 0.97,
    and no `translateY` appears anywhere on the icon.
  - Under emulated `prefers-reduced-motion: reduce`, pressing still shows
    the 3% step instantly. The pill does not glide (unchanged, it is a
    static `div` there).
  - Keyboard: Tab through the bar. There is exactly one stop per tab, as before.
- **Done when**: the icon wrapper is a plain `div` with class
  `bottom-nav-icon`. No `whileTap`, inner scale `motion.div`,
  `ds-tab-active-icon` or `ds-tab-bounce` remains. While a cell is pressed,
  `getComputedStyle(icon).transform` reads `matrix(0.97, 0, 0, 0.97, 0, 0)`.

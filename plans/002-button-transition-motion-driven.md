# 002 — Let framer own the motion of the buttons it animates

- **Status**: TODO
- **Commit**: 1ad7dd6a
- **Severity**: HIGH
- **Category**: Performance / interruptibility
- **Estimated scope**: 1 CSS rule, 1 attribute on 8 elements in 6 files, 1 new test file

## Problem

`src/index.css:601-608` gives every button a CSS transition on `transform`
and `opacity`. The rule is unlayered, so it beats every Tailwind utility.

```css
/* src/index.css:601-608 — current */
/* ─── SMOOTH TRANSITIONS FOR INTERACTIVE ELEMENTS ─────────── */
button,
[role="button"] {
  transition:
    transform 120ms cubic-bezier(0.4, 0, 0.2, 1),
    background-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

Framer Motion animates by writing a new inline `transform` / `opacity` value
every frame. On a button, each of those writes starts a fresh 120–150ms CSS
transition from wherever the element currently is. So the element trails its
own animation. Measured in Chromium during the audit: a `[role="button"]`
given a 100px transform had moved **5.6px after two frames**.

You can feel this in eight places, all of them framer-driven buttons:

| Location | What framer drives | What it feels like |
| --- | --- | --- |
| `src/components/food/FoodRow.tsx:342-366` (`motion.div`, `role="button"`, `drag="x"`, `style={{ x }}`) | transform, every pointer move | swipe-to-delete trails the finger and keeps sliding after release |
| `src/components/food/FoodRow.tsx:320-338` (`motion.button`, `style={{ opacity: deletePanelOpacity }}`) | opacity, flipped 0/1 by the drag | the red panel fades in late behind the row |
| `src/components/program/ExercisePicker.tsx:276-285` (`motion.button` Cancel) | opacity + width on enter/exit | fades lag the width, so the exit pops |
| `src/components/program/ProgrammeSettings.tsx:198-` (`motion.button`, `initial={{ opacity: 0, y: 8 }}`) | transform + opacity entrance | soft, late entrance |
| `src/components/program/RunPlanSettings.tsx:615-` (`motion.button`, `whileTap={{ scale: 0.98 }}`) | transform on press | press lands after the finger |
| `src/components/home/FirstMealCard.tsx:23` (`motion.button`, `whileTap={{ scale: 0.97 }}`) | transform on press | same |
| `src/features/streaks/BadgeEarnedModal.tsx:307` (seal `motion.button`, `whileTap={reduce ? undefined : { scale: 0.9 }}`, spring 500/24) | transform on press | each crack's compress is mushy, so the spring never snaps |
| `src/features/streaks/BadgeEarnedModal.tsx:512` ("Nice" `motion.button`, `initial={{ opacity: 0 }}`) | opacity entrance | late fade |

The draggable row, verbatim:

```tsx
/* src/components/food/FoodRow.tsx:342-356 — current */
        <motion.div
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: OPEN_OFFSET, right: 0 }}
          dragElastic={{ left: 0.7, right: 0 }}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          onTap={handleTap}
          style={{ x }}
          animate={{ x: targetX }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
          role="button"
          tabIndex={0}
          aria-label={`Edit ${group.foodName}`}
```

These are the only eight. On 1ad7dd6a, `grep -rn "<motion\.button" src` finds
seven, and the FoodRow `motion.div` is the only `motion.*` element carrying
`role="button"`.

## Target

Elements framer drives opt out of the `transform` and `opacity` transitions.
They keep the colour fades, which framer never touches.

```css
/* target — src/index.css, inserted directly after the rule at lines 601-608 */
/* Framer drives transform and opacity on these itself, a new value every
   frame. A CSS transition on the same properties re-eases each value from
   wherever the element is, so the element trails its own animation: 5.6px
   of a 100px move after two frames, measured in Chromium. Colour fades
   stay. Mark every motion element that is a button `data-motion-driven`;
   motionDrivenButtons.test.ts holds them to it. */
button[data-motion-driven],
[role="button"][data-motion-driven] {
  transition:
    background-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

Specificity does the work. Both rules are unlayered, and
`button[data-motion-driven]` (0,1,1) beats `button` (0,0,1), while
`[role="button"][data-motion-driven]` (0,2,0) beats `[role="button"]` (0,1,0).

Each of the eight elements gains the bare attribute `data-motion-driven`.

## Repo conventions to follow

- Data attributes as behaviour opt-outs are the house pattern. FoodRow
  already carries `data-swipe-card`, which tells `useSwipeNavigation` to stand
  down, with a comment saying why (`src/components/food/FoodRow.tsx:304-309`).
  Put `data-motion-driven` straight after the element's opening `<motion.x`
  line, before its other props, so it reads first.
- File-scanning guard tests live beside the thing they guard and say why
  in a header comment. See `src/lib/__tests__/stylesUsage.test.ts:1-17`.
  The walker shape below is taken from there.

## Steps

1. `src/index.css`: insert the CSS block under **Target** directly after
   line 608 (the closing `}` of the `button, [role="button"]` rule), with
   one blank line before it. Do not edit the existing rule.
2. Add `data-motion-driven` as the first prop of each element:
   - `src/components/food/FoodRow.tsx:320`: `<motion.button` →
     `<motion.button` then a new line `data-motion-driven`.
   - `src/components/food/FoodRow.tsx:342`: `<motion.div` (the one with
     `drag="x"`) → add `data-motion-driven` as its first prop. Leave the
     outer `motion.div` at line 301 alone, since it is not a button.
   - `src/components/program/ExercisePicker.tsx:276`
   - `src/components/program/ProgrammeSettings.tsx:198`
   - `src/components/program/RunPlanSettings.tsx:615`
   - `src/components/home/FirstMealCard.tsx:23`
   - `src/features/streaks/BadgeEarnedModal.tsx:307` (the seal)
   - `src/features/streaks/BadgeEarnedModal.tsx:512` (the "Nice" button)
3. Create `src/styles/__tests__/motionDrivenButtons.test.ts`:

   ```ts
   /**
    * Framer owns the transform and opacity of the elements it animates. The
    * global `button, [role="button"]` rule in index.css puts a CSS transition
    * on both, so every value framer wrote was re-eased by the browser and
    * arrived late: a swiped food row trailed the finger, a whileTap pressed in
    * after the tap. `data-motion-driven` takes an element out of those two
    * transitions (index.css). This holds every motion button to it, so the
    * next one cannot quietly lag.
    */
   import { describe, it, expect } from "vitest";
   import { readFileSync, readdirSync, statSync } from "node:fs";
   import { fileURLToPath } from "node:url";
   import { dirname, resolve, relative } from "node:path";

   const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

   function walk(dir: string, out: string[] = []): string[] {
     for (const name of readdirSync(dir)) {
       const full = resolve(dir, name);
       if (statSync(full).isDirectory()) {
         if (name === "__tests__" || name === "test") continue;
         walk(full, out);
       } else if (full.endsWith(".tsx")) out.push(full);
     }
     return out;
   }

   /** Comments blanked to spaces, so line numbers survive and a `>` inside
    *  a comment cannot end a tag early. */
   const blankComments = (s: string) =>
     s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

   /** The opening tag that starts at `start`: up to the first `>` outside
    *  every `{…}`, so arrow functions in props do not end it. */
   function openingTag(src: string, start: number): string {
     let depth = 0;
     for (let i = start; i < src.length; i++) {
       const c = src[i];
       if (c === "{") depth++;
       else if (c === "}") depth--;
       else if (c === ">" && depth === 0) return src.slice(start, i + 1);
     }
     return src.slice(start);
   }

   describe("motion buttons opt out of the global button transition", () => {
     it("the opt-out keeps colour fades and drops transform and opacity", () => {
       const css = blankComments(
         readFileSync(resolve(repoRoot, "src/index.css"), "utf8")
       );
       const rule = css.match(
         /button\[data-motion-driven\],\s*\[role="button"\]\[data-motion-driven\]\s*\{([^}]*)\}/
       );
       expect(rule, "no data-motion-driven rule in src/index.css").not.toBeNull();
       const body = rule![1];
       expect(body).toMatch(/background-color/);
       expect(body).not.toMatch(/transform|opacity|\ball\b/);
     });

     it("every motion button carries data-motion-driven", () => {
       const offenders: string[] = [];
       let seen = 0;
       for (const file of walk(resolve(repoRoot, "src"))) {
         const src = blankComments(readFileSync(file, "utf8"));
         for (const m of src.matchAll(/<motion\.([a-z]+)\b/g)) {
           const tag = openingTag(src, m.index!);
           const isButton = m[1] === "button" || /role="button"/.test(tag);
           if (!isButton) continue;
           seen++;
           if (!/\bdata-motion-driven\b/.test(tag)) {
             const line = src.slice(0, m.index).split("\n").length;
             offenders.push(`${relative(repoRoot, file)}:${line}`);
           }
         }
       }
       // The scan has to be finding them, or the guard proves nothing.
       expect(seen).toBeGreaterThanOrEqual(8);
       expect(
         offenders,
         "A motion element that is a button needs data-motion-driven, or " +
           "index.css's button transition re-eases every frame framer writes:\n" +
           offenders.join("\n")
       ).toEqual([]);
     });
   });
   ```

## Boundaries

- Do NOT move the global button rule into `@layer base`, and do NOT edit it.
  Moving it would hand every button with a `transition-*` utility a new
  transition, which is a wider change with its own audit. It is listed as a
  follow-up in `plans/README.md`.
- Do NOT touch the dead `transition-transform duration-150` in
  `src/components/ui/buttonClasses.ts:31` or `src/components/ui/IconButton.tsx:56`.
  It is dead for the same reason (the unlayered rule wins), and is the same
  follow-up.
- Do NOT change any animation value (springs, durations, `whileTap` scales)
  in the eight files. The attribute is the only edit there.
- Do NOT add `data-motion-driven` to non-button motion elements. The global
  rule never applies to them.
- Do NOT add dependencies.
- If a cited line no longer holds the element described (drift since
  1ad7dd6a), find it by its description. If it is gone or changed shape,
  STOP and report.

## Verification

- **Mechanical**:
  - `npx vitest run src/styles/__tests__/motionDrivenButtons.test.ts` passes.
    Then delete `data-motion-driven` from one element and confirm the test
    fails and names that `file:line`. Restore it.
  - `npm run lint` passes: read the `✖` summary line or the exit code.
  - `npm run verify` passes.
- **Feel check**: run `npm run dev` with the mobile emulator on (DevTools device toolbar):
  - **Food → a logged row:** swipe left slowly. The row stays exactly under
    the finger, with no rubber-band lag. Release it half open: it springs to
    the open stop and stops dead, with no extra drift after the spring
    settles. Swipe back: the red panel disappears as the row closes, not
    after.
  - **Home → First meal card** (a new account's first days): press and hold.
    It compresses as the finger lands, not a beat later.
  - **Settings → Programme / Run plan option cards:** they arrive crisply.
    In the Animations panel at 10%, each card's y and opacity finish together
    at 0.18s, with no tail after framer's animation ends.
  - **Badge modal** (`/dev/badge-seal`, which exists in dev builds): tap the seal quickly
    several times. Each tap compresses and springs back. The spring's
    overshoot is visible, not smeared.
  - Hover or press an ordinary `Button`: its background colour still fades,
    the same as before.
- **Done when**: in DevTools, the computed `transition-property` of each of
  the eight elements is `background-color, color`. The FoodRow drag tracks
  the pointer frame for frame: in a Performance recording, while the row is
  inside its open range, its translateX equals the pointer delta on every
  frame of the drag. The guard
  test passes.

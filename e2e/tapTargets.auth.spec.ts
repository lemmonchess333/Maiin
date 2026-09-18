/**
 * Form controls clear the 44px floor, measured rather than asserted in CSS.
 *
 * CLAUDE.md names "every interactive element clears 44px" as one of three
 * invariants that "regress constantly and keep getting swept up after the
 * fact", and says it cannot be lint-enforced. That is true of buttons and
 * pressable cards — a small glyph can carry a 44px hit area through a
 * `before:-inset-2` pseudo-element, which no source scan and no
 * `getBoundingClientRect` on the element itself can see.
 *
 * It is NOT true of `select`, `input` and `textarea`. Those have no
 * pseudo-element trick, are never inline prose, and their rendered height
 * is exactly the thing that matters. So they are measurable, and this
 * measures them.
 *
 * It found five under the floor, all hand-rolled rather than through
 * `.ds-input` (the primitive nine of the app's fourteen selects already
 * use): the default-visibility select at 30px, the rest-timer select at
 * 30px, the streak-reminder time input at 31px, and the privacy-zone name
 * input and radius select at 38px. A 30px select is the smallest control
 * in the app — under the 44px product target and under even the `sm`
 * button floor of 36px.
 *
 * A source-level version of this rule was tried first and rejected with
 * numbers: 46 of the app's 99 form controls carry no explicit `ds-input`
 * or `min-h-11`, because most reach 44px through padding plus line height,
 * and several build their class from a shared constant a scanner cannot
 * resolve. A gate needing 46 exceptions is scenery. Measuring the rendered
 * box resolves all of that and reported five.
 *
 * SCOPE. It walks routes and measures what each renders; it opens no
 * sheets, so the controls inside `RunSetupModal`, `EditServingsSheet` and
 * the composers are not covered here. `sr-only` controls are skipped —
 * the date input behind the Food date bar is deliberately 1x1 and driven
 * by a visible control.
 */
import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { suppressCoachmarks } from "./helpers/suppressCoachmarks";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

/** The Tropos product target (DESIGN_GUIDE §10), not the WCAG AA floor. */
const FLOOR_PX = 44;

const ROUTES = [
  "",
  "food",
  "history",
  "program",
  "social",
  "review",
  "upgrade",
  "settings",
  "settings/profile",
  "settings/account",
  "settings/nutrition",
  "settings/training",
  "settings/run-plan",
  "settings/lift-plan",
  "settings/workout-prefs",
  "settings/shoes",
  "settings/notifications",
  "settings/privacy",
  "settings/units-appearance",
  "settings/subscription",
] as const;

test.describe("form controls clear the touch floor", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );
  test.setTimeout(180_000);

  test("no select, input or textarea renders under the floor", async ({
    page,
  }) => {
    await suppressCoachmarks(page);
    await signInAsTestUser(page);

    const short: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route || "./");
      // Not `networkidle`: Firestore holds a long-poll open, so it never
      // fires and the sweep times out.
      await page.waitForTimeout(1500);

      const found = await page.evaluate((floor) => {
        const out: string[] = [];
        const controls = document.querySelectorAll(
          'select, textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])'
        );
        for (const el of Array.from(controls)) {
          if (el.closest(".sr-only") || el.classList.contains("sr-only"))
            continue;
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none")
            continue;
          if (box.height >= floor) continue;
          const name =
            (el.getAttribute("aria-label") ?? "") ||
            (el.getAttribute("placeholder") ?? "") ||
            (el.getAttribute("name") ?? "");
          out.push(
            `${Math.round(box.height)}px <${el.tagName.toLowerCase()}> ` +
              `${JSON.stringify(name.slice(0, 40))} ` +
              `cls=${JSON.stringify((el.getAttribute("class") ?? "").slice(0, 70))}`
          );
        }
        return out;
      }, FLOOR_PX);

      for (const f of found) short.push(`${route || "/"}: ${f}`);
    }

    expect(
      short,
      `A select / input / textarea shorter than ${FLOOR_PX}px. Give it ` +
        "`.ds-input` (which sets the height and the app's focus ring) or, " +
        "for a control sitting inline in a settings row where full width " +
        "would break the layout, `min-h-11` with the padding it needs."
    ).toEqual([]);
  });

  test("the measurement would catch a short control", async ({ page }) => {
    /* Positive control. Twenty routes reporting nothing is also what a
       broken selector produces, so prove the probe measures before
       trusting a clean sweep. */
    await page.goto("./");
    const measured = await page.evaluate((floor) => {
      const host = document.createElement("div");
      host.innerHTML = `
        <select style="height:30px"><option>a</option></select>
        <input style="height:31px">
        <textarea style="height:20px"></textarea>
        <select style="height:44px"><option>a</option></select>
        <input style="height:48px">
        <input class="sr-only" style="height:1px">
        <input type="checkbox" style="height:12px">`;
      document.body.appendChild(host);
      const controls = host.querySelectorAll(
        'select, textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])'
      );
      const heights: number[] = [];
      for (const el of Array.from(controls)) {
        if (el.classList.contains("sr-only")) continue;
        const h = el.getBoundingClientRect().height;
        if (h > 0 && h < floor) heights.push(Math.round(h));
      }
      host.remove();
      return heights.sort((a, b) => a - b);
    }, FLOOR_PX);
    // The three short ones, and nothing else: the 44 and 48 clear the
    // floor, the sr-only one is skipped, the checkbox is out of scope.
    expect(measured).toEqual([20, 30, 31]);
  });
});

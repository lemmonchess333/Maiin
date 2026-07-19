/**
 * Desktop wheel-scroll regression net.
 *
 * Born from a 2026-07-19 field report: "can't scroll on the desktop
 * version". The investigation cleared the app (the report reproduced only
 * in the reporter's browser), but along the way we proved there was NO
 * automated guard that the authed app's pages scroll at all on a desktop
 * viewport — a total-blocker class of bug (a leaked vaul/react-remove-scroll
 * lock, a stuck full-screen overlay, or a non-passive wheel preventDefault
 * would each kill it silently). This spec pins the contract directly:
 *
 *   1. Home renders taller than a desktop viewport for the seeded user,
 *      the document is scrollable (a leaked overflow/position lock fails
 *      this), and a cancelable wheel event is NOT consumed by the app.
 *   2. No non-passive wheel/touchmove listener is registered on
 *      window/document/html/body at rest (passive listeners cannot
 *      preventDefault, so they can never block scrolling).
 *
 * A real `mouse.wheel` gesture is deliberately not asserted: CI's headless
 * shell doesn't reproduce wheel input reliably (0px moved on CI vs 858px
 * locally), and the input pipeline is the browser's contract, not ours.
 *
 * Routed into the gated auth-emulator project via the *.auth.spec.ts name.
 */
import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";

test.describe("desktop wheel scrolling", () => {
  test.skip(!emulatorActive, "Requires emulator env");

  test("Home is scrollable, wheel is not consumed, and no non-passive lock exists at rest", async ({
    page,
  }) => {
    // Record every wheel/touchmove registration on the shell targets with
    // its passive flag, BEFORE any app code runs.
    await page.addInitScript(() => {
      const log: { type: string; target: string; passive: boolean }[] = [];
      (window as unknown as { __wheelListeners: typeof log }).__wheelListeners =
        log;
      const orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (
        type: string,
        listener: unknown,
        opts?: unknown
      ) {
        if (type === "wheel" || type === "touchmove") {
          const shellTarget =
            this === window ||
            this === document ||
            this === document.documentElement ||
            this === document.body;
          if (shellTarget) {
            const o = opts as { passive?: boolean } | boolean | undefined;
            log.push({
              type,
              target:
                this === window
                  ? "window"
                  : this === document
                    ? "document"
                    : this === document.documentElement
                      ? "html"
                      : "body",
              passive: typeof o === "object" && o !== null && !!o.passive,
            });
          }
        }
        return orig.call(
          this,
          type,
          listener as EventListener,
          opts as boolean
        );
      };
    });

    await signInAsTestUser(page);
    await page.goto("/Maiin/");
    // Let Home hydrate past skeletons so the page reaches full height.
    await page.waitForTimeout(4000);

    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    // The seeded user's Home must overflow a desktop viewport — otherwise
    // the assertions below would pass vacuously.
    expect(scrollHeight).toBeGreaterThan(innerHeight);

    // The document must be scrollable: setting scrollTop directly (with
    // smooth-scroll disabled for the measurement) must move the page. A
    // leaked scroll lock (html/body overflow:hidden or position:fixed)
    // fails this. NOTE: a real `mouse.wheel` gesture is deliberately NOT
    // asserted — CI's headless shell doesn't reproduce wheel input
    // reliably (0px on CI, 858px locally/headed); the app-side contract
    // is scrollability + not consuming the event, both deterministic.
    const scrolled = await page.evaluate(() => {
      const de = document.documentElement;
      const prev = de.style.scrollBehavior;
      de.style.scrollBehavior = "auto";
      de.scrollTop = 400;
      const moved = de.scrollTop;
      de.scrollTop = 0;
      de.style.scrollBehavior = prev;
      return moved;
    });
    expect(scrolled).toBeGreaterThan(0);

    // The app must not CONSUME wheel events: a cancelable synthetic wheel
    // dispatched at the page centre must come back un-defaultPrevented
    // (react-remove-scroll / a leaked vaul lock would preventDefault it).
    const wheelPrevented = await page.evaluate(() => {
      const ev = new WheelEvent("wheel", {
        deltaY: 120,
        bubbles: true,
        cancelable: true,
      });
      (document.elementFromPoint(200, 400) ?? document.body).dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(wheelPrevented).toBe(false);

    // No shell-level wheel/touchmove listener may be non-passive at rest.
    // (A non-passive listener is the only kind that can preventDefault a
    // scroll — vaul/react-remove-scroll register exactly that while a
    // drawer is open; none may leak into the resting state.)
    const listeners = await page.evaluate(
      () =>
        (
          window as unknown as {
            __wheelListeners: {
              type: string;
              target: string;
              passive: boolean;
            }[];
          }
        ).__wheelListeners
    );
    const nonPassive = listeners.filter((l) => !l.passive);
    expect(
      nonPassive,
      `non-passive shell scroll listeners at rest: ${JSON.stringify(nonPassive)}`
    ).toEqual([]);
  });
});

/**
 * The notch and the home bar are handled once, by the page.
 *
 * Two layers can make room for them on iOS: the web view (Capacitor's
 * `ios.contentInset`, which sets the scroll view's
 * `contentInsetAdjustmentBehavior`) and the page (`viewport-fit=cover` with
 * `env(safe-area-inset-*)` padding). Tropos pads in the page, through
 * `--safe-top` and `--safe-bottom`, because its floating tab bar and its
 * full-screen surfaces need to draw to the screen's edges.
 *
 * With the web view insetting as well, a phone shows all of this at once:
 * a black bar the height of the status bar above every page until it is
 * scrolled, the page jumping up by that height on the first scroll, a black
 * bar the height of the home bar under the tab bar at a page's end, and
 * both bars permanently on a screen that does not scroll. `100vh` is also
 * short of the screen by both insets, which is what moves the launch mark
 * when the web layer takes over from the launch image.
 *
 * None of that can be seen from here or from the capture rig, which films
 * the web build. This pins the two halves of the arrangement to each
 * other, so one cannot change without the other.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

/** The value of `ios.contentInset` in capacitor.config.ts, or null if the
 *  key is absent (Capacitor's default is "never"). */
function iosContentInset(): string | null {
  const config = read("capacitor.config.ts");
  const ios = config.match(/\n {2}ios:\s*\{([\s\S]*?)\n {2}\},/);
  if (!ios) throw new Error("capacitor.config.ts has no top-level ios block");
  const value = ios[1].match(/^\s*contentInset:\s*"([a-zA-Z]+)"/m);
  return value ? value[1] : null;
}

describe("iOS safe areas are handled once", () => {
  it("the page draws to the screen's edges", () => {
    const viewport = read("index.html").match(
      /name="viewport"\s+content="([^"]+)"/
    );
    expect(viewport?.[1]).toContain("viewport-fit=cover");
  });

  it("the page pads for the notch and the home bar", () => {
    const css = read("src/index.css");
    expect(css).toMatch(/--safe-top:\s*env\(safe-area-inset-top/);
    expect(css).toMatch(/--safe-bottom:\s*env\(safe-area-inset-bottom/);
  });

  it("so the web view does not inset for them as well", () => {
    expect(
      iosContentInset() ?? "never",
      "The page already pads by --safe-top and --safe-bottom. With the web " +
        "view insetting too, every page gets a black bar above it until it " +
        "is scrolled and one under the tab bar at its end. If the web view " +
        "is to own the insets instead, take the page's padding out in the " +
        "same change."
    ).toBe("never");
  });
});

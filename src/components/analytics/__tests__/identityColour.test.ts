import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A sport or brand identity colour is a FILL — a chart stroke, a bar, an
 * icon, a tint. It is not a text colour. `--running` measures 3.58:1 on
 * the light card and `--lifting` / `THEME.brand` 3.87:1 (3.28:1 on the
 * page), all under the 4.5:1 AA floor for the small text Analytics spends
 * them on; the `-strong` steps exist for exactly this and clear 5-7:1 in
 * both themes. `index.css` says so at the token definitions, and
 * `tokenContrast.test.ts` pins the measurements — but nothing stopped a
 * component reaching past the class system with an inline
 * `style={{ color: THEME.running }}` on a word.
 *
 * Analytics had four such sites: the Performance section heading (three
 * render branches of it) and the Training-load legend's "Fitness N",
 * "runs" and "lifts". They are now `text-lifting-strong` /
 * `text-running-strong`.
 *
 * Icons are the legitimate use and stay — SC 1.4.11's floor for a
 * non-text graphic is 3:1, which the identities clear, and an icon is
 * never the only carrier of meaning on these surfaces. So this is an
 * allow-list rather than a ban: every `color: THEME.<identity>` in
 * `src/components/analytics` must be named here with the reason it is
 * not text. A new one fails until someone classifies it.
 */
const ALLOWED = new Map<string, string[]>([
  ["PRsTab.tsx", ["Trophy"]],
  ["TrainingLoadCard.tsx", ["Activity"]],
  ["PeriodOverview.tsx", ["UtensilsCrossed"]],
]);

const DIR = join(process.cwd(), "src/components/analytics");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory())
      return name === "__tests__" ? [] : tsxFiles(p);
    return name.endsWith(".tsx") || name.endsWith(".ts") ? [p] : [];
  });
}

/** Only `color:` INSIDE a `style={{ … }}` expression — the shape that
 *  paints an element. A bare `color: THEME.x` in an object literal is
 *  data: PeriodOverview feeds one to its ring's `stroke` and
 *  PerformanceIndexChart feeds one to a legend dot's `backgroundColor`.
 *  Matching those too would make the allow-list a list of everything and
 *  stop meaning anything. */
const STYLE_PROP = /style=\{\{([\s\S]*?)\}\}/g;
const IDENTITY_COLOUR = /\bcolor:\s*THEME\.(running|lifting|brand)\b/g;

/** The JSX tag each identity-coloured `style` prop is attached to, in
 *  source order. Resolving the ELEMENT — not just counting sites — is
 *  what makes the allow-list mean something: a file keeps its entry when
 *  its icon stays an icon, and fails the moment that same site becomes a
 *  `<span>` or a `<p>`. A bare count would pass straight through that
 *  swap. */
function identityColouredTags(src: string): string[] {
  const tags: string[] = [];
  for (const m of src.matchAll(STYLE_PROP)) {
    if (![...m[1].matchAll(IDENTITY_COLOUR)].length) continue;
    const before = src.slice(0, m.index ?? 0);
    const open = [...before.matchAll(/<([A-Za-z][A-Za-z0-9.]*)/g)].pop();
    tags.push(open ? open[1] : "<unresolved>");
  }
  return tags;
}

/** lucide icons only. An icon is a non-text graphic (SC 1.4.11's 3:1
 *  floor, which the identities clear) and never the sole carrier of
 *  meaning on these surfaces. */
const ICON_TAGS = new Set(["Trophy", "Activity", "UtensilsCrossed"]);

describe("Analytics never paints text with a bare identity colour", () => {
  it("every identity-coloured style prop sits on a classified icon", () => {
    const found = new Map<string, string[]>();
    for (const file of tsxFiles(DIR)) {
      const tags = identityColouredTags(readFileSync(file, "utf8"));
      if (tags.length) found.set(file.slice(DIR.length + 1), tags);
    }
    const unexpected = [...found.entries()]
      .filter(([f, tags]) => {
        const allowed = ALLOWED.get(f) ?? [];
        return (
          tags.length !== allowed.length ||
          tags.some((t, i) => t !== allowed[i] || !ICON_TAGS.has(t))
        );
      })
      .map(([f, tags]) => `${f}: <${tags.join(">, <")}>`);
    expect(
      unexpected,
      "A bare identity colour is a FILL, not a text colour — purple " +
        "measures 3.87:1 and coral 3.58:1 on the light card, under the " +
        "4.5:1 floor. Use text-lifting-strong / text-running-strong for " +
        "words. If this really is an icon, add its tag to ALLOWED and " +
        "ICON_TAGS."
    ).toEqual([]);
  });
});

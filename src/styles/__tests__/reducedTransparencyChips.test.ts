/**
 * Reduce Transparency reaches every frosted surface (DS6, DESIGN_GUIDE
 * §14o: "a solid fallback under Reduce Transparency"). The tab bar, the
 * status bar's scrim, the toasts and the workout's docked cards draw
 * their glass in a stylesheet with its own fallback (`tabBarGlass`,
 * `sheetToastGlass`, `dockGlass`). The rest were Tailwind `backdrop-blur`
 * classes with none: a Space's hero chips, the directory's chips, the run
 * map's chips and controls, a run's Back and Replay, the comment bar and
 * the plan editors' sticky footers.
 *
 * Read from the source, comments dropped: a string that carries a
 * `backdrop-blur` class also carries `transparency-reduce:backdrop-blur-none`
 * and a solid `transparency-reduce:bg-*`, the variant `src/index.css`
 * keys on the attribute `reducedTransparency.ts` sets. Taking the blur off
 * alone would leave a 55% fill over a busy photo, which reads worse than
 * the frosted one. A fill set inline (which a button variant's hover tint
 * cannot grey on a pointer) needs the important form, `bg-black!`, to win
 * over the style: a blurred class string with a `background` style within
 * a few lines of it is held to that form. Single-quoted strings are not
 * read: the house style writes class strings in double quotes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";

const FILES = globSync("src/**/*.{ts,tsx}", { cwd: process.cwd() }).filter(
  (f) => !f.includes("__tests__") && !f.includes("/dev/") && !/\.test\./.test(f)
);

interface Literal {
  file: string;
  line: number;
  text: string;
}

/** Every `"…"` and `` `…` `` outside a comment. */
function literals(file: string, src: string): Literal[] {
  const out: Literal[] = [];
  const lineAt = (i: number) => src.slice(0, i).split("\n").length;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (c === '"' || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && !(c === '"' && src[j] === "\n"))
        j += src[j] === "\\" ? 2 : 1;
      out.push({ file, line: lineAt(i), text: src.slice(i + 1, j) });
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

/** A template's `${…}` and a quoted class inside it end a class as a
 *  space does (`${photo ? "bg-black/55 backdrop-blur-sm" : ""}`). */
const words = (text: string) => text.split(/[\s"']+|\$\{|\}/);

/** A class that blurs: `backdrop-blur`, `-sm` … `-3xl`, under any
 *  variant but the fallback's own. */
const blurs = (w: string) =>
  /^(?:[a-z0-9-]+:)*backdrop-blur(?:-(?:xs|sm|md|lg|xl|2xl|3xl))?!?$/.test(w) &&
  !w.startsWith("transparency-reduce:");

const all = FILES.flatMap((f) => literals(f, readFileSync(f, "utf8")));
const blurred = all.filter((l) => words(l.text).some(blurs));
const where = (l: Literal) => `${l.file}:${l.line}`;

describe("Reduce Transparency reaches every frosted chip and bar (DS6, §14o)", () => {
  it("finds the blurred surfaces it guards", () => {
    // A reader that found nothing would pass every check below.
    expect(blurred.length).toBeGreaterThanOrEqual(12);
  });

  it("every backdrop-blur class string takes the blur off under Reduce Transparency", () => {
    const bare = blurred.filter(
      (l) => !words(l.text).includes("transparency-reduce:backdrop-blur-none")
    );
    expect(bare.map(where)).toEqual([]);
  });

  it("and draws a solid fill there, never the translucent one without its blur", () => {
    const see = blurred.filter((l) => {
      const fills = words(l.text).filter((w) =>
        w.startsWith("transparency-reduce:bg-")
      );
      // `bg-black/85` is still see-through; the setting asks for solid.
      return fills.length === 0 || fills.some((w) => /\/\d+!?$/.test(w));
    });
    expect(see.map(where)).toEqual([]);
  });

  it("a fill set inline is outranked by the important form", () => {
    // A blurred class string with a style that sets `background` close by
    // (the same element): only `!important` beats an inline style.
    const near = blurred.filter((l) => {
      const lines = readFileSync(l.file, "utf8").split("\n");
      const span = lines.slice(Math.max(0, l.line - 4), l.line + 12).join("\n");
      return /style=\{[\s\S]*?\bbackground\s*:/.test(span);
    });
    const weak = near.filter((l) =>
      words(l.text).some(
        (w) => w.startsWith("transparency-reduce:bg-") && !w.endsWith("!")
      )
    );
    expect(near.length).toBeGreaterThanOrEqual(3);
    expect(weak.map(where)).toEqual([]);
    // Space's chips set theirs far from the class constant, at each use.
    const space = readFileSync("src/pages/Space.tsx", "utf8");
    expect(space).toContain("style={photo ? { background: THEME.scrim }");
    expect(space).toMatch(
      /const PHOTO_CHIP =[^;]*transparency-reduce:bg-black!/
    );
  });

  it("no blur is set as a style prop, where the class's fallback cannot reach it", () => {
    const styled = FILES.filter((f) =>
      /\b(?:Webkit|webkit)?[bB]ackdropFilter\s*:/.test(readFileSync(f, "utf8"))
    );
    expect(styled).toEqual([]);
  });

  it("the variant keys on the attribute reducedTransparency.ts sets, after dark", () => {
    const css = readFileSync("src/index.css", "utf8");
    const variant = css.indexOf(
      "@custom-variant transparency-reduce (&:where([data-reduced-transparency], [data-reduced-transparency] *));"
    );
    expect(variant).toBeGreaterThan(-1);
    // Equal specificity: the later variant wins, so a solid fill is not
    // undone by a `dark:` fill on the same element.
    expect(variant).toBeGreaterThan(css.indexOf("@custom-variant dark"));
    const mod = readFileSync("src/lib/reducedTransparency.ts", "utf8");
    expect(mod).toContain(
      'REDUCED_TRANSPARENCY_ATTRIBUTE = "data-reduced-transparency"'
    );
  });
});

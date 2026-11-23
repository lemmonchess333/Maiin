/**
 * A surface's fill class is not wiped by an inline `background`.
 *
 * The `background` shorthand resets every background longhand, the colour
 * a `bg-*` class sets among them, so an element with both draws whatever
 * the style says and nothing else. PRCard set a 3% gold tint that way and
 * had no fill at all: on dark the lit edge (DS6, §14o) framed the page's
 * own colour. A tint over a fill is `backgroundImage`; a fill that
 * replaces the class's is `backgroundColor`, or no class.
 *
 * Read from the source, one opening tag at a time (a child's style is not
 * its parent's): a tag whose class sets a fill and whose style sets the
 * `background` shorthand fails.
 *
 * Its reach: the five theme fills below, written as classes on the same
 * tag as the style. It does not see `bg-white`, `bg-black` or the sport
 * fills, a class held in a constant (`PHOTO_CHIP`), or a `style` passed to
 * a component that owns the fill. Comments inside a style are read, so a
 * comment that says `background:` there fails it, loudly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";

const FILES = globSync("src/**/*.tsx", { cwd: process.cwd() }).filter(
  (f) => !f.includes("__tests__") && !f.includes("/dev/") && !/\.test\./.test(f)
);

/** Each JSX opening tag, `<Name … >`, with braces, strings and arrows
 *  inside it read through. */
function openingTags(src: string): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = [];
  const re = /<([A-Za-z][\w.]*)[\s>]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + 1 + m[1].length;
    let depth = 0;
    let quote: string | null = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && src[i - 1] !== "=") break;
      else if (c === "<" && depth === 0) break; // not a tag after all
    }
    out.push({ at: m.index, text: src.slice(m.index, i + 1) });
  }
  return out;
}

/** The value of a tag's className: a string, or a braced expression. */
function classValue(tag: string): string {
  const at = tag.search(/\bclassName=/);
  if (at === -1) return "";
  let i = at + "className=".length;
  if (tag[i] === '"') return tag.slice(i + 1, tag.indexOf('"', i + 1));
  if (tag[i] !== "{") return "";
  let depth = 0;
  const start = i;
  for (; i < tag.length; i++) {
    if (tag[i] === "{") depth++;
    else if (tag[i] === "}" && --depth === 0) break;
  }
  // Comments inside the expression are not classes.
  return tag.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, "");
}

/** A fill class with no variant: `bg-card`, `bg-muted/40`, never
 *  `hover:bg-muted` or `bg-muted-foreground`. */
const FILL =
  /(?<![\w:/-])bg-(?:card|muted|background|popover|secondary)(?![\w-])/;
const SHORTHAND = /\bstyle=\{[\s\S]*?(?<![\w-])background\s*:/;
const wipes = (tag: string) =>
  FILL.test(classValue(tag)) && SHORTHAND.test(tag);

/** Tags left as they are, by file and a piece of their text. */
const EXEMPT: { file: string; has: string; why: string }[] = [
  {
    file: "src/components/run/GpsSignalChip.tsx",
    has: "onPage ? undefined : { background: THEME.scrim }",
    why: "the fill class and the inline scrim are exclusive: bg-muted on the page, the scrim on the map",
  },
];

describe("an inline background does not wipe a fill class", () => {
  const tags = FILES.flatMap((file) => {
    const src = readFileSync(file, "utf8");
    const lineAt = (i: number) => src.slice(0, i).split("\n").length;
    return openingTags(src).map((t) => ({ ...t, file, line: lineAt(t.at) }));
  });

  it("reads the tags it guards", () => {
    expect(tags.length).toBeGreaterThan(5000);
    // The shape that was wrong reads as wrong.
    const old = openingTags(
      '<div className="rounded-xl bg-card" style={{ background: `linear-gradient(red, blue)` }}>'
    )[0].text;
    expect(wipes(old)).toBe(true);
    expect(wipes(old.replace("background:", "backgroundImage:"))).toBe(false);
    // A variant's fill, or another colour's name, is not the element's.
    expect(wipes(old.replace("bg-card", "hover:bg-card"))).toBe(false);
    expect(wipes(old.replace("bg-card", "bg-muted-foreground"))).toBe(false);
  });

  it("each exemption still excuses a tag, so a stale one is noticed", () => {
    for (const e of EXEMPT)
      expect(
        tags.some(
          (t) => t.file === e.file && t.text.includes(e.has) && wipes(t.text)
        ),
        `${e.file}: ${e.why}`
      ).toBe(true);
  });

  it("no tag sets a fill class and the background shorthand", () => {
    const wiped = tags.filter(
      (t) =>
        wipes(t.text) &&
        !EXEMPT.some((e) => e.file === t.file && t.text.includes(e.has))
    );
    expect(wiped.map((t) => `${t.file}:${t.line}`)).toEqual([]);
  });
});

/**
 * DS6 (DESIGN_GUIDE §14o): on dark, a card, a compact tile, a chip and a
 * pill button take a hairline of light along the top and a faint outline,
 * through the shadow tokens, so `card-shadow` stays the one place a card's
 * edge is set. Steps 1 and 2 put the edge on the tokens and the primitives;
 * about 120 hand-rolled surfaces never asked for it, so on dark they were
 * #17171B on a #0E0E11 page, 1.06:1, with no edge at all.
 *
 * Read from the source, as the other design guards read it: a class string
 * that draws a card (`bg-card` with a card's radius) carries `card-shadow`
 * (any variant, `dark:` for a surface whose light look is its own) or a
 * shadow of its own (a menu or a popover floating over the page); a tile
 * (`bg-muted` with a radius and a tile's padding) carries `chip-edge`. A
 * card with the edge and a border drops the border on dark, or the two
 * stack into a doubled edge.
 *
 * Inset edges are painted under a card's children, so a child that fills
 * the card to its rim (a media header, a full-bleed band) covers it there:
 * carrying the class is not the same as showing the edge, and only a
 * capture can tell. The exceptions below each carry their reason.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";

const FILES = globSync("src/**/*.tsx", { cwd: process.cwd() }).filter(
  (f) => !f.includes("__tests__") && !f.includes("/dev/") && !/\.test\./.test(f)
);

/** Surfaces left as they are, by file and a piece of their class string. */
const EXEMPT: { file: string; has?: string; why: string }[] = [
  { file: "src/pages/Diagnostics.tsx", why: "an operator page, unlinked" },
  { file: "src/pages/AdminModeration.tsx", why: "an operator page" },
  {
    file: "src/pages/Upgrade.tsx",
    why: "the Pro page's plans: an accent border is their edge",
  },
  {
    file: "src/components/ProModal.tsx",
    why: "the Pro sheet's notes, drawn with the Pro page",
  },
  { file: "src/App.tsx", why: "the crash screen's details" },
  {
    file: "src/components/analytics/StatCard.tsx",
    why: "its template literal already carries card-shadow",
  },
  {
    file: "src/components/program/UpcomingRacePicker.tsx",
    has: "race-pick-row",
    why: "its border is the selection",
  },
  {
    file: "src/features/challenges/ChallengeFinaleCard.tsx",
    has: "relative rounded-2xl bg-card border overflow-hidden p-4",
    why: "its border is the medal tier's colour",
  },
];

const STRING = /"([^"\n]*)"|`([^`]*)`/g;

interface Found {
  file: string;
  line: number;
  classes: string[];
  text: string;
}

function strings(): Found[] {
  const out: Found[] = [];
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(STRING)) {
      const text = m[1] ?? m[2] ?? "";
      out.push({
        file,
        line: src.slice(0, m.index).split("\n").length,
        classes: text.split(/\s+/),
        text,
      });
    }
  }
  return out;
}

const exempt = (f: Found) =>
  EXEMPT.some((e) => e.file === f.file && (!e.has || f.text.includes(e.has)));

const has = (f: Found, test: (c: string) => boolean) => f.classes.some(test);
const radius = (c: string) => /^rounded-(lg|xl|2xl)$/.test(c);
const edged = (c: string) => /(^|:)card-shadow$/.test(c) || c === "chip-edge";
const ownShadow = (c: string) => /^(dark:)?shadow-(sm|md|lg|xl|2xl)$/.test(c);
const where = (f: Found) => `${f.file}:${f.line}`;

describe("the lit edge on dark surfaces (DS6, §14o)", () => {
  const all = strings();

  it("every card drawn by hand carries the card's edge", () => {
    const bare = all.filter(
      (f) =>
        has(f, (c) => c === "bg-card") &&
        has(f, radius) &&
        !has(f, edged) &&
        !has(f, ownShadow) &&
        !f.text.includes("card-shadow") &&
        !exempt(f)
    );
    expect(bare.map(where)).toEqual([]);
  });

  it("every tile drawn by hand carries the tile's edge", () => {
    const bare = all.filter(
      (f) =>
        has(f, (c) => c === "bg-muted") &&
        has(f, radius) &&
        has(f, (c) => /^(p-(3|3\.5|4|5)|px-(3|3\.5|4))$/.test(c)) &&
        // A field's fill, and a picture's placeholder, are not tiles.
        !has(f, (c) => c.startsWith("text-lg") || c.startsWith("object-")) &&
        !has(f, edged) &&
        !exempt(f)
    );
    expect(bare.map(where)).toEqual([]);
  });

  it("a card with the edge drops its border on dark, so the edge is not doubled", () => {
    const doubled = all.filter(
      (f) =>
        has(f, (c) => /(^|:)card-shadow$/.test(c)) &&
        has(f, (c) => c === "border" || c.startsWith("border-border")) &&
        !has(
          f,
          (c) =>
            c === "dark:border-transparent" ||
            c === "dark:border-0" ||
            c === "dark:border-none"
        ) &&
        !exempt(f)
    );
    expect(doubled.map(where)).toEqual([]);
  });

  it("each exemption still names a surface, so a stale one is noticed", () => {
    for (const e of EXEMPT) {
      const hits = all.filter(
        (f) => f.file === e.file && (!e.has || f.text.includes(e.has))
      );
      expect(hits.length, `${e.file}: ${e.why}`).toBeGreaterThan(0);
    }
  });
});

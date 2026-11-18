/**
 * DS6 (DESIGN_GUIDE §14o): on dark, a card, a compact tile, a chip and a
 * pill button take a hairline of light along the top and a faint outline,
 * through the shadow tokens, so `card-shadow` stays the one place a card's
 * edge is set. Steps 1 and 2 put the edge on the tokens and the primitives;
 * about 130 hand-rolled surfaces never asked for it, so on dark they were
 * #17171B on a #0E0E11 page, 1.06:1, with no edge at all.
 *
 * Read from the source, as the other design guards read it: a class string
 * that draws a card (`bg-card` with a card's radius) carries `card-shadow`
 * (any variant, `dark:` for a surface whose light look is its own),
 * `chip-edge` (a row sitting inside a tile) or a large shadow of its own (a
 * menu or a popover floating over the page; a `shadow-sm` is black and
 * cannot show on dark, so it does not count); a tile or a muted button
 * (`bg-muted` with a radius and a tile's or a button's padding) carries
 * `chip-edge`. A card with the edge and an all-round border drops the
 * border on dark, or the two stack into a doubled edge. The strings of one
 * `cn()` / `clsx()` call are read together, so an edge given by one branch
 * of a condition counts for the call.
 *
 * Two orderings to know when adding a class beside the edge. `card-shadow`
 * writes `box-shadow` itself, so a plain `ring-2` on the same element is
 * lost on dark (a `focus-visible:` ring still wins, and the edge gives way
 * while it shows). And `dark:border-transparent` comes after `border-primary`
 * in the sheet, so an accent border that carries meaning (a selection, a
 * tier) goes in a branch of its own without it.
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
    has: "border-l-4 border-primary",
    why: "the Pro page's plans: an accent border is their edge",
  },
  {
    file: "src/pages/Upgrade.tsx",
    has: "text-xs text-foreground bg-muted rounded-lg px-3 py-2",
    why: "the Pro page's notes, which stay as the Pro page draws them",
  },
  {
    file: "src/components/ProModal.tsx",
    has: "text-xs text-foreground bg-muted rounded-lg px-3 py-2",
    why: "the Pro sheet's notes, drawn with the Pro page",
  },
  {
    file: "src/pages/Upgrade.tsx",
    has: "flex items-start gap-3 p-3 rounded-xl",
    why: "the purchase's status banner, a message and not a tile",
  },
  {
    file: "src/components/paywall/PlanPicker.tsx",
    has: "border-border bg-card",
    why: "the paywall's plans: the border is their edge and the selection",
  },
  {
    file: "src/App.tsx",
    has: "text-left bg-card border border-border/50 rounded-xl p-3",
    why: "the crash screen's details",
  },
  {
    file: "src/components/program/ScheduleLayoutSheet.tsx",
    has: "min-h-[86px] flex flex-col",
    why: "a day's cell: the session's colour is its border and its fill",
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

interface Found {
  file: string;
  line: number;
  classes: string[];
  text: string;
  /**
   * What one branch of a class call draws: a string that sets a
   * background, with the strings that set none, which every branch shares.
   */
  branches: string[][];
}

/** A template's `${…}` ends a class as a space does. */
const words = (text: string) => text.split(/\s+|\$\{|\}/);

const CLASS_CALL = /(?:^|[^\w.$])(cn|clsx|twMerge)\s*$/;

/**
 * The class strings of every file: each `"…"` and `` `…` `` outside a
 * comment, with the strings of one `cn()` / `clsx()` / `twMerge()` call
 * joined into one. Single quotes are not read: JSX text is full of
 * apostrophes, and the house style writes class strings in double quotes.
 */
function strings(): Found[] {
  const out: Found[] = [];
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    const lineAt = (i: number) => src.slice(0, i).split("\n").length;
    // One entry per open paren: the strings of a class call, or null.
    const parens: ({ start: number; parts: string[] } | null)[] = [];
    const emit = (text: string, at: number) => {
      const call = parens.find((p) => p !== null);
      if (call) call.parts.push(text);
      else
        out.push({
          file,
          line: lineAt(at),
          classes: words(text),
          text,
          branches: [words(text)],
        });
    };
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
        while (
          j < src.length &&
          src[j] !== c &&
          !(c === '"' && src[j] === "\n")
        )
          j += src[j] === "\\" ? 2 : 1;
        emit(src.slice(i + 1, j), i);
        i = j + 1;
      } else if (c === "(") {
        const isCall = CLASS_CALL.test(src.slice(Math.max(0, i - 12), i));
        parens.push(isCall ? { start: i, parts: [] } : null);
        i++;
      } else if (c === ")") {
        const call = parens.pop();
        if (call && call.parts.length > 0) {
          const text = call.parts.join(" ");
          const parts = call.parts.map(words);
          const sets = (p: string[]) => p.some((c) => /^bg-/.test(c));
          const shared = parts.filter((p) => !sets(p)).flat();
          if (parens.some((p) => p !== null))
            parens.find((p) => p !== null)!.parts.push(text);
          else
            out.push({
              file,
              line: lineAt(call.start),
              classes: words(text),
              text,
              branches: parts.some(sets)
                ? parts.filter(sets).map((p) => [...p, ...shared])
                : [shared],
            });
        }
        i++;
      } else {
        i++;
      }
    }
  }
  return out;
}

const exempt = (f: Found) =>
  EXEMPT.some((e) => e.file === f.file && (!e.has || f.text.includes(e.has)));

const has = (f: Found, test: (c: string) => boolean) => f.classes.some(test);
const radius = (c: string) => /^rounded-(lg|xl|2xl)$/.test(c);
const edged = (c: string) => /(^|:)card-shadow$/.test(c) || c === "chip-edge";
const ownShadow = (c: string) => /^(dark:)?shadow-(lg|xl|2xl)$/.test(c);
const where = (f: Found) => `${f.file}:${f.line}`;

const bareCard = (f: Found) =>
  has(f, (c) => c === "bg-card") &&
  has(f, radius) &&
  !has(f, edged) &&
  !has(f, ownShadow);

const bareTile = (f: Found) =>
  has(f, (c) => c === "bg-muted") &&
  has(f, radius) &&
  has(f, (c) =>
    /^(p-(2\.5|3|3\.5|4|5)|px-(2\.5|3|3\.5|4)|px-\[\d+px\]|py-(3|3\.5|4))$/.test(
      c
    )
  ) &&
  // A field's fill, and a picture's placeholder, are not tiles.
  !has(
    f,
    (c) =>
      c.startsWith("text-lg") ||
      c.startsWith("object-") ||
      c.startsWith("placeholder:")
  ) &&
  !has(f, edged);

/** An all-round border: a side's border (`border-t`) is not doubled. */
const roundBorder = (b: string[]) =>
  b.includes("border") ||
  (b.some((c) => c.startsWith("border-border")) &&
    !b.some((c) => /^border-[tblrxy](-|$)/.test(c)));

/** One branch, not the whole call: a selected branch's own accent border
 *  is not doubled with the edge another branch carries. */
const doubled = (f: Found) =>
  f.branches.some(
    (b) =>
      b.some((c) => /(^|:)card-shadow$/.test(c)) &&
      roundBorder(b) &&
      !b.some(
        (c) =>
          c === "dark:border-transparent" ||
          c === "dark:border-0" ||
          c === "dark:border-none"
      )
  );

describe("the lit edge on dark surfaces (DS6, §14o)", () => {
  const all = strings();

  it("reads the strings of a class call together", () => {
    const strip = all.find(
      (f) =>
        f.file === "src/components/session/InProgressStrip.tsx" &&
        f.text.includes("bg-card")
    );
    expect(strip?.classes).toEqual(
      expect.arrayContaining(["bg-card", "rounded-xl", "card-shadow"])
    );
  });

  it("every card drawn by hand carries the card's edge", () => {
    const bare = all.filter((f) => bareCard(f) && !exempt(f));
    expect(bare.map(where)).toEqual([]);
  });

  it("every tile and muted button drawn by hand carries the tile's edge", () => {
    const bare = all.filter((f) => bareTile(f) && !exempt(f));
    expect(bare.map(where)).toEqual([]);
  });

  it("a card with the edge drops its border on dark, so the edge is not doubled", () => {
    const twice = all.filter((f) => doubled(f) && !exempt(f));
    expect(twice.map(where)).toEqual([]);
  });

  it("each exemption still excuses a surface, so a stale one is noticed", () => {
    for (const e of EXEMPT) {
      const excused = all.filter(
        (f) =>
          f.file === e.file &&
          (!e.has || f.text.includes(e.has)) &&
          (bareCard(f) || bareTile(f) || doubled(f))
      );
      expect(excused.length, `${e.file}: ${e.why}`).toBeGreaterThan(0);
    }
  });
});

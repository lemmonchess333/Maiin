/**
 * Control boundaries — WCAG 1.4.11, 3:1 for a control's edge and its
 * state indicator against what sits next to it.
 *
 * Two halves. The token half parses the real `src/index.css` and holds
 * the boundary colour these controls share (muted-foreground at 80%) to
 * 3:1 on every surface they sit on, in both themes. The source half pins
 * each control to that boundary, so a revert to the hairline `--border`
 * (1.1–1.3:1) or a faint grip fails here rather than in a sweep.
 *
 * Two controls carry their state or their box another way, and are
 * measured on their own terms below: the segmented control's selected
 * segment is a filled pill (3:1 against its track), and the dark field is
 * a filled box with a hairline rim.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FIELD_EDGE,
  FIELD_FOCUS_RING,
  SECONDARY_ON_CARD_EDGE,
} from "@/components/ui/buttonClasses";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const CSS = read("src/index.css");

type Rgb = [number, number, number];

function readHsl(block: string, name: string): Rgb {
  const m = block.match(
    new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`)
  );
  if (!m) throw new Error(`token --${name} not found`);
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
const lum = ([r, g, b]: Rgb) => {
  const f = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: Rgb, b: Rgb) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as Rgb;
const hex = (x: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255) as Rgb;

const darkAt = CSS.indexOf(".dark {");
const THEMES = {
  light: CSS.slice(0, darkAt),
  dark: CSS.slice(darkAt),
};
const SURFACES = ["card", "muted", "background", "input-fill"];

describe("the shared control boundary measures 3:1", () => {
  for (const [theme, block] of Object.entries(THEMES)) {
    for (const surface of SURFACES) {
      it(`muted-foreground/80 on ${surface} (${theme})`, () => {
        const bg = readHsl(block, surface);
        const edge = over(readHsl(block, "muted-foreground"), bg, 0.8);
        expect(ratio(edge, bg)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("the hairline it replaces does not (why the pin exists)", () => {
    const card = readHsl(THEMES.light, "card");
    expect(ratio(readHsl(THEMES.light, "border"), card)).toBeLessThan(3);
  });

  it("the running coral rings the run sheet's dark stage at 3:1", () => {
    const coral = readHsl(THEMES.light, "running");
    for (const sheet of ["#17171B", "#0E0E11"]) {
      expect(ratio(coral, hex(sheet))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("controls draw that boundary", () => {
  it("the shared class strings name it", () => {
    expect(FIELD_EDGE).toContain("border-muted-foreground/80");
    expect(SECONDARY_ON_CARD_EDGE).toContain("border-muted-foreground/80");
    expect(FIELD_FOCUS_RING).toContain("focus-visible:outline-primary!");
  });

  it("the field primitive draws its resting edge and fill from the input tokens", () => {
    // Every text field, textarea and select, at rest and on a tapped
    // select. What the tokens measure is in "the field primitive at rest".
    const css = read("src/styles/components.css").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    const rest = /select\.ds-input\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rest).toMatch(
      /border:\s*1px solid var\(--ds-color-input-border-rest\)/
    );
    expect(rest).toMatch(/background:\s*var\(--ds-color-input-fill-rest\)/);
    const tapped =
      css.split(".ds-input.ds-input-pointer-focus:focus")[1]?.split("}")[0] ??
      "";
    expect(tapped).toMatch(
      /border-color:\s*var\(--ds-color-input-border-rest\)/
    );
  });

  it("Toggle's off track edge is the boundary in light", () => {
    expect(read("src/components/ui/Toggle.tsx")).toMatch(
      /bg-muted border border-muted-foreground\/80 dark:border-border/
    );
  });

  it("the empty set check's box is the boundary", () => {
    const src = read("src/components/workout/SetCheck.tsx");
    expect(src).toContain("rounded-lg border-2 border-muted-foreground/80");
    expect(src).not.toContain("border-2 border-border");
  });

  it("the set row's fields and pills take the shared edges", () => {
    const src = read("src/components/WorkoutSession.tsx");
    expect(src.match(/cn\(\s*FIELD_EDGE,/g)?.length).toBe(2);
    expect(src.match(/SECONDARY_ON_CARD_EDGE/g)?.length).toBe(3);
    expect(read("src/components/workout/CompactRestTimer.tsx")).toContain(
      "SECONDARY_ON_CARD_EDGE"
    );
  });

  it("the reorder grip is not faded under 3:1", () => {
    const src = read("src/components/SortableExerciseRow.tsx");
    expect(src).toContain('className="bg-muted-foreground/80"');
    expect(src).not.toMatch(/opacity:\s*0\.22/);
  });

  it("the run sheet's rings are coral, not the lifting purple", () => {
    const src = read("src/components/run/RunBottomSheet.tsx");
    expect(src).not.toContain("ring-primary/50");
    expect(src.match(/focus-visible:outline-running/g)?.length).toBe(2);
  });

  it("EditServingsSheet's fields keep a visible focus", () => {
    const src = read("src/components/food/EditServingsSheet.tsx");
    expect(src).not.toContain("focus:outline-none focus:border-border");
    expect(src.match(/FIELD_FOCUS_RING/g)?.length).toBe(3);
  });

  it("the weight dial hides faint labels and floors the rest", () => {
    const src = read("src/components/home/WeightScaleDial.tsx");
    expect(src).toContain("LABEL_HIDE_BELOW = 0.45");
    expect(src).toContain("LABEL_MIN_OPACITY = 0.6");
    expect(src).toContain("Math.max(LABEL_MIN_OPACITY, mark.edgeFade)");
  });
});

/* The selected segment is a filled pill under a white label, with no
   outline. The fill is the state indicator, so it is what clears 3:1, and
   against everything it can sit beside: the --muted track, Train's
   lighter `bg-muted/50` track over the page, and (wrapped, no track) the
   card, the page and the muted unselected pills. */
describe("the selected segment's fill is its state, at 3:1", () => {
  const WHITE: Rgb = [1, 1, 1];
  const FILLS = ["segment-selected", "running-fill", "lifting-fill"];
  const neighbours = (block: string): [string, Rgb][] => [
    ["the --muted track", readHsl(block, "muted")],
    [
      "Train's muted/50 track",
      over(readHsl(block, "muted"), readHsl(block, "background"), 0.5),
    ],
    ["the card", readHsl(block, "card")],
    ["the page", readHsl(block, "background")],
  ];

  for (const [theme, block] of Object.entries(THEMES)) {
    for (const fill of FILLS) {
      it(`--${fill} clears 3:1 beside the track and its surfaces, white 4.5:1 on it (${theme})`, () => {
        const f = readHsl(block, fill);
        for (const [what, next] of neighbours(block)) {
          expect(
            ratio(f, next),
            `--${fill} on ${what} (${theme})`
          ).toBeGreaterThanOrEqual(3);
        }
        expect(ratio(WHITE, f)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("a sport label on the grey fill misses AA (why the sport tones fill)", () => {
    // Any neutral fill bright enough for 3:1 on the dark track leaves the
    // -strong text steps near 2:1 on it, so coral and purple ride in the
    // fill rather than the label.
    for (const block of Object.values(THEMES)) {
      const grey = readHsl(block, "segment-selected");
      for (const label of ["running-strong", "lifting-strong"]) {
        expect(ratio(readHsl(block, label), grey)).toBeLessThan(4.5);
      }
    }
  });

  it("the card pill it replaces was ~1:1 on the track (why the fill)", () => {
    for (const block of Object.values(THEMES)) {
      expect(
        ratio(readHsl(block, "card"), readHsl(block, "muted"))
      ).toBeLessThan(1.2);
    }
  });

  it("SegmentedControl's selected segment is the fill, under white, with no edge", () => {
    const src = read("src/components/ui/SegmentedControl.tsx");
    for (const cls of [
      '"bg-segment-selected"',
      '"bg-running-fill"',
      '"bg-lifting-fill"',
    ])
      expect(src).toContain(cls);
    expect(src).toMatch(/"text-white",\s*tone === "running"/);
    expect(src).not.toContain("border-muted-foreground");
    expect(src).not.toContain("bg-card shadow-sm");
  });
});

/* `.ds-input` at rest, from the tokens it really paints (tokens.css,
   "Input states"), measured against the theme tokens in index.css.

   Light keeps the shared 3:1 boundary: a light fill parts from a white
   card at about 1.1:1, so there the edge has to mark the box.

   Dark is a filled box on --muted with the --border hairline, and that
   is a deliberate step under the 3:1 boundary. The 80% grey edge it
   replaces measured 4.9–5.2:1 on the dark page and card, and on the
   phone it read as a white outline round every field (owner's report).
   WCAG 1.4.11 asks for a 3:1 boundary only where nothing else identifies
   the input (Understanding 1.4.11, "Boundaries", and its failing example
   is a field with no label); every field here has a label or a
   placeholder, and the placeholder is held to AA on the fill below and in
   tokenContrast.test.ts. A 3:1 edge at the minimum (muted-foreground at
   58%) was tried and still read as an outline. Focus turns the edge
   primary, 3:1 or more against the page and the card. */
describe("the field primitive at rest", () => {
  const TOKENS = read("src/styles/tokens.css");
  const tokenDarkAt = TOKENS.indexOf(".dark {");
  const TOKEN_THEMES = {
    light: TOKENS.slice(0, tokenDarkAt),
    dark: TOKENS.slice(tokenDarkAt),
  };
  /** `--ds-color-input-<name>-rest: hsl(var(--token) [/ alpha])`. */
  function restToken(theme: "light" | "dark", name: "fill" | "border") {
    const m = new RegExp(
      `--ds-color-input-${name}-rest:\\s*hsl\\(var\\(--([a-z-]+)\\)(?:\\s*\\/\\s*([\\d.]+))?\\)`
    ).exec(TOKEN_THEMES[theme]);
    if (!m) throw new Error(`--ds-color-input-${name}-rest not in ${theme}`);
    return { token: m[1], alpha: m[2] ? Number(m[2]) : 1 };
  }
  /** The field as painted: its fill, and its edge laid over that fill. */
  function field(theme: "light" | "dark") {
    const block = THEMES[theme];
    const fillT = restToken(theme, "fill");
    const edgeT = restToken(theme, "border");
    const fill = readHsl(block, fillT.token);
    const edge = over(readHsl(block, edgeT.token), fill, edgeT.alpha);
    return { block, fill, edge };
  }
  const AROUND = ["card", "background"];

  it("light: the edge is the shared boundary, 3:1 on the card and the page", () => {
    const { block, edge } = field("light");
    for (const surface of AROUND) {
      expect(
        ratio(edge, readHsl(block, surface)),
        `light field edge on --${surface}`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("dark: no bright edge; a fill a step up from the card and the page", () => {
    const { block, fill, edge } = field("dark");
    for (const surface of AROUND) {
      const s = readHsl(block, surface);
      expect(ratio(edge, s), `dark field edge on --${surface}`).toBeLessThan(2);
      expect(lum(fill), `dark field fill above --${surface}`).toBeGreaterThan(
        lum(s)
      );
    }
  });

  it.each(["light", "dark"] as const)(
    "the placeholder and the typed text clear AA on the fill (%s)",
    (theme) => {
      const { block, fill } = field(theme);
      expect(
        ratio(readHsl(block, "muted-foreground"), fill)
      ).toBeGreaterThanOrEqual(4.5);
      expect(ratio(readHsl(block, "foreground"), fill)).toBeGreaterThanOrEqual(
        4.5
      );
    }
  );

  it("dark: focus turns the edge primary, 3:1 on the page and the card", () => {
    const block = THEMES.dark;
    for (const surface of AROUND) {
      expect(
        ratio(readHsl(block, "primary"), readHsl(block, surface))
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

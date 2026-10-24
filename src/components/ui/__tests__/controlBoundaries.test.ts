/**
 * Control boundaries — WCAG 1.4.11, 3:1 for a control's edge and its
 * state indicator against what sits next to it.
 *
 * Two halves. The token half parses the real `src/index.css` and holds
 * the boundary colour these controls share (muted-foreground at 80%) to
 * 3:1 on every surface they sit on, in both themes. The source half pins
 * each control to that boundary, so a revert to the hairline `--border`
 * (1.1–1.3:1) or a faint grip fails here rather than in a sweep.
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

  it("Toggle's off track edge is the boundary in light", () => {
    expect(read("src/components/ui/Toggle.tsx")).toMatch(
      /bg-muted border border-muted-foreground\/80 dark:border-border/
    );
  });

  it("SegmentedControl's selected pill carries an edge on the track", () => {
    expect(read("src/components/ui/SegmentedControl.tsx")).toContain(
      '"bg-card shadow-sm border-muted-foreground/80"'
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

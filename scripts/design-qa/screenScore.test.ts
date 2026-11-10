import { describe, it, expect } from "vitest";
import {
  checkRules,
  colourOf,
  colourStats,
  hueFamilies,
  type ColourStats,
  type DomFigures,
} from "./screenScore";

/** A frame filled with `rgb`, with `colourRows` of its top rows in
 *  `colour` instead. */
function frame(
  width: number,
  height: number,
  rgb: [number, number, number],
  colourRows = 0,
  colour: [number, number, number] = [0, 0, 0]
) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const c = y < colourRows ? colour : rgb;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const PURPLE: [number, number, number] = [123, 114, 233]; // the brand
const CORAL: [number, number, number] = [212, 99, 122]; // running
const PAGE_DARK: [number, number, number] = [14, 14, 17];

describe("what counts as colour (the research's test)", () => {
  it("counts the brand purple and the running coral", () => {
    expect(colourOf(...PURPLE).colour).toBe(true);
    expect(colourOf(...CORAL).colour).toBe(true);
  });

  it("does not count the dark page, a grey, or a tinted near-black", () => {
    expect(colourOf(...PAGE_DARK).colour).toBe(false);
    expect(colourOf(128, 128, 128).colour).toBe(false);
    // Bevel's navy, #282d40: saturated but under the chroma floor.
    expect(colourOf(0x28, 0x2d, 0x40).colour).toBe(false);
  });

  it("reads hues around the wheel", () => {
    expect(colourOf(255, 0, 0).hue).toBe(0);
    expect(colourOf(0, 255, 0).hue).toBe(120);
    expect(colourOf(0, 0, 255).hue).toBe(240);
    expect(Math.round(colourOf(...PURPLE).hue)).toBe(245);
  });
});

describe("colour share and hue families", () => {
  it("measures the share of colour in the first screen only", () => {
    // 10 of 100 rows purple, measured over the top 50.
    const stats = colourStats(frame(10, 100, PAGE_DARK, 10, PURPLE), 50);
    expect(stats.colourShare).toBeCloseTo(0.2);
    expect(stats.families).toHaveLength(1);
    expect(stats.families[0].share).toBe(1);
  });

  it("keeps one hue across 0° as one family", () => {
    const bins = new Array(12).fill(0);
    bins[11] = 0.5; // 330–360
    bins[0] = 0.5; // 0–30
    const families = hueFamilies(bins);
    expect(families).toHaveLength(1);
    expect(families[0].share).toBeCloseTo(1);
  });

  it("drops a family under 5% of the colour, and sorts the rest", () => {
    const bins = new Array(12).fill(0);
    bins[8] = 0.7; // purple
    bins[11] = 0.27; // coral
    bins[4] = 0.03; // a trace of green
    expect(hueFamilies(bins).map((f) => f.share)).toEqual([0.7, 0.27]);
  });

  it("finds no colour on a neutral screen", () => {
    expect(colourStats(frame(4, 4, PAGE_DARK))).toEqual({
      colourShare: 0,
      families: [],
    });
  });
});

const GOOD: DomFigures = {
  viewport: { width: 393, height: 852 },
  theme: "dark",
  kind: "root",
  firstContentTop: 100,
  hero: { top: 100, visibleHeight: 300, label: "the race" },
  bottomChrome: 80,
  textSizes: [36, 18, 14, 12],
  largestTextInHero: true,
  filledButtons: [{ label: "Join challenge", neutral: true }],
  rows: { total: 3, withPicture: 3 },
};
const CALM: ColourStats = {
  colourShare: 0.04,
  families: [
    { hue: 244, share: 0.8 },
    { hue: 345, share: 0.2 },
  ],
};

const failing = (dom: DomFigures, colour = CALM) =>
  checkRules(dom, colour)
    .filter((c) => !c.pass)
    .map((c) => c.rule);

describe("the rules", () => {
  it("passes a screen built to them", () => {
    expect(failing(GOOD)).toEqual([]);
  });

  it("fails a hero too small, or starting too low", () => {
    expect(
      failing({ ...GOOD, hero: { top: 100, visibleHeight: 150, label: "x" } })
    ).toContain("1");
    expect(
      failing({ ...GOOD, hero: { top: 300, visibleHeight: 300, label: "x" } })
    ).toContain("1");
  });

  it("fails a large title above the hero", () => {
    expect(failing({ ...GOOD, largestTextInHero: false })).toContain("2");
    expect(failing({ ...GOOD, textSizes: [20, 18, 14] })).toContain("2");
  });

  it("fails more than six text sizes", () => {
    expect(
      failing({ ...GOOD, textSizes: [36, 24, 20, 18, 16, 14, 12] })
    ).toContain("7");
  });

  it("holds dark to 8% colour and light to 15%", () => {
    const loud = { ...CALM, colourShare: 0.1 };
    expect(failing(GOOD, loud)).toContain("9");
    expect(failing({ ...GOOD, theme: "light" }, loud)).not.toContain("9");
  });

  it("fails four hues, or no hue leading", () => {
    expect(
      failing(GOOD, {
        colourShare: 0.05,
        families: [
          { hue: 244, share: 0.4 },
          { hue: 345, share: 0.3 },
          { hue: 30, share: 0.2 },
          { hue: 180, share: 0.1 },
        ],
      })
    ).toContain("11");
  });

  it("fails chrome that pushes the first content down", () => {
    expect(failing({ ...GOOD, firstContentTop: 140 })).toContain("17");
    expect(
      failing({ ...GOOD, kind: "detail", firstContentTop: 100 })
    ).toContain("17");
  });

  it("fails a second filled button, and flags a coloured one to check", () => {
    expect(
      failing({
        ...GOOD,
        filledButtons: [
          { label: "Join challenge", neutral: true },
          { label: "Start a circle", neutral: false },
        ],
      })
    ).toEqual(expect.arrayContaining(["21", "12"]));
  });

  it("fails rows without a picture of their own", () => {
    expect(failing({ ...GOOD, rows: { total: 3, withPicture: 1 } })).toContain(
      "25"
    );
  });
});

/**
 * Screen scorer: the measured design rules (DESIGN_GUIDE §14m, evidence in
 * docs/design-rules-2026-11/) checked on one screen, the same way every
 * time, so a critique starts from numbers rather than an impression.
 *
 * The pure half. It takes a screenshot's pixels and the figures the
 * browser half (`e2e/helpers/screenScore.ts`) reads off the page, and
 * returns each rule's value, its limit and whether the screen meets it.
 * No browser and no clock: `screenScore.test.ts` pins it.
 *
 * Colour is measured as the design-rules research measured it
 * (rules-colour.md, "How it was measured"): a pixel is colour when its HSV
 * saturation is above 0.35, its value above 0.25 and its chroma (max − min)
 * at least 0.12, the chroma floor keeping tinted near-blacks out. Hues are
 * grouped into families: runs of neighbouring 30° bins around the wheel,
 * so coral at 355° and at 5° is one family.
 *
 * The figures are approximate by design. A rule that fails here is a place
 * to look, not a verdict: the critique skill reads the frame by eye before
 * it says anything.
 */

/** RGBA pixels, row-major, as pngjs decodes them. */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export interface HueFamily {
  /** The family's middle, in degrees. */
  hue: number;
  /** Its share of the colour pixels, 0–1. */
  share: number;
}

export interface ColourStats {
  /** Colour pixels as a share of the area measured, 0–1. */
  colourShare: number;
  /** Hue families holding at least 5% of the colour, largest first. */
  families: HueFamily[];
}

const BIN_DEGREES = 30;
const BINS = 360 / BIN_DEGREES;
/** A bin with less than this share of the colour does not join a family. */
const BIN_FLOOR = 0.02;
/** A family with less than this share of the colour is not counted. */
const FAMILY_FLOOR = 0.05;

/** Whether one pixel counts as colour, and its hue in degrees. */
export function colourOf(
  r: number,
  g: number,
  b: number
): { colour: boolean; hue: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const chroma = max - min;
  const saturation = max === 0 ? 0 : chroma / max;
  const colour = saturation > 0.35 && max > 0.25 && chroma >= 0.12;
  let hue = 0;
  if (chroma > 0) {
    if (max === R) hue = 60 * (((G - B) / chroma) % 6);
    else if (max === G) hue = 60 * ((B - R) / chroma + 2);
    else hue = 60 * ((R - G) / chroma + 4);
  }
  if (hue < 0) hue += 360;
  return { colour, hue };
}

/** Colour share and hue families over the top `height` rows (the first
 *  screen, when the frame is taller). */
export function colourStats(px: Pixels, height = px.height): ColourStats {
  const rows = Math.min(height, px.height);
  const bins = new Array<number>(BINS).fill(0);
  let colourPixels = 0;
  let total = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < px.width; x++) {
      const i = (y * px.width + x) * 4;
      total++;
      const { colour, hue } = colourOf(
        px.data[i],
        px.data[i + 1],
        px.data[i + 2]
      );
      if (!colour) continue;
      colourPixels++;
      bins[Math.floor(hue / BIN_DEGREES) % BINS]++;
    }
  }
  if (colourPixels === 0) return { colourShare: 0, families: [] };
  const shares = bins.map((n) => n / colourPixels);
  return {
    colourShare: colourPixels / total,
    families: hueFamilies(shares),
  };
}

/** Runs of neighbouring bins above the floor, around the wheel, as
 *  families; those under FAMILY_FLOOR dropped; largest first. */
export function hueFamilies(binShares: number[]): HueFamily[] {
  const on = binShares.map((s) => s >= BIN_FLOOR);
  if (on.every(Boolean)) {
    return [{ hue: 180, share: binShares.reduce((a, b) => a + b, 0) }];
  }
  // Start just after an empty bin, so a run across 360° is not split.
  const start = on.findIndex((v) => !v);
  const families: HueFamily[] = [];
  let run: number[] = [];
  const close = () => {
    if (run.length === 0) return;
    const share = run.reduce((a, i) => a + binShares[i], 0);
    const weighted = run.reduce(
      (a, i, k) => a + binShares[i] * (run[0] + k),
      0
    );
    const middle = ((weighted / share) * BIN_DEGREES + BIN_DEGREES / 2) % 360;
    families.push({ hue: Math.round(middle), share });
    run = [];
  };
  for (let k = 1; k <= BINS; k++) {
    const i = (start + k) % BINS;
    if (on[i]) run.push(i);
    else close();
  }
  close();
  return families
    .filter((f) => f.share >= FAMILY_FLOOR)
    .sort((a, b) => b.share - a.share);
}

/** What the browser half reads off the page, in CSS px. */
export interface DomFigures {
  viewport: { width: number; height: number };
  theme: "dark" | "light";
  /** A tab root (Home, Train, Food, Analytics, Social) or a pushed screen. */
  kind: "root" | "detail";
  /** Top of the first content block below the header and its controls. */
  firstContentTop: number | null;
  /** The largest block in the first screen. */
  hero: { top: number; visibleHeight: number; label: string } | null;
  /** The tab bar's height from the screen's bottom edge, 0 without one. */
  bottomChrome: number;
  /** Distinct font sizes in the first screen, largest first. */
  textSizes: number[];
  /** Whether the largest text sits inside the hero. */
  largestTextInHero: boolean;
  /** Filled buttons on the whole screen. */
  filledButtons: { label: string; neutral: boolean }[];
  /** List rows on the screen, and how many carry a picture of 28 px or
   *  more (an image, a drawing, a medal), not an icon. */
  rows: { total: number; withPicture: number };
}

export interface RuleCheck {
  rule: string;
  /** What is measured, in words. */
  label: string;
  value: string;
  limit: string;
  pass: boolean;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Each measured rule this scorer can check, against one screen. */
export function checkRules(dom: DomFigures, colour: ColourStats): RuleCheck[] {
  const checks: RuleCheck[] = [];
  const usable = dom.viewport.height - dom.bottomChrome;

  if (dom.hero) {
    const share = dom.hero.visibleHeight / usable;
    checks.push({
      rule: "1",
      label: `One hero, 30–60% of the first screen, top within 260 px (${dom.hero.label})`,
      value: `${pct(share)}, top ${Math.round(dom.hero.top)} px`,
      limit: "30–60%, top ≤ 260 px",
      pass: share >= 0.3 && share <= 0.6 && dom.hero.top <= 260,
    });
  } else {
    checks.push({
      rule: "1",
      label: "One hero, 30–60% of the first screen",
      value: "no block found",
      limit: "30–60%",
      pass: false,
    });
  }

  const [largest, next] = dom.textSizes;
  checks.push({
    rule: "2",
    label: "The hero holds the largest text, at 1.2× the next size",
    value:
      largest === undefined
        ? "no text"
        : `${largest} px${next ? ` vs ${next} px (${(largest / next).toFixed(2)}×)` : ""}, ${dom.largestTextInHero ? "in" : "not in"} the hero`,
    limit: "in the hero, ≥ 1.2×",
    pass:
      largest !== undefined &&
      dom.largestTextInHero &&
      (next === undefined || largest / next >= 1.2),
  });

  checks.push({
    rule: "7",
    label: "Text sizes in the first screen",
    value: String(dom.textSizes.length),
    limit: "≤ 6",
    pass: dom.textSizes.length <= 6,
  });

  const budget = dom.theme === "dark" ? 0.08 : 0.15;
  checks.push({
    rule: "9",
    label: `Colour on an everyday ${dom.theme} screen`,
    value: `${(colour.colourShare * 100).toFixed(1)}%`,
    limit: `≤ ${pct(budget)}`,
    pass: colour.colourShare <= budget,
  });

  const lead = colour.families[0]?.share ?? 1;
  checks.push({
    rule: "11",
    label: "Hues, and the leading hue's share of the colour",
    value:
      colour.families.length === 0
        ? "no colour"
        : `${colour.families.length} (${colour.families.map((f) => `${f.hue}° ${pct(f.share)}`).join(", ")})`,
    limit: "≤ 3, one ≥ 60%",
    pass: colour.families.length <= 3 && lead >= 0.6,
  });

  const topLimit = dom.kind === "root" ? 120 : 90;
  checks.push({
    rule: "17",
    label: "Chrome: first content block from the top, tab bar from the bottom",
    value:
      dom.firstContentTop === null
        ? "no content block"
        : `top ${Math.round(dom.firstContentTop)} px, bottom ${Math.round(dom.bottomChrome)} px`,
    limit: `top ≤ ${topLimit} px, bottom ≤ 90 px`,
    pass:
      dom.firstContentTop !== null &&
      dom.firstContentTop <= topLimit &&
      dom.bottomChrome <= 90,
  });

  const coloured = dom.filledButtons.filter((b) => !b.neutral);
  checks.push({
    rule: "21",
    label: "Filled buttons on the screen",
    value:
      dom.filledButtons.length === 0
        ? "none"
        : dom.filledButtons
            .map((b) => `${b.label} (${b.neutral ? "neutral" : "colour"})`)
            .join(", "),
    limit: "≤ 1",
    pass: dom.filledButtons.length <= 1,
  });
  if (coloured.length > 0) {
    checks.push({
      rule: "12",
      label: "A coloured fill only for starting that colour's thing",
      value: coloured.map((b) => b.label).join(", "),
      limit: "check by eye: a domain action may keep its colour",
      pass: false,
    });
  }

  if (dom.rows.total > 0) {
    checks.push({
      rule: "25",
      label: "List rows with a picture of their own",
      value: `${dom.rows.withPicture} of ${dom.rows.total}`,
      limit: "every row for a session, person or award",
      pass: dom.rows.withPicture === dom.rows.total,
    });
  }

  return checks;
}

/** One screen's checks as a Markdown table. */
export function checksTable(name: string, checks: RuleCheck[]): string {
  const lines = [
    `### ${name}`,
    "",
    "| Rule | Measure | Value | Limit | |",
    "| ---- | ------- | ----- | ----- | - |",
    ...checks.map(
      (c) =>
        `| ${c.rule} | ${c.label} | ${c.value} | ${c.limit} | ${c.pass ? "✓" : "✗"} |`
    ),
  ];
  return lines.join("\n");
}

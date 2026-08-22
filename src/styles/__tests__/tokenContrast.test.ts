/**
 * Token contrast — WCAG AA, enforced instead of swept.
 *
 * CLAUDE.md's design-system note says the colour invariants "regress
 * constantly and keep getting swept up after the fact". A periodic sweep
 * can't fix that; a test can. This one parses the REAL `src/index.css`
 * (never a copied table — the parsed file is the source of truth) and
 * fails when a text token drops below the AA threshold on its own
 * theme's card surface.
 *
 * What this would have caught (2026-08-09): the run summary rendered its
 * pace and calorie numerals from the STATIC JS constants `THEME.teal`
 * (#52A3BD) and `THEME.success` (#4DB872) via inline styles. Static hexes
 * cannot respond to the theme, so on the light card they measured 2.86:1
 * and 2.50:1 — under even the 3:1 large-text floor — while looking fine
 * in the dark theme the app defaults to, which is why it went unseen.
 * `--success` had a correct theme-aware token all along; `--teal` had no
 * token at all, the same gap the `--nutrition` comment blames for orange
 * hexes leaking past the guardrail.
 *
 * Thresholds: WCAG 2.2 SC 1.4.3 — 4.5:1 for normal text, 3:1 for large
 * text (>=24px, or >=18.66px bold). These tokens are used for numerals at
 * both sizes, so they are held to the stricter 4.5:1.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** Pull an `--name: H S% L%;` triple out of a given block of the file. */
function readHsl(block: string, name: string): [number, number, number] {
  const m = block.match(
    new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`)
  );
  if (!m) throw new Error(`token --${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The `:root` (light) block ends where the `.dark` block begins. */
function lightBlock(): string {
  const i = CSS.indexOf(".dark {");
  expect(i).toBeGreaterThan(-1);
  return CSS.slice(0, i);
}
function darkBlock(): string {
  return CSS.slice(CSS.indexOf(".dark {"));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) =>
    L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

/**
 * The surfaces a tinted control can actually sit on.
 *
 * `--background` is the one that keeps getting forgotten, and it is the
 * WORST case in light mode (93% vs the card's 100%). It is not
 * hypothetical: `RunDetail.tsx` and `RunSummary.tsx` render
 * `variant="sport-tinted"` buttons as direct children of the page stack,
 * as siblings of `bg-card` blocks rather than inside one. Checking only
 * card + muted is what let `--running-strong` (4.16:1) and
 * `--lifting-strong` (4.18:1) ship believing they cleared AA.
 */
const TINT_SURFACES = ["card", "muted", "background"] as const;

/**
 * The tint strengths the app actually paints, READ OUT OF THE SOURCE.
 *
 * This was a hardcoded `[0, 0.06, 0.1, 0.12]` for about an hour, and it
 * was already wrong when it was written: `bg-running/18` and
 * `bg-destructive/20` both exist and neither was in the list. That is the
 * same failure the design-system tokens keep having — a copy of a fact
 * that drifts from the fact. Scanning for `bg-<token>/<n>` cannot drift,
 * and it means a designer who introduces a stronger tint automatically
 * gets the contrast question asked.
 *
 * `0` is always included: the untinted case (a `SectionLabel` sitting
 * straight on a card) is the most common one of all. Alphas above 25% are
 * excluded — those are near-solid fills that carry `-foreground` text, not
 * an identity text step.
 */
const SRC = globSync("src/**/*.{ts,tsx}", { cwd: process.cwd() })
  .filter((f) => !f.includes("__tests__"))
  .map((f) => readFileSync(resolve(process.cwd(), f), "utf8"))
  .join("\n");

function tintAlphas(token: string): number[] {
  const found = new Set<number>([0]);
  for (const m of SRC.matchAll(new RegExp(`bg-${token}/(\\d+)`, "g"))) {
    const a = Number(m[1]) / 100;
    if (a <= 0.25) found.add(a);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Each token is held to the bar its ACTUAL USE requires — a single
 * blanket rule would be dishonest here:
 *
 *  - `teal` / `success` are SEMANTIC tokens, free to differ per theme, and
 *    appear at small sizes. They must clear 4.5:1.
 *  - `running` is the FIXED sport identity (`--running` is deliberately
 *    "IDENTICAL to :root" per index.css, and CLAUDE.md bars changing the
 *    colour scheme). It is 3.58:1 on the light card: fine for the large
 *    numerals it headlines (>=24px / >=18.66px bold), short of 4.5:1 for
 *    small text. Pinning it at the large-text bar records that real
 *    constraint instead of pretending the identity is safe everywhere —
 *    small-text coral on light needs a `--running-strong` step, the same
 *    shape as `--primary-strong` / `--nutrition-strong`.
 */
const TOKEN_BARS = [
  { token: "teal", min: AA_NORMAL, use: "semantic, any size" },
  { token: "success", min: AA_NORMAL, use: "semantic, any size" },
  { token: "running", min: AA_LARGE, use: "fixed identity, large text only" },
  {
    token: "running-strong",
    min: AA_NORMAL,
    use: "the AA step for small coral text",
  },
  { token: "lifting", min: AA_LARGE, use: "fixed identity, large text only" },
  {
    token: "lifting-strong",
    min: AA_NORMAL,
    use: "the AA step for small purple text",
  },
] as const;

describe("token contrast — text tokens on the card surface", () => {
  it.each(TOKEN_BARS)(
    "--$token clears its bar on the LIGHT card",
    ({ token, min }) => {
      const block = lightBlock();
      const fg = hslToRgb(...readHsl(block, token));
      const bg = hslToRgb(...readHsl(block, "card"));
      const ratio = contrast(fg, bg);
      expect(
        ratio,
        `--${token} is ${ratio.toFixed(2)}:1 on the light card (needs ${min}:1)`
      ).toBeGreaterThanOrEqual(min);
    }
  );

  it.each(TOKEN_BARS)(
    "--$token clears its bar on the DARK card",
    ({ token, min }) => {
      const dark = darkBlock();
      const fg = hslToRgb(...readHsl(dark, token));
      const bg = hslToRgb(...readHsl(dark, "card"));
      const ratio = contrast(fg, bg);
      expect(
        ratio,
        `--${token} is ${ratio.toFixed(2)}:1 on the dark card (needs ${min}:1)`
      ).toBeGreaterThanOrEqual(min);
    }
  );

  /**
   * Sport-tinted chips (`bg-running/10` + `text-running-strong`) are a
   * standard pattern here, and the tint LOWERS the effective contrast on
   * both themes — the plain-card check alone would miss it. Composite the
   * 10% tint over the card and re-measure.
   */
  /* Both sport identities, on both themes, over EVERY surface a tinted
     chip can sit on. `--card` alone is not enough: `--muted` is the raised
     tile (it failed first for purple, 3.70:1 in dark) and `--background`
     is the page canvas, which is darker still in light mode — that one
     failed BOTH sport steps at 4.16 / 4.18:1 and is why they were retuned
     on 2026-08-10. See TINT_SURFACES for why the canvas counts. */
  /* Every identity that has an AA text step, on both themes, over every
     surface x every tint strength the source actually paints. The token
     list is derived from the CSS itself, so a new `--x-strong` is measured
     the moment it is defined. */
  const STEPPED = [
    "running",
    "lifting",
    "nutrition",
    "destructive",
    "success",
    "warning",
    "achievement",
  ] as const;

  it.each(
    STEPPED.flatMap((token) =>
      (["light", "dark"] as const).map((theme) => ({ token, theme }))
    )
  )(
    "$token-strong clears AA on every $theme tint it can sit on",
    ({ token, theme }) => {
      const block = theme === "light" ? lightBlock() : darkBlock();
      const tint = hslToRgb(...readHsl(block, token));
      const fg = hslToRgb(...readHsl(block, `${token}-strong`));
      const alphas = tintAlphas(token);
      for (const surface of TINT_SURFACES) {
        const bg = hslToRgb(...readHsl(block, surface));
        for (const alpha of alphas) {
          const chip = bg.map((c, i) => alpha * tint[i] + (1 - alpha) * c) as [
            number,
            number,
            number,
          ];
          const ratio = contrast(fg, chip);
          expect(
            ratio,
            `--${token}-strong is ${ratio.toFixed(2)}:1 on a ${token}/${alpha * 100} tint over --${surface} (${theme})`
          ).toBeGreaterThanOrEqual(AA_NORMAL);
        }
      }
    }
  );

  it("teal and success are THEME-AWARE, not one fixed value", () => {
    /* The defect was theme-blindness, not a bad hue: a single value cannot
       clear AA on both a white and a near-black card. A future edit that
       collapses these back to one value across both blocks reintroduces
       exactly that, so the difference itself is the contract. */
    for (const token of [
      "teal",
      "success",
      "running-strong",
      "lifting-strong",
    ] as const) {
      expect(
        readHsl(lightBlock(), token),
        `--${token} must differ between themes`
      ).not.toEqual(readHsl(darkBlock(), token));
    }
  });
});

/**
 * Every Button variant's own label, measured from the classes it SHIPS.
 *
 * The block above pins tokens. This one pins the pairing, and it reads the
 * pairing out of `buttonClasses()` rather than a table copied beside it —
 * so a new variant, or a foreground swapped on an existing one, is
 * measured automatically instead of quietly escaping the suite. (The
 * hand-copied-table version of this check is what CLAUDE.md calls "the
 * tested copy does not prove the running copy".)
 *
 * What it found on 2026-08-10, when the tinted variants were first
 * measured as TEXT rather than as icons — worst case across the three
 * surfaces, both themes:
 *
 *   sport-tinted        2.74:1   text-running     → --running-strong
 *   destructive-tinted  3.44:1   text-destructive → --destructive-strong
 *   nutrition-tinted    2.44:1   dark mode, fill value used as text
 *
 * All three render `text-sm`/`text-xs` labels, so 4.5:1 is the bar, not
 * the 3:1 non-text bar an icon-only reading would have applied.
 */
const BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "destructive",
  "destructive-tinted",
  "ghost",
  "outline",
  "sport",
  "sport-tinted",
  "nutrition",
  "nutrition-tinted",
] as const;

/**
 * No variant is held below the AA bar any more.
 *
 * `sport` was, for about an hour: `bg-running text-white` measures
 * 3.58:1, and the exception said the number could not move without
 * moving the running brand colour. That framing was wrong — the FILL can
 * move while the identity stays put, which is exactly what
 * `--primary-strong` has always done for purple and `--nutrition-fill`
 * now does for orange. `--running-fill` and `--lifting-fill` closed it.
 *
 * The map is kept, empty, on purpose: it is the honest place to record a
 * future exception, and an empty one is a stronger statement than a
 * deleted one.
 */
const KNOWN_BELOW_AA: Record<string, number> = {};

function tokenRgb(
  block: string,
  name: string
): [number, number, number] | null {
  if (name === "white") return [1, 1, 1];
  try {
    return hslToRgb(...readHsl(block, name));
  } catch {
    return null;
  }
}

describe("Button variants — the label clears AA on its own surface", () => {
  it.each(
    BUTTON_VARIANTS.flatMap((variant) =>
      (["light", "dark"] as const).map((theme) => ({ variant, theme }))
    )
  )("$variant ($theme)", async ({ variant, theme }) => {
    const { buttonClasses } = await import("@/components/ui/buttonClasses");
    const classes = buttonClasses({ variant }).split(/\s+/);
    const block = theme === "light" ? lightBlock() : darkBlock();

    // `text-sm` / `text-xs` / `text-base` are FONT SIZES sharing the
    // `text-` prefix. Excluding them by name is deliberate: matching the
    // first `text-` would silently read the size class the day someone
    // reorders `cn()`'s arguments.
    const SIZE_WORDS = new Set(["xs", "sm", "base", "lg", "xl"]);
    const fgClass = classes.find(
      (c) => c.startsWith("text-") && !SIZE_WORDS.has(c.slice("text-".length))
    );
    expect(fgClass, `${variant} has no text-colour class`).toBeTruthy();
    const fg = tokenRgb(block, fgClass!.slice("text-".length));
    expect(fg, `${variant}: ${fgClass} is not a colour token`).toBeTruthy();

    const bgClass = classes.find((c) => c.startsWith("bg-"));
    expect(bgClass, `${variant} has no bg- class`).toBeTruthy();
    const [bgName, alpha] = bgClass!.slice("bg-".length).split("/");

    // `bg-transparent` (ghost, outline) inherits whatever it sits on, so
    // it is measured against every surface exactly like a tint at 0%.
    const tint = bgName === "transparent" ? null : tokenRgb(block, bgName);
    const mix = bgName === "transparent" ? 0 : alpha ? Number(alpha) / 100 : 1;
    expect(
      tint || bgName === "transparent",
      `${variant}: ${bgClass} is not a colour token`
    ).toBeTruthy();

    const min = KNOWN_BELOW_AA[variant] ?? AA_NORMAL;
    // A filled variant (mix === 1) has ONE background; a tint or a
    // transparent fill takes the colour of whatever is behind it.
    const surfaces = mix === 1 ? (["card"] as const) : TINT_SURFACES;
    for (const surface of surfaces) {
      const base = hslToRgb(...readHsl(block, surface));
      const bg = (
        mix === 1
          ? tint!
          : base.map((c, i) => mix * (tint ? tint[i] : c) + (1 - mix) * c)
      ) as [number, number, number];
      const ratio = contrast(fg!, bg);
      expect(
        ratio,
        `${variant} (${theme}): ${fgClass} on ${bgClass}${
          mix === 1 ? "" : ` over --${surface}`
        } is ${ratio.toFixed(2)}:1, needs ${min}:1`
      ).toBeGreaterThanOrEqual(min);
    }
  });

  /**
   * The fill steps, measured under white. These are the OTHER direction
   * from `-strong`: a `-strong` step must be legible ON a surface, a
   * `-fill` step must be legible UNDER white type, so the two move
   * opposite ways in dark mode and cannot be one token.
   */
  it.each(["running", "lifting", "nutrition"] as const)(
    "--%s-fill carries white text at AA",
    (token) => {
      for (const theme of ["light", "dark"] as const) {
        const block = theme === "light" ? lightBlock() : darkBlock();
        const fill = hslToRgb(...readHsl(block, `${token}-fill`));
        const ratio = contrast([1, 1, 1], fill);
        expect(
          ratio,
          `white on --${token}-fill is ${ratio.toFixed(2)}:1 (${theme})`
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  );

  it("the bare identities still FAIL under white — which is why -fill exists", () => {
    /* If an identity ever clears 4.5:1 under white on its own, the fill
       step is redundant and this test says so out loud rather than
       leaving a token nobody can justify. */
    for (const token of ["running", "lifting", "nutrition"] as const) {
      const identity = hslToRgb(...readHsl(lightBlock(), token));
      expect(
        contrast([1, 1, 1], identity),
        `--${token} now clears AA under white; --${token}-fill may be redundant`
      ).toBeLessThan(AA_NORMAL);
    }
  });
});

describe("the static JS hexes these replaced", () => {
  it("documents why inline THEME constants cannot be used for card text", () => {
    /* Kept as an executable record of the measurement, so the reasoning
       survives even if the tokens are later retuned. */
    const onLightCard = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const rgb: [number, number, number] = [
        ((n >> 16) & 255) / 255,
        ((n >> 8) & 255) / 255,
        (n & 255) / 255,
      ];
      return contrast(rgb, hslToRgb(...readHsl(lightBlock(), "card")));
    };
    // THEME.teal and THEME.success — the values that shipped.
    expect(onLightCard("#52A3BD")).toBeLessThan(3);
    expect(onLightCard("#4DB872")).toBeLessThan(3);
  });
});

describe("the range track's fill/groove edge — WCAG 1.4.11", () => {
  /* The edge between the filled and unfilled halves of the run-days
     slider is the ONLY thing that says where the value sits, so it is
     "visual information required to identify the state of a UI
     component" — the 3:1 non-text bar, in both themes.

     This exists because naming the token is not the same as checking it.
     The obvious pick was `--primary-strong`, and it is the pick the rest
     of the app makes for anything filled and brand-coloured — but that
     step is tuned for AA TEXT sitting ON the fill, which a track does not
     have. Measured against `--muted`, it lands at 2.87:1 in dark: an
     improvement on the inverted UA groove it replaced, and still under
     the floor. `--primary` clears it in both directions.

     So the assertion measures rather than naming a token. A future
     retune of either token, or a swap back to `-strong`, fails here
     rather than shipping a slider you cannot read in the dark. */
  it.each(["light", "dark"] as const)(
    "the fill is at least 3:1 against the groove in %s",
    (theme) => {
      const b = theme === "light" ? lightBlock() : darkBlock();
      const fill = hslToRgb(...readHsl(b, "primary"));
      const groove = hslToRgb(...readHsl(b, "muted"));
      const ratio = contrast(fill, groove);
      expect(
        ratio,
        `--primary is ${ratio.toFixed(2)}:1 against --muted in ${theme}. ` +
          `That edge is the slider's only state indication, so it needs ` +
          `3:1 (WCAG 1.4.11). --primary-strong measures 2.87:1 here, which ` +
          `is why the track does not use it.`
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  );

  it("records why --primary-strong is NOT the track fill", () => {
    // The executable form of the comment above — if a retune ever makes
    // -strong viable, this fails and the choice can be revisited.
    const dark = darkBlock();
    const ratio = contrast(
      hslToRgb(...readHsl(dark, "primary-strong")),
      hslToRgb(...readHsl(dark, "muted"))
    );
    expect(
      ratio,
      `--primary-strong now measures ${ratio.toFixed(2)}:1 against the ` +
        `dark groove. It was rejected as the track fill at 2.87:1; if it ` +
        `clears 3:1 now, the index.css comment explaining the choice is ` +
        `stale.`
    ).toBeLessThan(AA_LARGE);
  });
});

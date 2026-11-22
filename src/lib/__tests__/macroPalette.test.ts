/**
 * The macros' colours, chosen by measurement (DS10 call 3). On Food, Home and
 * Progress › Food each is 20 or more (CIEDE2000) from every colour it
 * meets in normal vision, and 15 or more at deuteranopia and protanopia
 * severity 100 from the colours it is told apart from by colour alone
 * (the ring, carbs and the other macro, side by side in the meal's bar
 * and Progress's donut). Each is a 3:1 fill on its theme's card.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEME, MACROS_LIGHT, MACROS_TEXT_LIGHT } from "@/lib/theme";
import { useMacroPalette } from "@/hooks/useMacroPalette";

// The palette's one input is the theme: answered here so the hook runs in
// this node suite without a React tree.
const themeIs = vi.hoisted(() => ({ dark: false }));
vi.mock("@/hooks/useIsDarkTheme", () => ({
  useIsDarkTheme: () => themeIs.dark,
}));
import { nutritionRows } from "@/components/analytics/trendRows";
import { distance, contrast } from "@/test/colourVision";

const SCREENS = {
  dark: {
    card: "#17171B",
    macros: { protein: THEME.macros.protein, fat: THEME.macros.fat },
    meets: {
      ring: THEME.semantic.nutrition,
      carbs: THEME.macros.carbs,
      running: THEME.running,
      water: THEME.teal,
      "water token": "#69A6BF",
      lifting: THEME.lifting,
    },
    alone: ["ring", "carbs"],
  },
  light: {
    card: "#FFFFFF",
    macros: { protein: MACROS_LIGHT.protein, fat: MACROS_LIGHT.fat },
    meets: {
      ring: THEME.semantic.nutrition,
      "ring's deep step": THEME.calorieRing.deep,
      carbs: THEME.macros.carbs,
      "carbs text": MACROS_TEXT_LIGHT.carbs,
      running: THEME.running,
      water: THEME.teal,
      "water token": "#326E85",
      lifting: THEME.lifting,
    },
    alone: ["ring", "ring's deep step", "carbs", "carbs text"],
  },
} as const;

describe.each(Object.entries(SCREENS))("the macros in %s", (_theme, s) => {
  const macros = Object.entries(s.macros);

  it.each(macros)("%s is 20 or more from every colour it meets", (_m, c) => {
    const others = [
      ...Object.entries(s.meets),
      ...macros.filter(([, x]) => x !== c),
    ];
    for (const [name, other] of others)
      expect(distance(c, other, "normal"), name).toBeGreaterThanOrEqual(20);
  });

  it.each(macros)(
    "%s is 15 or more at deutan and protan 100 from what colour alone separates",
    (_m, c) => {
      const alone = [
        ...s.alone.map((n) => [n, s.meets[n as keyof typeof s.meets]] as const),
        ...macros.filter(([, x]) => x !== c),
      ];
      for (const [name, other] of alone) {
        expect(distance(c, other, "deutan"), name).toBeGreaterThanOrEqual(15);
        expect(distance(c, other, "protan"), name).toBeGreaterThanOrEqual(15);
      }
    }
  );

  it.each(macros)("%s is a 3:1 fill on the card", (_m, c) => {
    expect(contrast(c, s.card)).toBeGreaterThanOrEqual(3);
  });
});

describe("one protein, one fat", () => {
  it("leaves pink and sage", () => {
    expect(THEME.macros.protein).not.toBe("#EC4899");
    expect(THEME.macros.fat).not.toBe("#7CB46C");
  });

  it("the light theme's text steps are its fills, at AA on white", () => {
    expect(MACROS_TEXT_LIGHT.protein).toBe(MACROS_LIGHT.protein);
    expect(MACROS_TEXT_LIGHT.fat).toBe(MACROS_LIGHT.fat);
    for (const c of [MACROS_LIGHT.protein, MACROS_LIGHT.fat])
      expect(contrast(c, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("Progress draws protein's trend in protein's colour, not the food orange", () => {
    const rows = nutritionRows({
      daysLogged: 5,
      avgCalories: 2100,
      avgProtein: 140,
      caloriesSeries: [],
      proteinSeries: [],
      showSeries: false,
      targetCalories: 2300,
      targetProtein: 160,
    });
    expect(rows.find((r) => r.key === "protein")?.color).toBe(
      THEME.macros.protein
    );
    const history = readFileSync(
      resolve(process.cwd(), "src/pages/History.tsx"),
      "utf8"
    );
    expect(history).toContain("proteinColor: macroAccent.protein");
  });
});

/* Every surface a macro's figure or swatch can sit on, read from the
   tokens in index.css: the page, the card, the raised tile, a field, the
   solid sheet and in dark the stage and its panel, each also under the
   macro's own 10% tint (a macro tile).
   The axe capture found the jade fat at 4.27:1 as 14px text on a dark
   surface lighter than the card; the words are the text colour now, with
   the swatch beside them, so this holds the words to 4.5:1 and the
   swatch to 3:1 on every one of them. */
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const DARK_AT = CSS.indexOf(".dark {");
function token(theme: "light" | "dark", name: string): string {
  const block = theme === "light" ? CSS.slice(0, DARK_AT) : CSS.slice(DARK_AT);
  const hex = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (hex) return hex[1].toLowerCase();
  const m = block.match(
    new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`)
  );
  if (!m) throw new Error(`--${name} not found in ${theme}`);
  const [h, sat, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
  const a = sat * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (
    "#" +
    [f(0), f(8), f(4)]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}
function tint(fg: string, bg: string, alpha: number): string {
  const ch = (h: string, i: number) =>
    parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}
const SURFACES = {
  light: ["background", "card", "muted", "input-fill", "surface-solid"],
  dark: [
    "background",
    "card",
    "muted",
    "input-fill",
    "surface-solid",
    "stage",
    "stage-raised",
  ],
} as const;

describe.each(["light", "dark"] as const)(
  "a macro's figure and swatch on every %s surface",
  (theme) => {
    themeIs.dark = theme === "dark";
    const { accent, text } = useMacroPalette();
    const textColour = token(theme, "foreground");

    it.each(["protein", "carbs", "fat"] as const)(
      "%s: its words are the text colour, 4.5:1 or more everywhere",
      (m) => {
        expect(text[m]).toBe("hsl(var(--foreground))");
        for (const name of SURFACES[theme]) {
          const base = token(theme, name);
          for (const ground of [base, tint(accent[m], base, 0.1)])
            expect(
              contrast(textColour, ground),
              `${name}`
            ).toBeGreaterThanOrEqual(4.5);
        }
      }
    );

    it.each(["protein", "fat"] as const)(
      "%s: its swatch is 3:1 or more on every surface and its own tint",
      (m) => {
        for (const name of SURFACES[theme]) {
          const base = token(theme, name);
          for (const ground of [base, tint(accent[m], base, 0.1)])
            expect(
              contrast(accent[m], ground),
              `${name}`
            ).toBeGreaterThanOrEqual(3);
        }
      }
    );
  }
);

describe("no macro's colour is drawn as words", () => {
  it.each([
    "src/components/settings/NutritionSection.tsx",
    "src/components/nutrition/ServingSizeDrawer.tsx",
  ])("%s puts the swatch beside each macro's name", (f) => {
    const src = readFileSync(resolve(process.cwd(), f), "utf8");
    expect(src.match(/<MacroSwatch /g)?.length).toBe(3);
  });
});

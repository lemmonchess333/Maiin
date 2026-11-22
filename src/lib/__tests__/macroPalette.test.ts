/**
 * The macros' colours, chosen by measurement (DS10 call 3, owner 22
 * November 2026). Fat left sage green, which was 6.6 from success green
 * for everyone and 6 to 8 from the food ring for colour-blind people;
 * protein left pink, 10 from the running coral on Home. On Food, Home and
 * Progress › Food each is 20 or more (CIEDE2000) from every colour it
 * meets in normal vision, and 15 or more at deuteranopia and protanopia
 * severity 100 from the colours it is told apart from by colour alone
 * (the ring, carbs and the other macro, side by side in the meal's bar
 * and Progress's donut). Each is a 3:1 fill on its theme's card.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEME, MACROS_LIGHT, MACROS_TEXT_LIGHT } from "@/lib/theme";
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

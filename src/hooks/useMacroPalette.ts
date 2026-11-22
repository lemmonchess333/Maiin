import { THEME, MACROS_LIGHT, MACROS_TEXT_LIGHT } from "@/lib/theme";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";

/**
 * Returns a macro colour palette split into two tracks:
 *   • `accent` — the fills: tile backgrounds (at 10% alpha), dots, bars,
 *     chart fills and lines. Protein and fat follow the theme (DS10 call
 *     3: the dark theme's are under 3:1 on white, so light takes
 *     `MACROS_LIGHT`); carbs and the food orange are the same in both.
 *   • `text`   — the colour a macro's words take: the text colour for the
 *     three macros, with the macro's swatch (`MacroSwatch`) beside them,
 *     and the food orange's AA step for calories.
 *
 * Use `accent` for `backgroundColor: ${accent.carbs}1A` and a swatch,
 * `text` for `color: text.carbs`.
 */
export function useMacroPalette() {
  // Recolours when the theme flips at runtime (Settings writes .dark on
  // the root element).
  const isDark = useIsDarkTheme();

  const accent = {
    protein: isDark ? THEME.macros.protein : MACROS_LIGHT.protein,
    carbs: THEME.macros.carbs,
    fat: isDark ? THEME.macros.fat : MACROS_LIGHT.fat,
    nutrition: THEME.semantic.nutrition,
  } as const;

  // A macro's words are the text colour, its colour the swatch, icon or
  // bar beside them: the jade fat is under 4.5:1 as small text on the
  // lighter dark surfaces, and no fat colour that keeps the colour-blind
  // floors clears it there (DS10 call 3). The food orange keeps its text
  // step.
  const text = {
    protein: "hsl(var(--foreground))",
    carbs: "hsl(var(--foreground))",
    fat: "hsl(var(--foreground))",
    nutrition: isDark ? accent.nutrition : MACROS_TEXT_LIGHT.nutrition,
  } as const;

  return { accent, text };
}

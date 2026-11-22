import { THEME, MACROS_LIGHT, MACROS_TEXT_LIGHT } from "@/lib/theme";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";

/**
 * Returns a macro colour palette split into two tracks:
 *   • `accent` — the fills: tile backgrounds (at 10% alpha), dots, bars,
 *     chart fills and lines. Protein and fat follow the theme (DS10 call
 *     3: the dark theme's are under 3:1 on white, so light takes
 *     `MACROS_LIGHT`); carbs and the food orange are the same in both.
 *   • `text`   — contrast-safe values for text rendered on card surfaces.
 *     In dark mode this is the bright palette (high contrast on the dark card);
 *     in light mode this switches to the darker variants in
 *     `MACROS_TEXT_LIGHT` so labels clear WCAG AA on white.
 *
 * Use `accent` for `backgroundColor: ${accent.carbs}1A`, `text` for
 * `color: text.carbs`.
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

  const text = isDark
    ? accent
    : ({
        protein: MACROS_TEXT_LIGHT.protein,
        carbs: MACROS_TEXT_LIGHT.carbs,
        fat: MACROS_TEXT_LIGHT.fat,
        nutrition: MACROS_TEXT_LIGHT.nutrition,
      } as const);

  return { accent, text };
}

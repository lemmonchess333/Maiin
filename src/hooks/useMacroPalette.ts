import { useSyncExternalStore } from "react";
import { THEME, MACROS_TEXT_LIGHT } from "@/lib/theme";

// Subscribe to class-attribute changes on documentElement so macro tiles
// recolour when the user toggles dark mode at runtime (Settings writes
// .dark on the root element — see Settings.tsx:205). Mirrors the pattern
// used by MuscleHeatMap.
function subscribeDarkMode(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getIsDark() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Returns a macro colour palette split into two tracks:
 *   • `accent` — the bright brand values, safe for tile backgrounds
 *     (used at 10% alpha), dots, chart fills, and any other graphical
 *     usage. Identical in light and dark mode.
 *   • `text`   — contrast-safe values for text rendered on card surfaces.
 *     In dark mode this is the bright palette (high contrast on #1A1A1F);
 *     in light mode this switches to the darker variants in
 *     `MACROS_TEXT_LIGHT` so labels clear WCAG AA on white.
 *
 * Use `accent` for `backgroundColor: ${accent.carbs}1A`, `text` for
 * `color: text.carbs`.
 */
export function useMacroPalette() {
  const isDark = useSyncExternalStore(
    subscribeDarkMode,
    getIsDark,
    () => false,
  );

  const accent = {
    protein: THEME.macros.protein,
    carbs: THEME.macros.carbs,
    fat: THEME.macros.fat,
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

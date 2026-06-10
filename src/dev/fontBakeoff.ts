/*
 * DEV/TEST-ONLY font bake-off override (see main.tsx — gated on
 * import.meta.env.MODE !== "production", so this module and the candidate
 * fonts it imports are dead-code-eliminated from the real production build).
 *
 * Applies a whole-app numeral/display font combo from a `bk-font-combo`
 * localStorage key, so the Playwright rig can capture the REAL screens
 * (Home, Food, History, RunDetail) under each candidate combination — the
 * only honest way to judge the mixed-numeral / zero-consistency / contrast
 * questions the isolated samples can't answer.
 *
 * Combos:
 *   control      → no override (Plus Jakarta Sans + JetBrains Mono)
 *   archivo-num  → numbers → Archivo; text stays Plus Jakarta Sans
 *   archivo-all  → numbers AND text → Archivo (single-family)
 */
import "@fontsource-variable/archivo/standard.css";

const ARCHIVO = "'Archivo Variable', ui-sans-serif, system-ui, sans-serif";

export function initFontBakeoff() {
  let combo: string | null = null;
  try {
    combo = localStorage.getItem("bk-font-combo");
  } catch {
    /* private mode */
  }
  if (!combo || combo === "control") return;

  const root = document.documentElement;
  // Numbers everywhere use .font-mono → var(--font-mono). Override the var.
  root.style.setProperty("--font-mono", ARCHIVO);

  const style = document.createElement("style");
  // Keep digits tabular in the candidate face (matches the live tabular-nums
  // usage; verified Archivo holds equal digit width with tnum).
  let css = `.font-mono { font-feature-settings: "tnum" 1; font-variant-numeric: tabular-nums; }`;

  if (combo === "archivo-all") {
    // Display text uses var(--font-display); the <body> rule hardcodes
    // Plus Jakarta Sans, so override both.
    root.style.setProperty("--font-display", ARCHIVO);
    css += `\nbody { font-family: ${ARCHIVO}; }`;
  }

  style.setAttribute("data-bk-font", combo);
  style.textContent = css;
  document.head.appendChild(style);
}

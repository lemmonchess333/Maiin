/**
 * Share-card palette drift pin (visual audit Phase 7).
 *
 * ShareCardRenderer is deliberately token-FREE: html-to-image's DOM clone
 * can't reliably resolve CSS variables, so the card hardcodes its sport
 * colours as literals (documented in the component header). That's correct
 * for capture — but it means a future THEME change would silently leave
 * exported share cards wearing the OLD brand colours. This source-scan pin
 * makes that drift loud: the renderer's literals must equal the THEME
 * tokens they duplicate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { THEME } from "../theme";

const here = dirname(fileURLToPath(import.meta.url));
const rendererSrc = readFileSync(
  resolve(here, "../../components/share/ShareCardRenderer.tsx"),
  "utf8"
);

function literal(name: string): string {
  const m = rendererSrc.match(
    new RegExp(`const ${name} = "(#[0-9a-fA-F]{6})"`)
  );
  expect(m, `${name} literal not found in ShareCardRenderer`).not.toBeNull();
  return m![1].toLowerCase();
}

describe("share-card palette stays in lockstep with THEME", () => {
  it("RUN_CORAL === THEME.running", () => {
    expect(literal("RUN_CORAL")).toBe(THEME.running.toLowerCase());
  });
  it("LIFT_PURPLE === THEME.lifting", () => {
    expect(literal("LIFT_PURPLE")).toBe(THEME.lifting.toLowerCase());
  });
  it("NUTRITION_ORANGE === THEME.semantic.nutrition", () => {
    expect(literal("NUTRITION_ORANGE")).toBe(
      THEME.semantic.nutrition.toLowerCase()
    );
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
import {
  HUD_CAPTION,
  HUD_SECONDARY,
  HUD_MIN_FONT_PX,
} from "../runHudTypography";

/**
 * D18: the run HUD's small text must clear the app's own floors.
 *
 * The active-run sheet carried FOUR arbitrary treatments across eighteen
 * sites — 8px/25% white, 9px/28%, 9px/30%, 9px/40%, 10px/35% — and every
 * one failed two documented rules at once. Measured off the first capture
 * frame the run HUD has ever had (`run-hud-active.png`):
 *
 *   TIME / KM / pace unit   9px   2.50:1
 *   CAL / ELEV / SPLITS     8px   2.15:1
 *   LOCK / PAUSE / HOLD     9px   2.22:1
 *
 * against an 11px floor and WCAG AA's 4.5:1 — roughly half of each, on the
 * one screen people read while moving, outdoors, at arm's length.
 *
 * The row stayed open for months for a good reason: nothing could show the
 * result of changing it. That is what the capture spec fixed, and this is
 * what stops it drifting back — the sheet styles inline, so nothing else
 * in the toolchain looks at these numbers.
 *
 * The contrast is COMPUTED here rather than asserted as a colour string,
 * because "50% white" is not the property that matters; 4.5:1 against this
 * particular near-black ground is, and a future change to either side
 * should have to face that number.
 */
const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const runDir = resolve(repoRoot, "src/components/run");

/** The active-run sheet's ground, sampled from `run-hud-active.png`. */
const SHEET_GROUND: [number, number, number] = [22, 22, 26];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: [number, number, number]): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

/** Composite `rgba(255,255,255,a)` over the sheet and return its ratio. */
function contrastOnSheet(rgba: string): number {
  const m = /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/.exec(rgba);
  if (!m) throw new Error(`not a white-alpha colour: ${rgba}`);
  const a = Number.parseFloat(m[1]);
  const composited = SHEET_GROUND.map((v) =>
    Math.round(a * 255 + (1 - a) * v)
  ) as [number, number, number];
  const l1 = Math.max(luminance(composited), luminance(SHEET_GROUND)) + 0.05;
  const l2 = Math.min(luminance(composited), luminance(SHEET_GROUND)) + 0.05;
  return l1 / l2;
}

function runFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...runFiles(full));
      continue;
    }
    if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("run HUD typography — D18 floors", () => {
  it("both roles clear the 11px floor", () => {
    // SectionLabel's docstring calls 11px "the app-wide minimum text size
    // (accessibility floor)". These are the only two treatments the sheet
    // has left, so the floor holds if they do.
    expect(HUD_CAPTION.fontSize).toBeGreaterThanOrEqual(HUD_MIN_FONT_PX);
    expect(HUD_SECONDARY.fontSize).toBeGreaterThanOrEqual(HUD_MIN_FONT_PX);
  });

  it("both roles clear WCAG AA against the sheet's own ground", () => {
    for (const [name, role] of [
      ["HUD_CAPTION", HUD_CAPTION],
      ["HUD_SECONDARY", HUD_SECONDARY],
    ] as const) {
      const ratio = contrastOnSheet(role.color);
      expect(
        ratio,
        `${name} (${role.color}) measures ${ratio.toFixed(2)}:1 on the ` +
          `run sheet. The four treatments this replaced ran 2.15-2.50:1.`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("secondary data reads at least as strongly as a caption", () => {
    // It carries a value rather than naming one, so it may not be dimmer.
    expect(contrastOnSheet(HUD_SECONDARY.color)).toBeGreaterThanOrEqual(
      contrastOnSheet(HUD_CAPTION.color)
    );
  });

  it("the pre-fix treatments really did fail — the proof, not the story", () => {
    // Kept as an assertion so the justification cannot rot into folklore,
    // and so a "restore the old look" change has to argue with a number.
    for (const old of [
      "rgba(255,255,255,0.25)",
      "rgba(255,255,255,0.28)",
      "rgba(255,255,255,0.3)",
      "rgba(255,255,255,0.4)",
    ]) {
      expect(contrastOnSheet(old)).toBeLessThan(4.5);
    }
  });

  it("no run component sets a sub-11px fontSize inline", () => {
    /* The sheet styles inline throughout, so no linter or Tailwind config
       sees these numbers. This is the only thing that does.

       Recharts AXIS TICKS are exempt, and that is D18's own carve-out
       rather than a convenience: "Chart axis ticks (TrendWeight,
       CalorieBalanceChart, 9-10px) are a separate and more defensible case
       — Recharts ticks are not body text." Scoped to the `tick={{…}}` prop
       specifically, so a genuine label in a charting file is still caught. */
    const offenders: string[] = [];
    for (const f of runFiles(runDir)) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/fontSize:\s*(\d+)/g)) {
        const px = Number(m[1]);
        if (px >= HUD_MIN_FONT_PX) continue;
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        if (/tick=\{\{[^}]*$/.test(before)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${relative(repoRoot, f)}:${line} → ${px}px`);
      }
    }
    expect(
      offenders,
      `Sub-${HUD_MIN_FONT_PX}px text on the run surface. Use HUD_CAPTION or ` +
        `HUD_SECONDARY — they are the two roles this sheet has, and they are ` +
        `the reason D18 could be closed.`
    ).toEqual([]);
  });
});

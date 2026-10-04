/**
 * The key under the pace-coloured route map describes the colours the map
 * actually draws. It showed three swatches ("Faster / On pace / Slower")
 * over a route drawn in four, with no label to say what they keyed, and
 * "On pace" named a target the colouring never had: each stretch is
 * coloured against the run's own average.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PaceLegend from "../PaceLegend";
import { routePaceColor } from "../routePace";
import { THEME } from "@/lib/theme";

afterEach(() => cleanup());

/** jsdom normalises inline colours to "rgb(r, g, b)". */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** Every colour the map can give a stretch, in the order a stretch meets
 *  them as it gets slower against the run's average. */
function colorsTheMapDraws(): string[] {
  const seen: string[] = [];
  for (let ratio = 0.5; ratio <= 2; ratio += 0.001) {
    const color = routePaceColor(ratio);
    if (!seen.includes(color)) seen.push(color);
  }
  return seen;
}

describe("route pace colours (RunMap)", () => {
  it("the map colours its route through the shared steps, not its own", () => {
    /* The test below holds the steps; this holds the map to them. RunMap
       needs WebGL, so its source is read rather than rendered: it must
       colour through `routePaceColor` and carry no pace colour of its own
       for the key to fall out of step with. */
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../RunMap.tsx"),
      "utf8"
    );
    expect(src).toMatch(/routePaceColor\(segPace \/ avgPaceSecPerKm\)/);
    expect(src).not.toMatch(/THEME\.pace(Fast|OnTarget|Slow)/);
  });

  it("colours a stretch by its pace against the run's average", () => {
    expect(routePaceColor(0.85)).toBe(THEME.paceFast);
    expect(routePaceColor(0.92)).toBe(THEME.paceOnTarget);
    expect(routePaceColor(1)).toBe(THEME.paceOnTarget);
    expect(routePaceColor(1.03)).toBe(THEME.warning);
    expect(routePaceColor(1.09)).toBe(THEME.warning);
    expect(routePaceColor(1.1)).toBe(THEME.paceSlow);
    expect(routePaceColor(Number.NaN)).toBe(THEME.paceSlow);
  });
});

describe("PaceLegend", () => {
  it("says what it keys and orders the steps from faster to slower", () => {
    render(<PaceLegend />);
    const key = screen.getByRole("img", {
      name: "Route pace, coloured from faster to slower than your average",
    });
    expect(key.textContent).toBe("Route paceFasterSlower");
    expect(screen.queryByText("On pace")).toBeNull();
  });

  it("draws every colour the map draws, in the map's order", () => {
    render(<PaceLegend />);
    const swatches = within(screen.getByRole("img"))
      .getAllByTestId("route-pace-step")
      .map((swatch) => swatch.style.background);
    // Four, not three: the amber step had no swatch.
    expect(swatches).toEqual(colorsTheMapDraws().map(rgb));
    expect(swatches).toHaveLength(4);
  });
});

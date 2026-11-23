/**
 * Gold is for bests only, and success green is a tick (DS10 call 4): a new
 * best's values and the longest streak are gold, and green is a tick
 * beside neutral words, never "PR".
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("gold is for bests", () => {
  it("the longest streak is gold and the current streak the text colour", () => {
    const grid = read("src/features/streaks/BadgeGrid.tsx");
    const figure = (label: string) => {
      const at = grid.indexOf(`>${label}</p>`);
      const open = grid.lastIndexOf('<p className="text-3xl', at);
      return grid.slice(open, grid.indexOf(">", open));
    };
    expect(figure("Longest streak")).toContain("text-achievement-strong");
    expect(figure("Current streak")).toContain("text-foreground");
  });

  it("the Bests page's values are plain, its trophy and New chip gold", () => {
    // As Strava's and Hevy's best-effort lists: plain values beside a
    // trophy, so gold stays rare.
    for (const f of [
      "src/components/analytics/PRsTab.tsx",
      "src/components/analytics/PRCard.tsx",
    ])
      expect(read(f), f).toContain(
        "text-sm font-bold font-mono tabular-nums text-foreground"
      );
    const card = read("src/components/analytics/PRCard.tsx");
    expect(card).toContain('<Trophy className="size-4 text-achievement" />');
    expect(card).toContain("bg-achievement/15");
  });

  it("the lift finish's New bests values are gold", () => {
    expect(read("src/components/workout/SessionCompleteScreen.tsx")).toContain(
      "text-lg font-extrabold font-figure tabular-nums text-achievement-strong"
    );
  });
});

describe("success green is a tick beside neutral words", () => {
  /* Every use is a tick beside its words, a done set's box or the shoe
     wear bar's first step. A word, a chip or a tint written in it would
     raise the number: give the words the text colour and put a tick
     beside them instead. */
  it("success classes appear on at most 13 lines of the app", () => {
    const lines = globSync("src/**/*.tsx")
      .filter(
        (f) =>
          !f.includes("__tests__") &&
          !f.startsWith("src/website") &&
          !f.includes("/dev/")
      )
      .flatMap((f) =>
        read(f)
          .split("\n")
          .filter((l) =>
            /\b(text-success(-strong)?|bg-success(\/\d+)?)\b/.test(l)
          )
      );
    expect(lines.length).toBeLessThanOrEqual(13);
  });

  it("no success chip or tint, and no PR in green", () => {
    for (const f of globSync("src/**/*.{ts,tsx}")) {
      if (f.includes("__tests__") || f.includes("/dev/")) continue;
      expect(read(f), f).not.toMatch(/bg-success\/\d+ text-success-strong/);
    }
    expect(read("DESIGN_GUIDE.md")).not.toMatch(/Positive \(streak, PR/);
  });
});

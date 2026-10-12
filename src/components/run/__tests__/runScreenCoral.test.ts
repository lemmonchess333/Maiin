/**
 * The live run screen's accent is the run's coral (DESIGN_GUIDE §14, the
 * owner's call in the run screen pass, 2026-10-12). Teal is water's colour
 * (DS3). The screen carried it on the timer, the km bar, the best lap,
 * Resume, the step card, the live route and position dot and the GPS
 * search. Only the heart-rate zone scale keeps a teal step: a five-colour
 * scale, not the screen's accent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FILES = [
  "src/pages/Run.tsx",
  "src/components/run/RunBottomSheet.tsx",
  "src/components/run/IntervalStepShell.tsx",
  "src/components/run/RunMap.tsx",
  "src/components/ui/RunControlButton.tsx",
];

describe("the live run screen's colour", () => {
  it("is coral, with teal left only on the heart-rate zone scale", () => {
    const uses = FILES.flatMap((file) =>
      readFileSync(resolve(root, file), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) =>
          /THEME\.(teal|semantic\.hydration)\b|#52A3BD/i.test(line)
        )
        .map((line) => `${file}: ${line}`)
    );
    expect(uses).toEqual([
      "src/components/run/RunBottomSheet.tsx: 1: THEME.teal,",
    ]);
  });
});

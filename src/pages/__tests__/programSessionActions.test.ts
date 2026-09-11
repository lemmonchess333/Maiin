/**
 * "Make this next" leads the day's action row, through the Button primitive.
 *
 * On an upcoming day you cannot start the session, so moving the cursor to
 * it IS the action — but it rendered after "Skip session" as a hand-rolled
 * `<button>` in `text-muted-foreground`, which reads as disabled and gives
 * a keyboard user no focus ring. That exact defect was already fixed for
 * "Short on time?" in the same row; its comment describes the fix, and the
 * two cursor controls beside it were left behind.
 *
 * Pinned at the source rather than by render: Program.tsx mounts a very
 * large tree (charts, sheets, several Firestore hooks) and nothing in the
 * repo renders it in jsdom. A source pin cannot prove what a user sees, so
 * it is deliberately narrow — the ORDER of the two controls, and that
 * neither is hand-rolled again.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8");
/** Comments name the old markup to explain the fix; matching raw source
 *  would flag that prose and push someone to delete the explanation. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

describe("the day's action row", () => {
  it("offers Make this next before Skip session", () => {
    const makeNext = code.indexOf("Make this next");
    const skip = code.indexOf("Skip session");
    expect(makeNext).toBeGreaterThan(-1);
    expect(skip).toBeGreaterThan(-1);
    expect(makeNext).toBeLessThan(skip);
  });

  it("routes both cursor controls through the Button primitive", () => {
    for (const label of ["Make this next", "Follow programme order"]) {
      const at = code.indexOf(label);
      // The element opening tag within the ~400 chars before the label.
      const before = code.slice(Math.max(0, at - 400), at);
      const lastOpen = before.lastIndexOf("<");
      expect(before.slice(lastOpen, lastOpen + 8)).toContain("<Button");
    }
  });

  it("gives Make this next more weight than the skip beside it", () => {
    // ghost is what Skip session and "Short on time?" use; the cursor move
    // has to outrank them or the promotion is cosmetic.
    const at = code.indexOf("Make this next");
    const before = code.slice(Math.max(0, at - 400), at);
    expect(before).toMatch(/variant="secondary"/);
    expect(before).not.toMatch(/variant="ghost"/);
  });

  it("no longer hand-rolls a muted-foreground control in that row", () => {
    // The shape the Button primitive replaced, in all three call sites.
    expect(code).not.toMatch(
      /className="min-h-\[44px\] px-4 inline-flex items-center justify-center text-sm font-medium text-muted-foreground/
    );
  });
});

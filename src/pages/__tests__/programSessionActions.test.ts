import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The day's one action lives in the card, whatever the day is.
 *
 * This file used to pin "Make this next" as the FIRST control in the row
 * beneath the card, ahead of Skip session, because on a day you cannot
 * start, moving the cursor IS the action and ghost weight put it level
 * with a skip. That reasoning held; its conclusion moved. The card now
 * carries the day's single action in its own slot — Start on the
 * startable day, Make this next on an upcoming one, nothing on a
 * terminal one — so ordering it against Skip is no longer the question.
 *
 * What survives unchanged is the defect underneath. All three of these
 * controls were once hand-rolled `<button>`s in `text-muted-foreground`
 * with no focus styling: they read as disabled, and a keyboard user got
 * no focus indicator at all. That is pinned below and is the reason this
 * file exists after the layout changed.
 *
 * Pinned at the source, for the reason the header of
 * `programExerciseList.test.ts` gives: Program.tsx mounts charts, sheets
 * and several Firestore hooks, and nothing in the repo renders it in
 * jsdom. A source pin cannot prove what a user sees, so these stay
 * narrow.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8");
/** Comments name the old markup to explain the fix; matching raw source
 *  would flag that prose and push someone to delete the explanation. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

describe("the card carries the day's action", () => {
  it("offers Make this next in the card's slot, not a row beneath it", () => {
    const at = code.indexOf('"Make this next"');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(Math.max(0, at - 400), at)).toContain(
      "primaryActionLabel="
    );
  });

  it("offers it only on a day that cannot be started", () => {
    const at = code.indexOf('"Make this next"');
    const before = code.slice(Math.max(0, at - 300), at);
    expect(before).toMatch(/status === "upcoming"/);
  });

  it("never offers it on a history week", () => {
    /* History weeks are records, not prescriptions — the same gate the
       row applied. Without it, viewing a past week would offer to move
       the cursor onto a day that has already been and gone. */
    const at = code.indexOf('"Make this next"');
    expect(code.slice(Math.max(0, at - 300), at)).toContain(
      "!isViewingHistory"
    );
  });

  it("does not dress a cursor move as a session start", () => {
    /* Start is a filled Play CTA. Moving the cursor is neither, so the
       slot takes its own icon and the `secondary` weight the row gave
       it — the card's default would make the two look identical. */
    expect(code).toMatch(/primaryActionIcon=\{[\s\S]{0,120}ArrowUp/);
    expect(code).toMatch(/primaryActionVariant=\{[\s\S]{0,120}"secondary"/);
  });

  it("leaves Run's card exactly as it was", () => {
    /* Both overrides are optional and Run passes neither, so its Start
       keeps the coral `sport` fill and the Play icon. */
    const run = readFileSync(
      resolve(repoRoot, "src/components/program/SessionCommandCard.tsx"),
      "utf8"
    );
    expect(run).toContain('primaryActionVariant ?? (sport === "run"');
    expect(run).toMatch(/primaryActionIcon \?\?/);
  });
});

describe("the defect the Button primitive fixed", () => {
  it("routes the surviving cursor control through the primitive", () => {
    const at = code.indexOf("Follow programme order");
    expect(at).toBeGreaterThan(-1);
    const before = code.slice(Math.max(0, at - 400), at);
    const lastOpen = before.lastIndexOf("<");
    expect(before.slice(lastOpen, lastOpen + 8)).toContain("<Button");
  });

  it("no longer hand-rolls a muted-foreground control anywhere", () => {
    // The shape the Button primitive replaced, in all three call sites.
    expect(code).not.toMatch(
      /className="min-h-\[44px\] px-4 inline-flex items-center justify-center text-sm font-medium text-muted-foreground/
    );
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The one link the disclosure's own tests cannot see.
 *
 * `exerciseListDisclosure.test.tsx` renders the component and pins its
 * behaviour, including that `forceOpen` holds the panel open. What it
 * cannot know is whether the PAGE passes anything into that prop — and
 * the prop's whole reason for existing is Program's own wiring:
 * "Reorder exercises" is a page-header overflow action, so it can be
 * tapped while the list is collapsed, and without `forceOpen={reorderMode}`
 * the mode starts with nothing on screen to drag. Pass `undefined` there
 * and every component test stays green.
 *
 * Pinned at the source, for the reason `programSessionActions.test.ts`
 * gives: Program.tsx mounts charts, sheets and several Firestore hooks,
 * and nothing in the repo renders it in jsdom. A source pin cannot prove
 * what a user sees, so this one is deliberately narrow — the wiring, and
 * that the list did not quietly escape the fold again.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8");
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

describe("the exercise list is folded, and the drag mode can still reach it", () => {
  it("renders the list through the disclosure", () => {
    expect(code).toContain("<ExerciseListDisclosure");
    expect(code).toContain("</ExerciseListDisclosure>");
  });

  it("hands the drag mode the override that opens it", () => {
    expect(code).toMatch(/forceOpen=\{reorderMode\}/);
  });

  it("puts BOTH the rows and Add exercise inside the fold", () => {
    /* Collapsed should be one row, not one row plus an orphan button —
       and "Add exercise" outside the panel would also leave the page
       taller than the fold was measured to make it. */
    const open = code.indexOf("<ExerciseListDisclosure");
    const close = code.indexOf("</ExerciseListDisclosure>");
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const panel = code.slice(open, close);
    expect(panel).toContain("<DndContext");
    expect(panel).toContain("Add exercise");
  });

  it("keeps the per-row manage menu inside it", () => {
    /* Replace / Remove / Move live only here — the day sheet is
       day-scoped and offers none of the three. If this drifts out of the
       panel the fold has hidden the affordance instead of deferring it. */
    const open = code.indexOf("<ExerciseListDisclosure");
    const close = code.indexOf("</ExerciseListDisclosure>");
    expect(code.slice(open, close)).toContain("More options for ");
  });
});

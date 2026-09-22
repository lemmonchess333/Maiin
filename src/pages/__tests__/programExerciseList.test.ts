import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The lift day's exercise list is on screen, not behind a control.
 *
 * A disclosure was built here and removed at the owner's call: with the
 * card stating the session directly above it, a tap that hid the list
 * left the page saying one thing twice. What remains is the invariant
 * worth holding — everything the list offers is reachable ONLY from the
 * list. `DayActionSheet` is day-scoped and offers no Replace, Remove or
 * Move, and "Reorder exercises" lives in the PAGE HEADER's overflow, so
 * a gate in front of the rows is a drag mode with nothing to drag.
 *
 * Each absence below is anchored on a positive in the same test, per the
 * standing rule: an absence that is a test's only assertion stops
 * testing anything the moment its mechanism stops being the one in use.
 *
 * Pinned at the source, for the reason `programSessionActions.test.ts`
 * gives: Program.tsx mounts charts, sheets and several Firestore hooks,
 * and nothing in the repo renders it in jsdom. A source pin cannot
 * prove what a user sees, so these are deliberately narrow.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const code = strip(
  readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8")
);
const card = strip(
  readFileSync(
    resolve(repoRoot, "src/components/program/SessionCommandCard.tsx"),
    "utf8"
  )
);

/**
 * The lift day's body: from the command card to the completed-session
 * block that follows the list.
 *
 * The boundary is a STRING the page renders, not the JSX comment that
 * labels it — `strip` deletes comments, so a comment anchor resolves to
 * -1 and `slice` then quietly hands back the whole rest of the file.
 * That is a slice which contains everything and proves nothing.
 */
const DAY_BODY_END = "This programme day is complete.";
const dayBody = () => {
  const open = code.indexOf("<SessionCommandCard");
  expect(open).toBeGreaterThan(-1);
  const close = code.indexOf(DAY_BODY_END, open);
  expect(close).toBeGreaterThan(open);
  return code.slice(open, close);
};

describe("the list renders with the day, ungated", () => {
  it("puts the rows and Add exercise in the day's body", () => {
    const body = dayBody();
    expect(body).toContain("<DndContext");
    expect(body).toContain("Add exercise");
  });

  it("keeps the per-row manage menu there — it exists nowhere else", () => {
    /* Replace / Remove / Move live only here; the day sheet offers none
       of the three, so anything in front of this list buries all three. */
    expect(dayBody()).toContain("More options for ");
  });

  it("holds no open/closed state for it", () => {
    /* Anchored on the rows above: the day body has the list, and the
       page has no boolean deciding whether to show it. `reorderMode`
       chooses BETWEEN two row renderings; it does not gate them. */
    expect(code).not.toMatch(/exercisesExpanded|ExerciseListFooter/);
    expect(code).toMatch(/const \[reorderMode, setReorderMode\]/);
  });

  it("offers no disclosure on the card that sits above it", () => {
    /* The card's slot for one is gone from the primitive, so a fold
       cannot return by wiring alone. Anchored on the props it does
       still take. */
    expect(card).toMatch(/primaryActionLabel\?: string/);
    expect(card).not.toMatch(/\bfooter\b/);
  });
});

describe("the two repeats the card no longer carries", () => {
  it("does not count the exercises above a list of them", () => {
    expect(code).toMatch(/~\$\{estimatedMinutes\} min/);
    expect(code).not.toMatch(/\$\{exerciseCount\} exercises/);
    expect(code).not.toMatch(/\bexerciseCount\b/);
  });

  it("does not number the day above a day cell already numbered", () => {
    expect(code).toMatch(/<ProgrammeWeekSelector/);
    expect(code).not.toMatch(/· Day \$\{idx \+ 1\}/);
  });
});

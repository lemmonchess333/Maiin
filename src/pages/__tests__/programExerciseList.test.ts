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

describe("the page reads top to bottom", () => {
  const at = (needle: string) => {
    const i = code.indexOf(needle);
    expect(i, `not found: ${needle}`).toBeGreaterThan(-1);
    return i;
  };

  it("puts the session modifiers after the list, not in front of it", () => {
    /* "Short on time?" and "Skip session" are both judgements about work
       you have to have seen. Above the list they asked blind, and they
       put two secondary links between the card that states the session
       and the rows that ARE it. */
    expect(at("<SessionCommandCard")).toBeLessThan(at("<DndContext"));
    expect(at("Add exercise")).toBeLessThan(at("Short on time?"));
    expect(at("Short on time?")).toBeLessThan(at("Skip session"));
  });
});

describe("a bodyweight lift's last set is not a load", () => {
  /* Both row renderings, the tappable rows and the drag-to-reorder rows,
     used to carry their own copy of the `Last:` chain, and the copies
     drifted. The prescription line already read `!isBW && ex.weight > 0`,
     so a bodyweight day hid the engine's stored load, while the chain
     below it ranked `weight > 0` FIRST and printed that same number:
     chin-ups read "3 sets x 13 reps" over "Last: 35 kg x 12". One copy
     also said "BW x 12" where the other said "12 reps".

     DS3 draws both renderings through one `ExerciseRowSummary`, so the
     chain exists once and the two cannot disagree. */
  const summary = strip(
    readFileSync(
      resolve(repoRoot, "src/components/program/ExerciseRowSummary.tsx"),
      "utf8"
    )
  );
  const chains = (src: string) =>
    [...src.matchAll(/Last:\{" "\}([\s\S]*?)\}\s*<\/p>/g)].map((m) => m[1]);

  it("has one copy, in the shared row summary", () => {
    expect(chains(summary)).toHaveLength(1);
    expect(chains(code)).toHaveLength(0);
  });

  it("asks isBW before it asks about weight", () => {
    const [chain] = chains(summary);
    const bw = chain.indexOf("isBW");
    const weight = chain.indexOf("lastPerf.weight > 0");
    expect(bw).toBeGreaterThan(-1);
    expect(weight).toBeGreaterThan(-1);
    expect(bw).toBeLessThan(weight);
  });

  it("is what both renderings draw, so drag mode is not its own dialect", () => {
    const body = dayBody();
    expect(body.match(/<ExerciseRowSummary\b/g)).toHaveLength(2);
    // Anchored: the reorder rendering is in the body, and so is the other.
    expect(body).toContain("<DndContext");
    expect(body).toContain("More options for ");
  });
});

describe("the day cells name the day, not the programme", () => {
  it("labels each cell with its focus", () => {
    expect(code).toMatch(/bottomLabel: dayFocusLabel\(/);
    expect(code).toContain('from "@/lib/liftDayLabel"');
  });

  it("no longer keeps the half that repeats", () => {
    /* The split CATEGORY. A Full Body rotation labelled all three days
       "Full Body"; Push/Pull/Legs x2 labelled days 1 and 4 both "Push".
       Anchored on the positive above. */
    expect(code).not.toMatch(/bottomLabel:\s*w\.dayName\.split/);
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

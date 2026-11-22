import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Train's layout, held to the rules Home and Food follow (DS4, §14m):
 * one control row under the title, the week as the header's line, the day
 * strip, then the day's session card, with the week's notices under the
 * card on both tabs, as Home's banners sit under its hero. Read from the
 * source, since the order is the claim.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const program = strip(
  readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8")
);
const run = strip(
  readFileSync(
    resolve(repoRoot, "src/components/program/ProgrammeRunSection.tsx"),
    "utf8"
  )
);
/* The day's session, which the Lift tab draws under its strip, with the
   week's notices handed in between its card and its exercises
   (`LiftSessionView`, TrainWk1 step 3). */
const view = strip(
  readFileSync(
    resolve(repoRoot, "src/components/program/LiftSessionView.tsx"),
    "utf8"
  )
);

const at = (code: string, needle: string) => {
  const i = code.indexOf(needle);
  expect(i, needle).toBeGreaterThan(-1);
  return i;
};

describe("Train's Lift tab", () => {
  it("puts the week on the header's line, not a row over the day strip", () => {
    expect(program).toMatch(/subtitleBelow/);
    expect(program).toMatch(
      /subtitle=\{activeTab === "run" \? programRunHeaderLine : liftHeaderLine\}/
    );
    expect(program).not.toMatch(/section="week_phase_row"/);
  });

  it("draws the Lift/Run switch as the 36pt track", () => {
    const sw = program.slice(at(program, 'ariaLabel="Train mode"') - 200);
    expect(sw.slice(0, 600)).toMatch(/size="sm"/);
  });

  it("orders the strip, the session card, then the week's notices", () => {
    // Train: the strip, then the day's session, which takes the week's
    // notices to draw between its card and its exercises.
    const stripAt = at(program, 'section="day_stepper"');
    const sessionAt = at(program, "<LiftSessionView");
    const betweenAt = at(program, "between={");
    // The Lift tab's, the last in the file: the Run tab's offer is handed
    // to its section above (whole-app grill Q11).
    const deloadAt = program.lastIndexOf("<DeloadBanner");
    const levelAt = at(program, "<ExperienceSuggestionCard");
    const afterAt = at(program, "after={");
    expect(stripAt).toBeLessThan(sessionAt);
    expect(sessionAt).toBeLessThan(betweenAt);
    expect(betweenAt).toBeLessThan(deloadAt);
    expect(betweenAt).toBeLessThan(levelAt);
    expect(deloadAt).toBeLessThan(afterAt);
    expect(levelAt).toBeLessThan(afterAt);
    // The day: its card, then the notices, then its exercise list.
    const cardAt = at(view, "<SessionCommandCard");
    const noticesAt = at(view, "{between}");
    const listAt = at(view, "<SortableExerciseRow");
    expect(cardAt).toBeLessThan(noticesAt);
    expect(noticesAt).toBeLessThan(listAt);
  });
});

describe("Train's Run tab", () => {
  it("takes the lighter-week offer first among the week's notices (Q11)", () => {
    /* One lighter-week decision for both sports: the Run tab draws the
       same offer the Lift tab does, handed in by Train. */
    const notices = run.slice(at(run, "const weekNotices = ("));
    const offerAt = at(notices, "{lighterWeekNotice}");
    expect(offerAt).toBeLessThan(at(notices, "<Banner"));
    const mount = program.slice(at(program, "<ProgrammeRunSection"));
    expect(mount.slice(0, mount.indexOf("/>\n"))).toMatch(
      /lighterWeekNotice=\{/
    );
  });

  it("draws the week's notices after the session card, in every mode", () => {
    const decl = at(run, "const weekNotices = (");
    const ret = run.indexOf("\n  return (", decl);
    // Every banner lives in the one const, not above the hero.
    const body = run.slice(ret);
    expect(body).not.toMatch(/<Banner\b/);
    const freeformCard = at(body, 'eyebrow="Start a run"');
    const freeNotices = body.indexOf("{weekNotices}", freeformCard);
    expect(freeNotices).toBeGreaterThan(freeformCard);
    const selector = at(body, "<ProgrammeWeekSelector");
    const plannedNotices = body.indexOf("{weekNotices}", selector);
    expect(plannedNotices).toBeGreaterThan(
      body.indexOf("<SessionCommandCard", selector)
    );
  });
});

describe("Home's hero on a 320pt phone", () => {
  it("gives back a third of its picture under 20em, so Start clears the tab bar", () => {
    const hero = strip(
      readFileSync(
        resolve(repoRoot, "src/components/home/SessionHero.tsx"),
        "utf8"
      )
    );
    expect(hero).toMatch(/"h-\[240px\] @max-\[20em\]:h-\[160px\]"/);
    expect(hero).toMatch(/"h-\[280px\] @max-\[20em\]:h-\[188px\]"/);
  });
});

describe("the fell-behind banner", () => {
  it("offers Realign as the tinted run action, leaving Start the one filled button", () => {
    expect(run).toMatch(
      /<Button variant="sport-tinted" fullWidth onClick=\{handleRealign\}>/
    );
  });
});

describe("a session's minutes", () => {
  it("are one string on Home's hero and Train's card", () => {
    const home = strip(
      readFileSync(
        resolve(repoRoot, "src/components/home/LiftCTACard.tsx"),
        "utf8"
      )
    );
    expect(home).toMatch(/aboutMinutes\(minutes\)/);
    expect(view).toMatch(/aboutMinutes\(estimatedMinutes\)/);
    expect(home + program + view).not.toMatch(/`about \$\{/);
    expect(view).not.toMatch(/`~\$\{estimatedMinutes\} min`/);
  });
});

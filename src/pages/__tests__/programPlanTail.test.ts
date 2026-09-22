import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The plan tail leaves the Train tab, and each piece lands somewhere.
 *
 * Three things sat below the session card, and between them they said
 * one fact the page already carried and two the user could not act on:
 *
 *   The training block's RUNNING row — its title was `liftWeekLabel`,
 *   the same string from the same function the week row renders 400 px
 *   above it, and for a legacy block its subtitle printed the number a
 *   third time. Managing a running block moved to the page ⋯.
 *
 *   The weekly sets-per-muscle table — collapsed it read "4 muscles
 *   below target", a count of problems rather than a finding, and the
 *   fields that fix it were two screens away. It moved to Settings ›
 *   Lift plan, beside the focus and lift days it rates.
 *
 *   The "Edit lift plan ›" footnote — 10 px muted text under a hairline,
 *   a third edit entry beside the two already in ⋯. That menu's edit row
 *   is now the lift editor on the Lift tab.
 *
 * What did NOT move is the point: the block card still renders "Start a
 * training block" and "Block complete" on the page, because those two
 * are the only lines nothing else offers. A test that let those go would
 * be pinning the deletion rather than the design.
 *
 * Source pins, for the reason `programSessionActions.test.ts` gives:
 * Program.tsx mounts charts, sheets and several Firestore hooks, and
 * nothing in the repo renders it in jsdom.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const program = strip(read("src/pages/Program.tsx"));
const liftPlan = strip(read("src/pages/settings/SettingsLiftPlan.tsx"));
const blockCard = strip(read("src/components/program/TrainingBlockCard.tsx"));

describe("the volume table moved rather than went", () => {
  it("is gone from the Train tab", () => {
    expect(program).not.toMatch(/WeeklyVolumeCard/);
  });

  it("renders in the lift-plan editor, where the fields it rates live", () => {
    /* The element, not a prefix of it: `toContain("<WeeklyVolumeCard")`
       is satisfied by `<WeeklyVolumeCardX`, which a mutation run proved
       by renaming the component and staying green. */
    expect(liftPlan).toMatch(/<WeeklyVolumeCard[\s/>]/);
  });

  it("is still rated against the programState goal, not the profile's", () => {
    /* Blk2 / M4: a running block OWNS the prescription, so the profile
       copy would paint a "Get stronger" block's week against the
       PRE-block band. The fallback to the profile is for a programState
       that has not loaded. */
    const at = liftPlan.indexOf("<WeeklyVolumeCard");
    const call = liftPlan.slice(at, at + 320);
    expect(call).toContain("programState?.primaryGoal");
    expect(call.indexOf("programState?.primaryGoal")).toBeLessThan(
      call.indexOf("profile.primaryGoal")
    );
  });
});

describe("the running block's row, and the two that stayed", () => {
  it("is suppressed on the page", () => {
    expect(program).toContain("hideRunningRow");
  });

  it("still renders when the block has FINISHED, whatever the page asks", () => {
    /* "Block complete — see what changed" is the only offer of the
       review. Gating it behind `hideRunningRow` would delete a flow, not
       a duplicate. */
    expect(blockCard).toContain("block && (finished || !hideRunningRow)");
  });

  it("leaves the start offer untouched", () => {
    // `{!block && ...}` — nothing about the new prop reaches it.
    expect(blockCard).toMatch(/\{!block && !raceTaperActive && hasTrained &&/);
  });

  it("gives ⋯ a way into the sheet the row used to open", () => {
    expect(program).toContain("setBlockDetailOpen(true)");
    expect(program).toContain("Training block");
    expect(program).toContain("detailOpen={blockDetailOpen}");
  });

  it("offers that row only while a block is actually running", () => {
    const at = program.indexOf("setBlockDetailOpen(true)");
    const before = program.slice(Math.max(0, at - 400), at);
    expect(before).toContain("programState?.trainingBlock");
  });
});

describe("one edit entry, not three", () => {
  it("drops the footnote", () => {
    expect(program).not.toMatch(/Edit lift plan\s*<\/?ChevronRight/);
    expect(program).not.toContain('navigate("/settings/lift-plan")');
  });

  it("points the ⋯ edit row at the lift editor on the Lift tab", () => {
    expect(program).toContain('? "/settings/lift-plan"');
    expect(program).toContain(': "/settings/training"');
  });

  it("keeps the full programme form reachable from the Run tab", () => {
    /* The lift editor is the right destination FROM the Lift tab; the
       everything-form is still one tap away on Run, and from Settings
       on either. */
    const at = program.indexOf('? "/settings/lift-plan"');
    expect(program.slice(Math.max(0, at - 200), at)).toContain(
      'activeTab === "lift"'
    );
  });
});

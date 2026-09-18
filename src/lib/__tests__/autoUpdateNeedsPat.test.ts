/**
 * `auto-update-pr-branches` must not touch a PR branch it cannot then
 * re-verify.
 *
 * A required status check on this repo is bound to the pull_request
 * event. A push made with `GITHUB_TOKEN` suppresses that event, and a
 * `workflow_dispatch` re-run is a DIFFERENT event — so the dispatched
 * checks go green and the ruleset does not count them. The PR lands on
 * `Required status check "unit" is expected`, which no re-run clears,
 * because no re-run changes the event.
 *
 * Measured 2026-09-18: eight PRs held in exactly that state for over an
 * hour. The ones that merged were the ones whose branches had been
 * updated through the REST API under a human token, which does produce
 * ruleset-satisfying CI.
 *
 * Standing down costs nothing, and that is the load-bearing half: the
 * ruleset does NOT require a branch to be up to date. Two PRs merged
 * that day with bases several commits behind main. So an update under
 * GITHUB_TOKEN buys no mergeability and destroys some.
 *
 * What this pins is the control flow, which is the part that can
 * regress quietly — someone restoring the dispatch loop to "fix" stale
 * branches would re-create a queue nobody can drain, and every symptom
 * of it reads as CI being slow.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const workflow = readFileSync(
  resolve(repoRoot, ".github/workflows/auto-update-pr-branches.yml"),
  "utf8"
);

/* Comments only. The header explains the hazard at length and names
   every command involved, so a scan of the raw file finds `gh pr
   update-branch` in the prose before it finds the call — which made the
   first version of the ordering check below fail against a correct
   workflow. Strip them and reason about the script. */
const script = workflow
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

describe("auto-update-pr-branches requires a PAT", () => {
  it("still updates branches at all, so the checks below are not vacuous", () => {
    expect(script).toContain("gh pr update-branch");
    expect(script).toContain("AUTO_UPDATE_PR_BRANCHES_PAT");
    /* And that stripping comments did not strip the script with them. */
    expect(script.length).toBeGreaterThan(400);
  });

  it("bails before touching a branch when the PAT is absent", () => {
    const bail = script.indexOf('if [ -z "$PAT" ]');
    const update = script.indexOf("gh pr update-branch");
    expect(bail, "no `PAT` empty-check in the job script").toBeGreaterThan(-1);
    expect(
      update,
      `the PAT check must come BEFORE any branch update — otherwise the ` +
        `job can push under GITHUB_TOKEN, which suppresses the ` +
        `pull_request CI the ruleset requires.`
    ).toBeGreaterThan(bail);
    /* The bail has to actually leave, not just log. */
    const between = script.slice(bail, update);
    expect(between).toContain("exit 0");
  });

  it("never dispatches the required-check workflows itself", () => {
    /* `gh workflow run` on ci.yml / emulator-tests.yml is the shape that
       produced green-but-uncounted checks. A dispatch of some unrelated
       workflow would be fine; this asserts the specific regression. */
    expect(script).not.toContain("gh workflow run");
    expect(script).not.toContain("CHECK_WORKFLOWS");
    /* The dispatch was the only reason this job held `actions: write`. */
    expect(script).not.toContain("actions: write");
  });
});

/**
 * The two workflows that dominate the runner pool supersede their own
 * superseded runs.
 *
 * `auto-update-pr-branches.yml` rewrites every open PR's head whenever
 * main moves. Without a concurrency group that restarts all of `CI` and
 * `Firebase Emulator Tests` on every open PR at once AND leaves the runs
 * for the heads it just obsoleted queued. Measured 2026-09-18 on one
 * commit: a `CI` run created at 08:37 had still not STARTED by 09:08,
 * while the `Firebase Emulator Tests` run for the same sha finished
 * green — the pool was full of work for commits nobody would merge.
 *
 * Two properties, and the second is the one that is easy to lose:
 *
 * 1. Both workflows declare a group keyed on `github.ref`, so a newer
 *    run of the same workflow on the same ref cancels the older.
 * 2. `cancel-in-progress` is FALSE on main. A bare `true` would cancel
 *    a main run when a second commit lands close behind it, and then a
 *    commit reaches main with its checks cancelled rather than green.
 *
 * Deliberately NOT asserted: that push and pull_request share a group.
 * They produce a duplicate run for one commit and collapsing them would
 * remove it — but a cancelled run posts a cancelled check under the same
 * workflow name on the same sha as the live one, which is the PR's own
 * gate. Superseding within one event only cancels runs for OLDER
 * commits, whose checks gate nothing. Widening it is an owner call.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** The workflows whose matrices dominate the queue. */
const GUARDED = ["ci.yml", "emulator-tests.yml"] as const;

function read(file: string): string {
  return readFileSync(resolve(repoRoot, ".github/workflows", file), "utf8");
}

describe("runner-pool concurrency", () => {
  it.each(GUARDED)("%s supersedes its own older runs", (file) => {
    const text = read(file);
    expect(text).toContain("concurrency:");
    expect(text).toContain("group: ${{ github.workflow }}-${{ github.ref }}");
  });

  it.each(GUARDED)("%s never cancels a run on main", (file) => {
    const text = read(file);
    /* A literal `cancel-in-progress: true` is the regression: it reads
       as the same optimisation and quietly stops verifying main. */
    expect(text).not.toMatch(/cancel-in-progress:\s*true\s*$/m);
    expect(text).toContain(
      "cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}"
    );
  });

  it("names workflows that exist, so a rename cannot make this vacuous", () => {
    for (const file of GUARDED) {
      expect(read(file).length).toBeGreaterThan(500);
    }
  });
});

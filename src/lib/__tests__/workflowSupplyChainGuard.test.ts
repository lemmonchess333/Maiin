/**
 * GitHub Actions supply-chain guards (security workstream, item 1f).
 *
 * Two invariants, both about who can run code with this repository's
 * tokens and signing certificates:
 *
 * 1. Every third-party Action is pinned to a full commit SHA. A floating
 *    tag (`actions/checkout@v4`) is a mutable pointer: whoever controls
 *    the tag controls the code that runs with `FIREBASE_SERVICE_ACCOUNT`
 *    and the iOS signing secrets. The trailing `# vX` comment is what
 *    lets Dependabot's `github-actions` ecosystem keep a pinned action
 *    updated, so it is required too.
 *
 * 2. `dependabot-auto-merge.yml` runs on `pull_request_target` with write
 *    permissions — the full repo token, in the context of main. That is
 *    safe ONLY because it never checks out or executes PR code: its one
 *    `run:` is `gh pr merge --auto`, and the job is gated on the actor
 *    being dependabot[bot]. One added `actions/checkout` step turns it
 *    into a token-exfiltration path for anyone who can open a PR.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const workflowsDir = resolve(repoRoot, ".github/workflows");

const workflowFiles = readdirSync(workflowsDir)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort();

interface UsesLine {
  file: string;
  line: number;
  text: string;
}

function usesLines(): UsesLine[] {
  const out: UsesLine[] = [];
  for (const file of workflowFiles) {
    const lines = readFileSync(resolve(workflowsDir, file), "utf8").split("\n");
    lines.forEach((text, i) => {
      if (/^\s*-?\s*uses:\s*\S/.test(text))
        out.push({ file, line: i + 1, text });
    });
  }
  return out;
}

/** `uses: owner/repo@<40-hex> # vTag` — third-party actions only. Local
 *  (`./path`) and docker (`docker://`) references are not pins and are
 *  left to their own review. */
const PINNED =
  /^\s*-?\s*uses:\s*[\w.-]+\/[\w.\/-]+@[0-9a-f]{40}\s+#\s*v\S+\s*$/;
const THIRD_PARTY = /^\s*-?\s*uses:\s*[\w.-]+\/[\w.\/-]+@/;

describe("GitHub Actions are pinned to commit SHAs", () => {
  it("scans a non-trivial set of workflows", () => {
    expect(workflowFiles.length).toBeGreaterThanOrEqual(10);
  });

  it("every third-party `uses:` carries a 40-hex sha and a `# v…` version comment", () => {
    const offenders = usesLines()
      .filter((u) => THIRD_PARTY.test(u.text) && !PINNED.test(u.text))
      .map((u) => `${u.file}:${u.line}  ${u.text.trim()}`);
    expect(
      offenders,
      "Unpinned or comment-less action(s). Pin with `uses: owner/repo@<commit sha> # <tag>` — resolve the tag with `git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag> refs/tags/<tag>^{}`.\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });
});

describe("dependabot-auto-merge.yml never runs PR code", () => {
  const src = readFileSync(
    resolve(workflowsDir, "dependabot-auto-merge.yml"),
    "utf8"
  );
  const lines = src.split("\n");

  it("still triggers on pull_request_target (the reason the rest of this suite exists)", () => {
    expect(src).toMatch(/^on:\s*pull_request_target\s*$/m);
  });

  it("gates the job on the actor being dependabot[bot]", () => {
    expect(src).toMatch(
      /if:\s*\$\{\{\s*github\.actor == 'dependabot\[bot\]'\s*\}\}/
    );
  });

  it("has no actions/checkout step", () => {
    const hits = lines
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => /uses:\s*actions\/checkout/.test(t))
      .map(({ i }) => i + 1);
    expect(
      hits,
      "actions/checkout in a pull_request_target workflow with write permissions executes PR-controlled code with the repo token"
    ).toEqual([]);
  });

  it("no run: step executes repository code (npm / npx / node / a script path)", () => {
    const runs = lines
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => /^\s*-?\s*run:/.test(t));
    const offenders = runs
      .filter(({ t }) =>
        /\b(npm|npx|node|yarn|pnpm|bash|sh)\b|\.\/|\bscripts\//.test(t)
      )
      .map(({ t, i }) => `${i + 1}: ${t.trim()}`);
    expect(runs.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

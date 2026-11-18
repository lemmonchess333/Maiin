import { describe, expect, it } from "vitest";
// Local pure helpers: no session, transcript file or repository.
// @ts-expect-error Standalone Node .mjs module is outside the TS app project.
import * as gate from "./gate.mjs";

/** A transcript line shaped as Claude Code writes them: the assistant's
 *  tool_use, then the user turn carrying its tool_result. */
let nextId = 0;
function call(
  name: string,
  input: Record<string, unknown>,
  result: { failed?: boolean; text?: string } = {}
): string[] {
  nextId += 1;
  const id = `toolu_${nextId}`;
  const use = {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name, input }],
    },
  };
  const content = result.failed
    ? `Exit code 1\n${result.text ?? ""}`
    : (result.text ?? "ok");
  const res = {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          content,
          ...(result.failed ? { is_error: true } : { is_error: false }),
        },
      ],
    },
  };
  return [JSON.stringify(use), JSON.stringify(res)];
}
const bash = (command: string, result?: { failed?: boolean }) =>
  call("Bash", { command, description: "x" }, result);
const edit = () =>
  call("Edit", { file_path: "/w/a.ts", old_string: "a", new_string: "b" });
const transcript = (...parts: string[][]) => parts.flat().join("\n");

describe("findGitCommits", () => {
  const found = (command: string) => gate.findGitCommits(command, "/w");

  it.each([
    ['git commit -m "fix"', "fix"],
    ['git add -A && git commit -m "a" && git push', "a"],
    ['git commit -am "both"', "both"],
    ["git commit --message=inline", "inline"],
    ['git commit -m "one" -m "two"', "one\n\ntwo"],
    ["bash -c 'git commit -m inner'", "inner"],
    ['FOO=1 timeout 60 git commit -m "env"', "env"],
  ])("finds the commit in %s", (command, message) => {
    const commits = found(command);
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe(message);
  });

  it("reads a heredoc message, quotes and operators inside it included", () => {
    const command = [
      "git commit -m \"$(cat <<'EOF'",
      'Title with "quotes" && a; semicolon',
      "",
      "Verified: none (docs only)",
      "EOF",
      ')" && git push',
    ].join("\n");
    const [commit] = found(command);
    expect(commit.message).toBe(
      'Title with "quotes" && a; semicolon\n\nVerified: none (docs only)'
    );
  });

  it("follows cd and -C to the repository being committed to", () => {
    const [commit] = found('cd /a/b && git -C sub commit --amend -m "x"');
    expect(commit.cwd).toBe("/a/b/sub");
    expect(commit.amend).toBe(true);
  });

  it("notes a message file and an editor commit", () => {
    expect(found("git commit -F /tmp/m.txt")[0].messageFile).toBe("/tmp/m.txt");
    expect(found("git commit")[0].message).toBeNull();
  });

  it.each([
    'git log --grep "git commit"',
    'echo "git commit -m x"',
    "git commit-tree abc123",
    "grep -rn 'git commit' docs",
    "# git commit -m commented out",
    'printf "%s" "git commit" | wc -c',
    "gitk commit",
  ])("finds no commit in %s", (command) => {
    expect(found(command)).toEqual([]);
  });
});

describe("classifyBash", () => {
  it.each([
    ["npm run verify", ["unit", "types", "lint", "build"]],
    ["npm run verify:app -- --diff origin/main", ["verify"]],
    ["npx vitest run src/lib/__tests__/a.test.ts", ["unit"]],
    ["npm run test", ["unit"]],
    ["npx tsc -b", ["types"]],
    ["npm run build", ["types", "build"]],
    ["npx eslint src/a.ts", ["lint"]],
    ["timeout 600 npx playwright test e2e/x.spec.ts", ["e2e"]],
    ["npm run test:e2e:auth", ["e2e"]],
    ["npx vite build && node scripts/check-dist-size.mjs", ["build"]],
    ["npx tsc -b && npx vitest run x", ["unit", "types"]],
    ["set -o pipefail; npx vitest run x | tail -5", ["unit"]],
  ])("%s proves %j", (command, methods) => {
    expect(gate.classifyBash(command).methods).toEqual(methods);
  });

  it("does not count tsc -p, which checks nothing on this repo", () => {
    expect(
      gate.classifyBash("npx tsc --noEmit -p tsconfig.json").methods
    ).toEqual([]);
  });

  it.each([
    "npx vitest run x 2>&1 | tail -20",
    "npx vitest run x; git push",
    "npx vitest run x || true",
    "npx vitest run x &",
  ])(
    "a check whose exit status %s hides is unverified, not evidence",
    (command) => {
      const verdict = gate.classifyBash(command);
      expect(verdict.methods).toEqual([]);
      expect(verdict.unverifiedExit).toEqual(["unit"]);
    }
  );

  it.each([
    ["git merge origin/main", true],
    ["git checkout main", true],
    ["git checkout -b claude/new", false],
    ["git stash pop", true],
    ["git reset --hard origin/main", true],
    ["git reset HEAD~1", false],
    ["sed -i 's/a/b/' f.ts", true],
    ["npx prettier --write f.ts", true],
    ["npx prettier --check f.ts", false],
    ["git status", false],
  ])("%s changes the tree: %s", (command, edits) => {
    expect(gate.classifyBash(command).edits).toBe(edits);
  });
});

describe("collectEvidence", () => {
  it("counts checks that passed after the last edit", () => {
    const evidence = gate.collectEvidence(
      transcript(edit(), bash("npx tsc -b"), bash("npx vitest run a.test.ts"))
    );
    expect(evidence.methods).toEqual(["unit", "types"]);
    expect(evidence.stale).toEqual([]);
  });

  it("an edit after a check makes it stale", () => {
    const evidence = gate.collectEvidence(
      transcript(bash("npx vitest run a.test.ts"), edit(), bash("npx tsc -b"))
    );
    expect(evidence.methods).toEqual(["types"]);
    expect(evidence.stale).toEqual(["unit"]);
  });

  it("an edit outside the repository, a commit message say, changes nothing", () => {
    const outside = call("Write", { file_path: "/tmp/msg.txt", content: "x" });
    const inside = call("Write", { file_path: "/w/src/a.ts", content: "x" });
    expect(
      gate.collectEvidence(transcript(bash("npx tsc -b"), outside), {
        root: "/w",
      }).methods
    ).toEqual(["types"]);
    expect(
      gate.collectEvidence(transcript(bash("npx tsc -b"), inside), {
        root: "/w",
      }).methods
    ).toEqual([]);
    // A sibling directory sharing the prefix is not inside.
    const sibling = call("Write", { file_path: "/w2/a.ts", content: "x" });
    expect(
      gate.collectEvidence(transcript(bash("npx tsc -b"), sibling), {
        root: "/w",
      }).methods
    ).toEqual(["types"]);
    // Without a root every edit counts.
    expect(
      gate.collectEvidence(transcript(bash("npx tsc -b"), outside)).methods
    ).toEqual([]);
  });

  it("a merge counts as an edit", () => {
    const evidence = gate.collectEvidence(
      transcript(bash("npx vitest run a"), bash("git merge origin/main"))
    );
    expect(evidence.methods).toEqual([]);
    expect(evidence.stale).toEqual(["unit"]);
  });

  it("a failed check is not evidence", () => {
    const evidence = gate.collectEvidence(
      transcript(bash("npx vitest run a", { failed: true }))
    );
    expect(evidence.methods).toEqual([]);
    expect(evidence.stale).toEqual([]);
  });

  it("a piped check is reported apart and is not evidence", () => {
    const evidence = gate.collectEvidence(
      transcript(bash("npx vitest run a | tail -3"))
    );
    expect(evidence.methods).toEqual([]);
    expect(evidence.unverifiedExit).toEqual(["unit"]);
  });

  it("reads the verify and review skills, and an advisor review", () => {
    expect(
      gate.collectEvidence(
        transcript(edit(), call("Skill", { skill: "verify" }))
      ).methods
    ).toEqual(["verify"]);
    expect(
      gate.collectEvidence(
        transcript(edit(), call("Skill", { skill: "code-review-matt" }))
      ).methods
    ).toEqual(["review"]);
    expect(
      gate.collectEvidence(
        transcript(
          edit(),
          call("Agent", {
            description: "Fable review of the diff",
            prompt: "…",
          })
        )
      ).methods
    ).toEqual(["review"]);
    expect(
      gate.collectEvidence(
        transcript(edit(), call("Agent", { description: "Explore the repo" }))
      ).methods
    ).toEqual([]);
  });

  it("reads a slash command the person typed", () => {
    const typed = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content:
          "<command-name>/verify</command-name>\n<command-args></command-args>",
      },
    });
    expect(gate.collectEvidence(typed).methods).toEqual(["verify"]);
  });

  it("survives lines that are not JSON and results without a use", () => {
    const orphan = JSON.stringify({
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "nope", content: "ok" }],
      },
    });
    expect(
      gate.collectEvidence(["not json", orphan, ""].join("\n")).methods
    ).toEqual([]);
  });

  it("reads tool_result content given as text blocks", () => {
    const lines = bash("npx vitest run a");
    const res = JSON.parse(lines[1]);
    res.message.content[0].content = [
      { type: "text", text: "Exit code 1\nfail" },
    ];
    delete res.message.content[0].is_error;
    expect(
      gate.collectEvidence([lines[0], JSON.stringify(res)].join("\n")).methods
    ).toEqual([]);
  });
});

describe("resolveMode", () => {
  const observe = JSON.stringify({ mode: "observe" });
  const enforce = JSON.stringify({ mode: "enforce" });

  it("prefers the env var, then the base branch, then the working tree", () => {
    expect(
      gate.resolveMode({
        env: "off",
        baseConfig: enforce,
        worktreeConfig: observe,
      })
    ).toEqual({ mode: "off", source: "env" });
    expect(
      gate.resolveMode({
        env: null,
        baseConfig: enforce,
        worktreeConfig: observe,
      })
    ).toEqual({ mode: "enforce", source: "base" });
    expect(
      gate.resolveMode({ env: null, baseConfig: null, worktreeConfig: observe })
    ).toEqual({ mode: "observe", source: "worktree" });
    expect(gate.resolveMode({})).toEqual({ mode: "off", source: "default" });
  });

  it("skips a value it cannot read", () => {
    expect(
      gate.resolveMode({
        env: "loud",
        baseConfig: "{",
        worktreeConfig: observe,
      })
    ).toEqual({ mode: "observe", source: "worktree" });
    expect(
      gate.resolveMode({ baseConfig: JSON.stringify({ mode: "strict" }) })
    ).toEqual({ mode: "off", source: "default" });
  });
});

describe("decide", () => {
  it("passes a commit after a verify run or a review", () => {
    expect(gate.decide({ mode: "enforce", methods: ["verify"] }).verdict).toBe(
      "pass"
    );
    expect(
      gate.decide({ mode: "enforce", methods: ["review", "unit"] }).deny
    ).toBe(false);
  });

  it("would block a commit with only unit tests and types, as the article's gate does", () => {
    const d = gate.decide({ mode: "observe", methods: ["unit", "types"] });
    expect(d.verdict).toBe("would-block");
    expect(d.deny).toBe(false);
  });

  it("passes a commit that says why it was not verified", () => {
    const message = "Docs\n\nVerified: none (docs only; no runtime path)\n";
    expect(gate.decide({ mode: "enforce", methods: [], message }).verdict).toBe(
      "pass"
    );
    expect(
      gate.decide({
        mode: "enforce",
        methods: [],
        message: "Verified: none ()",
      }).verdict
    ).toBe("would-block");
    expect(
      gate.decide({ mode: "enforce", methods: [], message: "Verified: unit" })
        .verdict
    ).toBe("would-block");
  });

  it("denies only in enforce mode, and lets the third commit through", () => {
    expect(gate.decide({ mode: "observe", methods: [] }).deny).toBe(false);
    expect(gate.decide({ mode: "off", methods: [] }).deny).toBe(false);
    expect(gate.decide({ mode: "enforce", methods: [], blocks: 0 }).deny).toBe(
      true
    );
    expect(gate.decide({ mode: "enforce", methods: [], blocks: 1 }).deny).toBe(
      true
    );
    const third = gate.decide({ mode: "enforce", methods: [], blocks: 2 });
    expect(third.deny).toBe(false);
    expect(third.releasedAfterBlocks).toBe(true);
  });
});

describe("trailers", () => {
  it("writes what was seen, or none", () => {
    expect(gate.verifiedTrailer(["types", "unit"])).toBe("unit, types");
    expect(gate.verifiedTrailer([])).toBe("none (unexplained)");
    expect(
      gate.gateTrailer({
        mode: "observe",
        source: "base",
        verdict: "would-block",
        methods: ["unit"],
        releasedAfterBlocks: false,
      })
    ).toBe("observe(base) would-block; seen: unit");
    expect(
      gate.gateTrailer({
        mode: "enforce",
        source: "env",
        verdict: "would-block",
        methods: [],
        releasedAfterBlocks: true,
      })
    ).toBe("enforce(env) would-block, released after 2 blocks; seen: nothing");
    expect(
      gate.gateTrailer({
        mode: "observe",
        source: "base",
        verdict: "pass",
        methods: ["review"],
        releasedAfterBlocks: false,
        rules: "worktree(env)",
      })
    ).toBe("observe(base) pass; seen: review; rules: worktree(env)");
  });

  it("names the way out when it denies", () => {
    const reason = gate.denyReason({ why: "nothing ran" });
    expect(reason).toContain("Verified: none (<why>)");
    expect(reason).toContain("npm run verify:app");
  });
});

describe("stampPlan", () => {
  const now = 1_000_000_000;
  const pending = {
    head: "abc",
    at: now - 60_000,
    trailers: {
      verified: "unit",
      gate: "observe(base) would-block; seen: unit",
    },
  };

  it("stamps the commit the stamp was left for", () => {
    expect(gate.stampPlan(pending, { head: "abc", now }).stamp).toBe(true);
  });

  it("drops a stamp left for another parent, an old one, or for a root commit", () => {
    expect(gate.stampPlan(pending, { head: "def", now }).stamp).toBe(false);
    expect(gate.stampPlan(pending, { head: null, now }).stamp).toBe(false);
    expect(
      gate.stampPlan(pending, {
        head: "abc",
        now: now + gate.PENDING_MAX_AGE_MS,
      }).stamp
    ).toBe(false);
    expect(gate.stampPlan(null, { head: "abc", now }).stamp).toBe(false);
  });
});

describe("evaluate", () => {
  it("returns null for a call that commits nothing", () => {
    expect(
      gate.evaluate({
        command: "git status",
        cwd: "/w",
        transcript: "",
        modeInputs: {},
      })
    ).toBeNull();
  });

  it("decides the last commit in the call from the transcript and the mode", () => {
    const result = gate.evaluate({
      command: 'npx vitest run a && git commit -m "x"',
      cwd: "/w",
      transcript: transcript(edit(), bash("npx tsc -b")),
      modeInputs: { worktreeConfig: JSON.stringify({ mode: "observe" }) },
      blocks: 0,
    });
    expect(result.mode).toBe("observe");
    expect(result.source).toBe("worktree");
    expect(result.evidence.methods).toEqual(["types"]);
    expect(result.decision.verdict).toBe("would-block");
    expect(result.trailers).toEqual({
      verified: "types",
      gate: "observe(worktree) would-block; seen: types",
    });
  });

  it("reads a -F message the hook supplies", () => {
    const result = gate.evaluate({
      command: "git commit -F msg.txt",
      cwd: "/w",
      transcript: "",
      modeInputs: { env: "enforce" },
      blocks: 0,
      messageFromFile: "Title\n\nVerified: none (copy only)\n",
    });
    expect(result.decision.verdict).toBe("pass");
    expect(result.decision.deny).toBe(false);
  });
});

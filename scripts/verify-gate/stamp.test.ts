/**
 * The commit gate end to end, in a throwaway repository: the PreToolUse
 * hook reads a transcript and leaves a pending stamp, then a real
 * `git commit` runs the commit-msg hook, which writes it. Nothing here
 * touches this repository's own .git.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HOOK = resolve(ROOT, ".claude/hooks/verify-gate.mjs");
const STAMP = resolve(ROOT, "scripts/verify-gate/stamp.mjs");

let dir: string;
let repo: string;
let transcriptPath: string;

/** Environment for child processes, without anything that would point git
 *  at another repository or set the gate's mode from outside. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  if (!("TROPOS_VERIFY_GATE" in extra)) delete env.TROPOS_VERIFY_GATE;
  return env;
}

function git(args: string[], env: Record<string, string> = {}): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: cleanEnv(env),
  });
}

function runHook(command: string, env: Record<string, string> = {}): string {
  return execFileSync("node", [HOOK], {
    input: JSON.stringify({
      session_id: "session-1",
      transcript_path: transcriptPath,
      cwd: repo,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
    encoding: "utf8",
    // Judge by this branch's rules, not main's copy, which the hook would
    // otherwise load wherever origin/main has one.
    env: cleanEnv({ TROPOS_VERIFY_GATE_RULES: "worktree", ...env }),
  });
}

const RULES = "; rules: worktree(env)";

function writeTranscript(...commands: string[]): void {
  const lines: string[] = [];
  commands.forEach((command, i) => {
    const id = `toolu_${i}`;
    const isEdit = command === "EDIT";
    lines.push(
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id,
              name: isEdit ? "Edit" : "Bash",
              input: isEdit ? { file_path: "a.ts" } : { command },
            },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: id,
              content: "ok",
              is_error: false,
            },
          ],
        },
      })
    );
  });
  writeFileSync(transcriptPath, `${lines.join("\n")}\n`);
}

function trailers(): Record<string, string> {
  const message = git(["log", "-1", "--format=%B"]);
  const parsed = execFileSync("git", ["interpret-trailers", "--parse"], {
    input: message,
    encoding: "utf8",
  });
  return Object.fromEntries(
    parsed
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at), line.slice(at + 1).trim()];
      })
  );
}

function pendingFiles(): string[] {
  const pending = join(repo, ".git", "claude-verify-gate", "pending");
  return existsSync(pending) ? readdirSync(pending) : [];
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "verify-gate-"));
  repo = join(dir, "repo");
  transcriptPath = join(dir, "transcript.jsonl");
  mkdirSync(repo);
  git(["init", "-q"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["config", "commit.gpgsign", "false"]);
  const hooks = join(dir, "hooks");
  mkdirSync(hooks);
  writeFileSync(
    join(hooks, "commit-msg"),
    `#!/bin/sh\nnode "${STAMP}" "$1" || true\n`,
    { mode: 0o755 }
  );
  git(["config", "core.hooksPath", hooks]);
  mkdirSync(join(repo, ".claude"));
  writeFileSync(
    join(repo, ".claude", "verify-gate.json"),
    JSON.stringify({ mode: "observe" })
  );
  git(["add", "."]);
  git(["commit", "-q", "--no-verify", "-m", "start"]);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the commit gate, end to end", () => {
  it("stamps a commit with what the session ran since its last edit", () => {
    writeTranscript("npx vitest run a", "EDIT", "npx tsc -b");
    expect(runHook('git commit -m "x"')).toBe("");
    expect(pendingFiles()).toHaveLength(1);
    git([
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "x\n\nCo-Authored-By: Someone <someone@example.com>",
    ]);
    const t = trailers();
    expect(t.Verified).toBe("types");
    expect(t["Verify-gate"]).toBe(
      `observe(worktree) would-block; seen: types${RULES}`
    );
    expect(t["Co-Authored-By"]).toBe("Someone <someone@example.com>");
    expect(pendingFiles()).toHaveLength(0);
  });

  it("keeps the session's own Verified line", () => {
    writeTranscript("EDIT", "npx tsc -b");
    // The hook decides from the message in the command it sees.
    runHook('git commit -m "x" -m "Verified: none (copy only)"');
    git([
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "x\n\nVerified: none (copy only)",
    ]);
    const t = trailers();
    expect(t.Verified).toBe("none (copy only)");
    expect(t["Verify-gate"]).toBe(
      `observe(worktree) pass; seen: types${RULES}`
    );
  });

  it("leaves a commit nobody stamped alone", () => {
    git(["commit", "-q", "--allow-empty", "-m", "a person's commit"]);
    expect(trailers()).toEqual({});
  });

  it("drops a stamp whose commit never happened", () => {
    writeTranscript("npx tsc -b");
    runHook('git commit -m "x"');
    // The commit it was left for skipped the hooks; HEAD has moved on.
    git([
      "commit",
      "-q",
      "--allow-empty",
      "--no-verify",
      "-m",
      "skipped hooks",
    ]);
    git(["commit", "-q", "--allow-empty", "-m", "a later commit"]);
    expect(trailers()).toEqual({});
    expect(pendingFiles()).toHaveLength(0);
  });

  it("in enforce mode denies twice, then lets the next commit through", () => {
    writeTranscript("EDIT");
    const env = { TROPOS_VERIFY_GATE: "enforce" };
    for (let i = 0; i < 2; i++) {
      const out = JSON.parse(runHook('git commit -m "x"', env));
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain(
        "Verified: none (<why>)"
      );
    }
    expect(runHook('git commit -m "x"', env)).toBe("");
    git(["commit", "-q", "--allow-empty", "-m", "x"]);
    expect(trailers()["Verify-gate"]).toBe(
      `enforce(env) would-block, released after 2 blocks; seen: nothing${RULES}`
    );
  });

  it("does nothing in a repository with no gate configured", () => {
    git(["rm", "-q", ".claude/verify-gate.json"]);
    git(["commit", "-q", "--no-verify", "-m", "no gate"]);
    writeTranscript("npx tsc -b");
    expect(runHook('git commit -m "x"')).toBe("");
    expect(pendingFiles()).toHaveLength(0);
  });

  it("ignores a Bash call that commits nothing", () => {
    writeTranscript("npx tsc -b");
    expect(runHook('git log --grep "commit"')).toBe("");
    expect(pendingFiles()).toHaveLength(0);
  });
});

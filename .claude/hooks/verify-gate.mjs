// The commit gate's PreToolUse hook (docs/agents/verification-stamps.md),
// reached through verify-gate.sh. For a Bash call that runs `git commit`
// it reads the session's transcript for the checks that passed since the
// last edit, decides by the gate's mode, and leaves a pending stamp that
// husky's commit-msg (scripts/verify-gate/stamp.mjs) writes onto the
// commit. In observe mode it never blocks anything.
//
// The rules come from the BASE branch's copy of scripts/verify-gate/gate.mjs
// when there is one, read with `git show`, so a branch cannot loosen the
// gate that judges its own commits; the working tree's copy is the
// fallback (and what the tests exercise).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BASE_REF = "origin/main";
const GATE_PATH = "scripts/verify-gate/gate.mjs";
const CONFIG_PATH = ".claude/verify-gate.json";
const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    }).replace(/\n$/, "");
  } catch {
    return null;
  }
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

async function loadGate(stateDir) {
  const blob = git(project, [
    "rev-parse",
    "-q",
    "--verify",
    `${BASE_REF}:${GATE_PATH}`,
  ]);
  if (blob) {
    const copy = join(stateDir, `gate-${blob}.mjs`);
    if (!existsSync(copy)) {
      const text = git(project, ["show", `${BASE_REF}:${GATE_PATH}`]);
      if (text) writeFileSync(copy, `${text}\n`);
    }
    try {
      const gate = await import(pathToFileURL(copy).href);
      if (typeof gate.evaluate === "function") return { gate, logic: "base" };
    } catch {
      // Fall through to the working tree's copy.
    }
  }
  const gate = await import(pathToFileURL(join(project, GATE_PATH)).href);
  return { gate, logic: "worktree" };
}

async function main() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (input.tool_name !== "Bash") return;
  const command = String(input.tool_input?.command ?? "");
  const cwd = input.cwd || process.cwd();

  const projectCommon = git(project, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  if (!projectCommon) return;
  const projectState = join(projectCommon, "claude-verify-gate");
  mkdirSync(projectState, { recursive: true });
  const { gate, logic } = await loadGate(projectState);

  const commits = gate.findGitCommits(command, cwd);
  if (!commits.length) return;
  const commit = commits[commits.length - 1];
  const target = resolve(cwd, commit.cwd || ".");
  const top = git(target, ["rev-parse", "--show-toplevel"]);
  const common = git(target, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  if (!top || !common) return;

  const modeInputs = {
    env: process.env.TROPOS_VERIFY_GATE ?? null,
    baseConfig: git(top, ["show", `${BASE_REF}:${CONFIG_PATH}`]),
    worktreeConfig: readText(join(top, CONFIG_PATH)),
  };
  const mode = gate.resolveMode(modeInputs);
  // No configuration anywhere: the gate is not set up for this repo.
  if (mode.mode === "off" && mode.source === "default") return;

  const stateDir = join(common, "claude-verify-gate");
  const session = String(input.session_id ?? "unknown").replace(
    /[^A-Za-z0-9_-]/g,
    ""
  );
  const sessionFile = join(stateDir, "sessions", `${session}.json`);
  let blocks = 0;
  try {
    blocks = Number(JSON.parse(readFileSync(sessionFile, "utf8")).blocks) || 0;
  } catch {
    blocks = 0;
  }

  const result = gate.evaluate({
    command,
    cwd,
    transcript: input.transcript_path ? readText(input.transcript_path) : "",
    modeInputs,
    blocks,
    messageFromFile: commit.messageFile
      ? readText(resolve(target, commit.messageFile))
      : null,
    root: top,
  });
  if (!result) return;

  const head = git(top, ["rev-parse", "-q", "--verify", "HEAD"]);
  const key = createHash("sha1").update(top).digest("hex").slice(0, 16);
  const record = {
    at: new Date().toISOString(),
    session,
    transcript: input.transcript_path ?? null,
    top,
    head,
    logic,
    mode: result.mode,
    source: result.source,
    verdict: result.decision.verdict,
    why: result.decision.why,
    denied: result.decision.deny,
    methods: result.evidence.methods,
    stale: result.evidence.stale,
    unverifiedExit: result.evidence.unverifiedExit,
    trailers: result.trailers,
    command: command.slice(0, 400),
  };

  mkdirSync(join(stateDir, "pending"), { recursive: true });
  mkdirSync(join(stateDir, "sessions"), { recursive: true });
  appendFileSync(join(stateDir, "log.jsonl"), `${JSON.stringify(record)}\n`);

  if (result.decision.deny) {
    writeFileSync(sessionFile, JSON.stringify({ blocks: blocks + 1 }));
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: gate.denyReason(result.decision),
        },
      })
    );
    return;
  }
  writeFileSync(
    join(stateDir, "pending", `${key}.json`),
    JSON.stringify({ ...record, at: Date.now() })
  );
}

main().catch(() => {});

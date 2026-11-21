// husky's commit-msg: `node scripts/verify-gate/stamp.mjs "$1"`.
//
// Writes the stamp the commit gate's hook left for this commit
// (docs/agents/verification-stamps.md): a `Verified:` trailer when the
// message has no `Verified:` line anywhere (Claude's own line wins), and the
// `Verify-gate:` trailer saying what the gate saw. A commit with no pending
// stamp, which is every commit a person makes, is left as it is. It never
// fails a commit.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stampPlan, verifiedLines } from "./gate.mjs";

function git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).replace(/\n$/, "");
  } catch {
    return null;
  }
}

/** Add one trailer. `--no-divider`: a `---` line in a message's body must
 *  not be read as the end of the message, which would move the trailers. */
function addTrailer(messageFile, ifExists, trailer) {
  return git([
    "interpret-trailers",
    "--in-place",
    "--no-divider",
    "--if-exists",
    ifExists,
    "--trailer",
    trailer,
    messageFile,
  ]);
}

export function stamp(
  messageFile,
  { now = Date.now(), env = process.env } = {}
) {
  const top = git(["rev-parse", "--show-toplevel"]);
  const common = git([
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  if (!top || !common || !messageFile)
    return { stamped: false, reason: "not a repository" };
  const key = createHash("sha1").update(top).digest("hex").slice(0, 16);
  const pendingFile = join(
    common,
    "claude-verify-gate",
    "pending",
    `${key}.json`
  );
  let pending;
  try {
    pending = JSON.parse(readFileSync(pendingFile, "utf8"));
  } catch {
    return { stamped: false, reason: "none pending" };
  }
  // Used or not, a pending stamp is spent by the first commit that sees it.
  rmSync(pendingFile, { force: true });
  const plan = stampPlan(pending, {
    head: git(["rev-parse", "-q", "--verify", "HEAD"]),
    now,
    session: env.CLAUDE_CODE_SESSION_ID || null,
    claudeCode: env.CLAUDECODE === "1",
    merging: git(["rev-parse", "-q", "--verify", "MERGE_HEAD"]) !== null,
  });
  if (!plan.stamp) return { stamped: false, reason: plan.reason };
  let message = "";
  try {
    message = readFileSync(messageFile, "utf8");
  } catch {
    return { stamped: false, reason: "message unreadable" };
  }
  // `--if-exists doNothing` sees only the trailer block, so a `Verified:`
  // line in a paragraph of its own would get a second, contradicting one.
  const verified = verifiedLines(message).length
    ? ""
    : addTrailer(
        messageFile,
        "doNothing",
        `Verified: ${pending.trailers.verified}`
      );
  const gate = addTrailer(
    messageFile,
    "replace",
    `Verify-gate: ${pending.trailers.gate}`
  );
  return { stamped: verified !== null && gate !== null, reason: plan.reason };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    stamp(process.argv[2]);
  } catch {
    // A stamp is never worth a failed commit.
  }
}

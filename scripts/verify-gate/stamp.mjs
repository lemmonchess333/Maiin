// husky's commit-msg: `node scripts/verify-gate/stamp.mjs "$1"`.
//
// Writes the stamp the commit gate's hook left for this commit
// (docs/agents/verification-stamps.md): a `Verified:` trailer when the
// message has none (Claude's own line wins), and the `Verify-gate:`
// trailer saying what the gate saw. A commit with no pending stamp, which is
// every commit a person makes, is left as it is. It never fails a commit.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stampPlan } from "./gate.mjs";

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

export function stamp(messageFile, { now = Date.now() } = {}) {
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
  const head = git(["rev-parse", "-q", "--verify", "HEAD"]);
  const plan = stampPlan(pending, { head, now });
  if (!plan.stamp) return { stamped: false, reason: plan.reason };
  const verified = git([
    "interpret-trailers",
    "--in-place",
    "--if-exists",
    "doNothing",
    "--trailer",
    `Verified: ${pending.trailers.verified}`,
    messageFile,
  ]);
  const gate = git([
    "interpret-trailers",
    "--in-place",
    "--if-exists",
    "replace",
    "--trailer",
    `Verify-gate: ${pending.trailers.gate}`,
    messageFile,
  ]);
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

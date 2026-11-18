// How commits were verified, read from their stamps
// (docs/agents/verification-stamps.md).
//
//   node scripts/verify-gate/stamps.mjs                 # the last 30 commits on HEAD
//   node scripts/verify-gate/stamps.mjs origin/main~50..origin/main
//   node scripts/verify-gate/stamps.mjs main..HEAD --json
//   node scripts/verify-gate/stamps.mjs -n 100 --since=2026-11-18
//
// `Verified:` and `Verify-gate:` lines are read from the whole message, not
// only its trailer block: main squash-merges with the branch's commit
// messages as the body, so a branch's stamps survive there mid-body. Merge
// commits (auto-update-pr-branches makes many) are left out; a commit with
// no `Verified:` line is "unstamped", which is not the same as `none`.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const FIELD = "\u001f";
const RECORD = "\u001e";

/** One commit's stamps: `{ status, methods, nones, gates }`. */
export function readStamps(body) {
  const verified = [];
  const gates = [];
  for (const line of String(body ?? "").split("\n")) {
    const v = /^\s*(?:[-*]\s+)?Verified:\s*(.+?)\s*$/i.exec(line);
    if (v) verified.push(v[1]);
    const g = /^\s*(?:[-*]\s+)?Verify-gate:\s*(.+?)\s*$/i.exec(line);
    if (g) gates.push(g[1]);
  }
  const methods = new Set();
  let nones = 0;
  for (const value of verified) {
    if (/^none\b/i.test(value)) {
      nones++;
      continue;
    }
    for (const part of value.split(",")) {
      const m = /^\s*([a-z0-9-]+)/i.exec(part);
      if (m) methods.add(m[1].toLowerCase());
    }
  }
  let status;
  if (!verified.length) status = "unstamped";
  else if (methods.size) status = nones ? "partly verified" : "verified";
  else status = "none";
  return { status, methods: [...methods], nones, gates };
}

/** Summary counts over many commits' stamps. */
export function summarise(rows) {
  const counts = { verified: 0, "partly verified": 0, none: 0, unstamped: 0 };
  let wouldBlock = 0;
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    if (row.gates.some((g) => /would-block/.test(g))) wouldBlock++;
  }
  return { total: rows.length, ...counts, wouldBlock };
}

function main(argv) {
  const json = argv.includes("--json");
  // Anything else goes to `git log` as given: a range, `-n 50`, `--since`.
  const rest = argv.filter((a) => a !== "--json");
  const args = [
    "log",
    "--no-merges",
    `--format=%h${FIELD}%s${FIELD}%B${RECORD}`,
  ];
  if (rest.length) args.push(...rest);
  else args.push("-n", "30", "HEAD");
  const out = execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = out
    .split(RECORD)
    .map((r) => r.replace(/^\n/, ""))
    .filter((r) => r.includes(FIELD))
    .map((r) => {
      const [sha, subject, body] = r.split(FIELD);
      return { sha, subject, ...readStamps(body) };
    });
  const summary = summarise(rows);
  if (json) {
    process.stdout.write(`${JSON.stringify({ summary, rows }, null, 2)}\n`);
    return;
  }
  for (const row of rows) {
    const how = row.methods.length ? row.methods.join(", ") : row.status;
    const gate = row.gates.length ? `  [gate: ${row.gates.join(" | ")}]` : "";
    process.stdout.write(
      `${row.sha}  ${how.padEnd(24)}  ${row.subject.slice(0, 70)}${gate}\n`
    );
  }
  process.stdout.write(
    `\n${summary.total} commits: ${summary.verified} verified, ${summary["partly verified"]} partly verified, ` +
      `${summary.none} none, ${summary.unstamped} unstamped; ${summary.wouldBlock} the gate would have blocked.\n`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main(process.argv.slice(2));
}

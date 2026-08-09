/**
 * Dead file references in production comments.
 *
 * CLAUDE.md, recurring-mistake rules: "Deleting a test file is a documentation
 * change too — grep for prose that cites it." A header saying "covered by X"
 * keeps steering people away from writing tests long after X is gone, and it
 * reads as authoritative because it names a file. That is not hypothetical
 * here: `useClaimMap.test.ts` vouched for 29 tests deleted in #1733, so nobody
 * wrote rejection cases, and the locked 70% distance gate ran for months
 * comparing metres to kilometres with a green suite (#1834, #1835).
 *
 * A rule nothing checks is a claim that rots, so this is the check. It scans
 * comments in `src/**` and `functions/**` for path-shaped tokens and fails when
 * the cited basename exists NOWHERE in the repo.
 *
 * Deliberately basename-only, not full-path. Comments legitimately use
 * shorthand (`lib/foo.ts`, `__tests__/bar.test.ts`) whose literal path doesn't
 * resolve from the citing file, and demanding exact paths would produce noise
 * that gets suppressed rather than fixed. "This filename exists somewhere"
 * catches the failure that actually bites — the file is GONE — while staying
 * quiet on style.
 *
 * Docs are out of scope on purpose: `docs/**` and the root `*.md` files
 * legitimately propose files that don't exist yet ("**NEW** src/x.tsx") and
 * describe past states. Comments sitting next to running code are held to a
 * higher bar because they are read as current.
 *
 * ALLOWED is a delete-only ratchet, same idiom as KNOWN_ORPHAN_EXPORTS in
 * symbolReachability.test.ts: every entry is a conscious exception with a
 * reason. Removing one is always fine; adding one should be argued for.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "graphify-out",
  "coverage",
  "ios",
  "android",
]);

/**
 * Citations that intentionally name something not in the repo.
 * Key is the cited token; value is why it stays.
 */
const ALLOWED: Record<string, string> = {
  // A path INSIDE a broken npm package — the comment's whole point is that
  // `bad-words@4` requires a file that does not exist. Naming it is the
  // evidence for choosing leo-profanity.
  "./badwords.js": "path inside the broken bad-words@4 package, not ours",
  // Operator-supplied credentials, never committed.
  "./service-account.json": "operator-supplied credential, deliberately absent",
  "./sa.json": "operator-supplied credential, deliberately absent",
  // Deleted in #1733 and cited BY NAME as the thing that was deleted — the
  // ADR-0008 motivating case. These references must survive: they are the
  // record of why there is no server port.
  "functions/lib/scheduledRunCompletion.js":
    "deleted in #1733, cited as history",
  "functions/__tests__/scheduledRunCompletion.test.js":
    "deleted in #1733, cited as history",
  "src/lib/__tests__/scheduledRunCompletion.cross.test.ts":
    "deleted in #1733, cited as history",
  // Superseded surface, cited as the thing that was replaced.
  "src/lib/healthScore.ts": "superseded surface, cited as history",
  // Synthetic hashed-asset URL inside serviceWorkerContract.test.ts's
  // executed-SW fixture — it must LOOK like a Vite asset to route into
  // the cache-first branch, and deliberately names no real file (a real
  // hash would rot on every build).
  "4173/Maiin/assets/index-abc123.js":
    "synthetic fixture URL in the executed-SW test, names no real file",
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function allRepoBasenames(dir: string, out = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) allRepoBasenames(full, out);
    else out.add(entry.name);
  }
  return out;
}

/** A path-shaped token with a source extension, e.g. `a/b/c.ts`. */
const PATH_RE =
  /(?<![\w/@.-])((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|md|json|css|rules))\b/g;
const COMMENT_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/* This file is excluded from its own scan: the docstring above uses
   path-shaped EXAMPLES (`lib/foo.ts`, `a/b/c.ts`) to explain what the rule
   matches, and they are illustrations, not citations. Scanning self would make
   the gate fail on its own documentation. */
const SELF = resolve(here, "deadPathReferences.test.ts");
const SCANNED = [
  ...sourceFiles(resolve(repoRoot, "src")),
  ...sourceFiles(resolve(repoRoot, "functions")),
  ...sourceFiles(resolve(repoRoot, "scripts")),
].filter((f) => f !== SELF);
const EXISTING = allRepoBasenames(repoRoot);

interface DeadRef {
  file: string;
  cited: string;
}

function findDeadRefs(): DeadRef[] {
  const dead: DeadRef[] = [];
  for (const file of SCANNED) {
    const text = readFileSync(file, "utf8");
    for (const comment of text.match(COMMENT_RE) ?? []) {
      for (const m of comment.matchAll(PATH_RE)) {
        const cited = m[1];
        if (cited.includes("node_modules")) continue;
        if (ALLOWED[cited]) continue;
        if (EXISTING.has(basename(cited))) continue;
        dead.push({ file: file.slice(repoRoot.length + 1), cited });
      }
    }
  }
  return dead;
}

describe("dead file references in production comments", () => {
  it("scans a real corpus (guard against a silently empty walk)", () => {
    // Without this the assertions below would pass vacuously if the directory
    // walk broke — the failure shape this whole file exists to prevent.
    expect(SCANNED.length).toBeGreaterThan(500);
    expect(EXISTING.size).toBeGreaterThan(500);
    expect(EXISTING.has("useClaimMap.ts")).toBe(true);
  });

  it("every path cited in a comment names a file that still exists", () => {
    const dead = findDeadRefs();
    expect(
      dead.map((d) => `${d.file} -> ${d.cited}`),
      "A comment names a file whose basename exists nowhere in the repo. " +
        "Either the file moved (update the citation) or it was deleted — in " +
        "which case say so in the prose, because a bare reference to a deleted " +
        "file reads as a live claim. If the path is deliberately external " +
        "(a credential, a path inside a dependency), add it to ALLOWED with a " +
        "reason."
    ).toEqual([]);
  });

  it("ALLOWED has no stale entries (delete-only ratchet)", () => {
    // An allow-list entry for a citation nobody makes any more is dead weight
    // that hides the next real one. Same discipline as KNOWN_ORPHAN_EXPORTS.
    const citedSomewhere = new Set<string>();
    for (const file of SCANNED) {
      const text = readFileSync(file, "utf8");
      for (const comment of text.match(COMMENT_RE) ?? []) {
        for (const m of comment.matchAll(PATH_RE)) citedSomewhere.add(m[1]);
      }
    }
    const unused = Object.keys(ALLOWED).filter((k) => !citedSomewhere.has(k));
    expect(
      unused,
      "ALLOWED entries no longer cited anywhere — delete them"
    ).toEqual([]);
  });
});

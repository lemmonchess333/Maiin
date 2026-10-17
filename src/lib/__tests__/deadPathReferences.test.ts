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
  // Cited BY NAME in eslintConfigPaths.test.ts as the entry that had rotted
  // in eslint.config.js's hex-exemption block: the file was deleted while
  // the exemption kept naming it, so the block read as deliberate forever.
  // The citation IS the evidence for that gate existing.
  "src/components/social/ShareCard.tsx":
    "deleted; cited as the stale eslint `files:` entry that motivated the gate",
  // A path INSIDE jsdom, cited as the evidence for why an animation-stall
  // in WorkoutSessionCompletion.test.tsx is a harness bug rather than a
  // framer-motion one: jsdom starts its rAF driver only on the 0 -> 1
  // transition of its own callback counter. Naming the file is what makes
  // that checkable by the next reader instead of taken on trust.
  "browser/Window.js": "path inside jsdom, cited as the mechanism's source",
  // Synthetic hashed-asset URL inside serviceWorkerContract.test.ts's
  // executed-SW fixture — it must LOOK like a Vite asset to route into
  // the cache-first branch, and deliberately names no real file (a real
  // hash would rot on every build).
  "4173/Maiin/assets/index-abc123.js":
    "synthetic fixture URL in the executed-SW test, names no real file",
};

function repoFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) repoFiles(full, out);
    else out.push(full);
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
// One inventory serves both the source corpus and basename lookup; each
// source's comments are then read once for both citation assertions.
const REPO_FILES = repoFiles(repoRoot);
const sourceRoots = ["src", "functions", "scripts"].map(
  (dir) => resolve(repoRoot, dir) + "/"
);
const SCANNED = REPO_FILES.filter((file) => {
  const portable = file.replace(/\\/g, "/");
  return (
    file !== SELF &&
    /\.(ts|tsx|js|jsx)$/.test(file) &&
    sourceRoots.some((root) => portable.startsWith(root.replace(/\\/g, "/")))
  );
});
const EXISTING = new Set(REPO_FILES.map((file) => basename(file)));

interface DeadRef {
  file: string;
  cited: string;
}

function citationsIn(text: string): string[] {
  return (text.match(COMMENT_RE) ?? []).flatMap((comment) =>
    [...comment.matchAll(PATH_RE)].map((m) => m[1])
  );
}

const CITATIONS: DeadRef[] = SCANNED.flatMap((file) =>
  citationsIn(readFileSync(file, "utf8")).map((cited) => ({
    file: file.slice(repoRoot.length + 1),
    cited,
  }))
);

function findDeadRefs(citations = CITATIONS): DeadRef[] {
  return citations.filter(({ cited }) => {
    if (cited.includes("node_modules")) return false;
    return !ALLOWED[cited] && !EXISTING.has(basename(cited));
  });
}

describe("dead file references in production comments", () => {
  it("scans a real corpus (guard against a silently empty walk)", () => {
    // Without this the assertions below would pass vacuously if the directory
    // walk broke — the failure shape this whole file exists to prevent.
    expect(SCANNED.length).toBeGreaterThan(500);
    expect(EXISTING.size).toBeGreaterThan(500);
    expect(EXISTING.has("useClaimMapForProgram.ts")).toBe(true);
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

  it("extracts comment citations and rejects a missing file while accepting existing and allowed references", () => {
    expect(
      citationsIn(
        "// covered by lib/useClaimMapForProgram.ts\n/* see lib/auditMissingFile.ts */"
      )
    ).toEqual(["lib/useClaimMapForProgram.ts", "lib/auditMissingFile.ts"]);
    const references = [
      "lib/useClaimMapForProgram.ts",
      "lib/auditMissingFile.ts",
      "./sa.json",
      "node_modules/package/missing.js",
    ].map((cited) => ({ file: "fixture", cited }));
    expect(findDeadRefs(references)).toEqual([
      { file: "fixture", cited: "lib/auditMissingFile.ts" },
    ]);
  });

  it("ALLOWED has no stale entries (delete-only ratchet)", () => {
    // An allow-list entry for a citation nobody makes any more is dead weight
    // that hides the next real one. Same discipline as KNOWN_ORPHAN_EXPORTS.
    const citedSomewhere = new Set(CITATIONS.map(({ cited }) => cited));
    const unused = Object.keys(ALLOWED).filter((k) => !citedSomewhere.has(k));
    expect(
      unused,
      "ALLOWED entries no longer cited anywhere — delete them"
    ).toEqual([]);
  });
});

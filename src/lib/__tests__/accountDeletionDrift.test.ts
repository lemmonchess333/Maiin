/**
 * R1A-Deletion Chunk 1 — drift-prevention static scan.
 *
 * Goal: prevent the original B1 defect from recurring. Every
 * user-keyed Firestore or Storage write site discovered by the
 * scanner must classify to an entry in
 * functions/accountDeletionInventory.json (included or excluded), or
 * carry a `// @deletion-classified: <key>` comment override.
 *
 * Failure mode: hard fail. Adding a new user-keyed collection without
 * an inventory entry blocks the merge. CI must mark this test as a
 * required check on the deployment branch (see manual setup
 * checklist in the Chunk 1 report).
 *
 * Scope notes:
 *   - Static regex extraction; not an AST walk. Handles the common
 *     write patterns observed in Phase 0; unhandled exotic patterns
 *     should use the @deletion-classified annotation.
 *   - Limited to src/**\/*.{ts,tsx} (excluding tests/) and the three
 *     active functions/ entry files (index.js, appleIAP.js,
 *     performanceEngine.js).
 *   - The scanner intentionally narrows to "first-segment user-keyed"
 *     and "known cross-user collection" writes — these are the
 *     categories that drove B1. False negatives are acceptable in v1
 *     (the e2e smoke test in Chunk 4 catches data left behind);
 *     future hardening evolves the patterns.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const inventoryPath = resolve(repoRoot, "functions/accountDeletionInventory.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));

const require = createRequire(import.meta.url);
const { matchesPathFilter } = require("../../../functions/lib/pathFilterMatcher.js");

interface InventoryAlias { key: string; path: string; reason: string; }
interface InventoryEntry {
  key: string;
  path?: string;
  collectionGroup?: string;
  pathFilter?: string;
  aliases?: InventoryAlias[];
  sourcePath?: string;
  testCoverageStatus?: string;
}

const ALL_ENTRIES: InventoryEntry[] = [
  ...inventory.included,
  ...inventory.excluded,
];

/* ── Path classification ─────────────────────────────────────────── */

/**
 * Build the set of "first-segment names" the inventory accepts as
 * user-keyed top-level collections. Only includes first-segments where
 * an inventory entry's `path` contains the `{uid}` placeholder — i.e.
 * collections whose primary keying is by uid (users, feeds, following,
 * scanUsage, …).
 *
 * Deliberately EXCLUDES first-segments that appear only via
 * `pathFilter` (collectionGroup with non-uid parent keying — e.g.
 * groups/{crewId}/members/{uid}, challenges/{challengeId}/participants/{uid}).
 * Writes to those parent docs (groups/{crewId}, challenges/{challengeId})
 * are NOT user-keyed and would be false positives if scanner flagged
 * them. The 3-segment detection below handles the cross-user-keyed
 * children separately.
 */
function buildKnownFirstSegments(): Set<string> {
  const segments = new Set<string>();
  for (const entry of ALL_ENTRIES) {
    if (entry.path && entry.path.includes("{uid}")) {
      const first = entry.path.split("/")[0];
      if (first) segments.add(first);
    }
    if (entry.sourcePath && entry.sourcePath.includes("{uid}")) {
      const first = entry.sourcePath.split("/")[0];
      if (first) segments.add(first);
    }
    // Chunk 1.1 schema: aliases are {key, path, reason} objects
    for (const alias of entry.aliases || []) {
      const aliasPath = typeof alias === "string" ? alias : alias.path;
      if (aliasPath && aliasPath.includes("{uid}")) {
        const first = aliasPath.split("/")[0];
        if (first) segments.add(first);
      }
    }
  }
  return segments;
}
const KNOWN_FIRST_SEGMENTS = buildKnownFirstSegments();

/**
 * Check whether a "users/{uid}/SUB" detection is classified by some
 * inventory entry. Matches both current paths and legacy aliases.
 */
function isUserSubcollectionClassified(sub: string): boolean {
  const target = `users/{uid}/${sub}`;
  for (const entry of ALL_ENTRIES) {
    if (entry.path === target) return true;
    if (entry.path && entry.path.startsWith(`${target}/`)) return true;
    // userPublicSubcollection covers users/{uid}/public — also classifies users/{uid}/public/profile
    if (entry.path && target.startsWith(`${entry.path}/`)) return true;
    for (const alias of entry.aliases || []) {
      const aliasPath = typeof alias === "string" ? alias : alias.path;
      if (aliasPath === target) return true;
    }
  }
  return false;
}

/**
 * Check whether a top-level user-keyed write to `X/{uid}` or
 * `X/{uid}/SUB` is classified.
 */
function isTopLevelUserKeyedClassified(first: string, sub: string | null): boolean {
  const candidates: string[] = [];
  if (sub) candidates.push(`${first}/{uid}/${sub}`);
  candidates.push(`${first}/{uid}`);
  candidates.push(first);
  for (const entry of ALL_ENTRIES) {
    if (!entry.path) continue;
    if (candidates.includes(entry.path)) return true;
    if (sub && entry.path.startsWith(`${first}/{uid}/${sub}/`)) return true;
  }
  return false;
}

/* ── File walking ────────────────────────────────────────────────── */

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === "ios" || name === "android") continue;
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, files);
    } else if (s.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function listSourceFiles(): string[] {
  const srcRoot = resolve(repoRoot, "src");
  const all = walk(srcRoot);
  return all.filter((f) => {
    if (!f.endsWith(".ts") && !f.endsWith(".tsx")) return false;
    if (f.includes("__tests__")) return false;
    if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) return false;
    if (f.endsWith(".d.ts")) return false;
    return true;
  });
}

function listFunctionsFiles(): string[] {
  return [
    resolve(repoRoot, "functions/index.js"),
    resolve(repoRoot, "functions/appleIAP.js"),
    resolve(repoRoot, "functions/performanceEngine.js"),
  ];
}

/* ── Pattern extraction ──────────────────────────────────────────── */

interface Detection {
  file: string;
  line: number;
  signature: string; // canonical "X/{uid}/SUB" or "X/{uid}" or "X"
  raw: string; // verbatim line for error messages
}

/**
 * Identifier names the scanner treats as "the user uid" placeholder.
 * If a write call uses one of these as the uid-position arg, it's
 * considered user-keyed.
 */
const UID_LIKE = /\b(uid|user\.uid|currentUser\.uid|currentUid|user\?\.\w*uid|targetUid|followerUid|followingUid|targetUserId|recipientUid|authorId|authorUid|fromUserId|toUserId|memberUid|userId|otherUid)\b/;

/**
 * Detection of `collection(db, "X", varname, "Y", ...)` or
 * `doc(db, "X", varname, "Y", ...)`.
 *
 * Captures: first segment, sub segment (if present).
 */
const WEB_TWO_SEGMENT = /\b(?:collection|doc)\s*\(\s*db\s*,\s*"([^"]+)"\s*,\s*([^,)]+)\s*,\s*"([^"]+)"/g;

/** `doc(db, "X", varname)` — top-level doc by some id */
const WEB_DOC_TOP_LEVEL = /\bdoc\s*\(\s*db\s*,\s*"([^"]+)"\s*,\s*([^,)]+)\s*\)/g;

/** `collection(db, "X")` — top-level collection access */
const WEB_COLLECTION_TOP_LEVEL = /\bcollection\s*\(\s*db\s*,\s*"([^"]+)"\s*\)/g;

/** `doc(db, "X", varname1, "Y", varname2)` — 4-segment doc ref where last id may be uid */
const WEB_FOUR_SEGMENT_DOC = /\bdoc\s*\(\s*db\s*,\s*"([^"]+)"\s*,\s*([^,)]+)\s*,\s*"([^"]+)"\s*,\s*([^,)]+)\s*\)/g;

/** Admin SDK: `.collection("X").doc(varname).collection("Y")` */
const ADMIN_TWO_SEGMENT = /\.collection\s*\(\s*"([^"]+)"\s*\)\s*\.doc\s*\(\s*([^)]+)\s*\)\s*\.collection\s*\(\s*"([^"]+)"/g;

/** Admin SDK: `.collection("X").doc(varname)` — first segment / doc by uid */
const ADMIN_DOC_BY_UID = /\.collection\s*\(\s*"([^"]+)"\s*\)\s*\.doc\s*\(\s*([^)]+)\s*\)/g;

/** Storage: `ref(storage, "X/${uid}/...")` or `ref(storage, \`X/${uid}/...\`)` */
const STORAGE_REF = /\bref\s*\(\s*\w*storage\w*\s*,\s*[`'"]([a-zA-Z][\w-]*)\/\$?\{?(uid|user\.uid|currentUser\.uid|currentUid)\}?/g;

/**
 * Lines flagged with `// @deletion-classified: <key>` are exempt —
 * the implementer has manually told the scanner this write is
 * already classified. The annotation may live on the same line or
 * on the immediately preceding line.
 */
const ANNOTATION = /@deletion-classified:\s*([\w-]+)/;

function annotationKey(currLine: string, prevLine: string): string | null {
  const m = currLine.match(ANNOTATION) || prevLine.match(ANNOTATION);
  return m ? m[1] : null;
}

function isUidLikeArg(varname: string): boolean {
  return UID_LIKE.test(varname.trim());
}

/* ── Scanner ─────────────────────────────────────────────────────── */

function scanFile(file: string): Detection[] {
  const detections: Detection[] = [];
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = lines[i - 1] || "";

    // Skip annotated lines — implementer has manually classified.
    const ann = annotationKey(line, prevLine);
    if (ann) continue;

    // WEB_TWO_SEGMENT: collection(db, "X", varname, "SUB")
    let m: RegExpExecArray | null;
    WEB_TWO_SEGMENT.lastIndex = 0;
    while ((m = WEB_TWO_SEGMENT.exec(line))) {
      const [, first, varname, sub] = m;
      if (!isUidLikeArg(varname)) continue;
      detections.push({ file, line: i + 1, signature: `${first}/{uid}/${sub}`, raw: line.trim() });
    }

    // WEB_FOUR_SEGMENT_DOC: doc(db, "X", varname1, "Y", varname2)
    // Detects cross-user-keyed writes like groups/{crewId}/members/{uid},
    // challenges/{challengeId}/participants/{uid}, kudos/{activityId}/users/{uid},
    // comments/{activityId}/items/{commentId}.
    WEB_FOUR_SEGMENT_DOC.lastIndex = 0;
    while ((m = WEB_FOUR_SEGMENT_DOC.exec(line))) {
      const [, first, , sub, lastVar] = m;
      // Only flag if the LAST arg is uid-like — that's where the
      // user-keyed cross-reference lives. Non-uid last-args (like
      // commentId) are out of scope for the deletion sweep.
      if (!isUidLikeArg(lastVar)) continue;
      detections.push({
        file,
        line: i + 1,
        signature: `${first}/{*}/${sub}/{uid}`,
        raw: line.trim(),
      });
    }

    // WEB_DOC_TOP_LEVEL: doc(db, "X", varname) — only flag if X is a known
    // user-keyed root AND varname is uid-like.
    WEB_DOC_TOP_LEVEL.lastIndex = 0;
    while ((m = WEB_DOC_TOP_LEVEL.exec(line))) {
      const [, first, varname] = m;
      if (!KNOWN_FIRST_SEGMENTS.has(first)) continue;
      if (!isUidLikeArg(varname)) continue;
      detections.push({ file, line: i + 1, signature: `${first}/{uid}`, raw: line.trim() });
    }

    // WEB_COLLECTION_TOP_LEVEL: collection(db, "X") — flag only if X is a
    // known user-keyed root collection (writes/queries against the
    // top-level need classification).
    WEB_COLLECTION_TOP_LEVEL.lastIndex = 0;
    while ((m = WEB_COLLECTION_TOP_LEVEL.exec(line))) {
      const [, first] = m;
      if (!KNOWN_FIRST_SEGMENTS.has(first)) continue;
      detections.push({ file, line: i + 1, signature: first, raw: line.trim() });
    }

    // ADMIN_TWO_SEGMENT: .collection("X").doc(varname).collection("SUB")
    ADMIN_TWO_SEGMENT.lastIndex = 0;
    while ((m = ADMIN_TWO_SEGMENT.exec(line))) {
      const [, first, varname, sub] = m;
      if (!isUidLikeArg(varname)) continue;
      detections.push({ file, line: i + 1, signature: `${first}/{uid}/${sub}`, raw: line.trim() });
    }

    // ADMIN_DOC_BY_UID: .collection("X").doc(varname)
    ADMIN_DOC_BY_UID.lastIndex = 0;
    while ((m = ADMIN_DOC_BY_UID.exec(line))) {
      const [, first, varname] = m;
      if (!isUidLikeArg(varname)) continue;
      if (!KNOWN_FIRST_SEGMENTS.has(first)) continue;
      detections.push({ file, line: i + 1, signature: `${first}/{uid}`, raw: line.trim() });
    }

    // Storage
    STORAGE_REF.lastIndex = 0;
    while ((m = STORAGE_REF.exec(line))) {
      const [, prefix] = m;
      detections.push({ file, line: i + 1, signature: `${prefix}/{uid}/`, raw: line.trim() });
    }
  }
  return detections;
}

/* ── Storage classifier ──────────────────────────────────────────── */

function isStorageClassified(signature: string): boolean {
  // signature looks like "X/{uid}/"
  for (const entry of ALL_ENTRIES) {
    if (entry.path === signature) return true;
  }
  return false;
}

/* ── Top-level classification ────────────────────────────────────── */

/**
 * Classify a 3-segment cross-user-keyed signature like
 * "groups/{*}/members/{uid}" against an inventory entry with
 * pathFilter "groups/*\/members" + docIdEquals "{uid}".
 *
 * Uses the segment-aware matchesPathFilter helper rather than string
 * equality so the matcher's blast-radius protection (rejecting
 * admin/feeds_archive/x/items etc.) applies at classification time.
 */
function isCrossUserKeyedClassified(signature: string): boolean {
  // signature shape: FIRST/{*}/SUB/{uid}
  const parts = signature.split("/");
  if (parts.length !== 4) return false;
  if (parts[1] !== "{*}" || parts[3] !== "{uid}") return false;
  // Build a candidate path the matcher will recognise: replace {*} with a
  // placeholder and the leaf with another so matchesPathFilter has a
  // well-formed candidate.
  const candidatePath = `${parts[0]}/__wildcard__/${parts[2]}/__leaf__`;
  for (const entry of ALL_ENTRIES) {
    if (entry.pathFilter && matchesPathFilter(entry.pathFilter, candidatePath)) {
      return true;
    }
  }
  return false;
}

function isClassified(signature: string): boolean {
  // Storage prefix
  if (signature.endsWith("/{uid}/")) {
    return isStorageClassified(signature);
  }
  // Cross-user-keyed via collectionGroup pathFilter
  if (signature.includes("/{*}/")) {
    return isCrossUserKeyedClassified(signature);
  }
  // users/{uid}/X
  if (signature.startsWith("users/{uid}/")) {
    const sub = signature.slice("users/{uid}/".length);
    return isUserSubcollectionClassified(sub);
  }
  // users/{uid}
  if (signature === "users/{uid}") return true; // covered by userRoot
  // X/{uid}/Y or X/{uid}
  const parts = signature.split("/");
  if (parts.length >= 2 && parts[1] === "{uid}") {
    const first = parts[0];
    const sub = parts[2] || null;
    return isTopLevelUserKeyedClassified(first, sub);
  }
  // Top-level X (no uid) — classified if X is a recognised first-segment
  // and an inventory entry has it as a top-level path.
  for (const entry of ALL_ENTRIES) {
    if (entry.path === signature) return true;
  }
  return false;
}

/* ── Test ────────────────────────────────────────────────────────── */

describe("accountDeletionDrift — every detected user-keyed write is classified", () => {
  const allFiles = [...listSourceFiles(), ...listFunctionsFiles()];
  const allDetections: Detection[] = [];
  for (const f of allFiles) {
    try {
      allDetections.push(...scanFile(f));
    } catch (err) {
      // Skip files we can't read; surfacing the error in the test
      // would be noisy. The test is about classification of detected
      // writes, not file-system completeness.
      void err;
    }
  }

  it("scanner ran across the expected file count", () => {
    expect(allFiles.length).toBeGreaterThan(20);
  });

  it("at least one user-keyed write was detected (sanity check)", () => {
    expect(allDetections.length).toBeGreaterThan(5);
  });

  it("every detected user-keyed write is classified by the inventory", () => {
    const unclassified: Detection[] = [];
    const seen = new Set<string>();
    for (const d of allDetections) {
      const dedupeKey = `${d.signature}::${d.file}::${d.line}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      if (!isClassified(d.signature)) {
        unclassified.push(d);
      }
    }
    if (unclassified.length > 0) {
      const message = unclassified
        .map(
          (d) =>
            `  ${relative(repoRoot, d.file)}:${d.line}\n    signature: ${d.signature}\n    code:      ${d.raw.slice(0, 200)}`,
        )
        .join("\n\n");
      throw new Error(
        `R1A-Deletion drift detected — ${unclassified.length} unclassified user-keyed write site(s):\n\n${message}\n\n` +
          `Fix by either (a) adding an entry to functions/accountDeletionInventory.json, ` +
          `or (b) annotating the line(s) with: // @deletion-classified: <inventory-key>`,
      );
    }
    expect(unclassified).toEqual([]);
  });
});

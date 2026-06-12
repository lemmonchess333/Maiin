/**
 * Guarded-write enforcement (CLAUDE.md recurring-mistake rule).
 *
 * "Never call raw `setDoc`/`addDoc`/`updateDoc` — always route through the
 * guarded wrappers in `src/lib/firestoreWrite.ts`." They strip `undefined`
 * (which Firestore rejects outright) and survive offline-queue replay (a raw
 * write that fails online fails forever on every flush). PR `5061046` migrated
 * ~25 raw call sites and fixed safeSave/safeMerge re-failing on every offline
 * flush — this guard stops the 26th from creeping back in.
 *
 * The invariant: no `setDoc(` / `addDoc(` / `updateDoc(` call anywhere under
 * `src/` except the two files that legitimately own the low-level write:
 *   - `firestoreWrite.ts` — DEFINES the guarded wrappers (calls the raw SDK
 *     functions internally, which is the whole point).
 *   - `offlineQueue.ts` — the flush layer the wrappers delegate to; it performs
 *     the actual replay writes of already-sanitised payloads.
 *
 * `setDocGuarded(` / `addDocGuarded(` / `updateDocGuarded(` do NOT match (the
 * pattern requires the bare name immediately followed by `(`), so legitimate
 * guarded calls are invisible to this scan. A new raw call fails CI; adding a
 * file to ALLOWLIST is a conscious, reviewed decision.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const srcRoot = resolve(repoRoot, "src");

/** The only files allowed to call the raw Firestore write SDK. */
const ALLOWLIST = new Set<string>([
  "src/lib/firestoreWrite.ts", // defines the guarded wrappers
  "src/lib/offlineQueue.ts", // the flush layer the wrappers delegate to
]);

/** Bare `setDoc(`/`addDoc(`/`updateDoc(` — NOT the `*Guarded(` variants (those
 *  have `Guarded` between the name and the paren) and NOT imports (`setDoc }`
 *  / `setDoc,`). */
const RAW_WRITE = /\b(setDoc|addDoc|updateDoc)\(/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__" || name === "test")
        continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

describe("guarded-write enforcement (no raw setDoc/addDoc/updateDoc)", () => {
  it("no src file outside the allow-list calls the raw write SDK", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const rel = relative(repoRoot, file);
      if (ALLOWLIST.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      // Check line-by-line so the message can name the exact line, and so a
      // mention inside a comment block (`* … addDoc() …`) without a call paren
      // doesn't trip it — the RAW_WRITE pattern needs `name(`.
      src.split("\n").forEach((line, i) => {
        // Skip obvious comment lines (the wrappers' own docs reference the names).
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
        if (RAW_WRITE.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(
      offenders,
      `Raw Firestore write(s) found. Route through addDocGuarded / ` +
        `setDocGuarded / updateDocGuarded (src/lib/firestoreWrite.ts) — they ` +
        `strip undefined and survive offline-queue replay. If this is a new ` +
        `legitimate low-level writer, add it to ALLOWLIST with a reason.\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("the allow-list is honest — each listed file exists and calls the raw SDK", () => {
    for (const rel of ALLOWLIST) {
      const src = readFileSync(resolve(repoRoot, rel), "utf8");
      expect(
        RAW_WRITE.test(src),
        `${rel} is allow-listed but no longer calls the raw SDK — remove it.`
      ).toBe(true);
    }
  });
});

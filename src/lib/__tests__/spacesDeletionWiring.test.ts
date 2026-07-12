/**
 * Spc1 PR4 — deletion-executor wiring pins for the Community Spaces
 * sweep. Lives in src/lib/__tests__ because the R1A overclaim guard
 * (accountDeletionDrift.test.ts) scans ONLY this directory for
 * inventory testCoverageKey strings. The deep behavioural coverage
 * (per-space membership/post deletion, prefix count) lives in
 * functions/__tests__/accountDeletion.test.js; these pin the WIRING
 * text so a refactor that drops the step or the prefix fails here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const executorJs = readFileSync(
  resolve(here, "../../../functions/accountDeletion.js"),
  "utf8"
);

describe("deletion executor wiring (Spc1 PR4)", () => {
  it("accountDeletion.js wires the spaces cleanup step (unit::accountDeletion.spacesCleanup.memberships)", () => {
    expect(executorJs).toMatch(/require\("\.\/lib\/spacesCleanup"\)/);
    expect(executorJs).toMatch(/cleanupSpacesForUser\(/);
  });

  it("the cleanup helper deletes authored posts per known space (unit::accountDeletion.spacesCleanup.posts)", () => {
    const helperJs = readFileSync(
      resolve(here, "../../../functions/lib/spacesCleanup.js"),
      "utf8"
    );
    expect(helperJs).toMatch(/where\("authorId", "==", uid\)/);
    expect(helperJs).toMatch(/members\/\$\{uid\}/);
  });

  it("space-photos is in the storage prefix sweep (unit::accountDeletion.storagePrefixes)", () => {
    expect(executorJs).toContain("space-photos/__UID__/");
  });
});

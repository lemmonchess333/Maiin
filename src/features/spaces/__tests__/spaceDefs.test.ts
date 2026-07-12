/**
 * Space definitions — config invariants + the config↔rules parity pin
 * (Spc1 PR1). Same D1-parity idiom as profileFieldRegistry.test.ts:
 * the firestore.rules isKnownSpaceId allowlist must stay set-equal to
 * SPACE_IDS, so adding/merging a space always touches both files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPACE_DEFS, SPACE_IDS, spaceDef } from "../spaceDefs";

describe("SPACE_DEFS config invariants", () => {
  it("ships the locked seven-space launch set (Spc1e)", () => {
    expect(SPACE_DEFS).toHaveLength(7);
  });

  it("ids are unique, url-safe slugs", () => {
    expect(new Set(SPACE_IDS).size).toBe(SPACE_IDS.length);
    for (const id of SPACE_IDS) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("v1 is interest-kind only (Spc1d)", () => {
    for (const d of SPACE_DEFS) expect(d.kind).toBe("interest");
  });

  it("accents stay inside the closed palette", () => {
    for (const d of SPACE_DEFS) {
      expect(["running", "lifting", "brand"]).toContain(d.accent);
    }
  });

  it("every space has a name and a tagline", () => {
    for (const d of SPACE_DEFS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.tagline.length).toBeGreaterThan(0);
      expect(spaceDef(d.id)).toBe(d);
    }
  });
});

describe("config ↔ firestore.rules parity (isKnownSpaceId)", () => {
  it("the rules allowlist is set-equal to SPACE_IDS", () => {
    const rules = readFileSync(
      resolve(__dirname, "../../../../firestore.rules"),
      "utf8"
    );
    const fnMatch = rules.match(
      /function isKnownSpaceId\([^)]*\)\s*\{[\s\S]*?return[^[]*\[([\s\S]*?)\]/
    );
    expect(fnMatch, "isKnownSpaceId not found in firestore.rules").toBeTruthy();
    const ruleIds = Array.from(fnMatch![1].matchAll(/'([^']+)'/g)).map(
      (m) => m[1]
    );
    expect(new Set(ruleIds)).toEqual(new Set(SPACE_IDS));
  });
});

describe("deletion executor wiring (Spc1 PR4)", () => {
  /* These two tests carry the inventory's testCoverageKey strings —
     the R1A overclaim guard scans TS test files for them. The deep
     behavioural coverage lives in functions/__tests__/
     accountDeletion.test.js (spaces-sweep + prefix assertions); these
     pin the WIRING text so a refactor that drops the step or the
     prefix fails here too. */
  const executorJs = readFileSync(
    resolve(__dirname, "../../../../functions/accountDeletion.js"),
    "utf8"
  );

  it("accountDeletion.js wires the spaces cleanup step (unit::accountDeletion.spacesCleanup)", () => {
    expect(executorJs).toMatch(/require\("\.\/lib\/spacesCleanup"\)/);
    expect(executorJs).toMatch(/cleanupSpacesForUser\(/);
  });

  it("space-photos is in the storage prefix sweep (unit::accountDeletion.storagePrefixes)", () => {
    expect(executorJs).toContain("space-photos/__UID__/");
  });
});

describe("config ↔ functions parity (lib/spaceIds.js)", () => {
  it("the deletion executor's server-side id list is set-equal to SPACE_IDS", () => {
    /* Tested-copy rule: the executor's bounded spaces sweep iterates
       functions/lib/spaceIds.js — the server-side mirror of this
       config. Drift means a new space's memberships/posts silently
       survive account deletion. */
    const js = readFileSync(
      resolve(__dirname, "../../../../functions/lib/spaceIds.js"),
      "utf8"
    );
    const arrMatch = js.match(/SPACE_IDS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(
      arrMatch,
      "SPACE_IDS not found in functions/lib/spaceIds.js"
    ).toBeTruthy();
    const serverIds = Array.from(arrMatch![1].matchAll(/"([^"]+)"/g)).map(
      (m) => m[1]
    );
    expect(new Set(serverIds)).toEqual(new Set(SPACE_IDS));
  });
});

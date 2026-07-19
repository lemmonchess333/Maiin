/**
 * Space definitions — config invariants + the config↔rules parity pin
 * (Spc1 PR1). Same D1-parity idiom as profileFieldRegistry.test.ts:
 * the firestore.rules isKnownSpaceId allowlist must stay set-equal to
 * SPACE_IDS, so adding/merging a space always touches both files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPACE_DEFS, SPACE_IDS, spaceDef, raceSpaceDefs } from "../spaceDefs";

describe("SPACE_DEFS config invariants", () => {
  it("ships the locked sets: 8 interest (Spc1e + trail-running) + 12 races (2026-07-19 plan)", () => {
    expect(SPACE_DEFS.filter((d) => d.kind === "interest")).toHaveLength(8);
    expect(SPACE_DEFS.filter((d) => d.kind === "race")).toHaveLength(12);
    expect(SPACE_DEFS).toHaveLength(20);
  });

  it("ids are unique, url-safe slugs", () => {
    expect(new Set(SPACE_IDS).size).toBe(SPACE_IDS.length);
    for (const id of SPACE_IDS) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("only interest and race kinds ship (location still schema-only)", () => {
    for (const d of SPACE_DEFS) {
      expect(["interest", "race"]).toContain(d.kind);
    }
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

describe("race event blocks (Races & Events plan, locked 2026-07-19)", () => {
  it("every race def carries an event block; interest defs never do", () => {
    for (const d of SPACE_DEFS) {
      if (d.kind === "race") expect(d.event, d.id).toBeDefined();
      else expect(d.event, d.id).toBeUndefined();
    }
  });

  it("event fields are well-formed", () => {
    for (const d of SPACE_DEFS) {
      if (!d.event) continue;
      expect(d.event.dateKey, d.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["5k", "10k", "half", "marathon"], d.id).toContain(
        d.event.distance
      );
      expect(d.event.city.length, d.id).toBeGreaterThan(0);
      expect(d.event.countryFlag.length, d.id).toBeGreaterThan(0);
      expect(d.event.websiteUrl, d.id).toMatch(/^https:\/\//);
      if (d.event.elevation !== undefined) {
        expect(["flat", "rolling", "hilly"], d.id).toContain(d.event.elevation);
      }
    }
  });

  it("race spaces are coral (running accent) — the closed-palette sport code", () => {
    for (const d of SPACE_DEFS) {
      if (d.kind === "race") expect(d.accent, d.id).toBe("running");
    }
  });

  it("raceSpaceDefs() returns all races sorted soonest first", () => {
    const races = raceSpaceDefs();
    expect(races).toHaveLength(12);
    const keys = races.map((d) => d.event!.dateKey);
    expect(keys).toEqual([...keys].sort());
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

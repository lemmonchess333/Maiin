import { describe, it, expect } from "vitest";
import { DEFAULT_CREWS } from "../defaultCrews";

// Pins the canonical default-crew seed data (issue #846). The seed script
// (scripts/seed-default-crews.ts) and any future consumer read from here, so
// these invariants guard against a malformed seed silently shipping.
describe("DEFAULT_CREWS", () => {
  it("declares the four app-provided crews", () => {
    expect(DEFAULT_CREWS).toHaveLength(4);
    expect(DEFAULT_CREWS.map((c) => c.name)).toEqual([
      "Hybrid Athletes",
      "Runners",
      "Lifters",
      "General Fitness",
    ]);
  });

  it("every crew is system-owned and typed default", () => {
    for (const crew of DEFAULT_CREWS) {
      expect(crew.createdBy).toBe("system");
      expect(crew.type).toBe("default");
    }
  });

  it("every crew has the fields the seed write + leaderboard rollup need", () => {
    for (const crew of DEFAULT_CREWS) {
      expect(crew.name).toBeTruthy();
      expect(crew.description).toBeTruthy();
      expect(crew.icon).toBeTruthy();
      expect(crew.leaderboardMetric).toBeTruthy();
    }
  });

  it("crew names are unique (seed idempotency matches by name)", () => {
    const names = DEFAULT_CREWS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

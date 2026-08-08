/**
 * Cross-test: the SERVER's awardable badge universe must exist in the client
 * catalogue (ADR-0008 — pin the running copies against each other, not
 * against prose).
 *
 * The seam: `functions/lib/badgeRules.js` decides WHAT gets awarded (the
 * activity triggers write `{id, earnedAt}` into `streaks/data.badges`), and
 * the client hydrates display entirely from `BADGE_DEFINITIONS` —
 * `useStreaks` merges via `BADGE_DEFINITIONS.map(...)`, so a stored id the
 * catalogue doesn't know is not an error, not a fallback row, but an award
 * that is silently INVISIBLE forever. Until this file, the only "tripwire"
 * was a comment in badgeRules.test.js plus two independently-maintained
 * literal lists — the exact two-copies shape the repo's #1 recurring-mistake
 * rule exists for.
 *
 * The server-awardable universe is derived by CALLING the award functions at
 * their own exported thresholds, never by copying id literals — so a badge
 * added to badgeRules is in the universe automatically, and this test fails
 * until the catalogue learns it.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { BADGE_DEFINITIONS } from "../badges";

const require_ = createRequire(import.meta.url);
const rules = require_("../../../../functions/lib/badgeRules") as {
  runMilestoneBadges: (meters: number, seconds: number) => string[];
  lifetimeMilestoneBadges: (kind: "run" | "lift", total: number) => string[];
  liftWeightMilestoneBadges: (
    exercises: { exerciseId: string; sets: { weightKg: number }[] }[]
  ) => string[];
  RUN_DISTANCE_MILESTONES: { id: string; minMeters: number }[];
  LIFT_WEIGHT_MILESTONES: { id: string; minKg: number }[];
  SPEED_DEMON_PACE_SEC_PER_KM: number;
  LIFETIME_RUN_METERS_MILESTONE: number;
  LIFETIME_LIFT_VOLUME_KG_MILESTONE: number;
  COMPOUND_LIFT_IDS: Set<string>;
};

/** Every id the server can write, produced by exercising the award
 *  functions at their own thresholds. */
function serverAwardableIds(): Set<string> {
  const ids = new Set<string>();

  // A marathon-distance run at a comfortably sub-speed-demon pace clears
  // every distance tier AND the pace badge in one call.
  const marathonMeters = Math.max(
    ...rules.RUN_DISTANCE_MILESTONES.map((m) => m.minMeters)
  );
  const fastSeconds =
    (marathonMeters / 1000) * (rules.SPEED_DEMON_PACE_SEC_PER_KM - 10);
  for (const id of rules.runMilestoneBadges(marathonMeters, fastSeconds)) {
    ids.add(id);
  }

  for (const id of rules.lifetimeMilestoneBadges(
    "run",
    rules.LIFETIME_RUN_METERS_MILESTONE
  )) {
    ids.add(id);
  }
  for (const id of rules.lifetimeMilestoneBadges(
    "lift",
    rules.LIFETIME_LIFT_VOLUME_KG_MILESTONE
  )) {
    ids.add(id);
  }

  const anyCompound = [...rules.COMPOUND_LIFT_IDS][0];
  const maxKg = Math.max(...rules.LIFT_WEIGHT_MILESTONES.map((m) => m.minKg));
  for (const id of rules.liftWeightMilestoneBadges([
    { exerciseId: anyCompound, sets: [{ weightKg: maxKg }] },
  ])) {
    ids.add(id);
  }

  return ids;
}

const catalogue = new Map(BADGE_DEFINITIONS.map((d) => [d.id, d]));

describe("server badge awards ≡ client catalogue", () => {
  it("every server-awardable id exists in BADGE_DEFINITIONS (no invisible awards)", () => {
    const ids = serverAwardableIds();
    // Vacuous-pass guard: the universe must actually enumerate — a broken
    // derivation returning 2 ids would "pass" the membership loop while
    // pinning almost nothing (the lesson from the sweep's tautology finds).
    expect(ids.size).toBeGreaterThanOrEqual(10);
    for (const id of ids) {
      expect(
        catalogue.has(id),
        `server awards "${id}" — not in catalogue`
      ).toBe(true);
    }
  });

  it("server-owned ids sit in the grid section their domain implies", () => {
    for (const m of rules.RUN_DISTANCE_MILESTONES) {
      expect(catalogue.get(m.id)?.category, m.id).toBe("running");
    }
    for (const m of rules.LIFT_WEIGHT_MILESTONES) {
      expect(catalogue.get(m.id)?.category, m.id).toBe("lifting");
    }
    expect(catalogue.get("speed_demon")?.category).toBe("running");
    expect(catalogue.get("century_km")?.category).toBe("running");
    expect(catalogue.get("tonnage_100")?.category).toBe("lifting");
  });

  it("catalogue descriptions state the SERVER's thresholds, not stale prose", () => {
    // The client never computes these awards — its descriptions are the only
    // place the user is told the rule, so they must carry the server's
    // numbers. If a threshold moves server-side, this fails until the prose
    // catches up.
    for (const m of rules.LIFT_WEIGHT_MILESTONES) {
      expect(catalogue.get(m.id)?.description, m.id).toContain(`${m.minKg} kg`);
    }
    // 300 s/km → "5:00" pace.
    const paceMin = rules.SPEED_DEMON_PACE_SEC_PER_KM / 60;
    expect(catalogue.get("speed_demon")?.description).toContain(
      `${paceMin}:00`
    );
    expect(catalogue.get("century_km")?.description).toContain(
      `${rules.LIFETIME_RUN_METERS_MILESTONE / 1000} km`
    );
    expect(catalogue.get("tonnage_100")?.description).toContain(
      `${rules.LIFETIME_LIFT_VOLUME_KG_MILESTONE / 1000} tonnes`
    );
  });
});

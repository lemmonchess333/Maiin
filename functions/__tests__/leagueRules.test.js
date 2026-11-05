/**
 * Weekly leagues, the rules (Soc15 call 3): points against each person's
 * own plan, the order a group ranks in, how a week settles at every tier's
 * edge, and how the groups are drawn. Pure, so the random order is fixed
 * by a seeded RNG.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rules = require("../lib/leagueRules");

const T0 = Date.now();

describe("points", () => {
  it("are the share of the plan done, out of 100", () => {
    expect(rules.leaguePoints(3, 4)).toBe(75);
    expect(rules.leaguePoints(1, 3)).toBe(33);
    expect(rules.leaguePoints(2, 3)).toBe(67);
    expect(rules.leaguePoints(0, 5)).toBe(0);
  });

  it("stop at the plan: sessions beyond it add nothing", () => {
    expect(rules.leaguePoints(3, 3)).toBe(100);
    expect(rules.leaguePoints(7, 3)).toBe(100);
  });

  it("let a three-day lifter beat a marathoner", () => {
    const lifter = rules.leaguePoints(3, 3); // a whole three-day week
    const marathoner = rules.leaguePoints(5, 6); // five of six runs
    expect(lifter).toBeGreaterThan(marathoner);
  });

  it("give nothing for a plan of nothing or a malformed figure", () => {
    expect(rules.leaguePoints(2, 0)).toBe(0);
    expect(rules.leaguePoints(Number.NaN, 3)).toBe(0);
    expect(rules.leaguePoints(-1, 3)).toBe(0);
  });
});

describe("the ranking", () => {
  it("is by points, then whoever reached them first, then the uid", () => {
    const ranked = rules.rankStandings([
      { uid: "c", points: 75, reachedAt: new Date(T0 + 3000) },
      { uid: "a", points: 100, reachedAt: new Date(T0 + 9000) },
      { uid: "d", points: 75, reachedAt: new Date(T0 + 1000) },
      { uid: "b", points: 75, reachedAt: new Date(T0 + 1000) },
    ]);
    expect(ranked.map((s) => [s.uid, s.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["d", 3],
      ["c", 4],
    ]);
  });

  it("reads a Firestore timestamp, a Date, an ISO string or ms alike, and puts a missing time last", () => {
    const ts = (ms) => ({ toMillis: () => ms });
    const ranked = rules.rankStandings([
      { uid: "none", points: 50 },
      { uid: "iso", points: 50, reachedAt: new Date(T0 + 4).toISOString() },
      { uid: "ts", points: 50, reachedAt: ts(T0 + 1) },
      { uid: "ms", points: 50, reachedAt: T0 + 2 },
      { uid: "date", points: 50, reachedAt: new Date(T0 + 3) },
    ]);
    expect(ranked.map((s) => s.uid)).toEqual([
      "ts",
      "ms",
      "date",
      "iso",
      "none",
    ]);
  });
});

/** A group of `n`, all in `tier`, ranked in the order given: points fall
 *  from 100 by one a place, so nobody is on zero. */
function group(n, tier, over = {}) {
  return Array.from({ length: n }, (_, i) => ({
    uid: `m${String(i + 1).padStart(2, "0")}`,
    tier,
    points: 100 - i,
    reachedAt: T0 + i,
    ...(over[i] || {}),
  }));
}

const outcomes = (results) => results.map((r) => r.outcome);
const count = (results, outcome) =>
  results.filter((r) => r.outcome === outcome).length;

describe("settling a week", () => {
  it("moves the top quarter up and the bottom quarter down, groups of 10, 20 and 30", () => {
    for (const [n, up, down] of [
      [10, 3, 2],
      [20, 5, 5],
      [30, 8, 7],
    ]) {
      const results = rules.settleGroup(group(n, "gold"));
      expect(count(results, "up"), `${n} up`).toBe(up);
      expect(count(results, "down"), `${n} down`).toBe(down);
      expect(results.slice(0, up).every((r) => r.outcome === "up")).toBe(true);
      expect(results.slice(n - down).every((r) => r.outcome === "down")).toBe(
        true
      );
      expect(results.every((r) => r.of === n)).toBe(true);
    }
  });

  it("names each member's new tier, one step from their own", () => {
    const results = rules.settleGroup(group(10, "silver"));
    expect(results[0]).toMatchObject({
      uid: "m01",
      tier: "silver",
      newTier: "gold",
      rank: 1,
      of: 10,
      points: 100,
      outcome: "up",
    });
    expect(results[4]).toMatchObject({ newTier: "silver", outcome: "stay" });
    expect(results[9]).toMatchObject({ newTier: "bronze", outcome: "down" });
  });

  it("goes no higher than Diamond and no lower than Bronze", () => {
    const diamond = rules.settleGroup(group(10, "diamond"));
    expect(diamond[0]).toMatchObject({ outcome: "stay", newTier: "diamond" });
    expect(diamond[9]).toMatchObject({ outcome: "down", newTier: "platinum" });
    const bronze = rules.settleGroup(group(10, "bronze"));
    expect(bronze[0]).toMatchObject({ outcome: "up", newTier: "silver" });
    expect(bronze[9]).toMatchObject({ outcome: "stay", newTier: "bronze" });
  });

  it("moves each tier's edge the right way", () => {
    for (const [tier, above, below] of [
      ["bronze", "silver", "bronze"],
      ["silver", "gold", "bronze"],
      ["gold", "platinum", "silver"],
      ["platinum", "diamond", "gold"],
      ["diamond", "diamond", "platinum"],
    ]) {
      const results = rules.settleGroup(group(20, tier));
      expect(results[0].newTier, `${tier} top`).toBe(above);
      expect(results[19].newTier, `${tier} bottom`).toBe(below);
    }
  });

  it("never promotes zero points, and moves anyone on zero down", () => {
    const zero = { points: 0 };
    const results = rules.settleGroup(
      group(12, "gold", {
        6: zero,
        7: zero,
        8: zero,
        9: zero,
        10: zero,
        11: zero,
      })
    );
    // Six on zero: all down, beyond the bottom quarter's three.
    expect(count(results, "down")).toBe(6);
    expect(
      results.filter((r) => r.points === 0).every((r) => r.outcome === "down")
    ).toBe(true);
    expect(count(results, "up")).toBe(3);
  });

  it("a week where nobody trained moves nobody up, and Bronze nowhere", () => {
    const quiet = group(10, "bronze").map((s) => ({ ...s, points: 0 }));
    expect(outcomes(rules.settleGroup(quiet))).toEqual(Array(10).fill("stay"));
    const silver = group(10, "silver").map((s) => ({ ...s, points: 0 }));
    expect(outcomes(rules.settleGroup(silver))).toEqual(Array(10).fill("down"));
  });

  it("a mixed group moves each member from their own tier", () => {
    const results = rules.settleGroup(
      group(10, "silver", { 0: { tier: "gold" }, 9: { tier: "bronze" } })
    );
    expect(results[0]).toMatchObject({ tier: "gold", newTier: "platinum" });
    expect(results[9]).toMatchObject({ tier: "bronze", outcome: "stay" });
  });

  it("is told in a plain sentence", () => {
    expect(rules.resultMessage({ outcome: "up", newTier: "silver" })).toBe(
      "You moved up to Silver"
    );
    expect(rules.resultMessage({ outcome: "stay", newTier: "gold" })).toBe(
      "You stayed in Gold"
    );
    expect(rules.resultMessage({ outcome: "down", newTier: "bronze" })).toBe(
      "You moved down to Bronze"
    );
  });
});

/** `n` people in `tier`, ids prefixed by the tier. */
function people(n, tier) {
  return Array.from({ length: n }, (_, i) => ({
    uid: `${tier}-${String(i).padStart(3, "0")}`,
    tier,
  }));
}

const sizes = (groups) => groups.map((g) => g.memberUids.length);
const everyone = (groups) => groups.flatMap((g) => g.memberUids).sort();

describe("drawing the groups", () => {
  it("makes groups of about 20, never under 10, from ceil(n / 20)", () => {
    for (const [n, expected] of [
      [10, [10]],
      [20, [20]],
      [21, [11, 10]],
      [40, [20, 20]],
      [41, [14, 14, 13]],
      [95, [19, 19, 19, 19, 19]],
    ]) {
      const { groups, unplaced } = rules.formGroups(people(n, "gold"), {
        rng: rules.seededRng(n),
      });
      expect(sizes(groups), `${n}`).toEqual(expected);
      expect(unplaced).toEqual([]);
      expect(everyone(groups)).toEqual(people(n, "gold").map((p) => p.uid));
    }
  });

  it("forms nothing from fewer than 10 people", () => {
    const { groups, unplaced } = rules.formGroups(people(9, "bronze"), {
      rng: rules.seededRng(1),
    });
    expect(groups).toEqual([]);
    expect(unplaced).toHaveLength(9);
  });

  it("keeps each tier apart while it has 10", () => {
    const { groups } = rules.formGroups(
      [...people(12, "silver"), ...people(15, "bronze")],
      { rng: rules.seededRng(2) }
    );
    expect(groups.map((g) => [g.tier, g.memberUids.length])).toEqual([
      ["silver", 12],
      ["bronze", 15],
    ]);
    expect(groups[0].memberUids.every((u) => u.startsWith("silver-"))).toBe(
      true
    );
  });

  it("carries a tier short of 10 down to the nearest tier below", () => {
    const { groups } = rules.formGroups(
      [
        ...people(4, "diamond"),
        ...people(3, "platinum"),
        ...people(11, "gold"),
      ],
      { rng: rules.seededRng(3) }
    );
    expect(groups.map((g) => [g.tier, g.memberUids.length])).toEqual([
      ["gold", 18],
    ]);
  });

  it("carries down past an empty tier to the next with people", () => {
    const { groups } = rules.formGroups(
      [...people(5, "diamond"), ...people(10, "silver")],
      { rng: rules.seededRng(4) }
    );
    expect(groups.map((g) => [g.tier, g.memberUids.length])).toEqual([
      ["silver", 15],
    ]);
  });

  it("puts a Bronze short of 10 with the nearest tier above, which has nothing below it", () => {
    const { groups } = rules.formGroups(
      [...people(12, "gold"), ...people(6, "bronze")],
      { rng: rules.seededRng(5) }
    );
    expect(groups.map((g) => [g.tier, g.memberUids.length])).toEqual([
      ["gold", 18],
    ]);
  });

  it("is random, and the same for the same seed", () => {
    const list = people(40, "gold");
    const a = rules.formGroups(list, { rng: rules.seededRng(7) });
    const b = rules.formGroups([...list].reverse(), {
      rng: rules.seededRng(7),
    });
    const c = rules.formGroups(list, { rng: rules.seededRng(8) });
    expect(a).toEqual(b);
    expect(a.groups[0].memberUids).not.toEqual(c.groups[0].memberUids);
    // Not simply the sorted order cut in two.
    expect(a.groups[0].memberUids).not.toEqual(
      list.slice(0, 20).map((p) => p.uid)
    );
  });

  it("never puts a blocked pair in one group", () => {
    const list = people(60, "gold");
    const uids = list.map((p) => p.uid);
    // Every fifth person blocked the next one; and one person blocked by
    // three others.
    const blocked = new Set();
    for (let i = 0; i < 60; i += 5)
      blocked.add(rules.pairKey(uids[i], uids[i + 1]));
    for (const j of [10, 20, 30]) blocked.add(rules.pairKey(uids[0], uids[j]));
    const isBlockedPair = (a, b) => blocked.has(rules.pairKey(a, b));
    for (let seed = 1; seed <= 200; seed++) {
      const { groups, unplaced } = rules.formGroups(list, {
        isBlockedPair,
        rng: rules.seededRng(seed),
      });
      expect(unplaced, `seed ${seed}`).toEqual([]);
      for (const g of groups) {
        for (const a of g.memberUids)
          for (const b of g.memberUids)
            expect(a !== b && isBlockedPair(a, b), `seed ${seed}`).toBe(false);
        expect(g.memberUids.length).toBeGreaterThanOrEqual(rules.GROUP_MIN);
        expect(g.memberUids.length).toBeLessThanOrEqual(rules.GROUP_MAX);
      }
      expect(everyone(groups)).toEqual([...uids].sort());
    }
  });

  it("with one group only, one of a blocked pair sits the week out", () => {
    const list = people(12, "silver");
    const pair = rules.pairKey(list[2].uid, list[7].uid);
    const { groups, unplaced } = rules.formGroups(list, {
      isBlockedPair: (a, b) => rules.pairKey(a, b) === pair,
      rng: rules.seededRng(9),
    });
    expect(groups).toHaveLength(1);
    expect(unplaced).toHaveLength(1);
    expect([list[2].uid, list[7].uid]).toContain(unplaced[0]);
    expect(groups[0].memberUids).toHaveLength(11);
  });

  it("treats an unknown tier as Bronze", () => {
    expect(rules.normaliseTier("wood")).toBe("bronze");
    expect(rules.normaliseTier(undefined)).toBe("bronze");
    const { groups } = rules.formGroups(
      people(10, "bronze").map((p, i) => (i < 3 ? { ...p, tier: "wood" } : p)),
      { rng: rules.seededRng(10) }
    );
    expect(groups).toEqual([expect.objectContaining({ tier: "bronze" })]);
  });
});

describe("the tiers", () => {
  it("are Bronze to Diamond, and a new member starts in Bronze", () => {
    expect(rules.LEAGUE_TIERS).toEqual([
      "bronze",
      "silver",
      "gold",
      "platinum",
      "diamond",
    ]);
    expect(rules.STARTING_TIER).toBe("bronze");
    expect(rules.tierName("platinum")).toBe("Platinum");
  });
});

"use strict";

/**
 * Weekly leagues, the rules (Soc15 call 3, owner-locked 3 November 2026).
 *
 * Pure: no Firestore, no clock. functions/lib/leagues.js does the reading
 * and writing; this file decides.
 *
 * TIERS. Bronze, Silver, Gold, Platinum, Diamond, in that order. A new
 * member starts in Bronze.
 *
 * POINTS. A member is scored against their own plan, so a three-day lifter
 * can beat a marathoner: points = round(100 × min(done, planned) /
 * planned). Sessions beyond the plan add nothing; 100 is a week done as
 * planned, whatever the plan was. Ties go to whoever reached their points
 * first (`reachedAt`), then to the uid, so an order is never left to the
 * database.
 *
 * GROUPS. Each Monday the people who opted in and trained in the last
 * ACTIVE_DAYS days are grouped by tier, in random order (an injected RNG,
 * so tests can fix it):
 *   1. Walk the tiers from Diamond down. A tier with fewer than GROUP_MIN
 *      people (counting any carried into it) is carried down to join the
 *      nearest tier below it. Bronze has nothing below it, so a Bronze
 *      pool still short of GROUP_MIN joins the nearest pool above it.
 *   2. Split each pool into ceil(n / GROUP_TARGET) groups dealt round-robin
 *      from the shuffled order, so the groups differ in size by at most
 *      one. Every size this makes is between GROUP_MIN and GROUP_TARGET
 *      for a pool of GROUP_MIN or more; GROUP_MAX is the ceiling a move
 *      below may fill to.
 *   3. No blocked pair shares a group. One of the pair (whichever can be)
 *      is swapped with someone in another group (their own tier's first)
 *      whom the swap suits both ways, or else moved to another group with
 *      room. When neither can be, one of them sits this week out: with
 *      only one group that is the one way to keep the pair apart.
 * A group made from more than one tier keeps each member's own tier: they
 * rise and fall from where they are.
 *
 * SETTLEMENT. Ranked by points, the top ceil(25%) with points above zero
 * move up a tier (not from Diamond) and the bottom floor(25%), with anyone
 * on zero points, move down (not from Bronze). Everyone else stays.
 *
 * The client keeps a copy of the tiers, the order and the two zone sizes
 * (src/features/league/leagueRules.ts), for the page's lines and the card's
 * place; src/features/league/__tests__/leagueRules.cross.test.ts pins the
 * two equal.
 */

const LEAGUE_TIERS = Object.freeze([
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
]);
const STARTING_TIER = "bronze";

/** About this many to a group. */
const GROUP_TARGET = 20;
/** No group is made smaller, and the league opens at this many people. */
const GROUP_MIN = 10;
/** No group is filled past this by a move. */
const GROUP_MAX = 30;
/** Trained in the last this many days to be placed (`lastActiveAt`). */
const ACTIVE_DAYS = 14;

function tierIndex(tier) {
  const i = LEAGUE_TIERS.indexOf(tier);
  return i < 0 ? 0 : i;
}

/** A stored tier, or Bronze for anything else. */
function normaliseTier(tier) {
  return LEAGUE_TIERS[tierIndex(tier)];
}

function tierAbove(tier) {
  return LEAGUE_TIERS[Math.min(LEAGUE_TIERS.length - 1, tierIndex(tier) + 1)];
}

function tierBelow(tier) {
  return LEAGUE_TIERS[Math.max(0, tierIndex(tier) - 1)];
}

/** "Bronze", "Silver" and so on. */
function tierName(tier) {
  const t = normaliseTier(tier);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Points for a week: the share of the plan done, out of 100. */
function leaguePoints(done, planned) {
  const d = Number.isFinite(done) && done > 0 ? Math.floor(done) : 0;
  const p = Number.isFinite(planned) && planned > 0 ? Math.floor(planned) : 0;
  if (p === 0) return 0;
  return Math.round((100 * Math.min(d, p)) / p);
}

/** A Firestore Timestamp, a Date, an ISO string or a number, in ms;
 *  Infinity when none, so a standing with no time ranks after one with. */
function millis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return Infinity;
}

/** Standings in rank order, each with its 1-based `rank`. */
function rankStandings(standings) {
  return [...standings]
    .sort((a, b) => {
      const pa = Number(a.points) || 0;
      const pb = Number(b.points) || 0;
      if (pb !== pa) return pb - pa;
      const ra = millis(a.reachedAt);
      const rb = millis(b.reachedAt);
      if (ra !== rb) return ra < rb ? -1 : 1;
      return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
    })
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

/** How many at the top of a group of `n` move up. */
function promotionCount(n) {
  return n > 0 ? Math.ceil(n / 4) : 0;
}

/** How many at the bottom of a group of `n` move down. */
function demotionCount(n) {
  return n > 0 ? Math.floor(n / 4) : 0;
}

/**
 * Each member's result for a settled group: `{ uid, tier, newTier, rank,
 * of, points, outcome }`, outcome "up", "stay" or "down".
 */
function settleGroup(standings) {
  const ranked = rankStandings(standings);
  const of = ranked.length;
  const up = promotionCount(of);
  const down = demotionCount(of);
  return ranked.map((s, i) => {
    const tier = normaliseTier(s.tier);
    const points = Number(s.points) || 0;
    const scored = points > 0;
    let outcome = "stay";
    if (scored && i < up && tier !== "diamond") outcome = "up";
    else if ((!scored || i >= of - down) && tier !== "bronze") outcome = "down";
    const newTier =
      outcome === "up"
        ? tierAbove(tier)
        : outcome === "down"
          ? tierBelow(tier)
          : tier;
    return { uid: s.uid, tier, newTier, rank: s.rank, of, points, outcome };
  });
}

/** The words a result is told in: "You moved up to Silver". */
function resultMessage(result) {
  const name = tierName(result.newTier);
  if (result.outcome === "up") return `You moved up to ${name}`;
  if (result.outcome === "down") return `You moved down to ${name}`;
  return `You stayed in ${name}`;
}

/** Fisher–Yates, in place, with `rng` returning [0, 1). */
function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** A small seeded RNG (mulberry32), for tests and reproducible runs. */
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One key for a pair, whichever way round it is named. */
function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The pools step 1 makes: `{ tier, people }`, highest tier first. */
function tierPools(people, rng) {
  const buckets = LEAGUE_TIERS.map(() => []);
  // Sorted first, so the RNG alone decides the order.
  const sorted = [...people].sort((a, b) =>
    a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0
  );
  for (const p of sorted) buckets[tierIndex(p.tier)].push(p);
  buckets.forEach((b) => shuffle(b, rng));

  const pools = [];
  let carry = [];
  for (let t = LEAGUE_TIERS.length - 1; t >= 0; t--) {
    const pool = carry.concat(buckets[t]);
    if (pool.length < GROUP_MIN && t > 0) {
      carry = pool;
      continue;
    }
    if (pool.length > 0) pools.push({ tier: LEAGUE_TIERS[t], people: pool });
    carry = [];
  }
  const last = pools[pools.length - 1];
  if (last && last.people.length < GROUP_MIN) {
    if (pools.length === 1) return [];
    pools.pop();
    pools[pools.length - 1].people.push(...last.people);
  }
  return pools;
}

/** A pool dealt round-robin into ceil(n / GROUP_TARGET) groups. */
function splitPool(people) {
  const k = Math.max(1, Math.ceil(people.length / GROUP_TARGET));
  const groups = Array.from({ length: k }, () => []);
  people.forEach((p, i) => groups[i % k].push(p.uid));
  return groups;
}

/**
 * This week's groups from the people to place (`{ uid, tier }`), as
 * `{ groups: [{ tier, memberUids }], unplaced: [uid] }`. `isBlockedPair(a,
 * b)` says whether either has blocked the other.
 */
function formGroups(people, { isBlockedPair = () => false, rng = Math.random } = {}) {
  const pools = tierPools(people, rng);
  if (pools.length === 0) {
    return { groups: [], unplaced: people.map((p) => p.uid).sort() };
  }
  const groups = [];
  for (const pool of pools) {
    for (const memberUids of splitPool(pool.people)) {
      groups.push({ tier: pool.tier, memberUids });
    }
  }

  const clashes = (uid, members, except) =>
    members.some((other) => other !== uid && other !== except && isBlockedPair(uid, other));
  // Other groups to try: the same tier's first, then the rest in order.
  const othersFor = (g) =>
    groups
      .map((group, h) => ({ group, h }))
      .filter(({ h }) => h !== g)
      .sort(
        (a, b) =>
          (a.group.tier === groups[g].tier ? 0 : 1) -
            (b.group.tier === groups[g].tier ? 0 : 1) || a.h - b.h
      );

  /** Takes `c` out of group `g`: swapped with someone in another group
   *  whom the swap suits both ways, or else moved to one with room. */
  const relocate = (g, c) => {
    const members = groups[g].memberUids;
    const at = members.indexOf(c);
    for (const { group } of othersFor(g)) {
      for (let j = 0; j < group.memberUids.length; j++) {
        const y = group.memberUids[j];
        if (clashes(c, group.memberUids, y) || clashes(y, members, c)) continue;
        group.memberUids[j] = c;
        members[at] = y;
        return true;
      }
    }
    if (members.length - 1 < GROUP_MIN) return false;
    for (const { group } of othersFor(g)) {
      if (group.memberUids.length < GROUP_MAX && !clashes(c, group.memberUids)) {
        group.memberUids.push(c);
        members.splice(at, 1);
        return true;
      }
    }
    return false;
  };

  // Every relocation leaves no new clash anywhere, so the clashes only
  // fall and the loop ends.
  const unplaced = [];
  for (let g = 0; g < groups.length; g++) {
    const members = groups[g].memberUids;
    let i = 0;
    while (i < members.length) {
      const x = members[i];
      if (!clashes(x, members)) {
        i++;
        continue;
      }
      // Either side of the pair may be the one that can move.
      const candidates = [
        x,
        ...members.filter((o) => o !== x && isBlockedPair(x, o)),
      ];
      if (!candidates.some((c) => relocate(g, c))) {
        unplaced.push(x);
        members.splice(i, 1);
      }
    }
  }
  return { groups: groups.filter((g) => g.memberUids.length > 0), unplaced };
}

module.exports = {
  LEAGUE_TIERS,
  STARTING_TIER,
  GROUP_TARGET,
  GROUP_MIN,
  GROUP_MAX,
  ACTIVE_DAYS,
  normaliseTier,
  tierAbove,
  tierBelow,
  tierName,
  leaguePoints,
  millis,
  rankStandings,
  promotionCount,
  demotionCount,
  settleGroup,
  resultMessage,
  shuffle,
  seededRng,
  pairKey,
  formGroups,
};

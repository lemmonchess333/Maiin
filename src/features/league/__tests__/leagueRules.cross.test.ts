/**
 * The league's rules, client and server (Soc15 call 3; ADR-0008). The
 * server ranks a group and moves its top and bottom when it settles the
 * week (functions/lib/leagueRules.js, which the turn requires); the app
 * draws the same order and the lines between the zones. If the two drift,
 * the page shows someone above the line the server will not promote, or a
 * place the server will not give.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  GROUP_MIN,
  LEAGUE_TIERS,
  demotionCount,
  promotionCount,
  rankStandings,
} from "../leagueRules";
import { resultTitle } from "../league";

const require_ = createRequire(import.meta.url);
const server = require_("../../../../functions/lib/leagueRules") as {
  LEAGUE_TIERS: string[];
  GROUP_MIN: number;
  promotionCount: (n: number) => number;
  demotionCount: (n: number) => number;
  rankStandings: (
    s: { uid: string; points: number; reachedAt?: unknown }[]
  ) => { uid: string; rank: number }[];
  settleGroup: (
    s: { uid: string; tier: string; points: number; reachedAt?: unknown }[]
  ) => { uid: string; outcome: string; rank: number }[];
  resultMessage: (r: { outcome: string; newTier: string }) => string;
};

const T0 = Date.now();

describe("league rules — client and server agree", () => {
  it("has the same tiers in the same order, and the same opening size", () => {
    expect([...LEAGUE_TIERS]).toEqual(server.LEAGUE_TIERS);
    expect(GROUP_MIN).toBe(server.GROUP_MIN);
  });

  it("draws the same zones for every group size", () => {
    for (let n = 0; n <= 40; n++) {
      expect(promotionCount(n), `up ${n}`).toBe(server.promotionCount(n));
      expect(demotionCount(n), `down ${n}`).toBe(server.demotionCount(n));
    }
  });

  it("ranks the same way, ties and missing times included", () => {
    const ts = (ms: number) => ({ toMillis: () => ms });
    const standings = [
      { uid: "e", points: 67, reachedAt: ts(T0 + 5) },
      { uid: "a", points: 100, reachedAt: new Date(T0 + 9) },
      { uid: "c", points: 67, reachedAt: T0 + 1 },
      { uid: "b", points: 67, reachedAt: new Date(T0 + 1).toISOString() },
      { uid: "d", points: 67 },
      { uid: "f", points: 0, reachedAt: T0 },
    ];
    expect(rankStandings(standings).map((s) => [s.uid, s.rank])).toEqual(
      server.rankStandings(standings).map((s) => [s.uid, s.rank])
    );
  });

  it("the reveal's headline is the Monday notification's sentence", () => {
    for (const outcome of ["up", "stay", "down"] as const) {
      for (const newTier of LEAGUE_TIERS) {
        expect(resultTitle({ outcome, newTier })).toBe(
          server.resultMessage({ outcome, newTier })
        );
      }
    }
  });

  it("the zones the page draws are where the server moves people", () => {
    for (const n of [10, 13, 18, 20, 30]) {
      const standings = Array.from({ length: n }, (_, i) => ({
        uid: `m${String(i).padStart(2, "0")}`,
        tier: "gold",
        points: 100 - i,
        reachedAt: T0 + i,
      }));
      const settled = server.settleGroup(standings);
      const up = promotionCount(n);
      const down = demotionCount(n);
      settled.forEach((r, i) => {
        const expected = i < up ? "up" : i >= n - down ? "down" : "stay";
        expect(r.outcome, `${n} #${i + 1}`).toBe(expected);
      });
    }
  });
});

/**
 * The partner limit and the bond the server starts, TS↔JS mirror pin.
 *
 * The server holds the limit (startPartnerStreak counts both people's
 * bonds in functions/lib/partnerBonds.js) and the app says it ("You have
 * 5 streak partners already"). A drift is a sentence quoting a number the
 * server does not hold. And the bond the server writes is the state the
 * engine starts from: a field the engine's empty state has and the bond
 * lacks, or one the bond adds, is a streak that starts wrong for everyone.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

vi.mock("firebase/firestore");
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { MAX_PARTNERS, emptyStreakState } from "../streakEngine";
import { bondId } from "../partnerStreakApi";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/partnerBonds.js") as {
  MAX_PARTNERS: number;
  bondIdFor: (a: string, b: string) => string;
  initialBond: (
    a: string,
    b: string,
    createdAt: unknown
  ) => Record<string, unknown>;
};

describe("partner limit, client and server", () => {
  it("is the same number on both sides", () => {
    expect(server.MAX_PARTNERS).toBe(MAX_PARTNERS);
  });

  it("names a pair's bond the same way on both sides", () => {
    for (const [a, b] of [
      ["me", "bob"],
      ["bob", "me"],
      ["user-a", "user-b"],
    ]) {
      expect(server.bondIdFor(a, b)).toBe(bondId(a, b));
    }
  });

  it("starts a bond from exactly the engine's empty state", () => {
    const createdAt = { stamp: "server time" };
    const bond = server.initialBond("me", "bob", createdAt);
    expect(bond).toEqual({
      members: ["bob", "me"],
      ...emptyStreakState(),
      createdAt,
    });
  });
});

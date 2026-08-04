/**
 * The read that gets the layoff answer to the generator.
 *
 * The property worth defending here is the FAILURE direction. Every way this
 * can go wrong — no uid, empty history, a read error — returns `"none"`,
 * because `"none"` is the behaviour the app had before Run15. The opposite
 * default would let one offline read rewrite a training runner's week down to
 * easy running, which is a worse bug than the one Run15 fixes: it fires for
 * everyone, not just returners.
 *
 * ADR-0009: bare `vi.mock("firebase/firestore")` + `seedFirestore`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  unfiredFailures,
  readLog,
} from "@/test/firestoreHarness";
import { fetchRecentLayoff, RECENT_RUN_SCAN_LIMIT } from "../fetchRecentLayoff";

const UID = "u1";

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Seed `count` eligible runs ending on `lastDate`, `every` days apart. */
function seedRuns(lastDate: string, count: number, every = 3): void {
  const tree: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < count; i++) {
    const date = addDays(lastDate, -(count - 1 - i) * every);
    tree[`users/${UID}/runs/r${date}`] = {
      date,
      distance: 8000,
      duration: 2700,
      createdAt: `${date}T09:00:00.000Z`,
    };
  }
  seedFirestore(tree);
}

beforeEach(() => resetFirestore());

describe("fetchRecentLayoff reads the history", () => {
  it("reports a real layoff", () => {
    seedRuns("2026-05-23", 10);
    return expect(fetchRecentLayoff(UID, "2026-08-04")).resolves.toBe(
      "detrained"
    );
  });

  it("reports a training runner as none", async () => {
    seedRuns("2026-08-03", 10);
    await expect(fetchRecentLayoff(UID, "2026-08-04")).resolves.toBe("none");
  });

  it("reports a missed fortnight as gap", async () => {
    seedRuns("2026-07-23", 10);
    await expect(fetchRecentLayoff(UID, "2026-08-04")).resolves.toBe("gap");
  });

  it("reads the caller's own runs collection, capped", async () => {
    seedRuns("2026-08-03", 5);
    await fetchRecentLayoff(UID, "2026-08-04");
    // Pinning the path matters: this is the only place the module names the
    // collection, and a wrong one fails SILENTLY (empty snapshot → "none").
    expect(readLog().some((r) => r.path === `users/${UID}/runs`)).toBe(true);
    expect(RECENT_RUN_SCAN_LIMIT).toBeGreaterThan(0);
  });
});

describe("every failure mode lands on none", () => {
  it("no uid — signed out, or called before auth settles", async () => {
    seedRuns("2026-05-23", 10); // a layoff IS present; absence of uid must win
    await expect(fetchRecentLayoff(null, "2026-08-04")).resolves.toBe("none");
    await expect(fetchRecentLayoff(undefined, "2026-08-04")).resolves.toBe(
      "none"
    );
    await expect(fetchRecentLayoff("", "2026-08-04")).resolves.toBe("none");
    // …and it does not pay for a read it cannot use.
    expect(readLog()).toHaveLength(0);
  });

  it("empty history — a brand-new user, not a lapsed one", async () => {
    await expect(fetchRecentLayoff(UID, "2026-08-04")).resolves.toBe("none");
  });

  it("a read error resolves rather than rejecting", async () => {
    seedRuns("2026-05-23", 10);
    failNextFirestore("getDocs");
    await expect(fetchRecentLayoff(UID, "2026-08-04")).resolves.toBe("none");
    // Assert the failure actually fired — otherwise this test silently
    // exercises the happy path and would pass with the catch block deleted.
    expect(unfiredFailures()).toHaveLength(0);
  });

  it("garbage field types do not throw", async () => {
    // Firestore hands back whatever is stored. A doc with a numeric `date` or
    // a string `distance` must be skipped, not crash the caller.
    seedFirestore({
      [`users/${UID}/runs/bad1`]: { date: 20260803, distance: "8k" },
      [`users/${UID}/runs/bad2`]: { date: null, duration: {} },
      [`users/${UID}/runs/ok`]: {
        date: "2026-05-23",
        distance: 8000,
        duration: 2700,
      },
    });
    await expect(fetchRecentLayoff(UID, "2026-08-04")).resolves.toBe(
      "detrained"
    );
  });
});

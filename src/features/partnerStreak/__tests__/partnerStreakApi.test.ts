import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * partnerStreakApi — bond lifecycle + consent guards.
 *
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 * The old version stubbed `doc`/`collection` as `args.join("/")` and
 * asserted against those synthetic strings
 * (`"mock-db/partnerBonds/bob__me"`), which pinned the shape of the stub
 * rather than anything Firestore would do. Bonds are now real documents:
 * the cap and idempotency cases SEED `partnerBonds/*` and let the real
 * `where("members", "array-contains", uid)` query select them, instead of
 * handing `getDocs` a pre-built answer.
 *
 * That is the substantive change. The old cap test fabricated its own
 * result set, so it never exercised the members filter at all — a bond
 * belonging to somebody else would have counted toward MY cap and the
 * test could not have noticed. The seeded version includes exactly that
 * row (see "another user's bonds do not count").
 *
 * The consent guards here were separately confirmed load-bearing by
 * mutation (each removal fails its own test), so they are not the
 * vacuous-negative class — `rejects.toThrow(/…/)` is a real positive
 * anchor. Keep them that way.
 */

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "me" } },
}));

const mockIsFollowing = vi.fn();
vi.mock("@/lib/socialApi", () => ({
  isFollowing: (...args: unknown[]) => mockIsFollowing(...args),
}));

import {
  bondId,
  createBond,
  dissolveBond,
  listMyBonds,
} from "../partnerStreakApi";
import { MAX_PARTNERS } from "../streakEngine";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  writeLog,
  allPaths,
} from "@/test/firestoreHarness";

/** Bonds belonging to `me`, one per synthetic partner. */
function seedMyBonds(count: number) {
  const tree: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < count; i++) {
    tree[`partnerBonds/me__p${i}`] = { members: ["me", `p${i}`], streak: 0 };
  }
  seedFirestore(tree);
}

const bondWrites = () =>
  writeLog().filter((w) => w.path.startsWith("partnerBonds/"));

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  // Default: mutual follow holds, no existing bonds.
  mockIsFollowing.mockResolvedValue(true);
});
afterEach(() => {
  resetFirestore();
});

describe("bondId", () => {
  it("is order-independent (same id whoever initiates)", () => {
    expect(bondId("alice", "bob")).toBe(bondId("bob", "alice"));
  });

  it("is deterministic and pair-unique", () => {
    expect(bondId("alice", "bob")).toBe("alice__bob");
    expect(bondId("bob", "alice")).toBe("alice__bob");
  });
});

describe("createBond", () => {
  it("rejects an identity mismatch (me !== authed uid)", async () => {
    await expect(createBond("someone-else", "bob")).rejects.toThrow(
      /Identity mismatch/
    );
    expect(bondWrites()).toEqual([]);
  });

  it("rejects bonding with yourself", async () => {
    await expect(createBond("me", "me")).rejects.toThrow(/yourself/);
    expect(bondWrites()).toEqual([]);
  });

  it("rejects when the follow is not mutual", async () => {
    // I follow them, but they don't follow me.
    mockIsFollowing.mockImplementation((a: string) =>
      Promise.resolve(a === "me")
    );
    await expect(createBond("me", "bob")).rejects.toThrow(/Mutual follow/);
    expect(bondWrites()).toEqual([]);
  });

  it("rejects once the partner cap is reached", async () => {
    seedMyBonds(MAX_PARTNERS);
    await expect(createBond("me", "bob")).rejects.toThrow(/limit reached/);
    expect(bondWrites()).toEqual([]);
  });

  it("another user's bonds do not count toward my cap", async () => {
    // One short of the cap for me, plus a full set belonging to someone
    // else. The old suite handed `getDocs` a pre-built list, so the
    // `array-contains` members filter was never exercised and a foreign
    // bond leaking into my count was untestable.
    seedMyBonds(MAX_PARTNERS - 1);
    const foreign: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < MAX_PARTNERS; i++) {
      foreign[`partnerBonds/other__q${i}`] = {
        members: ["other", `q${i}`],
        streak: 0,
      };
    }
    seedFirestore(foreign);

    await expect(createBond("me", "bob")).resolves.toBe("bob__me");
    expect(readDoc("partnerBonds/bob__me")).toBeTruthy();
  });

  it("writes a cold bond with sorted members and streak 0", async () => {
    const id = await createBond("me", "bob");
    expect(id).toBe("bob__me"); // sorted: bob < me

    expect(bondWrites().map((w) => w.path)).toEqual(["partnerBonds/bob__me"]);
    const stored = readDoc("partnerBonds/bob__me")!;
    expect(stored.members).toEqual(["bob", "me"]);
    expect(stored.streak).toBe(0);
    expect(stored.lastSharedDay).toBeNull();
    // serverTimestamp() materialises through the fake rather than
    // staying the literal sentinel string the old stub returned.
    expect(stored.createdAt).toBeTruthy();
  });

  it("is idempotent — returns the existing bond id without re-writing", async () => {
    const id = bondId("me", "bob");
    seedFirestore({
      [`partnerBonds/${id}`]: { members: ["bob", "me"], streak: 3 },
    });
    await expect(createBond("me", "bob")).resolves.toBe(id);
    expect(bondWrites()).toEqual([]);
    // The existing streak survives — an idempotent create must not
    // reset the pair to a cold bond.
    expect(readDoc(`partnerBonds/${id}`)!.streak).toBe(3);
  });

  it("idempotent return wins even at the cap ceiling", async () => {
    // At cap, but one of the bonds IS this pair → must return, not reject.
    const id = bondId("me", "bob");
    seedMyBonds(MAX_PARTNERS - 1);
    seedFirestore({
      [`partnerBonds/${id}`]: { members: ["bob", "me"], streak: 1 },
    });
    await expect(createBond("me", "bob")).resolves.toBe(id);
    expect(bondWrites()).toEqual([]);
  });
});

describe("dissolveBond", () => {
  it("deletes the bond doc by id", async () => {
    seedFirestore({
      "partnerBonds/bob__me": { members: ["bob", "me"], streak: 4 },
    });
    await dissolveBond("bob__me");
    expect(readDoc("partnerBonds/bob__me")).toBeUndefined();
    expect(allPaths()).not.toContain("partnerBonds/bob__me");
  });
});

describe("listMyBonds", () => {
  it("maps docs to { id, ...data }", async () => {
    seedFirestore({
      "partnerBonds/bob__me": { members: ["bob", "me"], streak: 4 },
    });
    const bonds = await listMyBonds("me");
    expect(bonds).toEqual([
      { id: "bob__me", members: ["bob", "me"], streak: 4 },
    ]);
  });

  it("returns only MY bonds", async () => {
    seedFirestore({
      "partnerBonds/bob__me": { members: ["bob", "me"], streak: 4 },
      "partnerBonds/other__q1": { members: ["other", "q1"], streak: 9 },
    });
    const bonds = await listMyBonds("me");
    expect(bonds.map((b) => b.id)).toEqual(["bob__me"]);
  });
});

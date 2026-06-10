import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Firebase mocks (string-path style, matching socialApi.test.ts) ----
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...args: string[]) => args.join("/")),
  doc: vi.fn((...args: string[]) => args.join("/")),
  query: vi.fn((...args: unknown[]) => args[0]),
  where: vi.fn((...args: unknown[]) => ({ where: args })),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  serverTimestamp: () => "SERVER_TIMESTAMP",
}));

vi.mock("@/lib/firebase", () => ({
  db: "mock-db",
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

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  // Default: mutual follow holds, no existing bonds.
  mockIsFollowing.mockResolvedValue(true);
  mockGetDocs.mockResolvedValue({ docs: [] });
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
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("rejects bonding with yourself", async () => {
    await expect(createBond("me", "me")).rejects.toThrow(/yourself/);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("rejects when the follow is not mutual", async () => {
    // I follow them, but they don't follow me.
    mockIsFollowing.mockImplementation((a: string) =>
      Promise.resolve(a === "me")
    );
    await expect(createBond("me", "bob")).rejects.toThrow(/Mutual follow/);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("rejects once the partner cap is reached", async () => {
    // MAX_PARTNERS existing bonds, none with this partner.
    const docs = Array.from({ length: MAX_PARTNERS }, (_, i) => ({
      id: `me__p${i}`,
      data: () => ({ members: ["me", `p${i}`], streak: 0 }),
    }));
    mockGetDocs.mockResolvedValue({ docs });
    await expect(createBond("me", "bob")).rejects.toThrow(/limit reached/);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("writes a cold bond with sorted members and streak 0", async () => {
    const id = await createBond("me", "bob");
    expect(id).toBe("bob__me"); // sorted: bob < me
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = mockSetDoc.mock.calls[0];
    expect(ref).toBe("mock-db/partnerBonds/bob__me");
    expect(payload.members).toEqual(["bob", "me"]);
    expect(payload.streak).toBe(0);
    expect(payload.lastSharedDay).toBeNull();
    expect(payload.createdAt).toBe("SERVER_TIMESTAMP");
  });

  it("is idempotent — returns the existing bond id without re-writing", async () => {
    const id = bondId("me", "bob");
    mockGetDocs.mockResolvedValue({
      docs: [{ id, data: () => ({ members: ["bob", "me"], streak: 3 }) }],
    });
    const result = await createBond("me", "bob");
    expect(result).toBe(id);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("idempotent return wins even at the cap ceiling", async () => {
    // At cap, but one of the bonds IS this pair → must return, not reject.
    const id = bondId("me", "bob");
    const docs = [
      { id, data: () => ({ members: ["bob", "me"], streak: 1 }) },
      ...Array.from({ length: MAX_PARTNERS - 1 }, (_, i) => ({
        id: `me__p${i}`,
        data: () => ({ members: ["me", `p${i}`], streak: 0 }),
      })),
    ];
    mockGetDocs.mockResolvedValue({ docs });
    await expect(createBond("me", "bob")).resolves.toBe(id);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe("dissolveBond", () => {
  it("deletes the bond doc by id", async () => {
    await dissolveBond("bob__me");
    expect(mockDeleteDoc).toHaveBeenCalledWith("mock-db/partnerBonds/bob__me");
  });
});

describe("listMyBonds", () => {
  it("maps docs to { id, ...data }", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: "bob__me", data: () => ({ members: ["bob", "me"], streak: 4 }) },
      ],
    });
    const bonds = await listMyBonds("me");
    expect(bonds).toEqual([
      { id: "bob__me", members: ["bob", "me"], streak: 4 },
    ]);
  });
});

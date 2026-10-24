/**
 * The copy of a block for the person blocked (Polish3 call 1):
 * `blockedBy/{blocked}/users/{blocker}` kept matching
 * `blocks/{blocker}/users/{blocked}` by reconcileBlockMirror, which
 * onBlockWritten runs on every write of a block.
 *
 * Driven against the in-memory Firestore; the emulator suite
 * (integration/blockMirror.test.js) runs the real trigger.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { reconcileBlockMirror } = require("../lib/blockMirror");

const ROW = "blockedBy/bob/users/alice";
const BLOCK = "blocks/alice/users/bob";

const reconcile = (firestore, blockerUid = "alice", blockedUid = "bob") =>
  reconcileBlockMirror({ firestore, blockerUid, blockedUid });

const writes = (firestore) =>
  firestore.operations.filter(([, path]) => path === ROW);

describe("reconcileBlockMirror", () => {
  it("writes the row for a block, holding nothing but its id", async () => {
    const firestore = memoryFirestore({ [BLOCK]: { blockedAt: 1 } });
    expect(await reconcile(firestore)).toBe("mirrored");
    expect(firestore.data.get(ROW)).toEqual({});
  });

  it("removes the row once the block is gone", async () => {
    const firestore = memoryFirestore({ [ROW]: {} });
    expect(await reconcile(firestore)).toBe("removed");
    expect(firestore.data.has(ROW)).toBe(false);
  });

  it("changes nothing when delivered again", async () => {
    const firestore = memoryFirestore({ [BLOCK]: { blockedAt: 1 } });
    await reconcile(firestore);
    expect(await reconcile(firestore)).toBe("unchanged");
    expect(writes(firestore)).toEqual([["set", ROW]]);

    await firestore.doc(BLOCK).delete();
    await reconcile(firestore);
    expect(await reconcile(firestore)).toBe("unchanged");
    expect(writes(firestore)).toEqual([
      ["set", ROW],
      ["delete", ROW],
    ]);
  });

  it("follows the block as it is now, whatever order the events arrive in", async () => {
    // Blocked, unblocked, blocked again; the first event arrives last.
    const firestore = memoryFirestore({ [BLOCK]: { blockedAt: 3 } });
    await reconcile(firestore); // the second block's event
    await reconcile(firestore); // the unblock's event, after the re-block
    await reconcile(firestore); // the first block's event
    expect(firestore.data.get(ROW)).toEqual({});

    // Unblocked for good, and the block's event is late.
    await firestore.doc(BLOCK).delete();
    await reconcile(firestore); // the unblock
    await reconcile(firestore); // the block, late
    expect(firestore.data.has(ROW)).toBe(false);
  });

  it("keeps each pair to its own row", async () => {
    const firestore = memoryFirestore({
      [BLOCK]: { blockedAt: 1 },
      "blocks/carol/users/bob": { blockedAt: 1 },
    });
    await reconcile(firestore);
    await reconcile(firestore, "carol", "bob");
    // Bob's own block of Alice is a separate question, and not asked.
    expect(await reconcile(firestore, "bob", "alice")).toBe("unchanged");
    expect(
      [...firestore.data.keys()].filter((p) => p.startsWith("blockedBy/"))
    ).toEqual(["blockedBy/bob/users/alice", "blockedBy/bob/users/carol"]);
  });

  it("writes nothing for a block of yourself, or a pair without ids", async () => {
    const firestore = memoryFirestore({
      "blocks/alice/users/alice": { blockedAt: 1 },
    });
    expect(await reconcile(firestore, "alice", "alice")).toBe("skipped");
    expect(await reconcile(firestore, "", "bob")).toBe("skipped");
    expect(await reconcile(firestore, "alice", null)).toBe("skipped");
    expect(
      [...firestore.data.keys()].filter((p) => p.startsWith("blockedBy/"))
    ).toEqual([]);
  });

  it.each([
    ["the person blocked", "bob"],
    ["the blocker", "alice"],
  ])(
    "writes no row while %s is being deleted, and still removes one",
    async (_who, deleting) => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      const firestore = memoryFirestore({
        [BLOCK]: { blockedAt: 1 },
        [`accountDeletionRequests/${deleting}`]: { status: "running" },
      });
      expect(await reconcile(firestore)).toBe("skipped");
      expect(firestore.data.has(ROW)).toBe(false);

      await firestore.doc(BLOCK).delete();
      await firestore.doc(ROW).set({});
      expect(await reconcile(firestore)).toBe("removed");
      expect(firestore.data.has(ROW)).toBe(false);
    }
  );

  it("writes no row for an account already deleted", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const firestore = memoryFirestore({
      [BLOCK]: { blockedAt: 1 },
      "deletedAccounts/bob": {
        uid: "bob",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect(await reconcile(firestore)).toBe("skipped");
    expect(firestore.data.has(ROW)).toBe(false);
  });
});

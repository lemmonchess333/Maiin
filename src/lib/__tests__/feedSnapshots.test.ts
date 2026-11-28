/**
 * The Feed's kept reads (`feedSnapshots`): one account's at a time, and
 * what they show filtered against the blocks and hidden posts as they are
 * now.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetFeedSnapshotsForTests,
  readFeedSnapshot,
  visibleFeedItems,
  writeFeedSnapshot,
} from "../feedSnapshots";

beforeEach(__resetFeedSnapshotsForTests);

describe("feedSnapshots — one account's reads", () => {
  it("gives a source's read back to the account that kept it", () => {
    writeFeedSnapshot("A", "explore", { items: ["a1"] });
    expect(readFeedSnapshot("A", "explore")).toEqual({ items: ["a1"] });
    expect(readFeedSnapshot("A", "following")).toBeUndefined();
  });

  it("never to another account, or to no account", () => {
    writeFeedSnapshot("A", "explore", { items: ["a1"] });
    expect(readFeedSnapshot("B", "explore")).toBeUndefined();
    expect(readFeedSnapshot(null, "explore")).toBeUndefined();
  });

  it("forgets every read of the last account once another keeps one", () => {
    writeFeedSnapshot("A", "explore", { items: ["a1"] });
    writeFeedSnapshot("A", "following", { items: ["a2"] });
    writeFeedSnapshot("B", "explore", { items: ["b1"] });
    expect(readFeedSnapshot("B", "explore")).toEqual({ items: ["b1"] });
    // A signing back in on this phone starts from nothing.
    expect(readFeedSnapshot("A", "following")).toBeUndefined();
    expect(readFeedSnapshot("A", "explore")).toBeUndefined();
  });
});

describe("visibleFeedItems — the posts as the lists stand now", () => {
  const post = (activityId: string, authorId: string) => ({
    activityId,
    authorId,
  });
  const kept = [post("p1", "bea"), post("p2", "cal"), post("p3", "dev")];

  it("leaves out anyone blocked either way and any post hidden", () => {
    expect(
      visibleFeedItems(kept, new Set(["cal"]), new Set(["p3"])).map(
        (p) => p.activityId
      )
    ).toEqual(["p1"]);
  });

  it("hands back the same list when nothing is left out", () => {
    expect(visibleFeedItems(kept, new Set(), new Set())).toBe(kept);
    expect(visibleFeedItems(kept, new Set(["nobody"]))).toBe(kept);
    expect(visibleFeedItems(kept)).toBe(kept);
  });
});

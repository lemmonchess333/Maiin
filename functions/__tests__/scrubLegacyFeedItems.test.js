import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  scrubLegacyFeedItems,
  parseArgs,
} = require("../scripts/scrubLegacyFeedItems");
const { buildFeedIndex } = require("../lib/feedIndex");
const createdAt = new Date("2026-10-01T12:00:00Z");
const expiresAt = new Date("2027-03-30T12:00:00Z");
const legacy = () => ({
  activityId: "a1",
  authorId: "alice",
  createdAt,
  expiresAt,
  authorName: "Alice",
  authorPhotoURL: "photo.jpg",
  type: "run",
  summary: "Tempo · 5.0 km · 25:00",
  prHit: true,
  badgeEarned: "first-run",
});
const safe = () =>
  buildFeedIndex({ activityId: "a1", authorId: "alice", createdAt, expiresAt });

describe("scrubLegacyFeedItems", () => {
  it("defaults to a dry run, then replaces all display fields and preserves the deletion routing key", async () => {
    const fs = memoryFirestore({
      "feeds/bob/items/oldAutoId": legacy(),
      "notifications/bob/items/n1": { activityId: "a1", message: "keep" },
      "comments/a1/items/c1": { authorId: "alice", text: "keep" },
    });
    const dry = await scrubLegacyFeedItems({ firestore: fs });
    expect(dry).toMatchObject({
      candidates: 1,
      foreign: 2,
      rewritten: 0,
      dryRun: true,
    });
    expect(fs.data.get("feeds/bob/items/oldAutoId")).toEqual(legacy());
    const applied = await scrubLegacyFeedItems({ firestore: fs, apply: true });
    expect(applied).toMatchObject({ rewritten: 1, removed: 0, dryRun: false });
    expect(fs.data.get("feeds/bob/items/oldAutoId")).toEqual(safe());
    expect(fs.data.get("notifications/bob/items/n1")).toEqual({
      activityId: "a1",
      message: "keep",
    });
    expect(fs.data.get("comments/a1/items/c1")).toEqual({
      authorId: "alice",
      text: "keep",
    });
    expect(
      (await scrubLegacyFeedItems({ firestore: fs, apply: true })).rewritten
    ).toBe(0);
  });

  it("scrubs even a versioned row if it still carries forbidden fields", async () => {
    const fs = memoryFirestore({
      "feeds/bob/items/a1": { ...legacy(), schemaVersion: 2 },
    });
    await scrubLegacyFeedItems({ firestore: fs, apply: true });
    expect(fs.data.get("feeds/bob/items/a1")).toEqual(safe());
  });

  it("pages and resumes without skipping other recipients' copies", async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 205 }, (_, i) => [
        `feeds/b${String(i).padStart(3, "0")}/items/a1`,
        legacy(),
      ])
    );
    const fs = memoryFirestore(entries);
    const first = await scrubLegacyFeedItems({
      firestore: fs,
      apply: true,
      maxPages: 1,
    });
    expect(first.rewritten).toBe(200);
    const rest = await scrubLegacyFeedItems({
      firestore: fs,
      apply: true,
      after: first.cursor,
    });
    expect(rest.rewritten).toBe(5);
    expect(
      [...fs.data.values()].every(
        (row) => row.schemaVersion === 2 && !row.summary
      )
    ).toBe(true);
  });

  it("does not resurrect a row deleted between its scan and transaction", async () => {
    const path = "feeds/bob/items/a1";
    const fs = memoryFirestore({ [path]: legacy() });
    const runTransaction = fs.runTransaction;
    fs.runTransaction = async (fn) => {
      fs.data.delete(path);
      return runTransaction(fn);
    };
    await scrubLegacyFeedItems({ firestore: fs, apply: true });
    expect(fs.data.has(path)).toBe(false);
  });

  it("only shrinks rows whose recipient or author account is being deleted", async () => {
    const fs = memoryFirestore({
      "feeds/bob/items/a1": legacy(),
      "accountDeletionRequests/alice": { status: "running" },
    });
    const report = await scrubLegacyFeedItems({ firestore: fs, apply: true });
    expect(report.removed).toBe(1);
    expect(fs.data.has("feeds/bob/items/a1")).toBe(false);
  });

  it("removes unusable secondary indexes without touching their posts", async () => {
    const fs = memoryFirestore({
      "feeds/bob/items/a1": { ...legacy(), activityId: "bad/path" },
      "activities/a1": { authorId: "alice", visibility: "private" },
    });
    await scrubLegacyFeedItems({ firestore: fs, apply: true });
    expect(fs.data.has("feeds/bob/items/a1")).toBe(false);
    expect(fs.data.has("activities/a1")).toBe(true);
  });

  it("requires an explicit project and explicit apply option", () => {
    expect(() => parseArgs([])).toThrow(/project/);
    expect(parseArgs(["--project", "demo-tropos"]).apply).toBe(false);
    expect(parseArgs(["--project", "demo-tropos", "--apply"]).apply).toBe(true);
    expect(() =>
      parseArgs(["--project", "demo-tropos", "--max-pages", "0"])
    ).toThrow(/positive/);
  });
});

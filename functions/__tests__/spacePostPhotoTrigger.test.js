/**
 * onSpacePostWritten hands every write's before and after to the photo
 * cleanup, after moderation, and fails the event when the cleanup fails so
 * it is retried. The cleanup's own rules are in spacePostPhoto.test.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";

const spacePostModeration = require("../lib/spacePostModeration");
const spacePostPhoto = require("../lib/spacePostPhoto");
const { onSpacePostWritten } = require("../index");

const POST = {
  authorId: "author-uid",
  body: "Long run done",
  photoUrl:
    "https://firebasestorage.googleapis.com/v0/b/b/o/space-photos%2Fauthor-uid%2F1.jpg",
};
const deleted = {
  before: { exists: true, data: () => POST },
  after: { exists: false, data: () => undefined, ref: { path: "p" } },
};
const context = {
  params: { spaceId: "s1", postId: "p1" },
  timestamp: new Date().toISOString(),
};

let order;
beforeEach(() => {
  order = [];
  vi.spyOn(
    spacePostModeration,
    "removeObjectionableSpacePost"
  ).mockImplementation(async () => {
    order.push("moderation");
  });
  vi.spyOn(spacePostPhoto, "deleteOrphanedPhoto").mockImplementation(
    async () => {
      order.push("photo");
      return null;
    }
  );
});
afterEach(() => vi.restoreAllMocks());

describe("onSpacePostWritten — the post's photo", () => {
  it("passes a deleted post's before and after to the cleanup, after moderation", async () => {
    await onSpacePostWritten.run(deleted, context);
    expect(order).toEqual(["moderation", "photo"]);
    const [args] = spacePostPhoto.deleteOrphanedPhoto.mock.calls[0];
    expect(args.before).toEqual(POST);
    expect(args.after).toBeNull();
    expect(typeof args.getBucket).toBe("function");
  });

  it("fails the event when the cleanup fails, so it is retried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    spacePostPhoto.deleteOrphanedPhoto.mockRejectedValueOnce(new Error("503"));
    await expect(onSpacePostWritten.run(deleted, context)).rejects.toThrow(
      "503"
    );
  });
});

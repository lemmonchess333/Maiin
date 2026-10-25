/**
 * A Space post's photo goes with the post, and nobody else's goes with it
 * (lib/spacePostPhoto.js). `photoUrl` is client-written and the rules
 * accept any Firebase Storage URL, so the cases that matter most are the
 * refusals: another person's photo, another project's bucket, another
 * prefix.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ownedPhotoPath,
  orphanedPhotoUrl,
  deleteOrphanedPhoto,
} = require("../lib/spacePostPhoto");

const BUCKET = "adaptive-fitness-af8bb.appspot.com";
const AUTHOR = "author-uid";

/** A download URL as getDownloadURL writes it: the object path encoded. */
function downloadUrl(
  path,
  bucket = BUCKET,
  host = "firebasestorage.googleapis.com"
) {
  return `https://${host}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=abc`;
}

const OWN = `space-photos/${AUTHOR}/1729872000000.jpg`;

describe("ownedPhotoPath", () => {
  it("returns the path of the author's own post photo", () => {
    expect(ownedPhotoPath(downloadUrl(OWN), AUTHOR, BUCKET)).toBe(OWN);
  });

  it.each([
    ["another person's photo", downloadUrl("space-photos/victim-uid/1.jpg")],
    ["another project's bucket", downloadUrl(OWN, "attacker.appspot.com")],
    ["their profile photo", downloadUrl(`profile-photos/${AUTHOR}/a.jpg`)],
    ["their legacy meal photo", downloadUrl(`food-photos/${AUTHOR}/m.jpg`)],
    ["the folder itself", downloadUrl(`space-photos/${AUTHOR}`)],
    [
      "a dot segment",
      downloadUrl(`space-photos/${AUTHOR}/../victim-uid/1.jpg`),
    ],
    ["an empty segment", downloadUrl(`space-photos/${AUTHOR}//1.jpg`)],
    ["another host", downloadUrl(OWN, BUCKET, "storage.googleapis.com")],
    ["plain http", downloadUrl(OWN).replace("https:", "http:")],
    ["a port", downloadUrl(OWN).replace(".com/", ".com:8443/")],
    ["not a URL", "space-photos/author-uid/1.jpg"],
    ["a broken escape", downloadUrl(OWN).replace("%2F", "%E0%A4%A")],
  ])("refuses %s", (_label, url) => {
    expect(ownedPhotoPath(url, AUTHOR, BUCKET)).toBeNull();
  });

  it("refuses when the author or bucket is unknown", () => {
    expect(ownedPhotoPath(downloadUrl(OWN), "", BUCKET)).toBeNull();
    expect(ownedPhotoPath(downloadUrl(OWN), undefined, BUCKET)).toBeNull();
    expect(ownedPhotoPath(downloadUrl(OWN), AUTHOR, "")).toBeNull();
    expect(ownedPhotoPath(undefined, AUTHOR, BUCKET)).toBeNull();
  });
});

describe("orphanedPhotoUrl", () => {
  const post = { authorId: AUTHOR, body: "x", photoUrl: downloadUrl(OWN) };

  it("is the photo when the post is deleted", () => {
    expect(orphanedPhotoUrl(post, null)).toBe(post.photoUrl);
  });
  it("is the old photo when the post names another one", () => {
    expect(
      orphanedPhotoUrl(post, {
        ...post,
        photoUrl: downloadUrl(`space-photos/${AUTHOR}/2.jpg`),
      })
    ).toBe(post.photoUrl);
  });
  it("is nothing when an edit keeps the photo", () => {
    expect(orphanedPhotoUrl(post, { ...post, body: "edited" })).toBeNull();
  });
  it("is nothing for a create, or a post without a photo", () => {
    expect(orphanedPhotoUrl(null, post)).toBeNull();
    expect(orphanedPhotoUrl({ authorId: AUTHOR, body: "x" }, null)).toBeNull();
  });
});

function fakeBucket(deleteImpl = async () => {}) {
  const deleted = [];
  return {
    deleted,
    name: BUCKET,
    file: (path) => ({
      delete: async () => {
        await deleteImpl(path);
        deleted.push(path);
      },
    }),
  };
}

describe("deleteOrphanedPhoto", () => {
  const post = { authorId: AUTHOR, body: "x", photoUrl: downloadUrl(OWN) };

  it("deletes the deleted post's own photo", async () => {
    const bucket = fakeBucket();
    await expect(
      deleteOrphanedPhoto({
        before: post,
        after: null,
        getBucket: () => bucket,
      })
    ).resolves.toBe(OWN);
    expect(bucket.deleted).toEqual([OWN]);
  });

  it("never deletes another person's photo a post named", async () => {
    const bucket = fakeBucket();
    const logger = { warn: vi.fn() };
    const forged = {
      ...post,
      photoUrl: downloadUrl("space-photos/victim-uid/1.jpg"),
    };
    await expect(
      deleteOrphanedPhoto({
        before: forged,
        after: null,
        getBucket: () => bucket,
        logger,
      })
    ).resolves.toBeNull();
    expect(bucket.deleted).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith("spacePostPhoto.notOwned", {
      authorId: AUTHOR,
    });
  });

  it("does not ask for Storage when the write leaves no photo", async () => {
    const getBucket = vi.fn();
    await deleteOrphanedPhoto({ before: null, after: post, getBucket });
    await deleteOrphanedPhoto({
      before: post,
      after: { ...post, body: "y" },
      getBucket,
    });
    expect(getBucket).not.toHaveBeenCalled();
  });

  it("treats a file already gone as done", async () => {
    const bucket = fakeBucket(async () => {
      throw Object.assign(new Error("No such object"), { code: 404 });
    });
    await expect(
      deleteOrphanedPhoto({
        before: post,
        after: null,
        getBucket: () => bucket,
      })
    ).resolves.toBe(OWN);
  });

  it("throws any other failure, so the trigger is retried", async () => {
    const bucket = fakeBucket(async () => {
      throw Object.assign(new Error("backend error"), { code: 503 });
    });
    await expect(
      deleteOrphanedPhoto({
        before: post,
        after: null,
        getBucket: () => bucket,
      })
    ).rejects.toThrow("backend error");
  });
});

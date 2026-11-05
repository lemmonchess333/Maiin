/**
 * A shared session's photos on the server (Soc15 call 2).
 *
 * Their folder, `post-photos/{authorId}/{activityId}/`, goes with the post
 * whatever the post names: the folder comes from the post's author and id,
 * not from its `photos` list, so a photo that was uploaded and never named
 * (the app gave up, or the person took it off) goes as well. And the
 * moderation queue is shown only the URLs that are the post's own uploads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";

const postPhotos = require("../lib/postPhotos");
const routeMapFiles = require("../lib/routeMapFiles");
const socialFanout = require("../lib/socialFanout");
const { onActivityDeleted } = require("../index");

const {
  MAX_POST_PHOTOS,
  postPhotoPrefix,
  deletePostPhotoFiles,
  isPostPhotoUrl,
  postPhotoUrls,
} = postPhotos;

const BUCKET =
  "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/";
const photoUrl = (author, post, id, bucket = BUCKET) =>
  `${bucket}post-photos%2F${author}%2F${post}%2F${id}.jpg?alt=media&token=t0k`;
const photo = (id, author = "author-uid", post = "post-1") => ({
  id,
  url: photoUrl(author, post, id),
  w: 1600,
  h: 1200,
});

function fakeBucket() {
  return { name: "b", deleteFiles: vi.fn(async () => undefined) };
}

describe("postPhotoPrefix", () => {
  it("names the post's own folder, ending in a slash", () => {
    expect(postPhotoPrefix("author-uid", "post-1")).toBe(
      "post-photos/author-uid/post-1/"
    );
  });

  it.each([
    ["", "post-1"],
    ["author-uid", ""],
    [undefined, "post-1"],
    ["author-uid", undefined],
    ["a/b", "post-1"],
    ["author-uid", "x/y"],
    ["..", "post-1"],
    ["author-uid", "."],
  ])("names nothing for author %j and post %j", (authorId, activityId) => {
    expect(postPhotoPrefix(authorId, activityId)).toBeNull();
  });
});

describe("deletePostPhotoFiles", () => {
  it("empties the deleted post's folder when the post names photos", async () => {
    const bucket = fakeBucket();
    await expect(
      deletePostPhotoFiles({
        data: { authorId: "author-uid", photos: [photo("Ab3dEf6hIj")] },
        activityId: "post-1",
        getBucket: () => bucket,
      })
    ).resolves.toBe("post-photos/author-uid/post-1/");
    expect(bucket.deleteFiles).toHaveBeenCalledWith({
      prefix: "post-photos/author-uid/post-1/",
    });
  });

  it("empties it when the post names none, for an upload that was never named", async () => {
    // A lift's post and a run's: any post can have had a photo uploaded.
    for (const data of [
      { authorId: "author-uid", type: "workout" },
      { authorId: "author-uid", type: "run", photos: [] },
    ]) {
      const bucket = fakeBucket();
      await expect(
        deletePostPhotoFiles({
          data,
          activityId: "post-1",
          getBucket: () => bucket,
        })
      ).resolves.toBe("post-photos/author-uid/post-1/");
      expect(bucket.deleteFiles).toHaveBeenCalledWith({
        prefix: "post-photos/author-uid/post-1/",
      });
    }
  });

  it("never names a folder wider than the post's own", async () => {
    // A post id that begins another's must not reach it: the prefix ends
    // in a slash.
    const bucket = fakeBucket();
    await deletePostPhotoFiles({
      data: { authorId: "author-uid" },
      activityId: "post",
      getBucket: () => bucket,
    });
    const [{ prefix }] = bucket.deleteFiles.mock.calls[0];
    expect(prefix).toBe("post-photos/author-uid/post/");
    expect("post-photos/author-uid/post-1/x.jpg".startsWith(prefix)).toBe(
      false
    );
  });

  it.each([
    [{ authorId: "" }, "post-1"],
    [{ authorId: "a/b" }, "post-1"],
    [{ authorId: ".." }, "post-1"],
    [{}, "post-1"],
    [undefined, "post-1"],
    [{ authorId: "author-uid" }, "x/y"],
  ])(
    "reaches no Storage for post %j with id %j, and says so",
    async (data, activityId) => {
      const getBucket = vi.fn(fakeBucket);
      const logger = { warn: vi.fn() };
      await expect(
        deletePostPhotoFiles({ data, activityId, getBucket, logger })
      ).resolves.toBeNull();
      expect(getBucket).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledOnce();
    }
  );

  it("throws when Storage fails, so the trigger is retried", async () => {
    const bucket = fakeBucket();
    bucket.deleteFiles.mockRejectedValueOnce(new Error("503"));
    await expect(
      deletePostPhotoFiles({
        data: { authorId: "author-uid" },
        activityId: "post-1",
        getBucket: () => bucket,
      })
    ).rejects.toThrow("503");
  });
});

describe("isPostPhotoUrl and postPhotoUrls — what the moderation queue shows", () => {
  it("takes this post's own upload of the photo, in either bucket name", () => {
    expect(
      isPostPhotoUrl(
        photoUrl("author-uid", "post-1", "Ab3dEf6hIj"),
        "author-uid",
        "post-1",
        "Ab3dEf6hIj"
      )
    ).toBe(true);
    expect(
      isPostPhotoUrl(
        photoUrl(
          "author-uid",
          "post-1",
          "Ab3dEf6hIj",
          BUCKET.replace("firebasestorage.app", "appspot.com")
        ),
        "author-uid",
        "post-1",
        "Ab3dEf6hIj"
      )
    ).toBe(true);
  });

  it.each([
    ["another person's", photoUrl("stranger", "post-1", "Ab3dEf6hIj")],
    ["another post's", photoUrl("author-uid", "post-2", "Ab3dEf6hIj")],
    ["another id's", photoUrl("author-uid", "post-1", "Zz9yXx8wVv")],
    [
      "another bucket",
      photoUrl(
        "author-uid",
        "post-1",
        "Ab3dEf6hIj",
        BUCKET.replace("adaptive-fitness-af8bb", "evil-project")
      ),
    ],
    [
      "a nested file",
      `${BUCKET}post-photos%2Fauthor-uid%2Fpost-1%2Fx%2FAb3dEf6hIj.jpg`,
    ],
    ["a tracking pixel", "https://evil.example/p.gif"],
    ["a route map", `${BUCKET}route-maps%2Fauthor-uid%2Fpost-1%2Flight.jpg`],
    [
      "too long",
      photoUrl("author-uid", "post-1", "Ab3dEf6hIj") + "x".repeat(2048),
    ],
    ["not a string", 42],
  ])("refuses %s", (_, url) => {
    expect(isPostPhotoUrl(url, "author-uid", "post-1", "Ab3dEf6hIj")).toBe(
      false
    );
  });

  it("lists the post's own photos in its order, at most four, and nothing else", () => {
    const own = ["Aaaaaaaa1", "Bbbbbbbb2", "Cccccccc3", "Dddddddd4"].map((id) =>
      photo(id)
    );
    expect(postPhotoUrls(own, "author-uid", "post-1")).toEqual(
      own.map((p) => p.url)
    );
    expect(
      postPhotoUrls(
        [
          own[0],
          photo("Eeeeeeee5", "stranger"),
          { ...own[1], id: "bad id!" },
          own[2],
        ],
        "author-uid",
        "post-1"
      )
    ).toEqual([own[0].url, own[2].url]);
    expect(
      postPhotoUrls([null, "a string", own[3]], "author-uid", "post-1")
    ).toEqual([own[3].url]);
    expect(
      postPhotoUrls([...own, photo("Ffffffff6")], "author-uid", "post-1")
    ).toHaveLength(MAX_POST_PHOTOS);
    expect(postPhotoUrls(undefined, "author-uid", "post-1")).toEqual([]);
    expect(postPhotoUrls(own, "", "post-1")).toEqual([]);
  });
});

describe("onActivityDeleted — the post's photos", () => {
  const LIFT_POST = { authorId: "author-uid", type: "workout" };
  const context = {
    params: { activityId: "post-1" },
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.spyOn(socialFanout, "removeActivityFromFeeds").mockResolvedValue({
      removed: 0,
    });
    vi.spyOn(routeMapFiles, "deleteRouteMapFiles").mockResolvedValue(null);
    vi.spyOn(postPhotos, "deletePostPhotoFiles").mockResolvedValue(
      "post-photos/author-uid/post-1/"
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("empties the folder of any deleted post, a lift's that named no photo included", async () => {
    await onActivityDeleted.run({ data: () => LIFT_POST }, context);
    expect(postPhotos.deletePostPhotoFiles).toHaveBeenCalledOnce();
    const [args] = postPhotos.deletePostPhotoFiles.mock.calls[0];
    expect(args.data).toEqual(LIFT_POST);
    expect(args.activityId).toBe("post-1");
    expect(typeof args.getBucket).toBe("function");
  });

  it("fails the event when the cleanup fails, so it is retried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    postPhotos.deletePostPhotoFiles.mockRejectedValueOnce(new Error("503"));
    await expect(
      onActivityDeleted.run({ data: () => LIFT_POST }, context)
    ).rejects.toThrow("503");
  });
});

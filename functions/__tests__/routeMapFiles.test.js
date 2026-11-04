/**
 * A run post's map images go with the post (Soc15 call 5): its
 * `route-maps/{authorId}/{activityId}/` folder is emptied when the post is
 * deleted, and nothing else is ever named.
 *
 * The folder comes from the post, not from the URLs it names, so a map
 * uploaded and never named still goes; and a post that shared no route
 * never reaches Storage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";

const routeMapFiles = require("../lib/routeMapFiles");
const socialFanout = require("../lib/socialFanout");
const { onActivityDeleted } = require("../index");

const { couldHaveRouteMap, routeMapPrefix, deleteRouteMapFiles } =
  routeMapFiles;

const ROUTE = [
  { lat: 51.5, lon: -0.12 },
  { lat: 51.51, lon: -0.12 },
];
const RUN_POST = { authorId: "author-uid", type: "run", routePreview: ROUTE };

function fakeBucket() {
  return { name: "b", deleteFiles: vi.fn(async () => undefined) };
}

describe("routeMapPrefix", () => {
  it("names the post's own folder, ending in a slash", () => {
    expect(routeMapPrefix("author-uid", "post-1")).toBe(
      "route-maps/author-uid/post-1/"
    );
  });

  it.each([
    ["", "post-1"],
    ["author-uid", ""],
    [undefined, "post-1"],
    ["a/b", "post-1"],
    ["author-uid", "x/y"],
    ["..", "post-1"],
    ["author-uid", "."],
  ])("names nothing for author %j and post %j", (authorId, activityId) => {
    expect(routeMapPrefix(authorId, activityId)).toBeNull();
  });
});

describe("couldHaveRouteMap", () => {
  it("is true for a post that names a map or shares a route", () => {
    expect(couldHaveRouteMap(RUN_POST)).toBe(true);
    expect(
      couldHaveRouteMap({ authorId: "a", routeMap: { light: "x", dark: "y" } })
    ).toBe(true);
  });

  it("is false for a lift's post, a withheld route and a one-point route", () => {
    expect(couldHaveRouteMap({ authorId: "a", type: "workout" })).toBe(false);
    expect(couldHaveRouteMap({ authorId: "a", routePreview: [] })).toBe(false);
    expect(couldHaveRouteMap({ authorId: "a", routePreview: [ROUTE[0]] })).toBe(
      false
    );
    expect(couldHaveRouteMap(undefined)).toBe(false);
  });
});

describe("deleteRouteMapFiles", () => {
  it("empties the deleted post's folder", async () => {
    const bucket = fakeBucket();
    await expect(
      deleteRouteMapFiles({
        data: RUN_POST,
        activityId: "post-1",
        getBucket: () => bucket,
      })
    ).resolves.toBe("route-maps/author-uid/post-1/");
    expect(bucket.deleteFiles).toHaveBeenCalledWith({
      prefix: "route-maps/author-uid/post-1/",
    });
  });

  it("never reaches Storage for a post with no route", async () => {
    const getBucket = vi.fn(fakeBucket);
    await expect(
      deleteRouteMapFiles({
        data: { authorId: "author-uid", type: "workout" },
        activityId: "post-1",
        getBucket,
      })
    ).resolves.toBeNull();
    expect(getBucket).not.toHaveBeenCalled();
  });

  it("names no folder when the post has no author it can name", async () => {
    const getBucket = vi.fn(fakeBucket);
    const logger = { warn: vi.fn() };
    await expect(
      deleteRouteMapFiles({
        data: { ...RUN_POST, authorId: "" },
        activityId: "post-1",
        getBucket,
        logger,
      })
    ).resolves.toBeNull();
    expect(getBucket).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("throws when Storage fails, so the trigger is retried", async () => {
    const bucket = fakeBucket();
    bucket.deleteFiles.mockRejectedValueOnce(new Error("503"));
    await expect(
      deleteRouteMapFiles({
        data: RUN_POST,
        activityId: "post-1",
        getBucket: () => bucket,
      })
    ).rejects.toThrow("503");
  });
});

describe("onActivityDeleted — the post's map", () => {
  const snap = { data: () => RUN_POST };
  const context = {
    params: { activityId: "post-1" },
    timestamp: new Date().toISOString(),
  };
  let order;

  beforeEach(() => {
    order = [];
    vi.spyOn(socialFanout, "removeActivityFromFeeds").mockImplementation(
      async () => {
        order.push("feeds");
        return { removed: 0 };
      }
    );
    vi.spyOn(routeMapFiles, "deleteRouteMapFiles").mockImplementation(
      async () => {
        order.push("map");
        return "route-maps/author-uid/post-1/";
      }
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("hands the deleted post and its id to the cleanup, after the feeds", async () => {
    await onActivityDeleted.run(snap, context);
    expect(order).toEqual(["feeds", "map"]);
    const [args] = routeMapFiles.deleteRouteMapFiles.mock.calls[0];
    expect(args.data).toEqual(RUN_POST);
    expect(args.activityId).toBe("post-1");
    expect(typeof args.getBucket).toBe("function");
  });

  it("fails the event when the cleanup fails, so it is retried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    routeMapFiles.deleteRouteMapFiles.mockRejectedValueOnce(new Error("503"));
    await expect(onActivityDeleted.run(snap, context)).rejects.toThrow("503");
  });
});

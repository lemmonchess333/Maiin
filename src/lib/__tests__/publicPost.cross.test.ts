// @vitest-environment jsdom
/**
 * A shared post's public page, server and page (App1 Q51).
 *
 * functions/lib/publicPost.js writes the post's public figures into the
 * page it serves and answers `?format=json` with the same; the page reads
 * them with src/lib/publicPost.ts. If the two drifted (a renamed field, the
 * block's id, the origin), the page would draw "This post isn’t available"
 * for every post, which looks exactly like the privacy rule working. So the
 * server's own output is fed to the page's reader here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import {
  loadPublicPost,
  publicPostCard,
  PUBLIC_POST_DATA_ID,
} from "@/lib/publicPost";
import {
  APP_STORE_URL,
  PUBLIC_APP_ORIGIN,
  publicPostUrl,
} from "@/lib/publicLinks";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/publicPost.js");
const {
  memoryFirestore,
} = require("../../../functions/__tests__/helpers/memoryFirestore.cjs");

const SHELL =
  '<!doctype html><html><head><meta property="og:title" content="Tropos" /></head><body></body></html>';

function db(post: Record<string, unknown>) {
  return memoryFirestore({
    "users/sam": { preferredDistanceUnit: "mi", liftingWeightUnit: "lbs" },
    "users/sam/public/profile": { displayName: "Sam" },
    "activities/run1": {
      authorId: "sam",
      authorName: "Sam",
      type: "run",
      visibility: "public",
      createdAt: new Date("2026-11-12T07:10:00Z"),
      runName: "Long run",
      distance: 10210,
      duration: 3130,
      avgPace: 306,
      ...post,
    },
  });
}

/** What the server sends for a request. */
async function serve(
  firestore: unknown,
  query: Record<string, string> = {}
): Promise<unknown> {
  let body: unknown;
  const res = {
    set: () => res,
    status: () => res,
    send: (b: unknown) => {
      body = b;
      return res;
    },
    json: (b: unknown) => {
      body = b;
      return res;
    },
  };
  await server.servePublicPost(
    { method: "GET", path: "/activity/run1", query },
    res,
    { db: firestore, loadShell: async () => SHELL }
  );
  return body;
}

afterEach(() => {
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("the page reads what the server writes", () => {
  it("names the same block and the same origin", () => {
    expect(server.DATA_ELEMENT_ID).toBe(PUBLIC_POST_DATA_ID);
    expect(server.PUBLIC_ORIGIN).toBe(PUBLIC_APP_ORIGIN);
    // Safari's banner and Get Tropos name the same app.
    expect(APP_STORE_URL).toBe(
      `https://apps.apple.com/app/id${server.APP_STORE_ID}`
    );
  });

  it("reads the post from the block in the page the server served", async () => {
    const html = (await serve(db({}))) as string;
    document.head.innerHTML = new DOMParser().parseFromString(
      html,
      "text/html"
    ).head.innerHTML;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const post = await loadPublicPost("run1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(post).toMatchObject({
      id: "run1",
      type: "run",
      authorName: "Sam",
      title: "Long run",
      unit: "mi",
      liftUnit: "lbs",
      distanceM: 10210,
      durationSec: 3130,
      paceSecPerKm: 306,
      summary: "Long run: 6.34 mi in 52:10 at 8:12 /mi.",
    });
    // Taken once: a second look asks the server afresh.
    expect(document.getElementById(PUBLIC_POST_DATA_ID)).toBeNull();
    const card = publicPostCard(post!);
    expect(card).toMatchObject({
      template: "run",
      format: "square",
      unit: "mi",
      handle: "Sam",
      headline: "Long run",
      distanceKm: 10.21,
    });
    // The figures only: never a route, whatever the author shared.
    expect(card.routePath).toBeUndefined();
  });

  it("asks the server for the figures when the page has no block", async () => {
    const answer = await serve(db({}), { format: "json" });
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => answer,
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const post = await loadPublicPost("run1");
    expect(fetchSpy).toHaveBeenCalledWith(
      `${publicPostUrl("run1")}?format=json`,
      { cache: "no-store" }
    );
    expect(post?.authorName).toBe("Sam");
  });

  it("reads a post the server does not show as not shown, block or answer", async () => {
    const firestore = db({ visibility: "followers" });
    const html = (await serve(firestore)) as string;
    document.head.innerHTML = new DOMParser().parseFromString(
      html,
      "text/html"
    ).head.innerHTML;
    expect(await loadPublicPost("run1")).toBeNull();

    const answer = await serve(firestore, { format: "json" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => answer }))
    );
    expect(await loadPublicPost("run1")).toBeNull();
  });

  it("ignores a block about another post", async () => {
    const html = (await serve(db({}))) as string;
    document.head.innerHTML = new DOMParser().parseFromString(
      html,
      "text/html"
    ).head.innerHTML;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: "other", available: false }),
      }))
    );
    await expect(loadPublicPost("other")).resolves.toBeNull();
    // The block for run1 is still there for run1.
    expect(document.getElementById(PUBLIC_POST_DATA_ID)).not.toBeNull();
  });

  it("throws when the server cannot tell, for the page to offer Try again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );
    await expect(loadPublicPost("run1")).rejects.toThrow("503");
  });
});

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
 *
 * The run's map is cut on the server (functions/lib/publicRoute.js), which
 * measures with its own copy of the app's haversine and asks its own copy
 * of `isOutdoorGpsRun` whether a run had GPS. Both are held to the app's
 * here, and the cut line is read back by the page as it was sent.
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
import { haversine } from "@/lib/gps";
import { isOutdoorGpsRun } from "@/lib/runGuards";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/publicPost.js");
const route = require("../../../functions/lib/publicRoute.js");
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

/** Degrees of latitude in a metre, on the haversine's earth. */
const DEG_PER_M = 180 / (Math.PI * 6371000);

describe("the run's map", () => {
  it("is read by the page as the server cut it", async () => {
    const points = Array.from({ length: 101 }, (_, i) => ({
      lat: 51.5 + i * 50 * DEG_PER_M,
      lon: -0.12,
      timestamp: 1_762_931_400_000 + i * 15_000,
    }));
    const firestore = memoryFirestore({
      "users/sam": {},
      "users/sam/public/profile": { displayName: "Sam" },
      "users/sam/privacyZones/home": {
        lat: 51.5,
        lon: -0.12,
        radiusMeters: 200,
      },
      "users/sam/runs/r1": { sharedActivityId: "run1", points, place: null },
      "activities/run1": {
        authorId: "sam",
        type: "run",
        visibility: "public",
        distance: 5000,
        duration: 1500,
        routePreview: [points[10], points[90]],
      },
    });
    const answer = (await serve(firestore, { format: "json" })) as {
      post: { route: { lat: number; lon: number }[] };
    };
    expect(answer.post.route.length).toBeGreaterThan(10);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => answer }))
    );
    const post = await loadPublicPost("run1");
    expect(post?.route).toEqual(answer.post.route);
    // Neither end of the run, nor the zone, reaches the page.
    for (const p of post!.route!) {
      expect(haversine(p.lat, p.lon, 51.5, -0.12)).toBeGreaterThan(599);
      const last = points[points.length - 1];
      expect(haversine(p.lat, p.lon, last.lat, last.lon)).toBeGreaterThan(399);
    }
  });

  it("measures with the app's haversine", () => {
    const pairs: [number, number, number, number][] = [
      [51.5, -0.12, 51.5036, -0.12],
      [51.5, -0.12, 51.5, -0.1],
      [-33.86, 151.21, -33.87, 151.2],
      [64.1, -21.9, 64.2, -21.7],
      [0, 179.999, 0, -179.999],
    ];
    for (const [a, b, c, d] of pairs) {
      expect(route.haversine(a, b, c, d)).toBeCloseTo(haversine(a, b, c, d), 9);
    }
  });

  it("asks whether a run had GPS as the app does", () => {
    const runs = [
      {},
      { place: null, activityType: "easy" },
      { place: "treadmill" },
      { place: "treadmill", activityType: "long" },
      { activityType: "treadmill" },
      { activityType: "manual" },
      { activityType: "freerun", place: null },
      { activityType: null, place: null },
    ];
    for (const run of runs) {
      expect(route.isOutdoorGpsRun(run)).toBe(isOutdoorGpsRun(run));
    }
  });
});

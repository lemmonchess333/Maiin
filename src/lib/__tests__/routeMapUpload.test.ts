// @vitest-environment jsdom
/**
 * A run post's map image, made and named after the post exists
 * (`attachRouteMap`, Soc15 call 5).
 *
 * What the post and its readers depend on:
 *   - the image is drawn from the post's shared route and nothing else,
 *     and only when the post shares one;
 *   - both images are uploaded to the post's own folder and screened
 *     before the post names them, and a refused or failed one is never
 *     named;
 *   - nothing waits on it and nothing hears from it: offline, without
 *     WebGL or on any failure it stops, and the post is as it was;
 *   - a post's map is made once.
 *
 * MapLibre is not run here (jsdom has no WebGL): the renderer is mocked
 * and handed back two blobs. Storage and the screening callable are
 * mocked at their SDK boundary; Firestore is the shared fake (ADR-0009).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  events: [] as string[],
  render: null as null | ((line: unknown) => Promise<unknown>),
  screen: "ok" as "ok" | "refused" | "unavailable",
}));

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({
  db: {},
  storage: {},
  functions: {},
  auth: { currentUser: { uid: "runner" } },
}));
vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => ({ fullPath: path }),
  uploadBytes: vi.fn(
    async (r: { fullPath: string }, _blob: Blob, meta: object) => {
      H.events.push(`upload ${r.fullPath} ${JSON.stringify(meta)}`);
    }
  ),
  getDownloadURL: vi.fn(
    async (r: { fullPath: string }) =>
      `https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/${encodeURIComponent(r.fullPath)}?alt=media&token=t`
  ),
}));
vi.mock("firebase/functions", () => ({
  httpsCallable: () => async (payload: { path: string }) => {
    H.events.push(`screen ${payload.path}`);
    if (H.screen === "unavailable") throw new Error("unavailable");
    return { data: { ok: H.screen === "ok" } };
  },
}));
vi.mock("../routeMapImage", () => ({
  renderRouteMapImages: vi.fn((line: unknown) => H.render!(line)),
}));

import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { renderRouteMapImages } from "../routeMapImage";
import { attachRouteMap, ROUTE_MAP_MAX_BYTES } from "../routeMapUpload";
import { runPostRoute } from "../runCompletion";
import type { GPSPoint } from "../gps";

const TRACE = Array.from(
  { length: 300 },
  (_, i) => ({ lat: 51.5 + i * 0.0001, lon: -0.12 }) as GPSPoint
);
const SHARED = runPostRoute(TRACE, { withheld: false, showEnds: false });
const WITHHELD = runPostRoute(TRACE, { withheld: true, showEnds: false });

const jpeg = (bytes = 40_000) =>
  new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });

let postN = 0;
let postId = "";
let online: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetFirestore();
  H.events = [];
  H.screen = "ok";
  H.render = async () => ({ light: jpeg(), dark: jpeg() });
  vi.mocked(renderRouteMapImages).mockClear();
  // Each test's own post: a post's map is made once per app session.
  postId = `post-${++postN}`;
  seedFirestore({
    [`activities/${postId}`]: { authorId: "runner", type: "run" },
  });
  vi.stubGlobal("WebGLRenderingContext", class {});
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  online.mockRestore();
});

const attach = (route = SHARED, id = postId) =>
  attachRouteMap({ uid: "runner", activityId: id, route });

describe("attachRouteMap", () => {
  it("draws the post's shared route, uploads both images to the post's folder, screens them and names them", async () => {
    await attach();
    expect(renderRouteMapImages).toHaveBeenCalledOnce();
    // The very line runPostRoute shared, not a trace of its own.
    expect(vi.mocked(renderRouteMapImages).mock.calls[0][0]).toBe(
      SHARED.mapLine
    );
    const meta = JSON.stringify({
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    });
    expect(H.events).toEqual([
      `upload route-maps/runner/${postId}/light.jpg ${meta}`,
      `screen route-maps/runner/${postId}/light.jpg`,
      `upload route-maps/runner/${postId}/dark.jpg ${meta}`,
      `screen route-maps/runner/${postId}/dark.jpg`,
    ]);
    const routeMap = readDoc(`activities/${postId}`)?.routeMap as Record<
      string,
      string
    >;
    expect(routeMap.light).toContain(
      encodeURIComponent(`route-maps/runner/${postId}/light.jpg`)
    );
    expect(routeMap.dark).toContain(
      encodeURIComponent(`route-maps/runner/${postId}/dark.jpg`)
    );
    expect(Object.keys(routeMap).sort()).toEqual(["dark", "light"]);
  });

  it("makes no map of a route the post withholds", async () => {
    await attach(WITHHELD);
    expect(renderRouteMapImages).not.toHaveBeenCalled();
    expect(H.events).toEqual([]);
    // Anchor: the same post with a shared route does get its map.
    await attach(SHARED);
    expect(readDoc(`activities/${postId}`)?.routeMap).toBeDefined();
  });

  it("makes no map offline, and none without WebGL", async () => {
    online.mockReturnValue(false);
    await attach();
    expect(renderRouteMapImages).not.toHaveBeenCalled();

    online.mockReturnValue(true);
    vi.unstubAllGlobals();
    await attach(SHARED, "no-webgl");
    expect(renderRouteMapImages).not.toHaveBeenCalled();
    expect(H.events).toEqual([]);
  });

  it("names nothing when the map could not be drawn", async () => {
    H.render = async () => null;
    await expect(attach()).resolves.toBeUndefined();
    expect(renderRouteMapImages).toHaveBeenCalledOnce();
    expect(H.events).toEqual([]);
    expect(readDoc(`activities/${postId}`)?.routeMap).toBeUndefined();
  });

  it("names nothing when a screen refuses an image or cannot check it", async () => {
    for (const screen of ["refused", "unavailable"] as const) {
      H.screen = screen;
      H.events = [];
      const id = `${postId}-${screen}`;
      seedFirestore({ [`activities/${id}`]: { authorId: "runner" } });
      await expect(attach(SHARED, id)).resolves.toBeUndefined();
      expect(H.events).toEqual([
        expect.stringContaining(`upload route-maps/runner/${id}/light.jpg`),
        `screen route-maps/runner/${id}/light.jpg`,
      ]);
      expect(readDoc(`activities/${id}`)?.routeMap).toBeUndefined();
    }
  });

  it("uploads no image too large to be a map", async () => {
    H.render = async () => ({
      light: jpeg(ROUTE_MAP_MAX_BYTES),
      dark: jpeg(),
    });
    await attach();
    expect(H.events).toEqual([]);
    expect(readDoc(`activities/${postId}`)?.routeMap).toBeUndefined();
  });

  it("never rejects, whatever fails", async () => {
    H.render = async () => {
      throw new Error("WebGL context lost");
    };
    await expect(attach()).resolves.toBeUndefined();
  });

  it("makes a post's map once", async () => {
    await Promise.all([attach(), attach()]);
    await attach();
    expect(renderRouteMapImages).toHaveBeenCalledOnce();
  });
});

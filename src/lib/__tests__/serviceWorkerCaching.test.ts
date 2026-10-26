/**
 * public/sw.js's caching, executed against an in-memory cache store.
 *
 * Four defects, each run against the worker as it ships:
 *  - The image and font rule ran before the hashed-asset rule, so a
 *    hashed font or image under assets/ was fetched again on every visit.
 *  - Map styles, tile data and glyphs fell to the network-first rule:
 *    fetched no-store, past their own HTTP caching, and kept by the
 *    hundred until the next deploy's trim.
 *  - The shell (index.html) was written only at install, so anything that
 *    cleared the cache left an offline deep link with no page at all, and
 *    every route visited was kept again under its own address.
 *  - The cache name carried no build, so one deploy's chunks piled up
 *    beside the next one's until a size trim cut them in arbitrary order.
 * And one dead end: a "skipWaiting" message handler nothing ever posted to
 * (install already calls skipWaiting).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE = readFileSync(resolve(repoRoot, "public/sw.js"), "utf8");
const ORIGIN = "http://localhost:4173";
const BASE = "/Maiin/";
/* The map's host, read from where the app sets it, so a move to another
   tile server fails here until the worker moves with it. */
const BASEMAP_ORIGIN = /BASEMAP_ORIGIN = "([^"]+)"/.exec(
  readFileSync(resolve(repoRoot, "src/lib/basemap.ts"), "utf8")
)![1];

interface FakeResponse {
  status: number;
  body: string;
  headers: Map<string, string>;
  clone(): FakeResponse;
}

function response(
  body: string,
  status = 200,
  type = "application/octet-stream"
): FakeResponse {
  return {
    status,
    body,
    headers: new Map([["content-type", type]]),
    clone() {
      return response(body, status, type);
    },
  };
}

/** What Hosting answers a route of the app with: index.html. */
function page(body: string): FakeResponse {
  return response(body, 200, "text/html; charset=utf-8");
}

/** The worker, evaluated at a supported app origin and base path. */
function worker(
  stamp = "__TROPOS_BUILD__",
  { origin = ORIGIN, base = BASE } = {}
) {
  const store = new Map<string, Map<string, FakeResponse>>();
  const keyOf = (req: unknown) =>
    typeof req === "string"
      ? new URL(req, origin).href
      : (req as { url: string }).url;
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      match: async (req: unknown) => entries.get(keyOf(req)),
      put: async (req: unknown, res: FakeResponse) => {
        entries.set(keyOf(req), res);
      },
      add: async (req: unknown) => {
        entries.set(keyOf(req), await net.fetch(req));
      },
      delete: async (req: unknown) => entries.delete(keyOf(req)),
      keys: async () => [...entries.keys()].map((url) => ({ url })),
    };
  };
  const net = {
    online: true,
    fetched: [] as string[],
    pages: new Map<string, FakeResponse>(),
    fetch: async (req: unknown) => {
      const url = keyOf(req);
      net.fetched.push(url);
      if (!net.online) throw new TypeError("Failed to fetch");
      return net.pages.get(url) ?? response(`body of ${url}`);
    },
  };
  const listeners = new Map<string, (event: unknown) => void>();
  runInNewContext(SOURCE.replaceAll("__TROPOS_BUILD__", stamp), {
    self: {
      location: new URL(`${origin}${base}sw.js`),
      addEventListener: (type: string, fn: (event: unknown) => void) =>
        listeners.set(type, fn),
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    URL,
    Headers: Map,
    console,
    Response: class {
      body: string;
      status: number;
      constructor(body: string, init: { status: number }) {
        this.body = body;
        this.status = init.status;
      }
    },
    Request: class {
      url: string;
      constructor(url: string) {
        this.url = new URL(url, origin).href;
      }
    },
    importScripts: () => {
      throw new Error("no FCM config in these tests");
    },
    caches: {
      open,
      keys: async () => [...store.keys()],
      delete: async (name: string) => store.delete(name),
      match: async (req: unknown) => {
        for (const entries of store.values()) {
          const hit = entries.get(keyOf(req));
          if (hit) return hit;
        }
        return undefined;
      },
    },
    fetch: (req: unknown) => net.fetch(req),
  });

  /** Dispatch a GET; resolves to the response, or null if not taken. */
  async function get(
    path: string,
    mode = "no-cors"
  ): Promise<FakeResponse | null> {
    const url = new URL(path, origin).href;
    let answer: Promise<FakeResponse> | null = null;
    const waits: Promise<unknown>[] = [];
    listeners.get("fetch")!({
      request: { method: "GET", url, mode },
      respondWith: (p: Promise<FakeResponse>) => {
        answer = p;
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    if (!answer) return null;
    const res = await answer;
    await Promise.all(waits);
    // Let the fire-and-forget cache writes land.
    await new Promise((r) => setTimeout(r, 0));
    return res;
  }

  async function lifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  return { store, net, listeners, get, lifecycle, open };
}

describe.each([
  { origin: "https://adaptive-fitness-af8bb.firebaseapp.com", base: "/" },
  { origin: "https://adaptive-fitness-af8bb.web.app", base: "/" },
  { origin: "https://troposfit.com", base: "/" },
  { origin: "https://lemmonchess333.github.io", base: "/Maiin/" },
  { origin: ORIGIN, base: BASE },
])("offline app at $origin$base", ({ origin, base }) => {
  it("keeps a visited shell and hashed asset available after going offline", async () => {
    const sw = worker(undefined, { origin, base });
    const asset = `${base}assets/index-abc123.js`;
    sw.net.pages.set(new URL(`${base}food`, origin).href, page("<app>"));
    sw.net.pages.set(new URL(asset, origin).href, response("app javascript"));
    await sw.get(`${base}food`, "navigate");
    await sw.get(asset);

    sw.net.online = false;
    expect((await sw.get(`${base}program`, "navigate"))?.body).toBe("<app>");
    expect((await sw.get(asset))?.body).toBe("app javascript");
    expect(sw.net.fetched.filter((url) => url.endsWith(asset))).toHaveLength(1);
  });

  it("leaves Firebase API traffic and reserved Hosting helpers uncached", async () => {
    const sw = worker(undefined, { origin, base });
    for (const url of [
      "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel",
      "https://firebasestorage.googleapis.com/v0/b/bucket/o/photo.jpg",
      "https://adaptive-fitness-af8bb.firebaseio.com/data.json",
      `${origin}/__/auth/handler?code=private-code`,
      `${origin}/__/firebase/init.json`,
    ]) {
      expect(await sw.get(url), url).toBeNull();
    }
    expect(sw.net.fetched).toEqual([]);
  });
});

describe("public/sw.js caching (executed)", () => {
  it("serves a hashed font from the cache without fetching it again", async () => {
    const sw = worker();
    const font = `${BASE}assets/archivo-latin-abc12345.woff2`;
    await (await sw.open("any")).put(font, response("font bytes"));

    const res = await sw.get(font);
    expect(res?.body).toBe("font bytes");
    expect(sw.net.fetched).toEqual([]);
  });

  it("still revalidates an image that is not a hashed asset (the anchor)", async () => {
    const sw = worker();
    const icon = `${BASE}icons/icon-192x192.png`;
    await (await sw.open("any")).put(icon, response("old icon"));

    await sw.get(icon);
    expect(sw.net.fetched).toEqual([new URL(icon, ORIGIN).href]);
  });

  it("leaves map styles, tile data and glyphs to the browser", async () => {
    const sw = worker();
    for (const path of [
      "/styles/positron",
      "/planet/20261015_001001_pt/12/2047/1362.pbf",
      "/fonts/Noto%20Sans%20Regular/0-255.pbf",
      "/sprites/ofm_f384/ofm@2x.png",
    ]) {
      expect(await sw.get(BASEMAP_ORIGIN + path), path).toBeNull();
    }
    // Its own routes it still takes.
    expect(await sw.get(`${BASE}food`, "navigate")).not.toBeNull();
  });

  it("still keeps the exercise library for offline use (the anchor)", async () => {
    const sw = worker();
    const library =
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
    sw.net.pages.set(library, response("[exercises]", 200, "text/plain"));
    await sw.get(library, "cors");

    sw.net.online = false;
    expect((await sw.get(library, "cors"))?.body).toBe("[exercises]");
  });

  it("opens an offline deep link from a shell kept by any visit online", async () => {
    const sw = worker();
    // No install has run, as after something cleared every cache.
    sw.net.pages.set(new URL(`${BASE}food`, ORIGIN).href, page("<app>"));
    await sw.get(`${BASE}food`, "navigate");

    sw.net.online = false;
    const shell = await sw.get(`${BASE}program`, "navigate");
    expect(shell?.body).toBe("<app>");
  });

  it("keeps a route as the shell, not once per route visited", async () => {
    const sw = worker();
    await sw.lifecycle("install");
    const before = [...sw.store.values()][0].size;
    for (const route of ["food", "program", "user/a", "user/b", "run/1"]) {
      const url = new URL(`${BASE}${route}`, ORIGIN).href;
      sw.net.pages.set(url, page(`<app ${route}>`));
      await sw.get(`${BASE}${route}`, "navigate");
    }
    const [entries] = [...sw.store.values()];
    expect(entries.size).toBe(before);
    expect(entries.get(new URL(`${BASE}index.html`, ORIGIN).href)?.body).toBe(
      "<app run/1>"
    );
  });

  it("does not keep a legal page as the shell", async () => {
    const sw = worker();
    sw.net.pages.set(
      new URL(`${BASE}legal/privacy.html`, ORIGIN).href,
      page("<legal>")
    );
    await sw.get(`${BASE}legal/privacy.html`, "navigate");
    sw.net.online = false;
    expect((await sw.get(`${BASE}program`, "navigate"))?.body).not.toBe(
      "<legal>"
    );
    // The page itself is still there offline, under its own address.
    expect((await sw.get(`${BASE}legal/privacy.html`, "navigate"))?.body).toBe(
      "<legal>"
    );
  });

  it("names its cache by the build, so a deploy's activate removes the last one's", async () => {
    const before = worker("build-a");
    await before.lifecycle("install");
    const [oldName] = [...before.store.keys()];
    expect(oldName).toContain("build-a");

    const after = worker("build-b");
    // The browser's cache storage outlives the worker.
    for (const [name, entries] of before.store) after.store.set(name, entries);
    after.store.set("tropos-v13", new Map());
    await after.lifecycle("install");
    await after.lifecycle("activate");
    const names = [...after.store.keys()];
    expect(names.some((n) => n.includes("build-b"))).toBe(true);
    expect(names).not.toContain(oldName);
    expect(names).not.toContain("tropos-v13");
  });

  it("listens for no messages", () => {
    expect(worker().listeners.has("message")).toBe(false);
  });
});

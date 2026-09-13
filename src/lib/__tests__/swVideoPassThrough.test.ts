/**
 * The service worker leaves video to the browser.
 *
 * A <video> element fetches with a Range header and expects 206 back.
 * Every caching branch in sw.js answers from `cache.match`, which hands
 * a stored 200 body to a Range request — the exact response Safari
 * refuses to play. So a request for a recording under the app's own
 * origin must reach the browser's network stack untouched: no
 * respondWith, no fetch by the worker, nothing stored.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8"
);

function worker(base: string) {
  const listeners = new Map<string, (event: unknown) => void>();
  const network = vi.fn(async () => new Response("bytes"));
  const put = vi.fn();
  const caches = {
    open: async () => ({
      match: async () => undefined,
      put,
      delete: async () => true,
      keys: async () => [],
    }),
    match: async () => undefined,
  };
  runInNewContext(source, {
    self: {
      location: new URL(`${base}sw.js`),
      addEventListener: (type: string, callback: (event: unknown) => void) =>
        listeners.set(type, callback),
    },
    URL,
    Request,
    Response,
    Headers,
    caches,
    fetch: network,
    console,
  });
  return (path: string) => {
    const respondWith = vi.fn();
    listeners.get("fetch")!({
      request: new Request(new URL(path, base), {
        headers: { Range: "bytes=0-1" },
      }),
      waitUntil: vi.fn(),
      respondWith,
    });
    return { respondWith, network, put };
  };
}

describe("sw.js — video pass-through", () => {
  it.each([
    ["the product domain", "https://troposfit.com/"],
    ["GitHub Pages base path", "https://example.com/Maiin/"],
  ])("on %s, an MP4 and a WebM are not intercepted", (_, base) => {
    const request = worker(base);
    for (const path of ["pro-demo/scan.mp4", "pro-demo/scan.webm"]) {
      const { respondWith, network, put } = request(path);
      expect(respondWith, path).not.toHaveBeenCalled();
      expect(network, path).not.toHaveBeenCalled();
      expect(put, path).not.toHaveBeenCalled();
    }
  });

  it("a same-origin image is still intercepted — the branch is video-only", () => {
    const { respondWith } = worker("https://troposfit.com/")(
      "badges/early-bird.webp"
    );
    expect(respondWith).toHaveBeenCalledTimes(1);
  });
});

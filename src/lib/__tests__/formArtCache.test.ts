import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8"
);
const picture = (bytes = 100) =>
  new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/webp" },
  });
function worker(
  base = "https://tropos.firebaseapp.com/",
  quotaFailure = false
) {
  const stores = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, (event: unknown) => void>();
  const network = vi.fn(async () => picture());
  const caches = {
    open: async (name: string) => {
      if (quotaFailure) throw new Error("Quota exceeded");
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name)!;
      return {
        match: async (request: Request) => entries.get(request.url)?.clone(),
        put: async (request: Request, response: Response) => {
          entries.set(request.url, response.clone());
        },
        delete: async (request: Request) => entries.delete(request.url),
        keys: async () => [...entries.keys()].map((url) => new Request(url)),
      };
    },
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
  const request = async (path: string, method = "GET") => {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: new Request(new URL(path, base), { method }),
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    });
    const result = await response;
    await Promise.all(pending);
    return result;
  };
  const art = () =>
    [...stores].filter(([key]) => key.includes("-form-art-"))[0]?.[1] ??
    new Map<string, Response>();
  return { network, request, art };
}
describe("bounded public form-art cache", () => {
  it("handles Firebase Hosting and serves viewed images offline", async () => {
    const sw = worker();
    expect((await sw.request("form-frames/squat/1.webp"))?.status).toBe(200);
    sw.network.mockRejectedValue(new Error("offline"));
    expect((await sw.request("form-frames/squat/1.webp"))?.status).toBe(200);
    expect(sw.network).toHaveBeenCalledTimes(1);
    expect(sw.network).toHaveBeenCalledWith(expect.any(Request), {
      cache: "no-cache",
    });
  });
  it("supports a Pages base path and excludes APIs and writes", async () => {
    const sw = worker("https://example.com/Maiin/");
    await sw.request("form-frames/squat/1.webp");
    expect(sw.art().size).toBe(1);
    expect(
      await sw.request("https://firestore.googleapis.com/v1/projects/test")
    ).toBeUndefined();
    expect(
      await sw.request("form-frames/squat/1.webp", "POST")
    ).toBeUndefined();
    expect(sw.network).toHaveBeenCalledTimes(1);
  });
  it("serializes concurrent writes and evicts oldest files above 48", async () => {
    const sw = worker();
    await Promise.all(
      Array.from({ length: 55 }, (_, i) =>
        sw.request(`form-frames/test/${i}.webp`)
      )
    );
    expect(sw.art().size).toBe(48);
    expect(
      sw.art().has("https://tropos.firebaseapp.com/form-frames/test/0.webp")
    ).toBe(false);
  });
  it("also enforces the 24 MiB byte limit", async () => {
    const sw = worker();
    sw.network.mockImplementation(async () => picture(2 * 1024 * 1024));
    await Promise.all(
      Array.from({ length: 14 }, (_, i) =>
        sw.request(`form-frames/test/${i}.webp`)
      )
    );
    expect(sw.art().size).toBe(12);
    expect(
      [...sw.art().values()].reduce(
        (total, response) =>
          total + Number(response.headers.get("x-tropos-art-bytes")),
        0
      )
    ).toBe(24 * 1024 * 1024);
  });
  it("rejects oversized files, HTML fallback responses and missing images", async () => {
    const sw = worker();
    sw.network
      .mockResolvedValueOnce(picture(2 * 1024 * 1024 + 1))
      .mockResolvedValueOnce(
        new Response("<html>app shell</html>", {
          headers: { "content-type": "text/html" },
        })
      )
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    for (let i = 0; i < 3; i++) await sw.request(`form-frames/test/${i}.webp`);
    expect(sw.art().size).toBe(0);
  });
  it("does not lose a successful image when storage is unavailable", async () => {
    const sw = worker(undefined, true);
    expect((await sw.request("form-frames/test/1.webp"))?.status).toBe(200);
  });
});

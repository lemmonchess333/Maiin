import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";

/**
 * Static contract for both public service workers (packet 17). A notification
 * tap must never be dropped while Firebase Messaging loads, so the
 * `notificationclick` listener MUST be installed before the first
 * `firebase-messaging-compat.js` import in each worker. The canonical worker
 * must carry the FCM background handler; the legacy worker must remain hosted
 * during the migration window.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const swPath = resolve(repoRoot, "public/sw.js");
const legacyPath = resolve(repoRoot, "public/firebase-messaging-sw.js");

function assertClickBeforeMessagingImport(source: string, label: string) {
  const clickIdx = source.indexOf("notificationclick");
  const importIdx = source.indexOf("firebase-messaging-compat.js");
  expect(
    clickIdx,
    `${label}: notificationclick listener missing`
  ).toBeGreaterThanOrEqual(0);
  expect(
    importIdx,
    `${label}: firebase-messaging import missing`
  ).toBeGreaterThanOrEqual(0);
  expect(
    clickIdx,
    `${label}: notificationclick must precede the messaging import`
  ).toBeLessThan(importIdx);
}

describe("service-worker file contract", () => {
  it("public/sw.js installs notificationclick before importing FCM messaging", () => {
    assertClickBeforeMessagingImport(readFileSync(swPath, "utf8"), "sw.js");
  });

  it("public/sw.js carries the FCM background handler", () => {
    expect(readFileSync(swPath, "utf8")).toContain("onBackgroundMessage");
  });

  it("public/firebase-messaging-sw.js is retained and correctly ordered", () => {
    expect(existsSync(legacyPath)).toBe(true);
    assertClickBeforeMessagingImport(
      readFileSync(legacyPath, "utf8"),
      "firebase-messaging-sw.js"
    );
  });
});

/**
 * Behavioural contract for the fetch handler's skip-list, pinned by
 * EXECUTING sw.js (node:vm, stubbed SW globals) and dispatching
 * synthetic fetch events at the captured listener — not by grepping the
 * source. The load-bearing case: Firebase EMULATOR origins must never
 * be intercepted. The network-first branch cache.put()s a clone of the
 * response, which never resolves for a Firestore WebChannel long-poll
 * (an infinite stream) — each intercepted long-poll permanently pinned
 * one connection until Chrome's 6-per-origin pool was exhausted and
 * every later emulator request hung (found by the two-account
 * offline-queue E2E, the first spec to drive one browser context
 * through enough page sessions to drain the pool).
 */
describe("sw.js fetch handler skip-list (executed)", () => {
  /** Evaluate sw.js as if served from `swUrl`, returning the captured
   *  fetch listener. The FCM importScripts block self-gates on config
   *  query params, so a bare URL skips it. */
  function loadFetchHandler(swUrl: string): (event: unknown) => void {
    const listeners = new Map<string, (event: unknown) => void>();
    const sandbox = {
      self: {
        location: new URL(swUrl),
        addEventListener: (type: string, fn: (event: unknown) => void) =>
          listeners.set(type, fn),
      },
      URL,
      console,
      importScripts: () => {
        throw new Error("importScripts must not run without FCM config");
      },
      // The caching strategies construct their promise chains
      // synchronously inside respondWith(...) — give them inert,
      // resolvable stubs so intercepted requests don't throw.
      caches: {
        match: async () => undefined,
        open: async () => ({
          match: async () => undefined,
          put: async () => undefined,
          keys: async () => [],
        }),
      },
      fetch: async () => ({ status: 200, clone: () => ({}) }),
    };
    runInNewContext(readFileSync(swPath, "utf8"), sandbox);
    const handler = listeners.get("fetch");
    if (!handler) throw new Error("sw.js registered no fetch listener");
    return handler;
  }

  /** Dispatch one synthetic fetch event; returns whether the handler
   *  claimed it via respondWith (skipped requests go direct). */
  function intercepts(
    handler: (event: unknown) => void,
    method: string,
    url: string
  ): boolean {
    let claimed = false;
    handler({
      request: { method, url, mode: "no-cors" },
      respondWith: (p: Promise<unknown>) => {
        claimed = true;
        // Swallow the strategy promise — the stubs below make it
        // resolvable, and an unhandled rejection would fail the run.
        void Promise.resolve(p).catch(() => {});
      },
    });
    return claimed;
  }

  const handler = loadFetchHandler("http://localhost:4173/Maiin/sw.js");

  it("never intercepts Firebase emulator origins (loopback, non-app origin)", () => {
    expect(
      intercepts(
        handler,
        "GET",
        "http://127.0.0.1:8080/google.firestore.v1.Firestore/Listen/channel?VER=8"
      )
    ).toBe(false);
    expect(
      intercepts(
        handler,
        "GET",
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup"
      )
    ).toBe(false);
    expect(
      intercepts(handler, "GET", "http://localhost:9199/v0/b/bucket/o/x")
    ).toBe(false);
  });

  it("never intercepts production Firebase hosts or non-GET requests", () => {
    expect(
      intercepts(
        handler,
        "GET",
        "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel"
      )
    ).toBe(false);
    expect(
      intercepts(handler, "POST", "http://localhost:4173/Maiin/anything")
    ).toBe(false);
  });

  it("still serves the app's own origin, even when that origin is localhost", () => {
    // The emulator skip is scoped to NON-app loopback origins — the dev
    // and preview servers are localhost too, and the SW must keep
    // handling their asset/navigation requests.
    expect(
      intercepts(
        handler,
        "GET",
        "http://localhost:4173/Maiin/assets/index-abc123.js"
      )
    ).toBe(true);
  });
});

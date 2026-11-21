/**
 * The Hosting build is the website, not the app (App1 Q52): its
 * index.html is website.html, it ships only the website's public files and
 * the worker that retires the app's, and a Pages or iPhone build is
 * untouched.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import {
  RETIRED_WORKER_PATHS,
  RETIRED_WORKER_SOURCE,
  WEBSITE_HTML,
  WEBSITE_OUTPUT,
  websiteEntryPlugin,
  WEBSITE_PUBLIC_ART,
  websitePublicFiles,
} from "./websiteEntry";

type Bundle = Record<
  string,
  { type: "asset" | "chunk"; fileName: string; source?: string }
>;

const ROOT = process.cwd();

function callConfig(plugin: Plugin, env?: { isSsrBuild?: boolean }) {
  const hook = plugin.config as
    ((config: unknown, env?: { isSsrBuild?: boolean }) => unknown) | undefined;
  return hook?.({}, env);
}

function generate(plugin: Plugin, bundle: Bundle) {
  const emitFile = vi.fn();
  const error = vi.fn((message: string) => {
    throw new Error(message);
  });
  const hook = plugin.generateBundle as (
    this: unknown,
    options: unknown,
    bundle: Bundle
  ) => void;
  hook.call({ emitFile, error }, {}, bundle);
  return emitFile;
}

function websiteBundle(): Bundle {
  return {
    [WEBSITE_HTML]: {
      type: "asset",
      fileName: WEBSITE_HTML,
      source: "<html>website</html>",
    },
    "assets/website-abc.js": {
      type: "chunk",
      fileName: "assets/website-abc.js",
    },
  };
}

describe("websiteEntryPlugin", () => {
  it("builds website.html alone on Hosting, without the app's public folder", () => {
    expect(callConfig(websiteEntryPlugin("/repo", true))).toEqual({
      build: {
        copyPublicDir: false,
        rolldownOptions: { input: { website: `/repo/${WEBSITE_HTML}` } },
      },
    });
  });

  it("writes the page out as index.html, with the website's public files and the retiring worker", () => {
    const bundle = websiteBundle();
    const emitFile = generate(websiteEntryPlugin(ROOT, true), bundle);
    expect(bundle[WEBSITE_HTML]).toBeUndefined();
    const emitted = new Map(
      emitFile.mock.calls.map(([file]) => [file.fileName, file.source])
    );
    expect(emitted.get(WEBSITE_OUTPUT)).toBe("<html>website</html>");
    for (const file of [
      "icons/icon.svg",
      "icons/icon-192x192.png",
      "icons/icon-512x512.png",
      "legal/privacy.html",
      "legal/terms.html",
      "legal/support.html",
    ]) {
      expect(emitted.has(file), file).toBe(true);
    }
    const worker = readFileSync(RETIRED_WORKER_SOURCE, "utf8");
    for (const path of RETIRED_WORKER_PATHS) {
      expect(emitted.get(path), path).toBe(worker);
    }
    // The app's own files stay with the app: of its picture folders, only
    // the few drawings the website's pages draw (`WEBSITE_PUBLIC_ART`).
    const art = new Set<string>(WEBSITE_PUBLIC_ART);
    for (const name of emitted.keys()) {
      if (art.has(name)) continue;
      expect(name).not.toMatch(
        /^(form-frames|form-art|badges|medals|run-form|food-art)\/|^(init\.js|404\.html|manifest\.json|vite\.svg)$/
      );
    }
    expect(WEBSITE_PUBLIC_ART.length).toBeLessThan(30);
    expect([...emitted.keys()].sort()).toEqual(
      [
        WEBSITE_OUTPUT,
        ...websitePublicFiles(`${ROOT}/public`),
        ...RETIRED_WORKER_PATHS,
      ].sort()
    );
  });

  it("fails a Hosting build that made no website page, or an app page beside it", () => {
    const plugin = websiteEntryPlugin(ROOT, true);
    expect(() => generate(plugin, {})).toThrow(/no website.html/);
    expect(() =>
      generate(plugin, {
        [WEBSITE_HTML]: { type: "asset", fileName: WEBSITE_HTML, source: "" },
        [WEBSITE_OUTPUT]: { type: "asset", fileName: WEBSITE_OUTPUT },
      })
    ).toThrow(/app index.html/);
  });

  it("leaves the Pages and iPhone builds alone", () => {
    const plugin = websiteEntryPlugin(ROOT, false);
    expect(callConfig(plugin)).toBeUndefined();
    const bundle: Bundle = {
      [WEBSITE_OUTPUT]: { type: "asset", fileName: WEBSITE_OUTPUT },
    };
    const emitFile = generate(plugin, bundle);
    expect(emitFile).not.toHaveBeenCalled();
    expect(Object.keys(bundle)).toEqual([WEBSITE_OUTPUT]);
  });

  it("leaves the server build that draws each page alone (prerender.ts)", () => {
    const plugin = websiteEntryPlugin("/repo", true);
    expect(callConfig(plugin, { isSsrBuild: true })).toBeUndefined();
    const emitFile = generate(plugin, {});
    expect(emitFile).not.toHaveBeenCalled();
  });

  it("is on for the Hosting build only, as the association file is", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain(
      "websiteEntryPlugin(import.meta.dirname, isFirebaseHosting && !isCapacitor)"
    );
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["build:hosting"]).toContain("HOSTING_TARGET=firebase");
    expect(pkg.scripts.build).not.toContain("HOSTING_TARGET");
    const workflow = readFileSync(
      ".github/workflows/deploy-hosting.yml",
      "utf8"
    );
    expect(workflow).toContain("npm run build:hosting");
  });

  it("loads the website's entry, never the app's", () => {
    const html = readFileSync(WEBSITE_HTML, "utf8");
    expect(html).toContain('src="/src/website/main.tsx"');
    expect(html).not.toContain("/src/main.tsx");
  });
});

describe("the retiring service worker", () => {
  /** Runs the worker's script against a stand-in for a worker's scope. */
  function runWorker() {
    const listeners = new Map<string, (event: unknown) => void>();
    const deleted: string[] = [];
    const scope = {
      addEventListener: (type: string, fn: (event: unknown) => void) =>
        listeners.set(type, fn),
      skipWaiting: vi.fn(),
      registration: { unregister: vi.fn(async () => true) },
    };
    const caches = {
      keys: async () => ["tropos-v14-abc", "tropos-v14-abc-form-art-abc"],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    };
    new Function("self", "caches", readFileSync(RETIRED_WORKER_SOURCE, "utf8"))(
      scope,
      caches
    );
    return { listeners, deleted, scope };
  }

  it("takes over at once, clears every cache and unregisters", async () => {
    const { listeners, deleted, scope } = runWorker();
    listeners.get("install")?.({});
    expect(scope.skipWaiting).toHaveBeenCalled();
    let done: Promise<unknown> = Promise.resolve();
    listeners.get("activate")?.({
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    });
    await done;
    expect(deleted).toEqual(["tropos-v14-abc", "tropos-v14-abc-form-art-abc"]);
    expect(scope.registration.unregister).toHaveBeenCalled();
  });

  it("answers no request and shows no push", () => {
    const { listeners } = runWorker();
    expect([...listeners.keys()].sort()).toEqual(["activate", "install"]);
  });
});

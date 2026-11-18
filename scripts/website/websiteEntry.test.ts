/**
 * The Hosting build is the website, not the app (App1 Q52): its
 * index.html is website.html, and a Pages or iPhone build is untouched.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import {
  WEBSITE_HTML,
  WEBSITE_OUTPUT,
  websiteEntryPlugin,
} from "./websiteEntry";

type Bundle = Record<
  string,
  { type: "asset" | "chunk"; fileName: string; source?: string }
>;

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

describe("websiteEntryPlugin", () => {
  it("builds website.html alone on Hosting, and writes it out as index.html", () => {
    const plugin = websiteEntryPlugin("/repo", true);
    expect(callConfig(plugin)).toEqual({
      build: {
        rolldownOptions: { input: { website: `/repo/${WEBSITE_HTML}` } },
      },
    });
    const bundle: Bundle = {
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
    const emitFile = generate(plugin, bundle);
    expect(bundle[WEBSITE_HTML]).toBeUndefined();
    expect(emitFile).toHaveBeenCalledWith({
      type: "asset",
      fileName: WEBSITE_OUTPUT,
      source: "<html>website</html>",
    });
  });

  it("fails a Hosting build that made no website page, or an app page beside it", () => {
    const plugin = websiteEntryPlugin("/repo", true);
    expect(() => generate(plugin, {})).toThrow(/no website.html/);
    expect(() =>
      generate(plugin, {
        [WEBSITE_HTML]: { type: "asset", fileName: WEBSITE_HTML, source: "" },
        [WEBSITE_OUTPUT]: { type: "asset", fileName: WEBSITE_OUTPUT },
      })
    ).toThrow(/app index.html/);
  });

  it("leaves the Pages and iPhone builds alone", () => {
    const plugin = websiteEntryPlugin("/repo", false);
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

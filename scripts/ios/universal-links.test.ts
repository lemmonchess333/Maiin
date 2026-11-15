import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ASSOCIATION_PATHS,
  appleAppSiteAssociation,
  universalLinksPlugin,
} from "./universal-links";

describe("iPhone invite association", () => {
  it("names only the verified app, root invite URLs, shared posts and shared Spaces", () => {
    expect(appleAppSiteAssociation("A2B3C4D5E6")).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["A2B3C4D5E6.com.tropos.app"],
            components: [
              {
                "/": "/",
                "?": { invite: "????????" },
                comment: expect.any(String),
              },
              // A shared post (App1 Q51): the app's own /activity/:id.
              { "/": "/activity/*", comment: expect.any(String) },
              // A shared Space (Run27 call 11): the app's own /space/:id.
              { "/": "/space/*", comment: expect.any(String) },
            ],
          },
        ],
      },
    });
  });
  it.each([
    "",
    "TEAM_ID",
    "a2b3c4d5e6",
    " A2B3C4D5E6",
    "A2B3C4D5E6.com.tropos.app",
    "../secret",
  ])("rejects invalid prefix %s", (prefix) => {
    expect(() => appleAppSiteAssociation(prefix)).toThrow("IOS_APP_ID_PREFIX");
  });
  it("keeps entitlement and Hosting response consistent without exposing all web routes", () => {
    const entitlement = readFileSync("ios/App/App/App.entitlements", "utf8");
    expect(entitlement).toContain("<string>applinks:troposfit.com</string>");
    expect(entitlement).not.toContain("applinks:*");
    const hosting = JSON.parse(readFileSync("firebase.json", "utf8")).hosting;
    // Both addresses the file is served at, the .well-known one being the
    // one Apple's CDN reads first.
    for (const path of ASSOCIATION_PATHS) {
      expect(
        hosting.headers.find(
          (rule: { source: string }) => rule.source === `/${path}`
        )?.headers,
        path
      ).toContainEqual({ key: "Content-Type", value: "application/json" });
    }
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain("isFirebaseHosting && !isCapacitor");
  });
});

function emit(prefix: string | undefined, hosting: boolean) {
  const plugin = universalLinksPlugin(prefix, hosting);
  const emitFile = vi.fn();
  const hook = plugin.generateBundle;
  if (typeof hook !== "function")
    throw new Error("Expected a generateBundle hook");
  Reflect.apply(hook, { emitFile }, []);
  return emitFile;
}

/** The two files a configured Hosting build emits for a prefix: the same
 *  association at `.well-known/`, which Apple's CDN reads first, and at the
 *  root. */
function emitted(prefix: string) {
  const source = JSON.stringify(appleAppSiteAssociation(prefix));
  return [
    [
      {
        type: "asset",
        fileName: ".well-known/apple-app-site-association",
        source,
      },
    ],
    [{ type: "asset", fileName: "apple-app-site-association", source }],
  ];
}

it("emits a real JSON association only for a configured Hosting build", () => {
  expect(emit("A2B3C4D5E6", true).mock.calls).toEqual(emitted("A2B3C4D5E6"));
});
it.each([
  [undefined, true],
  ["", true],
  ["A2B3C4D5E6", false],
] as const)(
  "emits no placeholder for prefix %s, Hosting %s",
  (prefix, hosting) => {
    expect(emit(prefix, hosting)).not.toHaveBeenCalled();
  }
);
it("reads the prefix as the iPhone build reads the secret, whitespace stripped", () => {
  expect(emit(" A2B3C4D5E6\n", true).mock.calls).toEqual(
    emitted("A2B3C4D5E6")
  );
  expect(emit(" \n", true)).not.toHaveBeenCalled();
});
it("fails a configured Hosting build rather than emit an invalid association", () => {
  expect(() => emit("NOT_A_PREFIX", true)).toThrow("IOS_APP_ID_PREFIX");
});

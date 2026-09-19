import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * One StoreKit implementation, not two.
 *
 * `npx cap sync ios` wires every plugin in `package.json` into the native
 * project, so on this platform the dependency IS the wiring — there is no
 * separate step where somebody decides a plugin should ship. For a long
 * time that meant `Package.swift` listed both `RevenuecatPurchasesCapacitor`
 * and `CordovaPluginPurchase`, and the binary carried two StoreKit
 * observers. Whichever one finishes a transaction first wins; the other's
 * bookkeeping is then wrong, and nothing surfaces that.
 *
 * It was invisible from the JavaScript side, which is why this guard is a
 * file read rather than a type. `cordova-plugin-purchase` was never
 * imported — `purchaseProvider.ts` reached it through a `window.CdvPurchase`
 * global — so no import graph, no bundler, and no typechecker could see the
 * second implementation. Only `package.json` could.
 *
 * ADR-0006 settles which one stays. This stops the other coming back as a
 * one-line install nobody reads twice.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const pkg = JSON.parse(
  readFileSync(resolve(repoRoot, "package.json"), "utf8")
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

/** Anything that talks to StoreKit and would be synced into the shell. */
const RIVAL_PURCHASE_PLUGINS = [
  "cordova-plugin-purchase",
  "@capacitor-community/in-app-purchases",
  "cordova-plugin-inapppurchase",
  "@awesome-cordova-plugins/in-app-purchase-2",
];

describe("one StoreKit path", () => {
  it("has RevenueCat as a dependency", () => {
    /* The absence assertion. Every other case here passes on a
       package.json that lost its purchase plugin entirely, or on a read
       that silently returned an empty object — states in which this suite
       would report a clean single path over an app that cannot sell
       anything. */
    expect(allDeps["@revenuecat/purchases-capacitor"]).toBeTruthy();
  });

  it("has no rival purchase plugin alongside it", () => {
    const found = RIVAL_PURCHASE_PLUGINS.filter((name) => name in allDeps);
    expect(
      found,
      `These ship a second StoreKit observer into the same binary:\n  ${found.join("\n  ")}\n\n` +
        `cap sync wires every package.json plugin into the native project, ` +
        `so adding one is enough — no import required, and nothing in the ` +
        `JS build can see it. If one of these is genuinely needed, retire ` +
        `RevenueCat in the same change and update ADR-0006.`
    ).toEqual([]);
  });

  it("leaves no code reaching for the removed plugin's global", () => {
    /* `window.CdvPurchase` was how the old path found the store. A
       reference surviving the dependency removal would be a branch that
       can only ever take its failure case, dressed as a fallback. */
    const provider = readFileSync(
      resolve(repoRoot, "src/lib/purchaseProvider.ts"),
      "utf8"
    );
    expect(provider).not.toMatch(/CdvPurchase/);
  });
});

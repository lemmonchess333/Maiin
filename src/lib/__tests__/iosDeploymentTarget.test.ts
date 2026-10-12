import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The iOS app needs iOS 15.4 or later, and every build setting says so.
 *
 * The app is a web page in WKWebView, so its iOS version is its Safari
 * version. Tailwind v4 puts almost the whole stylesheet inside `@layer`
 * blocks (about 113 KB of 137 KB, measured on the 2026-10-06 build), and
 * Safari learned `@layer` in 15.4: before it, the blocks are dropped
 * whole and the app opens unstyled. The newer features the build uses
 * carry their own fallbacks (`color-mix()` behind `@supports`,
 * `@property` behind Tailwind's properties block, container queries
 * written wide-first, see containerQueryFallback.test.ts), so 15.4 is the
 * floor, not 16.
 *
 * Nothing is stranded: every iPhone that runs iOS 15 can update to 15.8.
 * Raising the floor to 16 would drop the iPhone 6s, 7 and first SE, which
 * end at iOS 15.
 *
 * Lowering this needs a stylesheet that works without `@layer`; raising
 * it needs a reason the devices it drops are worth.
 */
const pbxproj = readFileSync(
  resolve(__dirname, "../../../ios/App/App.xcodeproj/project.pbxproj"),
  "utf8"
);

describe("iOS deployment target", () => {
  const targets = [
    ...pbxproj.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g),
  ].map((m) => m[1]);

  it("finds the build configurations it pins", () => {
    // Debug and Release, for the project and for the App target.
    expect(targets.length).toBeGreaterThanOrEqual(4);
  });

  it("is 15.4 in every build configuration", () => {
    expect(new Set(targets)).toEqual(new Set(["15.4"]));
  });
});

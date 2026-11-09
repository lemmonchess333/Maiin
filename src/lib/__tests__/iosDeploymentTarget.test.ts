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

/** The Live Activity widget is gated on 16.2 (Polish2 call 1), the
 *  plugin's floor: on an older iOS the system never loads it, and the app
 *  itself still runs from 15.4. */
const WIDGET_TARGET = "16.2";

/** The widget extension's configuration ids: the only ones that differ. */
const widgetConfigIds = [
  ...(pbxproj
    .match(
      /\/\* Build configuration list for PBXNativeTarget "LiveActivitiesExtension" \*\/ = \{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);/
    )?.[1]
    .matchAll(/([0-9A-F]{24}) \/\*/g) ?? []),
].map((m) => m[1]);

describe("iOS deployment target", () => {
  /** Each configuration that sets a target: its id and the version. */
  const targets = [
    ...pbxproj.matchAll(
      /^\t\t([0-9A-F]{24}) \/\*[^\n]*\*\/ = \{\n\t\t\tisa = XCBuildConfiguration;\n\t\t\t(?:baseConfigurationReference[^\n]*\n\t\t\t)?buildSettings = \{\n(?:\t\t\t\t[^\n]*\n)*?\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/gm
    ),
  ].map((m) => ({ id: m[1], target: m[2] }));

  it("finds the build configurations it pins", () => {
    // Debug and Release, for the project, the App target and the widget.
    expect(targets.length).toBe(
      pbxproj.match(/IPHONEOS_DEPLOYMENT_TARGET = /g)?.length
    );
    expect(targets.length).toBeGreaterThanOrEqual(6);
    expect(widgetConfigIds).toHaveLength(2);
  });

  it("is 15.4 in every build configuration but the widget's", () => {
    const app = targets.filter((t) => !widgetConfigIds.includes(t.id));
    expect(app.length).toBeGreaterThanOrEqual(4);
    expect(new Set(app.map((t) => t.target))).toEqual(new Set(["15.4"]));
    expect(
      targets.filter((t) => widgetConfigIds.includes(t.id)).map((t) => t.target)
    ).toEqual([WIDGET_TARGET, WIDGET_TARGET]);
  });

  it("is the app's 15.4 that `cap sync` reads", () => {
    // The Capacitor CLI writes CapApp-SPM's platform from the FIRST
    // IPHONEOS_DEPLOYMENT_TARGET in the file (getMajoriOSVersion). Were
    // the widget's first, every plugin package would ask for iOS 16 and
    // the 15.4 app would not build.
    expect(pbxproj.match(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/)?.[1]).toBe(
      "15.4"
    );
    expect(
      readFileSync(
        resolve(__dirname, "../../../ios/App/CapApp-SPM/Package.swift"),
        "utf8"
      )
    ).toContain("platforms: [.iOS(.v15)]");
  });
});

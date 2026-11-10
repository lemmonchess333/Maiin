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
 *
 * The one exception is the Live Activity widget, a native extension with
 * no web page in it: the plugin's widget needs iOS 16.2, so that is its
 * floor. It sets no floor for the app, which still opens on 15.4; before
 * 16.2 iOS simply never loads the widget (docs/run-live-activity.md).
 */
const pbxproj = readFileSync(
  resolve(__dirname, "../../../ios/App/App.xcodeproj/project.pbxproj"),
  "utf8"
);

/** The build configurations of one target, by its configuration list. */
function configurationsOf(target: string): string[] {
  const list = pbxproj.match(
    new RegExp(
      `/\\* Build configuration list for PBXNativeTarget "${target}" \\*/ = \\{[\\s\\S]*?buildConfigurations = \\(([\\s\\S]*?)\\);`
    )
  );
  return [...(list?.[1] ?? "").matchAll(/([0-9A-F]{24}) \/\*/g)].map((m) => {
    const config = pbxproj.match(
      new RegExp(`^\\s*${m[1]} /\\*[^\\n]*\\*/ = \\{([\\s\\S]*?)^\\s*\\};`, "m")
    );
    return config?.[1] ?? "";
  });
}

const deploymentTargets = (text: string) =>
  [...text.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map(
    (m) => m[1]
  );

describe("iOS deployment target", () => {
  const widget = configurationsOf("LiveActivitiesExtension");
  let rest = pbxproj;
  for (const config of widget) rest = rest.replace(config, "");
  const targets = deploymentTargets(rest);

  it("finds the build configurations it pins", () => {
    // Debug and Release, for the project and for the App target.
    expect(targets.length).toBeGreaterThanOrEqual(4);
    expect(widget).toHaveLength(2);
  });

  it("is 15.4 in every build configuration but the widget's", () => {
    expect(new Set(targets)).toEqual(new Set(["15.4"]));
  });

  it("is 16.2 for the Live Activity widget, which the plugin's widget needs", () => {
    expect(widget.map(deploymentTargets)).toEqual([["16.2"], ["16.2"]]);
  });
});

/**
 * The drawings a Live Activity shows (Wid2 call 1) are images the widget
 * extension holds, named by the app in each update. Nothing on the web or
 * in CI's simulator build draws the card, so what can be held here is the
 * chain a mistake breaks without a sound: the names the app can send are
 * in the catalog, the catalog is in the extension's bundle, and each image
 * is a size ActivityKit accepts.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LIVE_ACTIVITY_POSES,
  POSE_HEIGHT_PT,
  poseAssetName,
  poseAt,
  type LiveActivityArtId,
} from "@/lib/liveActivityArt";

const repoRoot = resolve(__dirname, "../../..");
const catalog = resolve(repoRoot, "ios/App/LiveActivities/Assets.xcassets");
const pbxproj = readFileSync(
  resolve(repoRoot, "ios/App/App.xcodeproj/project.pbxproj"),
  "utf8"
);

const ids = Object.keys(LIVE_ACTIVITY_POSES) as LiveActivityArtId[];
const names = ids.flatMap((id) =>
  LIVE_ACTIVITY_POSES[id].map((_, pose) => poseAssetName(id, pose))
);

/** A PNG's width and height, from its header. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("the Live Activity's drawings", () => {
  it("has every pose the app can name in the widget's catalog, and no other", () => {
    expect(names.length).toBeGreaterThanOrEqual(4);
    const sets = readdirSync(catalog)
      .filter((entry) => entry.endsWith(".imageset"))
      .map((entry) => entry.replace(/\.imageset$/, ""))
      .sort();
    expect(sets).toEqual([...names].sort());
  });

  it("draws each pose at 2x and 3x of one height, inside the card", () => {
    // ActivityKit refuses a card whose image is larger than the card: the
    // Lock Screen card is at most 160 pt tall, with 14 pt margins.
    expect(POSE_HEIGHT_PT + 2 * 14).toBeLessThanOrEqual(160);
    for (const name of names) {
      const dir = resolve(catalog, `${name}.imageset`);
      const contents = JSON.parse(
        readFileSync(resolve(dir, "Contents.json"), "utf8")
      ) as { images: { filename: string; scale: string }[] };
      expect(contents.images.map((image) => image.scale)).toEqual(["2x", "3x"]);
      for (const image of contents.images) {
        const scale = Number(image.scale.replace("x", ""));
        const size = pngSize(resolve(dir, image.filename));
        expect(size.height).toBe(POSE_HEIGHT_PT * scale);
        expect(size.width).toBeLessThan(size.height);
      }
    }
  });

  it("goes round a drawing's poses in order, from any step", () => {
    expect([0, 1, 2, 3, 4, 5].map((step) => poseAt("run-easy", step))).toEqual([
      "run-easy-pose-1",
      "run-easy-pose-2",
      "run-easy-pose-3",
      "run-easy-pose-4",
      "run-easy-pose-1",
      "run-easy-pose-2",
    ]);
    expect(poseAt("run-easy", -1)).toBe("run-easy-pose-4");
  });

  it("cuts its poses from a flipbook Home's hero already plays", () => {
    for (const id of ids) {
      const layout = JSON.parse(
        readFileSync(
          resolve(repoRoot, "docs/exercise-art/motion", id, "frames.json"),
          "utf8"
        )
      ) as { src: string; frames: number };
      expect(existsSync(resolve(repoRoot, "public", layout.src))).toBe(true);
      for (const frame of LIVE_ACTIVITY_POSES[id])
        expect(frame).toBeLessThan(layout.frames);
    }
  });

  it("bundles the catalog in the widget extension, where the plugin looks for a named image", () => {
    // `Image(name)` in the widget reads the extension's own bundle. A
    // catalog that is in the folder but not in the target's Resources
    // phase builds, ships, and draws nothing.
    const target = pbxproj.match(
      /\/\* LiveActivitiesExtension \*\/ = \{\s*isa = PBXNativeTarget;[\s\S]*?buildPhases = \(([\s\S]*?)\);/
    );
    expect(target).not.toBeNull();
    const phase = target![1].match(/([0-9A-F]{24}) \/\* Resources \*\//);
    expect(phase).not.toBeNull();
    const files = pbxproj.match(
      new RegExp(
        `${phase![1]} /\\* Resources \\*/ = \\{\\s*isa = PBXResourcesBuildPhase;[\\s\\S]*?files = \\(([\\s\\S]*?)\\);`
      )
    );
    expect(files).not.toBeNull();
    const buildFile = files![1].match(
      /([0-9A-F]{24}) \/\* Assets\.xcassets in Resources \*\//
    );
    expect(buildFile).not.toBeNull();
    const fileRef = pbxproj.match(
      new RegExp(
        `${buildFile![1]} /\\* Assets\\.xcassets in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ([0-9A-F]{24}) `
      )
    );
    expect(fileRef).not.toBeNull();
    // The reference is the LiveActivities group's own child, so its path
    // is ios/App/LiveActivities/Assets.xcassets, not the app's catalog.
    const group = pbxproj.match(
      /\/\* LiveActivities \*\/ = \{\s*isa = PBXGroup;\s*children = \(([\s\S]*?)\);/
    );
    expect(group).not.toBeNull();
    expect(group![1]).toContain(`${fileRef![1]} /* Assets.xcassets */`);
  });
});

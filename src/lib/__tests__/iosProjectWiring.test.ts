/**
 * The iOS project as COMMITTED is what `deploy-ios.yml` builds, and nothing
 * in this repo can compile it — no macOS runner, no Xcode. So the only
 * check that can run here is a read of the files themselves, and that read
 * found five certain failures in a scaffold that had never executed
 * (2026-09-19): it archived a workspace that does not exist; it shipped no
 * `GoogleService-Info.plist`, which the Firebase plugins abort without at
 * launch; its build number was pinned at 1, so the second upload would be
 * refused; the privacy manifest sat beside the project with no reference,
 * so it never shipped; and the Home steps sheet reached HealthKit with no
 * usage string, which the OS terminates the app for.
 *
 * Each pin below is one of those, stated as the property that holds it
 * closed. They read `project.pbxproj` by its own structure (PBXBuildFile →
 * PBXFileReference → path) rather than grepping for a filename, because a
 * file can be NAMED in the project and still not be copied — that is
 * exactly how the privacy manifest was lost.
 *
 * What this cannot tell you: whether the archive succeeds. The first run
 * of the workflow is still a bring-up; these keep it from failing for a
 * reason a reader could have seen.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

const pbxproj = read("ios/App/App.xcodeproj/project.pbxproj");
const workflow = read(".github/workflows/deploy-ios.yml");
const infoPlist = read("ios/App/App/Info.plist");
const iosIgnore = read("ios/.gitignore");
const pkg = JSON.parse(read("package.json")) as {
  dependencies: Record<string, string>;
};

const OBJECT_ID = /[0-9A-F]{24}/;

/** Paths the App target's Resources phase copies into the bundle. */
function bundledResourcePaths(): string[] {
  const phase = pbxproj.match(
    /isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/
  );
  if (!phase) throw new Error("no PBXResourcesBuildPhase in project.pbxproj");
  const buildFileIds = [
    ...phase[1].matchAll(new RegExp(`^\\s*(${OBJECT_ID.source}) /\\*`, "gm")),
  ].map((m) => m[1]);
  return buildFileIds.map((id) => {
    const buildFile = pbxproj.match(
      new RegExp(
        `^\\s*${id} /\\*[^\\n]*isa = PBXBuildFile; fileRef = (${OBJECT_ID.source})`,
        "m"
      )
    );
    if (!buildFile) throw new Error(`PBXBuildFile ${id} has no fileRef`);
    // A plain file is a one-line PBXFileReference with a path. A localised
    // storyboard is a multi-line PBXVariantGroup whose Base.lproj children
    // hold the paths; its own name is the bundle name.
    const fileRef = pbxproj.match(
      new RegExp(
        `^\\s*${buildFile[1]} /\\*[^\\n]*isa = PBXFileReference;[^\\n]*path = "?([^";]+)"?;`,
        "m"
      )
    );
    if (fileRef) return fileRef[1];
    const variantGroup = pbxproj.match(
      new RegExp(
        `^\\s*${buildFile[1]} /\\*[^\\n]*= \\{\\n\\s*isa = PBXVariantGroup;[\\s\\S]*?name = "?([^";]+)"?;`,
        "m"
      )
    );
    if (!variantGroup)
      throw new Error(`file reference ${buildFile[1]} missing`);
    return variantGroup[1];
  });
}

describe("iOS project wiring — what the TestFlight workflow would build", () => {
  const resources = bundledResourcePaths();

  it("resolves the Resources phase (so an absence below is a real absence)", () => {
    // Anchor: a parse that returned nothing would make every not-present
    // assertion vacuous. The asset catalogue has been in the phase since the
    // template was generated.
    expect(resources).toContain("Assets.xcassets");
    expect(resources.length).toBeGreaterThanOrEqual(6);
  });

  it("bundles the privacy manifest", () => {
    // The file was in ios/App/App/ with no PBXFileReference and no Resources
    // entry, so every archive shipped without it. Being in the folder is not
    // being in the app.
    expect(
      existsSync(resolve(repoRoot, "ios/App/App/PrivacyInfo.xcprivacy"))
    ).toBe(true);
    expect(resources).toContain("PrivacyInfo.xcprivacy");
  });

  it("bundles GoogleService-Info.plist from the path the workflow writes it to", () => {
    // Three @capacitor-firebase plugins call FirebaseApp.configure() when the
    // bridge loads them, and configure() aborts without this file. The
    // reference makes a missing file a build error that names it.
    expect(resources).toContain("GoogleService-Info.plist");
    expect(workflow).toContain("PLIST=ios/App/App/GoogleService-Info.plist");
    // Not tracked: it arrives from the secret on CI and by hand locally.
    expect(iosIgnore).toMatch(/^App\/App\/GoogleService-Info\.plist$/m);
    // The workflow's file reference sits in the group whose path is App/.
    const groupChildren = pbxproj.match(
      /\/\* App \*\/ = \{[\s\S]*?children = \(([\s\S]*?)\);[\s\S]*?path = App;/
    );
    expect(groupChildren?.[1]).toContain("GoogleService-Info.plist");
  });

  it("archives the container that exists, with -project", () => {
    // There is no ios/App/App.xcworkspace. Capacitor 8 consumes its plugins
    // through the local Swift package CapApp-SPM, and `cap build ios`
    // archives an SPM project with -project. The scaffold named a workspace.
    expect(workflow).not.toMatch(/xcodebuild[^\n]*-workspace/);
    const container = workflow.match(/xcodebuild -project (\S+)/);
    expect(container).not.toBeNull();
    expect(existsSync(resolve(repoRoot, container![1]))).toBe(true);
  });

  it("gives every upload a higher build number than the last", () => {
    // project.pbxproj pins CURRENT_PROJECT_VERSION = 1. App Store Connect
    // refuses an upload whose build number is not higher than the previous
    // one, so with the pinned value the SECOND run fails at upload, after a
    // full archive. The run number only ever increases.
    expect(pbxproj).toMatch(/CURRENT_PROJECT_VERSION = 1;/);
    expect(workflow).toMatch(/CURRENT_PROJECT_VERSION="\$GITHUB_RUN_NUMBER"/);
    // And the version testers see is the one Settings → Support reports.
    expect(workflow).toMatch(
      /APP_VERSION=\$\(node -p "require\('\.\/package\.json'\)\.version"\)/
    );
    expect(workflow).toMatch(/MARKETING_VERSION="\$APP_VERSION"/);
  });

  it("places the Firebase plist before the archive it belongs to", () => {
    const place = workflow.indexOf("name: Place GoogleService-Info.plist");
    const archive = workflow.indexOf("name: Archive");
    expect(place).toBeGreaterThan(-1);
    expect(archive).toBeGreaterThan(place);
  });

  it("declares HealthKit usage strings for as long as the plugin is a dependency", () => {
    // useSteps().connect → requestHealthPermissions → HKHealthStore
    // .requestAuthorization, reached from Settings → Health and from the
    // Home steps priming sheet, which auto-opens. Without
    // NSHealthShareUsageDescription the OS terminates the app on that tap.
    const usesHealthKit = "capacitor-health" in pkg.dependencies;
    const share =
      /<key>NSHealthShareUsageDescription<\/key>\s*<string>[^<]+<\/string>/.test(
        infoPlist
      );
    const update =
      /<key>NSHealthUpdateUsageDescription<\/key>\s*<string>[^<]+<\/string>/.test(
        infoPlist
      );
    expect(usesHealthKit).toBe(true);
    expect(share).toBe(usesHealthKit);
    expect(update).toBe(usesHealthKit);
  });

  it("answers the export-compliance question in the bundle", () => {
    // Tropos uses only HTTPS (exempt). Without this key every CI upload sits
    // in "Missing Compliance" until someone answers the question in App
    // Store Connect by hand, and testers cannot install it. If the app ever
    // ships its own cryptography, this pin is the reminder to revisit it.
    expect(infoPlist).toMatch(
      /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/
    );
  });
});

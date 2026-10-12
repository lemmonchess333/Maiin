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
 *
 * A second read (2026-09-30), when the owner, who has no Mac, set out to
 * run it, found four more: a deprecated runner image; automatic signing,
 * which on a runner with no Apple account looks for a development profile
 * that will never exist; an export with no profile mapping; and none of the
 * entitlements the Sign in with Apple and HealthKit plugins need.
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
const entitlements = read("ios/App/App/App.entitlements");
const pkg = JSON.parse(read("package.json")) as {
  dependencies: Record<string, string>;
};

const OBJECT_ID = /[0-9A-F]{24}/;

/** The body of one workflow step, from its `- name:` line to the next. */
function workflowStep(name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  if (start < 0) throw new Error(`no step named "${name}" in deploy-ios.yml`);
  const next = workflow.indexOf("- name:", start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
}

/** Top-level keys of a plist dict, in the order they appear. */
function plistKeys(xml: string): string[] {
  return [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]);
}

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

  it("builds an iPhone-only app", () => {
    // Tropos is designed for the phone. A universal build ("1,2") is
    // reviewed and listed as an iPad app too: iPad screenshots, iPad
    // layouts, iPad purchases. Built for the iPhone family alone, an iPad
    // runs it as an iPhone app (and App Review still tries it there, so
    // purchases on an iPad stay a native-iOS path, see purchaseProvider).
    // Read from the App target's own configuration list, so a config added
    // later is covered without editing this.
    const list = pbxproj.match(
      /\/\* Build configuration list for PBXNativeTarget "App" \*\/ = \{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);/
    );
    expect(list).not.toBeNull();
    const configIds = [
      ...list![1].matchAll(new RegExp(`(${OBJECT_ID.source}) /\\*`, "g")),
    ].map((m) => m[1]);
    // Anchor: Debug and Release, so the loop below is not vacuous.
    expect(configIds).toHaveLength(2);
    for (const id of configIds) {
      const config = pbxproj.match(
        new RegExp(
          `^\\s*${id} /\\*[^\\n]*\\*/ = \\{\\n\\s*isa = XCBuildConfiguration;[\\s\\S]*?\\n\\s*name = ([^;]+);`,
          "m"
        )
      );
      expect(config, `XCBuildConfiguration ${id}`).not.toBeNull();
      expect(
        config![0].match(/TARGETED_DEVICE_FAMILY = "?([^";]+)"?;/)?.[1],
        `App target ${config![1]}`
      ).toBe("1");
    }
    // No configuration anywhere in the project brings the iPad back.
    expect(pbxproj).not.toMatch(/TARGETED_DEVICE_FAMILY = "?[^;]*2/);
    // And the iPad-only orientation list went with it.
    expect(plistKeys(infoPlist)).toContain("UISupportedInterfaceOrientations");
    expect(plistKeys(infoPlist)).not.toContain(
      "UISupportedInterfaceOrientations~ipad"
    );
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

  it("builds on a macOS image that is not deprecated", () => {
    // macos-14 is deprecated (actions/runner-images#13518), and its default
    // Xcode is older than App Store Connect accepts uploads from. macos-26
    // carries the current Xcode as its default.
    expect(workflow.match(/^\s*runs-on:\s*(\S+)/m)?.[1]).toBe("macos-26");
  });

  it("signs the App target with the imported profile, never from the xcodebuild command line", () => {
    // The committed project signs automatically. On a runner with no Apple
    // account that looks for a development profile that never exists, so
    // the workflow switches the App target to manual signing first, and its
    // step expects exactly these two settings to switch.
    expect(pbxproj.match(/CODE_SIGN_STYLE = Automatic;/g)?.length).toBe(2);
    const sign = workflow.indexOf(
      "name: Sign the App target with the App Store profile"
    );
    expect(sign).toBeGreaterThan(-1);
    expect(workflow.indexOf("name: Archive")).toBeGreaterThan(sign);
    // Passed to xcodebuild, a profile setting reaches every Swift package
    // target too, and xcodebuild refuses a profile on a package target.
    expect(workflowStep("Archive")).not.toMatch(
      /PROVISIONING_PROFILE|CODE_SIGN_STYLE|CODE_SIGN_IDENTITY/
    );
  });

  it("tells the manual export which profile signs the app", () => {
    // Without the mapping a manual export stops at "no profiles for
    // com.tropos.app", after the archive has already taken its 20 minutes.
    const exportStep = workflowStep("Export .ipa");
    expect(exportStep).toMatch(
      /<key>signingStyle<\/key><string>manual<\/string>/
    );
    expect(exportStep).toMatch(
      /<key>provisioningProfiles<\/key>\s*<dict>\s*<key>\$\{BUNDLE_ID\}<\/key><string>\$\{PROFILE_UUID\}<\/string>/
    );
    expect(
      workflowStep("Import signing certificate + provisioning profile")
    ).toMatch(/echo "PROFILE_UUID=\$PROFILE_UUID" >> "\$GITHUB_ENV"/);
  });

  it("declares the entitlement each native plugin needs, and only while it is used", () => {
    const keys = plistKeys(entitlements);
    // Anchor: a parse that found nothing would make the checks below vacuous.
    expect(keys).toContain(
      "com.apple.developer.devicecheck.appattest-environment"
    );
    // FirebaseAuthentication.signInWithApple() fails on the phone without it.
    const nativeAppleSignIn =
      "@capacitor-firebase/authentication" in pkg.dependencies &&
      read("src/lib/nativeAuth.ts").includes("signInWithApple(");
    expect(keys.includes("com.apple.developer.applesignin")).toBe(
      nativeAppleSignIn
    );
    // HKHealthStore refuses an app that does not carry the entitlement.
    expect(keys.includes("com.apple.developer.healthkit")).toBe(
      "capacitor-health" in pkg.dependencies
    );
    // The native App Check provider attests with App Attest.
    expect(
      keys.includes("com.apple.developer.devicecheck.appattest-environment")
    ).toBe("@capacitor-firebase/app-check" in pkg.dependencies);
  });

  it("names in the guide every secret the run checks for, and checks every secret it reads", () => {
    const preflight = workflowStep("Check the signing secrets are set");
    const checked = [
      ...preflight.matchAll(/^\s+([A-Z0-9_]+): \$\{\{ secrets\.\1 \}\}/gm),
    ].map((m) => m[1]);
    expect(checked.length).toBe(8);
    // The VITE_* client config has its own check (scripts/check-web-env.mjs).
    const read_ = new Set(
      [...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)]
        .map((m) => m[1])
        .filter((name) => !name.startsWith("VITE_"))
    );
    expect([...read_].sort()).toEqual([...checked].sort());
    const guide = read("docs/ios-release.md");
    for (const name of checked) expect(guide).toContain(`\`${name}\``);
    // The keychain's password is made in the job, so nobody should be sent
    // to create a secret for it.
    expect(guide).not.toContain("KEYCHAIN_PASSWORD");
    expect(workflow).not.toContain("secrets.KEYCHAIN_PASSWORD");
  });
});

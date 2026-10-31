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
import { appInfoPlistString, resolvedSetting } from "@/test/iosBuildSettings";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (p: string) =>
  readFileSync(resolve(repoRoot, p), "utf8").replace(/\r\n/g, "\n");

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
  const target = pbxproj.match(
    /\/\* App \*\/ = \{\s*isa = PBXNativeTarget;[\s\S]*?buildPhases = \(([\s\S]*?)\);/
  );
  if (!target) throw new Error("no App PBXNativeTarget in project.pbxproj");
  const resourcesId = target[1].match(
    new RegExp(`(${OBJECT_ID.source}) /\\* Resources \\*/`)
  )?.[1];
  if (!resourcesId) throw new Error("App target has no Resources phase");
  const phase = pbxproj.match(
    new RegExp(
      `${resourcesId} /\\* Resources \\*/ = \\{\\s*isa = PBXResourcesBuildPhase;[\\s\\S]*?files = \\(([\\s\\S]*?)\\);`
    )
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

  it("uploads Crashlytics' symbol files from the archive, after TestFlight has the build", () => {
    // Without them every native crash report is unreadable. Uploaded after
    // the TestFlight upload, so a failure cannot hold the build back.
    const upload = workflow.indexOf("name: Upload to TestFlight");
    const symbols = workflow.indexOf("name: Upload Crashlytics symbol files");
    expect(upload).toBeGreaterThan(-1);
    expect(symbols).toBeGreaterThan(upload);
    expect(workflow).toContain(
      '-gsp ios/App/App/GoogleService-Info.plist -p ios \\\n            "$RUNNER_TEMP/App.xcarchive/dSYMs"'
    );
    expect(pbxproj).toContain('DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";');
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
    // The strings come from build settings (see the pilot test below), so
    // both kinds of build are read as they resolve, not as typed.
    const usesHealthKit = "capacitor-health" in pkg.dependencies;
    expect(usesHealthKit).toBe(true);
    for (const gate of ["NO", "YES"]) {
      for (const key of [
        "NSHealthShareUsageDescription",
        "NSHealthUpdateUsageDescription",
      ]) {
        expect(
          appInfoPlistString(key, gate).length,
          `${key} with the gate ${gate}`
        ).toBeGreaterThan(40);
      }
    }
  });

  it("asks Health for steps alone in a standard build, and for heart rate and workout export only in the pilot", () => {
    // A standard build reads steps and nothing else, so its Health prompt
    // says that. The pilot's expanded text names the Watch's heart rate and
    // the workout export it adds. One switch, WATCH_RUN_RELEASE_ENABLED,
    // picks the text, the Watch app and the native gate together.
    for (const configuration of ["Debug", "Release"]) {
      const standardShare = appInfoPlistString(
        "NSHealthShareUsageDescription",
        "NO",
        configuration
      );
      const standardUpdate = appInfoPlistString(
        "NSHealthUpdateUsageDescription",
        "NO",
        configuration
      );
      expect(standardShare).toBe(
        "Tropos reads your step count from Health to show today's steps on Home."
      );
      expect(standardUpdate).toBe(
        "Tropos does not add workouts or any other data to Health."
      );
      expect(
        appInfoPlistString(
          "NSHealthShareUsageDescription",
          "YES",
          configuration
        )
      ).toMatch(/heart rate during Apple Watch runs if enabled/);
      expect(
        appInfoPlistString(
          "NSHealthUpdateUsageDescription",
          "YES",
          configuration
        )
      ).toMatch(/workouts when you turn on export/);
    }
    // The committed Release configuration is a standard build.
    expect(appInfoPlistString("NSHealthShareUsageDescription", "NO")).toBe(
      resolvedSetting("App", "Release", "TROPOS_HEALTH_SHARE_USAGE")
    );
    expect(infoPlist).toMatch(
      /<key>NSHealthShareUsageDescription<\/key>\s*<string>\$\(TROPOS_HEALTH_SHARE_USAGE\)<\/string>/
    );
  });

  it("embeds the Watch app in a pilot build and in no other", () => {
    // The App target always builds TroposWatch (so a pull request compiles
    // it) and copies it into App.app/Watch through one phase. Which builds
    // the copy runs in is decided by the gate: the file is excluded unless
    // WATCH_RUN_RELEASE_ENABLED is exactly YES, so a missing or misspelt
    // value fails closed, to a build with no Watch app.
    const embed = pbxproj.match(
      new RegExp(
        `(${OBJECT_ID.source}) /\\* Embed Watch Content \\*/ = \\{\\s*isa = PBXCopyFilesBuildPhase;[\\s\\S]*?dstPath = "([^"]+)";[\\s\\S]*?files = \\(([\\s\\S]*?)\\);`
      )
    );
    expect(embed).not.toBeNull();
    expect(embed![2]).toBe("$(CONTENTS_FOLDER_PATH)/Watch");
    expect(
      [...embed![3].matchAll(/\/\* (.+?) in Embed Watch Content \*\//g)].map(
        (m) => m[1]
      )
    ).toEqual(["TroposWatch.app"]);
    const appTarget = pbxproj.match(
      /\/\* App \*\/ = \{\s*isa = PBXNativeTarget;[\s\S]*?productType/
    )![0];
    expect(appTarget).toContain(`${embed![1]} /* Embed Watch Content */`);
    expect(appTarget).toMatch(
      /dependencies = \(\s*[0-9A-F]{24} \/\* PBXTargetDependency \*\/,\s*\);/
    );

    const glob = (pattern: string) =>
      new RegExp(
        "^" +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, "[^/]*")
            .replace(/\?/g, "[^/]") +
          "$"
      );
    const listed = (configuration: string, name: string, gate?: string) =>
      resolvedSetting(
        "App",
        configuration,
        name,
        gate === undefined ? {} : { WATCH_RUN_RELEASE_ENABLED: gate }
      )
        .split(/\s+/)
        .filter(Boolean)
        .some((pattern) => glob(pattern).test("TroposWatch.app"));
    // Xcode skips a file in any phase when a pattern in
    // EXCLUDED_SOURCE_FILE_NAMES matches it and none in
    // INCLUDED_SOURCE_FILE_NAMES does.
    const embeds = (configuration: string, gate?: string) =>
      !(
        listed(configuration, "EXCLUDED_SOURCE_FILE_NAMES", gate) &&
        !listed(configuration, "INCLUDED_SOURCE_FILE_NAMES", gate)
      );
    for (const configuration of ["Debug", "Release"]) {
      expect(embeds(configuration, "YES"), `${configuration} pilot`).toBe(true);
      expect(embeds(configuration, "NO"), `${configuration} standard`).toBe(
        false
      );
      for (const odd of ["", "yes", "1", "TRUE"])
        expect(embeds(configuration, odd), `gate "${odd}"`).toBe(false);
    }
    // As committed: Release is a standard build, Debug keeps the Watch for
    // local work in Xcode.
    expect(embeds("Release")).toBe(false);
    expect(embeds("Debug")).toBe(true);
  });

  it("installs the Watch app only inside the iPhone app, never beside it in an archive", () => {
    // Without SKIP_INSTALL an archive installs TroposWatch.app next to
    // App.app in Products/Applications, and the export no longer sees one
    // iOS app. Xcode's own Watch app template sets it.
    const list = pbxproj.match(
      /\/\* Build configuration list for PBXNativeTarget "TroposWatch" \*\/ = \{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);/
    );
    const ids = [
      ...list![1].matchAll(new RegExp(`(${OBJECT_ID.source}) /\\*`, "g")),
    ].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      const config = pbxproj.match(
        new RegExp(`^\\s*${id} /\\*[^\\n]*\\*/ = \\{([\\s\\S]*?)^\\s*\\};`, "m")
      );
      expect(config?.[1]).toContain("SKIP_INSTALL = YES;");
    }
    expect(workflowStep("Verify archived iPhone and Watch signing")).toContain(
      'if [ "$ARCHIVED_APPS" != "App.app" ]; then'
    );
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

  it("turns with the phone only to portrait", () => {
    // Every screen is laid out for a phone held upright, and the large-text
    // capture spec checks them at portrait widths only. A landscape phone
    // is a 393-point-tall window none of them was drawn for.
    const list = infoPlist.match(
      /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/
    );
    expect(list).not.toBeNull();
    expect(
      [...list![1].matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1])
    ).toEqual(["UIInterfaceOrientationPortrait"]);
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

  it("signs the iPhone and Watch targets with their imported profiles, never from the xcodebuild command line", () => {
    // The committed project signs automatically. On a runner with no Apple
    // account that looks for a development profile that never exists, so
    // the workflow switches both app targets to manual signing first. Each
    // target has Debug and Release settings; package targets stay untouched.
    expect(pbxproj.match(/CODE_SIGN_STYLE = Automatic;/g)?.length).toBe(4);
    const sign = workflow.indexOf(
      "name: Sign the iPhone and Watch targets with App Store profiles"
    );
    expect(sign).toBeGreaterThan(-1);
    expect(workflow.indexOf("name: Archive")).toBeGreaterThan(sign);
    // Passed to xcodebuild, a profile setting reaches every Swift package
    // target too, and xcodebuild refuses a profile on a package target.
    expect(workflowStep("Archive")).not.toMatch(
      /PROVISIONING_PROFILE|CODE_SIGN_STYLE|CODE_SIGN_IDENTITY/
    );
  });

  it("keeps the committed release gate off and ties both pilot gates to one manual choice", () => {
    expect(infoPlist).toMatch(
      /<key>TroposConnectedTrainingEnabled<\/key>\s*<string>\$\(WATCH_RUN_RELEASE_ENABLED\)<\/string>/
    );
    const appConfigList = pbxproj.match(
      /\/\* Build configuration list for PBXNativeTarget "App" \*\/ = \{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);/
    );
    const releaseId = appConfigList?.[1].match(
      new RegExp(`(${OBJECT_ID.source}) /\\* Release \\*/`)
    )?.[1];
    expect(releaseId).toBeDefined();
    const appRelease = pbxproj.match(
      new RegExp(
        `^\\s*${releaseId} /\\* Release \\*/ = \\{([\\s\\S]*?)^\\s*\\};`,
        "m"
      )
    );
    expect(appRelease?.[1]).toContain(
      "PRODUCT_BUNDLE_IDENTIFIER = com.tropos.app;"
    );
    expect(appRelease?.[1]).toContain("WATCH_RUN_RELEASE_ENABLED = NO;");
    expect(workflow).toMatch(
      /connected_training_pilot:\s*description:[^\n]*\n\s*type: boolean\s*required: false\s*default: false/
    );
    const mode = workflowStep("Select connected training build mode");
    expect(mode).toMatch(
      /true\)\s*if \[ "\$EVENT_NAME" != workflow_dispatch \][\s\S]*?fi\s*echo "web=true"[\s\S]*?echo "native=YES"/
    );
    expect(mode).toMatch(
      /false\|""\)\s*echo "web=false"[\s\S]*?echo "native=NO"/
    );
    expect(
      workflowStep("Build web bundle and sync into the iOS project")
    ).toContain(
      "VITE_CONNECTED_TRAINING_ENABLED: ${{ steps.training-mode.outputs.web }}"
    );
    expect(workflowStep("Archive")).toContain(
      "WATCH_RUN_RELEASE_ENABLED: ${{ steps.training-mode.outputs.native }}"
    );
    expect(workflowStep("Archive")).toContain(
      'WATCH_RUN_RELEASE_ENABLED="$WATCH_RUN_RELEASE_ENABLED"'
    );
    for (const name of [
      "Verify archived iPhone and Watch signing",
      "Verify exported iPhone and Watch signing",
    ]) {
      expect(workflowStep(name)).toContain(
        '--expected-connected-training "${{ steps.training-mode.outputs.native }}"'
      );
    }
  });

  it("tells the manual export which profile signs each app", () => {
    // Without the mapping a manual export stops at "no profiles for
    // com.tropos.app", after the archive has already taken its 20 minutes.
    const exportStep = workflowStep("Export .ipa");
    expect(exportStep).toMatch(
      /<key>signingStyle<\/key><string>manual<\/string>/
    );
    expect(exportStep).toMatch(
      /<key>provisioningProfiles<\/key>\s*<dict>\s*<key>\$\{BUNDLE_ID\}<\/key><string>\$\{PROFILE_UUID\}<\/string>/
    );
    expect(exportStep).toMatch(
      /<key>\$\{WATCH_BUNDLE_ID\}<\/key><string>\$\{WATCH_PROFILE_UUID\}<\/string>/
    );
    expect(
      workflowStep("Import signing certificate + provisioning profile")
    ).toMatch(/echo "PROFILE_UUID=\$PROFILE_UUID" >> "\$GITHUB_ENV"/);
    expect(
      workflowStep("Import signing certificate + provisioning profile")
    ).toMatch(
      /echo "WATCH_PROFILE_UUID=\$WATCH_PROFILE_UUID" >> "\$GITHUB_ENV"/
    );
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
    expect(checked.length).toBe(9);
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

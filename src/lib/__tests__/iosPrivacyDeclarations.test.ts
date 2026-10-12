/**
 * What the iOS app declares about privacy, read from the committed files.
 *
 * Nothing here can build the app (no Mac, no Xcode), so as with
 * iosProjectWiring.test.ts the check is a read of the files themselves:
 *
 *  - The privacy manifest's collected data types are the App Store privacy
 *    label's source. They must be exactly the agreed set, each linked to the
 *    account, none used for tracking, every key one Apple documents. The
 *    old file used `NSPrivacyCollectedDataTypeHealthFitness`, which is not
 *    one of Apple's keys, and nothing noticed.
 *  - Required-reason API entries cover what the app's plugins call without
 *    a manifest of their own (@capacitor/preferences, @capacitor/filesystem,
 *    capacitor-live-activities ship none), for as long as they are
 *    dependencies.
 *  - Purpose strings name every use.
 *  - Nothing that can track is built in: Analytics without the
 *    advertising-ID trait, Authentication without the Facebook SDK, and the
 *    plugin's App Tracking Transparency calls patched out on every install.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import capacitorConfig from "../../../capacitor.config";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

const pkg = JSON.parse(read("package.json")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  overrides: Record<string, unknown>;
};

/* ── A plist reader, enough for these files ────────────────────────── */

type PlistValue =
  | string
  | boolean
  | PlistValue[]
  | { [key: string]: PlistValue };

/** Parses the XML plist the iOS files use: dict, array, key, string,
 *  true and false, with comments. Throws on anything else, so a value of a
 *  shape this does not know is a failure rather than a silent skip. */
function parsePlist(xml: string): PlistValue {
  const tokens = xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>/g, "")
    .match(/<[^>]+>|[^<]+/g)!
    .map((t) => t.trim())
    .filter(Boolean);
  let i = 0;
  const value = (): PlistValue => {
    const tag = tokens[i++];
    if (tag === "<true/>") return true;
    if (tag === "<false/>") return false;
    if (tag === "<array/>") return [];
    if (tag === "<dict/>") return {};
    if (tag === "<string>") {
      let text = "";
      if (tokens[i] !== "</string>") text = tokens[i++];
      expect(tokens[i++]).toBe("</string>");
      return text;
    }
    if (tag === "<array>") {
      const out: PlistValue[] = [];
      while (tokens[i] !== "</array>") out.push(value());
      i++;
      return out;
    }
    if (tag === "<dict>") {
      const out: Record<string, PlistValue> = {};
      while (tokens[i] !== "</dict>") {
        expect(tokens[i++]).toBe("<key>");
        const key = tokens[i++];
        expect(tokens[i++]).toBe("</key>");
        out[key] = value();
      }
      i++;
      return out;
    }
    throw new Error(`unexpected plist token ${tag}`);
  };
  expect(tokens[i++]).toMatch(/^<plist/);
  const root = value();
  expect(tokens[i]).toBe("</plist>");
  return root;
}

type Dict = Record<string, PlistValue>;

/* ── The privacy manifest ──────────────────────────────────────────── */

const manifest = parsePlist(read("ios/App/App/PrivacyInfo.xcprivacy")) as Dict;

const APP = "NSPrivacyCollectedDataTypePurposeAppFunctionality";
const ANALYTICS = "NSPrivacyCollectedDataTypePurposeAnalytics";

/** The agreed declaration: type → purposes. */
const DECLARED: Record<string, string[]> = {
  Name: [APP],
  EmailAddress: [APP],
  Health: [APP, ANALYTICS],
  Fitness: [APP, ANALYTICS],
  PreciseLocation: [APP],
  CoarseLocation: [ANALYTICS],
  PhotosorVideos: [APP],
  OtherUserContent: [APP],
  UserID: [APP],
  DeviceID: [ANALYTICS],
  PurchaseHistory: [APP],
  ProductInteraction: [APP, ANALYTICS],
  OtherUsageData: [APP, ANALYTICS],
  CrashData: [APP],
  PerformanceData: [ANALYTICS],
  OtherDiagnosticData: [APP],
};

/** Apple's documented collected-data-type keys ("Describing data use in
 *  privacy manifests"), without their common prefix. */
const APPLE_DATA_TYPES = new Set([
  "Name",
  "EmailAddress",
  "PhoneNumber",
  "PhysicalAddress",
  "OtherUserContactInfo",
  "Health",
  "Fitness",
  "PaymentInfo",
  "CreditInfo",
  "OtherFinancialInfo",
  "PreciseLocation",
  "CoarseLocation",
  "SensitiveInfo",
  "Contacts",
  "EmailsOrTextMessages",
  "PhotosorVideos",
  "AudioData",
  "GameplayContent",
  "CustomerSupport",
  "OtherUserContent",
  "BrowsingHistory",
  "SearchHistory",
  "UserID",
  "DeviceID",
  "PurchaseHistory",
  "ProductInteraction",
  "AdvertisingData",
  "OtherUsageData",
  "CrashData",
  "PerformanceData",
  "OtherDiagnosticData",
  "EnvironmentScanning",
  "Hands",
  "Head",
  "OtherDataTypes",
]);
const APPLE_PURPOSES = new Set(
  [
    "ThirdPartyAdvertising",
    "DeveloperAdvertising",
    "Analytics",
    "ProductPersonalization",
    "AppFunctionality",
    "Other",
  ].map((p) => `NSPrivacyCollectedDataTypePurpose${p}`)
);

const collected = manifest.NSPrivacyCollectedDataTypes as Dict[];
const typeName = (entry: Dict) =>
  String(entry.NSPrivacyCollectedDataType).replace(
    /^NSPrivacyCollectedDataType/,
    ""
  );

describe("privacy manifest — collected data", () => {
  it("does not track, and names no tracking domains", () => {
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
  });

  it("declares exactly the agreed data types, once each, with their purposes", () => {
    // Anchor: the parse found the array, so the comparison is not vacuous.
    expect(collected.length).toBeGreaterThan(0);
    const declared = Object.fromEntries(
      collected.map((entry) => [
        typeName(entry),
        entry.NSPrivacyCollectedDataTypePurposes,
      ])
    );
    expect(collected).toHaveLength(Object.keys(DECLARED).length);
    expect(declared).toEqual(DECLARED);
  });

  it("links every type to the account and uses none for tracking", () => {
    for (const entry of collected) {
      expect(entry.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(entry.NSPrivacyCollectedDataTypeTracking).toBe(false);
    }
  });

  it("uses only Apple's keys", () => {
    // The previous file declared NSPrivacyCollectedDataTypeHealthFitness,
    // which Apple does not define.
    for (const entry of collected) {
      expect(String(entry.NSPrivacyCollectedDataType)).toMatch(
        /^NSPrivacyCollectedDataType/
      );
      expect(APPLE_DATA_TYPES.has(typeName(entry))).toBe(true);
      for (const purpose of entry.NSPrivacyCollectedDataTypePurposes as string[])
        expect(APPLE_PURPOSES.has(purpose)).toBe(true);
    }
  });
});

describe("privacy manifest — required-reason APIs", () => {
  const reasons = Object.fromEntries(
    (manifest.NSPrivacyAccessedAPITypes as Dict[]).map((entry) => [
      String(entry.NSPrivacyAccessedAPIType).replace(
        /^NSPrivacyAccessedAPICategory/,
        ""
      ),
      entry.NSPrivacyAccessedAPITypeReasons as string[],
    ])
  );

  it("declares UserDefaults for the app's own preferences (kept)", () => {
    // @capacitor/preferences writes UserDefaults.standard and ships no
    // manifest of its own.
    expect("@capacitor/preferences" in pkg.dependencies).toBe(true);
    expect(reasons.UserDefaults).toContain("CA92.1");
  });

  it("declares App Group defaults and file timestamps while Live Activities is a dependency", () => {
    // capacitor-live-activities shares UserDefaults(suiteName:) with its
    // widget and reads its images' creation dates.
    const liveActivities = "capacitor-live-activities" in pkg.dependencies;
    expect(liveActivities).toBe(true);
    expect((reasons.UserDefaults ?? []).includes("1C8F.1")).toBe(
      liveActivities
    );
    expect((reasons.FileTimestamp ?? []).includes("C617.1")).toBe(true);
  });

  it("declares file timestamps while the meal-photo sweep reads them", () => {
    // foodPhotoStore's 90-day sweep reads each photo's mtime through
    // @capacitor/filesystem's readdir, which ships no manifest.
    const sweep = read("src/lib/foodPhotoStore.ts");
    expect(sweep).toMatch(/Filesystem\.readdir/);
    expect(sweep).toMatch(/mtime/);
    expect(reasons.FileTimestamp).toEqual(["C617.1"]);
  });

  it("uses only documented reason codes", () => {
    const documented: Record<string, string[]> = {
      UserDefaults: ["CA92.1", "1C8F.1", "C56D.1", "AC6B.1"],
      FileTimestamp: ["DDA9.1", "C617.1", "3B52.1", "0A2A.1"],
      SystemBootTime: ["35F9.1", "8FFB.1", "3D61.1"],
      DiskSpace: ["85F4.1", "E174.1", "7D9E.1", "B728.1"],
      ActiveKeyboards: ["3EC4.1", "54BD.1"],
    };
    for (const [category, codes] of Object.entries(reasons)) {
      expect(Object.keys(documented)).toContain(category);
      for (const code of codes) expect(documented[category]).toContain(code);
    }
  });
});

/* ── Info.plist purpose strings ────────────────────────────────────── */

describe("Info.plist — purpose strings cover every use", () => {
  const info = parsePlist(read("ios/App/App/Info.plist")) as Dict;
  const purpose = (key: string) => {
    const text = info[key];
    expect(typeof text).toBe("string");
    expect((text as string).length).toBeGreaterThan(40);
    return text as string;
  };

  /** Each place a photo comes in, and the component that takes it. */
  const PHOTO_USES: [RegExp, string][] = [
    [/meal/, "src/components/FoodCameraModal.tsx"],
    [/barcode/, "src/components/FoodCameraModal.tsx"],
    [/progress photo/, "src/components/progress/ProgressPhotoDaySheet.tsx"],
    [/profile photo/, "src/components/settings/SettingsAvatar.tsx"],
    [/Space post/, "src/features/spaces/SpacePostComposer.tsx"],
  ];

  it("the camera string names each use, and each is a real photo input", () => {
    // iOS offers the camera on any photo input, so each one is a camera use.
    const camera = purpose("NSCameraUsageDescription");
    for (const [use, component] of PHOTO_USES) {
      expect(camera).toMatch(use);
      expect(read(component)).toMatch(/type="file"/);
    }
  });

  it("the photo library string names each use, the share card's photo too", () => {
    const library = purpose("NSPhotoLibraryUsageDescription");
    for (const [use] of PHOTO_USES) expect(library).toMatch(use);
    expect(library).toMatch(/share card/);
    expect(read("src/components/share/ShareCardSheet.tsx")).toMatch(
      /type="file"/
    );
  });

  it("asks to add to the library, for the images a person chooses to save", () => {
    // Saving from the share sheet ("Save Image") needs this key, or iOS
    // ends the app on that tap.
    const add = purpose("NSPhotoLibraryAddUsageDescription");
    expect(add).toMatch(/only when you choose/);
    expect(add).toMatch(/share card/);
    expect(add).toMatch(/progress photo comparison/);
  });

  it("the location string names each use of location", () => {
    const location = purpose("NSLocationWhenInUseUsageDescription");
    for (const use of [/runs/, /weather/, /route you plan/, /privacy zone/])
      expect(location).toMatch(use);
  });

  it("asks for no tracking permission: Tropos does not track", () => {
    expect(info.NSUserTrackingUsageDescription).toBeUndefined();
  });
});

/* ── SDKs that could track ─────────────────────────────────────────── */

describe("SDKs — nothing that tracks is built in", () => {
  const spm = capacitorConfig.experimental?.ios?.spm;
  const packageSwift = read("ios/App/CapApp-SPM/Package.swift");
  const AUTH = "@capacitor-firebase/authentication";
  const authDir = resolve(repoRoot, "node_modules", AUTH);
  const authVersion = (
    JSON.parse(readFileSync(join(authDir, "package.json"), "utf8")) as {
      version: string;
    }
  ).version;

  it("builds Analytics without advertising-ID support, and Authentication with Google only", () => {
    expect(spm?.packageTraits).toEqual({
      "@capacitor-firebase/analytics": ["AnalyticsWithoutAdIdSupport"],
      [AUTH]: ["Google"],
    });
    // Traits need Swift tools 6.1; the App Check entry stays.
    expect(spm?.swiftToolsVersion).toBe("6.1");
    expect(spm?.packageOptions).toEqual({
      "@capacitor-firebase/app-check": { symlink: true },
    });
  });

  it("the committed Package.swift is the one cap sync writes from that config", () => {
    expect(packageSwift).toMatch(/^\/\/ swift-tools-version: 6\.1\n/);
    expect(packageSwift).toContain(
      '.package(name: "CapacitorFirebaseAnalytics", path: "../../../node_modules/@capacitor-firebase/analytics", traits: ["AnalyticsWithoutAdIdSupport"])'
    );
    expect(packageSwift).toContain(
      '.package(name: "CapacitorFirebaseAuthentication", path: "../../../node_modules/@capacitor-firebase/authentication", traits: ["Google"])'
    );
  });

  it("uses an Authentication plugin that makes Facebook a trait (8.5.2 or later)", () => {
    // 8.2.0 linked the Facebook SDK unconditionally.
    const [major, minor, patch] = authVersion.split(".").map(Number);
    expect(major).toBe(8);
    expect(minor * 1000 + patch).toBeGreaterThanOrEqual(5002);
    expect(pkg.dependencies[AUTH]).toBe("^8.5.2");
    expect(read(`node_modules/${AUTH}/Package.swift`)).toMatch(
      /condition: \.when\(traits: \["Facebook"\]\)/
    );
  });

  it("patches the App Tracking Transparency calls out on every install", () => {
    expect(pkg.devDependencies["patch-package"]).toBeDefined();
    expect(pkg.scripts.postinstall).toBe("patch-package");
    // One patch, for the installed version (patch-package names them so).
    const patches = readdirSync(resolve(repoRoot, "patches"));
    expect(patches).toEqual([
      `@capacitor-firebase+authentication+${authVersion}.patch`,
    ]);
    // Applied: the plugin's Swift neither imports the framework nor calls
    // it, and both plugin methods are still there, answering "denied".
    const swiftFiles: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".swift")) swiftFiles.push(path);
      }
    };
    walk(join(authDir, "ios"));
    expect(swiftFiles.length).toBeGreaterThan(10);
    for (const file of swiftFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/import AppTrackingTransparency/);
      expect(source).not.toMatch(/ATTrackingManager/);
    }
    const plugin = readFileSync(
      join(authDir, "ios/Plugin/FirebaseAuthenticationPlugin.swift"),
      "utf8"
    );
    expect(plugin).toMatch(/name: "requestAppTrackingTransparencyPermission"/);
    expect(plugin).toMatch(/name: "checkAppTrackingTransparencyPermission"/);
    expect(
      readFileSync(
        join(authDir, "ios/Plugin/FirebaseAuthentication.swift"),
        "utf8"
      ).match(/CheckAppTrackingTransparencyPermissionResult\("denied"\)/g)
    ).toHaveLength(2);
  });

  it("the app never asks for tracking permission", () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "__tests__") walk(path);
        } else if (
          /\.tsx?$/.test(name) &&
          /TrackingTransparency/.test(readFileSync(path, "utf8"))
        ) {
          callers.push(path);
        }
      }
    };
    walk(resolve(repoRoot, "src"));
    expect(callers).toEqual([]);
  });

  it("keeps the advisory-free patch-package tree: the workspace lookup is the in-repo shim", () => {
    // patch-package's own find-yarn-workspace-root pulls in braces, which
    // fails CI's audit gate (scripts/npm-shims/find-yarn-workspace-root).
    expect(pkg.overrides["find-yarn-workspace-root"]).toBe(
      "$find-yarn-workspace-root"
    );
    expect(pkg.devDependencies["find-yarn-workspace-root"]).toBe(
      "file:scripts/npm-shims/find-yarn-workspace-root"
    );
    expect(existsSync(resolve(repoRoot, "node_modules/braces"))).toBe(false);
  });
});

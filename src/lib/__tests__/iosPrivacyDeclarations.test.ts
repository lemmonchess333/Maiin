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
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

const pkg = JSON.parse(read("package.json")) as {
  dependencies: Record<string, string>;
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

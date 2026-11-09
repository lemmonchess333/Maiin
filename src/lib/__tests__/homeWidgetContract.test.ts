/**
 * The Home Screen and Lock Screen widgets' two halves, held to each other
 * (Wid1), as `liveActivityContract.test.ts` holds the Live Activity's.
 *
 * The app writes the snapshot (homeWidgetSnapshot.ts) and the widget
 * extension decodes it by name (ios/App/LiveActivities/
 * HomeWidgetSnapshot.swift). Nothing here can compile or run the widget,
 * and a key one side renames is a widget that silently draws its first-use
 * note on every phone (a snapshot that does not decode reads as none), so
 * these read the Swift source: every key the app writes is a property the
 * widget decodes, and the reverse; every value an enum can take, the App
 * Group, the plugin's methods, the links, the colours and the families.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { THEME } from "@/lib/theme";
import { MAX_SINGLE_LOG_ML } from "@/lib/waterUnits";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import { widgetUrl } from "@/lib/widgetLinks";
import {
  DAY_KEYS,
  DRINK_KEYS,
  FOOD_KEYS,
  HOME_WIDGET_APP_GROUP,
  HOME_WIDGET_SNAPSHOT_VERSION,
  HOME_WIDGET_STALE_AFTER_MS,
  SNAPSHOT_KEYS,
  STREAK_KEYS,
  WATER_KEYS,
  WEEK_KEYS,
  WIDGET_DAY_STATES,
  WIDGET_SEGMENTS,
  WIDGET_SPORTS,
} from "@/lib/homeWidgetContract";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");
const widget = (file: string) => read(`ios/App/LiveActivities/${file}`);

const snapshotSwift = widget("HomeWidgetSnapshot.swift");
const storeSwift = widget("HomeWidgetStore.swift");
const pluginSwift = read("ios/App/App/HomeWidgetsPlugin.swift");
const bridgeTs = read("src/lib/homeWidgets.ts");

/** The body of a Swift type declaration, to its matching brace. */
function swiftBody(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`no "${declaration}" in the widget`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`"${declaration}" never closes`);
}

/** A struct's decoded properties: its instance `let name: Type` lines, at
 *  the struct's own depth. */
function decoded(source: string, declaration: string): string[] {
  const body = swiftBody(source, declaration);
  const indent = /^( *)/.exec(
    body.split("\n").find((line) => /^\s+let \w+:/.test(line)) ?? ""
  )![1];
  return [...body.matchAll(new RegExp(`^${indent}let (\\w+):`, "gm"))].map(
    (m) => m[1]
  );
}

/** A string enum's raw values, a case without one being its name. */
function rawValues(declaration: string): string[] {
  return [
    ...swiftBody(snapshotSwift, declaration).matchAll(
      /^\s+case (\w+)(?: = "([^"]+)")?$/gm
    ),
  ].map((m) => m[2] ?? m[1]);
}

describe("the snapshot the app writes is the snapshot the widget decodes", () => {
  it.each([
    ["struct HomeWidgetSnapshot: Decodable {", SNAPSHOT_KEYS],
    ["struct WidgetDay: Decodable {", DAY_KEYS],
    ["struct WidgetWeek: Decodable {", WEEK_KEYS],
    ["struct WidgetStreak: Decodable {", STREAK_KEYS],
    ["struct WidgetFood: Decodable {", FOOD_KEYS],
    ["struct WidgetWater: Decodable {", WATER_KEYS],
  ])("%s", (declaration, keys) => {
    expect(decoded(snapshotSwift, declaration).sort()).toEqual(
      [...keys].sort()
    );
  });

  it("decodes every value each enum is written with, and no other", () => {
    expect(rawValues("enum WidgetDayState: String, Decodable {")).toEqual([
      ...WIDGET_DAY_STATES,
    ]);
    expect(rawValues("enum WidgetSport: String, Decodable {")).toEqual([
      ...WIDGET_SPORTS,
    ]);
    expect(rawValues("enum WidgetSegment: String, Decodable {")).toEqual([
      ...WIDGET_SEGMENTS,
    ]);
  });

  it("reads the version the app writes, and dims after the same day (W8d)", () => {
    expect(snapshotSwift).toContain(
      `static let currentVersion = ${HOME_WIDGET_SNAPSHOT_VERSION}`
    );
    expect(snapshotSwift).toContain("snapshot.version == currentVersion");
    expect(HOME_WIDGET_STALE_AFTER_MS).toBe(24 * 60 * 60 * 1000);
    expect(snapshotSwift).toContain(
      "static let staleAfter: TimeInterval = 24 * 60 * 60"
    );
    // Written in ms, read in ms.
    expect(snapshotSwift).toContain(
      "Date(timeIntervalSince1970: writtenAt / 1000)"
    );
  });

  it("keys a day as the app does, in the Gregorian calendar whatever the phone's", () => {
    expect(snapshotSwift).toContain("Calendar(identifier: .gregorian)");
    expect(snapshotSwift).toContain('"%04ld-%02ld-%02ld"');
  });
});

describe("the drinks the widget queues are the drinks the app saves", () => {
  it("writes each drink with the fields the app reads", () => {
    expect(
      decoded(storeSwift, "struct QueuedDrink: Codable, Equatable {").sort()
    ).toEqual([...DRINK_KEYS].sort());
    // The plugin hands every field to the web view.
    for (const key of DRINK_KEYS)
      expect(pluginSwift).toContain(`"${key}": drink.${key}`);
  });

  it("pours no more than the water log takes in one drink", () => {
    expect(storeSwift).toContain(
      `static let maxDrinkMl = ${MAX_SINGLE_LOG_ML}`
    );
  });

  it("makes each drink's id at the tap, the receipt id that saves it once", () => {
    const intent = widget("LogDrinkIntent.swift");
    expect(intent).toContain("id: UUID().uuidString");
    // Only against a snapshot, so only for the account it names.
    expect(intent).toContain("account: snapshot.account");
    expect(intent).toContain("date: WidgetCalendar.key(now)");
  });

  it("draws a queued drink once: added until the app's total counts it", () => {
    expect(snapshotSwift).toContain("!counted.contains($0.id)");
    expect(snapshotSwift).toContain("$0.account == account");
  });
});

describe("one App Group, one plugin, on both sides", () => {
  it("names the App Group the entitlements carry", () => {
    expect(storeSwift).toContain(
      `static let appGroup = "${HOME_WIDGET_APP_GROUP}"`
    );
    for (const file of [
      "ios/App/App/App.entitlements",
      "ios/App/LiveActivities/LiveActivities.entitlements",
    ])
      expect(read(file)).toContain(`<string>${HOME_WIDGET_APP_GROUP}</string>`);
  });

  it("answers every method the web view calls, under the name it registers", () => {
    expect(pluginSwift).toContain('let jsName = "HomeWidgets"');
    expect(bridgeTs).toContain(
      'registerPlugin<HomeWidgetsPlugin>("HomeWidgets")'
    );
    const native = [
      ...pluginSwift.matchAll(/CAPPluginMethod\(name: "(\w+)"/g),
    ].map((m) => m[1]);
    const web = [
      ...swiftBody(bridgeTs, "interface HomeWidgetsPlugin {").matchAll(
        /^\s+(\w+)\(/gm
      ),
    ].map((m) => m[1]);
    expect(native.sort()).toEqual(web.sort());
    for (const method of native)
      expect(pluginSwift).toContain(
        `@objc func ${method}(_ call: CAPPluginCall)`
      );
  });

  it("redraws the widgets when the app writes, throttled", () => {
    expect(pluginSwift).toContain("WidgetCenter.shared.reloadAllTimelines()");
    expect(pluginSwift).toMatch(/reloadInterval: TimeInterval = \d+/);
  });
});

describe("the widgets draw in the app's words, colours and links", () => {
  it("opens the app where its own links do", () => {
    expect(snapshotSwift).toContain(
      `static let home = URL(string: "${widgetUrl("/")}")!`
    );
    expect(snapshotSwift).toContain(
      `static let food = URL(string: "${widgetUrl("/food")}")!`
    );
  });

  it("takes food and water's colours from the theme", () => {
    const palette = widget("TroposLiveActivity.swift");
    const hex = (name: string) =>
      `#${palette.match(new RegExp(`static let ${name} = Color\\(rgb: 0x([0-9A-F]{6})\\)`))?.[1]}`;
    expect(hex("food")).toBe(THEME.semantic.nutrition);
    expect(hex("foodDeep")).toBe(THEME.calorieRing.deep);
    expect(hex("water")).toBe(THEME.semantic.hydration);
    expect(hex("lifting")).toBe(THEME.lifting);
    expect(hex("running")).toBe(THEME.running);
    // The card in the dark is the app's dark card.
    expect(widget("WidgetChrome.swift")).toContain(
      `UIColor(rgb: 0x${THEME.surface.slice(1)})`
    );
  });

  it("labels the calorie ring as the app's ring does", () => {
    const food = widget("FoodWidget.swift");
    for (const mode of ["left", "over", "logged"])
      expect(food).toContain(`"${CALORIE_UNIT} ${mode}"`);
  });

  it("writes a volume as the app does", () => {
    // formatWaterVolume: ml under a litre, then litres to two places with
    // the trailing zeros gone.
    expect(snapshotSwift).toContain(
      'if value < 1000 { return "\\(value) ml" }'
    );
    expect(snapshotSwift).toContain(
      'String(format: "%.2f", Double(value) / 1000)'
    );
  });

  it("says nothing of a streak at risk (W7c, W8b)", () => {
    // The words it draws: its string literals, not its comments.
    const words = [
      ...widget("StreakWidget.swift").matchAll(/"((?:[^"\\]|\\.)*)"/g),
    ].map((m) => m[1]);
    expect(words).toContain("day streak");
    for (const text of words)
      expect(text).not.toMatch(
        /\brisk\b|\blose\b|\blost\b|\bbreak\b|hours? left|don't|before midnight|!/i
      );
  });
});

describe("the widgets the extension holds (Wid1 call 1 and call 3)", () => {
  const bundle = widget("LiveActivitiesBundle.swift");
  const families = (file: string) =>
    [
      ...(widget(file)
        .match(/\.supportedFamilies\(\[([^\]]+)\]\)/)?.[1]
        .matchAll(/\.(\w+)/g) ?? []),
    ].map((m) => m[1]);

  it("holds the Live Activity and the three widgets", () => {
    for (const name of [
      "TroposLiveActivity()",
      "TodayWidget()",
      "StreakWidget()",
      "FoodWidget()",
    ])
      expect(bundle).toContain(name);
  });

  it.each([
    [
      "TodayWidget.swift",
      [
        "systemSmall",
        "systemMedium",
        "accessoryRectangular",
        "accessoryInline",
      ],
    ],
    ["StreakWidget.swift", ["systemSmall", "accessoryCircular"]],
    ["FoodWidget.swift", ["systemSmall", "systemMedium", "accessoryCircular"]],
  ])("%s draws the families Wid1 names, each with a preview", (file, want) => {
    expect(families(file)).toEqual(want);
    const previews = [
      ...widget(file).matchAll(/WidgetPreviewContext\(family: \.(\w+)\)/g),
    ].map((m) => m[1]);
    for (const family of want) expect(previews).toContain(family);
  });

  it("keeps iOS 17's interactive button and card behind an availability check, for an extension that runs from 16.2", () => {
    const intent = widget("LogDrinkIntent.swift");
    expect(intent).toMatch(
      /@available\(iOS 17\.0, \*\)\nstruct LogDrinkIntent/
    );
    const food = widget("FoodWidget.swift");
    const button = food.indexOf("Button(intent:");
    expect(button).toBeGreaterThan(0);
    expect(
      food.lastIndexOf("if #available(iOS 17.0, *)", button)
    ).toBeGreaterThan(food.lastIndexOf("struct AddDrinkButton", button));
    // The plain deep link before iOS 17.
    expect(food).toContain("Link(destination: HomeWidgetLinks.home)");
    const chrome = widget("WidgetChrome.swift");
    for (const use of chrome.matchAll(/containerBackground\(for: \.widget\)/g))
      expect(
        chrome.lastIndexOf("if #available(iOS 17.0, *)", use.index)
      ).toBeGreaterThan(chrome.lastIndexOf("func ", use.index) - 1);
    for (const file of [
      "TodayWidget.swift",
      "StreakWidget.swift",
      "FoodWidget.swift",
    ])
      expect(widget(file), file).not.toContain("containerBackground");
  });

  it("draws the Lock Screen in its monochrome mode, not in colours it cannot show", () => {
    const chrome = widget("WidgetChrome.swift");
    expect(chrome).toContain("@Environment(\\.widgetRenderingMode)");
    expect(chrome).toContain("mode == .fullColor ?");
  });
});

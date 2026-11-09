/**
 * The Live Activity's two halves, held to each other.
 *
 * The app sends each activity's data (runLiveActivity.ts,
 * restLiveActivity.ts) and the widget extension reads it by name
 * (ios/App/LiveActivities/LiveActivityPayload.swift). Nothing here can
 * compile or run the widget, and a key one side renames is a card that
 * silently shows dashes on a phone, so the pins below read the Swift
 * source: every key the app sends is one the widget reads, with the type
 * it reads it as, and the reverse. The same goes for the colours, the
 * rest band's words, and the plugin the widget is built on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capacitorPlugin } from "@/test/capacitorPlugin";

const startActivity = vi.fn();
vi.mock("capacitor-live-activities", () => ({
  LiveActivities: capacitorPlugin({
    startActivity: (...a: unknown[]) => startActivity(...a),
    updateActivity: vi.fn(),
    endActivity: vi.fn(),
  }),
}));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => true }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { THEME } from "@/lib/theme";
import { distanceLabel, paceLabel } from "@/lib/runLabels";
import {
  REST_ACTIVITY_KEYS,
  RUN_ACTIVITY_KEYS,
} from "@/lib/liveActivityContract";
import {
  __resetRunActivityForTests,
  startRunActivity,
} from "@/lib/runLiveActivity";
import {
  __resetRestActivityForTests,
  startRestActivity,
} from "@/lib/restLiveActivity";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");
const widget = (file: string) => read(`ios/App/LiveActivities/${file}`);

const payloadSwift = widget("LiveActivityPayload.swift");

/** The body of a Swift `struct <name>` declaration, to its closing brace
 *  at the start of a line. */
function swiftStruct(source: string, name: string): string {
  const start = source.indexOf(`struct ${name} {`);
  if (start < 0) throw new Error(`no struct ${name} in the widget`);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end);
}

type Read = "string" | "number" | "flag";

/** The keys a payload type reads from the content state, with how. */
function readsOf(name: string): Record<string, Read> {
  const reads: Record<string, Read> = {};
  for (const m of swiftStruct(payloadSwift, name).matchAll(
    /fields\.(string|number|flag)\("(\w+)"\)/g
  )) {
    reads[m[2]] = m[1] as Read;
  }
  return reads;
}

/** What a value the app sends is read as on the other side. */
function readAs(value: unknown): Read {
  if (typeof value === "boolean") return "flag";
  if (typeof value === "number") return "number";
  return "string";
}

const RUN = {
  distance: "3.4 km",
  pace: "5:12 /km",
  elapsed: "23:41",
  label: "Recording",
  paused: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetRunActivityForTests();
  __resetRestActivityForTests();
  startActivity.mockResolvedValue({ activityId: "act-1" });
});

describe("the data the app sends is the data the widget reads", () => {
  it("names each kind the widget draws", () => {
    // `kind` is read once, by the payload's own initialiser.
    expect(payloadSwift).toContain('switch fields.string("kind")');
    expect(payloadSwift).toContain('case "run":');
    expect(payloadSwift).toContain('case "rest":');
  });

  it("a run: every key sent is read, as the type it is sent as", async () => {
    await startRunActivity(RUN);
    const sent = startActivity.mock.calls[0][0].data as Record<string, unknown>;
    expect(sent.kind).toBe("run");
    expect(Object.keys(sent).sort()).toEqual([...RUN_ACTIVITY_KEYS].sort());
    const reads = readsOf("RunPayload");
    expect(Object.keys(reads).sort()).toEqual(
      RUN_ACTIVITY_KEYS.filter((k) => k !== "kind").sort()
    );
    for (const [key, how] of Object.entries(reads))
      expect(readAs(sent[key]), key).toBe(how);
  });

  it("a rest: every key sent is read, as the type it is sent as", async () => {
    await startRestActivity({
      startedAt: 1_000,
      endsAt: 91_000,
      exerciseName: "Bench Press",
      next: { name: "Set 2", load: "15 kg × 10" },
    });
    const sent = startActivity.mock.calls[0][0].data as Record<string, unknown>;
    expect(sent.kind).toBe("rest");
    expect(Object.keys(sent).sort()).toEqual([...REST_ACTIVITY_KEYS].sort());
    const reads = readsOf("RestPayload");
    expect(Object.keys(reads).sort()).toEqual(
      REST_ACTIVITY_KEYS.filter((k) => k !== "kind").sort()
    );
    for (const [key, how] of Object.entries(reads))
      expect(readAs(sent[key]), key).toBe(how);
    // Times are sent in ms and read as ms.
    expect(swiftStruct(payloadSwift, "RestPayload")).toContain(
      "Date(timeIntervalSince1970: end / 1000)"
    );
  });

  it("formats each run figure as the widget splits it: one space before the unit", () => {
    // figureAndUnit draws the unit smaller by splitting at the first space.
    expect(payloadSwift).toContain('label.firstIndex(of: " ")');
    for (const unit of ["km", "mi"] as const) {
      expect(distanceLabel(3420, unit)).toMatch(/^[\d.]+ \S+$/);
      expect(paceLabel(312, unit)).toMatch(/^\d+:\d\d \S+$/);
      expect(distanceLabel(0, unit)).toBe("—");
      expect(paceLabel(0, unit)).toBe("—");
    }
  });
});

describe("the widget draws in the app's colours and words", () => {
  const views = widget("TroposLiveActivity.swift");

  it("takes each colour from the theme", () => {
    const hex = (name: string) =>
      `#${views.match(new RegExp(`static let ${name} = Color\\(rgb: 0x([0-9A-F]{6})\\)`))?.[1]}`;
    expect(hex("surface")).toBe(THEME.surface);
    expect(hex("running")).toBe(THEME.running);
    expect(hex("lifting")).toBe(THEME.lifting);
    expect(hex("done")).toBe(THEME.success);
  });

  it("says what the rest band says", () => {
    const band = read("src/components/workout/CompactRestTimer.tsx");
    const rest = widget("RestActivityViews.swift");
    for (const words of ['"Rest done"', '"Rest"']) {
      expect(band).toContain(words);
      expect(rest).toContain(words);
    }
  });

  it("counts a rest down with the system's own timer and bar, which tick with the app asleep", () => {
    const rest = widget("RestActivityViews.swift");
    expect(rest).toContain(
      "Text(timerInterval: rest.interval, countsDown: true"
    );
    expect(rest).toContain(
      "ProgressView(timerInterval: rest.interval, countsDown: true)"
    );
  });
});

describe("the plugin the widget is built on", () => {
  const plugin = (p: string) =>
    read(`node_modules/capacitor-live-activities/${p}`);

  it("starts every activity with the attributes type the widget is configured for", () => {
    const attributes = plugin(
      "ios/LiveActivitiesKit/Core/DynamicActivityAttributes.swift"
    );
    expect(attributes).toMatch(
      /public struct DynamicActivityAttributes: ActivityAttributes/
    );
    expect(attributes).toContain("public var data: [String: AnyCodable]");
    expect(plugin("ios/Plugin/LiveActivities.swift")).toContain(
      "Activity<DynamicActivityAttributes>"
    );
    expect(widget("TroposLiveActivity.swift")).toContain(
      "ActivityConfiguration(for: DynamicActivityAttributes.self)"
    );
  });

  it("leaves the plugin's own widget out: one widget per attributes type", () => {
    const bundle = widget("LiveActivitiesBundle.swift");
    expect(bundle).toContain("TroposLiveActivity()");
    expect(bundle).not.toContain("DynamicActivityWidget");
  });

  it("takes an ended activity off the lock screen at once", () => {
    // patches/capacitor-live-activities+8.0.0.patch: the default policy
    // keeps an ended activity on the Lock Screen for up to four hours.
    const swift = plugin("ios/Plugin/LiveActivities.swift");
    expect(swift).toContain("dismissalPolicy: .immediate");
    expect(swift).not.toContain("dismissalPolicy: .default");
  });
});

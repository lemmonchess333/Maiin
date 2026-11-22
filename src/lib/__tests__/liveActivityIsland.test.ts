/**
 * The Dynamic Island's small views (Run26 call 1, the follow-up to Wid2):
 * what the app asks the plugin to draw in the compact and minimal views
 * of a run and of a lift, on a set and resting. The plugin draws each view from this
 * layout (`DynamicActivityWidget.swift`, `createMinimal` and
 * `createCompactTrailing`), so the layout is the whole of the change; only
 * a phone with an island shows the result (`docs/qa/pre-launch-backlog.md`).
 *
 * Apple: with Live Activities from two apps, the iPhone 18 Pro shows each
 * in its compact view at a reduced width, and other iPhones show each in
 * its minimal view ("Displaying live data with Live Activities"). So a
 * figure that music shares the island with is the minimal view on most
 * phones and the compact view's trailing side on the newest.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";

const startActivity = vi.fn();

vi.mock("capacitor-live-activities", () => ({
  LiveActivities: capacitorPlugin({
    startActivity: (...a: unknown[]) => startActivity(...a),
    updateActivity: vi.fn(),
    endActivity: vi.fn(async () => undefined),
    getAllActivities: vi.fn(async () => ({ activities: [] })),
  }),
}));
vi.mock("@/lib/platform", () => ({ isNativePlatform: vi.fn(() => true) }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { __resetLiveActivitiesForTests } from "@/lib/liveActivities";
import {
  __resetLiftActivityForTests,
  showLiftRest,
  showLiftSession,
} from "@/lib/liftLiveActivity";
import {
  __resetRunActivityForTests,
  startRunActivity,
} from "@/lib/runLiveActivity";

interface Element {
  type: string;
  properties: Record<string, unknown>[];
  children?: Element[];
}
interface Started {
  layout: Element;
  dynamicIslandLayout: {
    compactLeading: Element;
    compactTrailing: Element;
    minimal: Element;
  };
}

/** A property's value: the plugin's elements carry them as one-key objects. */
const prop = (element: Element, key: string): unknown =>
  element.properties.find((p) => key in p)?.[key];

/** Every element in a layout, depth first. */
const walk = (element: Element): Element[] => [
  element,
  ...(element.children ?? []).flatMap(walk),
];

const ENDS_AT = Date.UTC(2030, 0, 1, 12, 0, 0);

const LIFT = {
  name: "Push A",
  art: "bench-press" as const,
  set: {
    exerciseName: "Bench press",
    setLabel: "Set 3 of 4",
    load: "80 kg × 6",
    fact: "3/4",
  },
  setsDone: 2,
};

async function startedSet(): Promise<Started> {
  __resetLiftActivityForTests();
  await showLiftSession(LIFT);
  return startActivity.mock.calls.at(-1)![0] as Started;
}

async function startedRest(): Promise<Started> {
  __resetLiftActivityForTests();
  await showLiftSession(LIFT);
  await showLiftRest({ endsAt: ENDS_AT });
  return startActivity.mock.calls.at(-1)![0] as Started;
}

async function startedRun(): Promise<Started> {
  await startRunActivity({
    distance: "12.4 km",
    pace: "5:48 /km",
    elapsed: "1:12:30",
    label: "Long 14 km",
  });
  return startActivity.mock.calls.at(-1)![0] as Started;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetLiveActivitiesForTests();
  __resetLiftActivityForTests();
  __resetRunActivityForTests();
  startActivity.mockResolvedValue({ activityId: "act-1" });
});

describe("a rest in the island's smallest view", () => {
  it("shows the time left, not the dumbbell", async () => {
    const { dynamicIslandLayout } = await startedRest();
    const minimal = dynamicIslandLayout.minimal;
    // Apple: show updated information there rather than a mark, as the
    // Clock app's timer shows the time left.
    expect(minimal.type).toBe("timer");
    expect(prop(minimal, "endTime")).toBe(ENDS_AT);
    // Stops at 0:00 with the phone locked, as the card's own countdown.
    expect(prop(minimal, "style")).toBe("countdown");
    expect(prop(minimal, "fontSize")).toBe(12);
    expect(prop(minimal, "monospacedDigit")).toBe(true);
    // The system's timer text takes all the width it is given, so its
    // digits are set in the middle of the bubble.
    expect(prop(minimal, "alignment")).toBe("center");
    expect(JSON.stringify(minimal)).not.toContain("dumbbell");
  });
});

describe("the compact view's live figure", () => {
  it("is 12 pt on a run", async () => {
    const { dynamicIslandLayout } = await startedRun();
    const trailing = dynamicIslandLayout.compactTrailing;
    expect(prop(trailing, "text")).toBe("{{distanceValue}}");
    expect(prop(trailing, "fontSize")).toBe(12);
  });

  it("is the set's number at 12 pt on a set", async () => {
    const { dynamicIslandLayout } = await startedSet();
    const trailing = dynamicIslandLayout.compactTrailing;
    expect(prop(trailing, "text")).toBe("{{fact}}");
    expect(prop(trailing, "fontSize")).toBe(12);
  });

  it("is 12 pt in a rest", async () => {
    const { dynamicIslandLayout } = await startedRest();
    const trailing = dynamicIslandLayout.compactTrailing;
    expect(trailing.type).toBe("timer");
    expect(prop(trailing, "endTime")).toBe(ENDS_AT);
    expect(prop(trailing, "fontSize")).toBe(12);
  });

  it("keeps the sport's icon on the leading side", async () => {
    const run = await startedRun();
    expect(prop(run.dynamicIslandLayout.compactLeading, "systemName")).toBe(
      "figure.run"
    );
    const rest = await startedRest();
    expect(prop(rest.dynamicIslandLayout.compactLeading, "systemName")).toBe(
      "dumbbell.fill"
    );
    const set = await startedSet();
    expect(prop(set.dynamicIslandLayout.compactLeading, "systemName")).toBe(
      "dumbbell.fill"
    );
  });
});

describe("the island shared with music", () => {
  it("shows a run's distance at 12 pt, in whichever view the phone uses", async () => {
    const { dynamicIslandLayout } = await startedRun();
    for (const side of [
      dynamicIslandLayout.minimal,
      dynamicIslandLayout.compactTrailing,
    ]) {
      expect(side.type).toBe("text");
      expect(prop(side, "text")).toBe("{{distanceValue}}");
      expect(prop(side, "fontSize")).toBe(12);
    }
  });

  it("shows a rest's countdown at 12 pt, in whichever view the phone uses", async () => {
    const { dynamicIslandLayout } = await startedRest();
    for (const side of [
      dynamicIslandLayout.minimal,
      dynamicIslandLayout.compactTrailing,
    ]) {
      expect(side.type).toBe("timer");
      expect(prop(side, "endTime")).toBe(ENDS_AT);
      expect(prop(side, "fontSize")).toBe(12);
    }
  });
});

describe("the Lock Screen card, which an iPhone without an island shows", () => {
  it("keeps Wid2's figures, not the island's", async () => {
    const run = await startedRun();
    const runFigure = walk(run.layout).find(
      (el) => prop(el, "text") === "{{distanceValue}}"
    )!;
    expect(prop(runFigure, "fontSize")).toBe(34);
    // Wid2 call 2: the rest is the lift's card at the run's size, where the
    // rest-only card drew it at 28.
    const rest = await startedRest();
    const restFigure = walk(rest.layout).find((el) => el.type === "timer")!;
    expect(prop(restFigure, "fontSize")).toBe(34);
    // A set's weight and reps is longer than a countdown, so a little
    // smaller.
    const set = await startedSet();
    const setFigure = walk(set.layout).find(
      (el) => prop(el, "text") === "{{figure}}"
    )!;
    expect(prop(setFigure, "fontSize")).toBe(28);
  });
});

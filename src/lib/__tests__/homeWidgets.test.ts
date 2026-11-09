/**
 * The app's side of the widgets' plugin: inert off the phone and on a
 * build without the plugin, a snapshot written only when it says
 * something new (or its time needs refreshing), and the App Group's
 * queued drinks read as untrusted input.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  native: true,
  drinks: [] as unknown[],
  writeSnapshot: vi.fn(async (_o: { snapshot: string }) => {}),
  writeSections: vi.fn(async (_o: { sections: string }) => {}),
  clearSnapshot: vi.fn(async () => {}),
  removeQueuedDrinks: vi.fn(async (_o: { ids: string[] }) => {}),
}));

vi.mock("../platform", () => ({ isNativePlatform: () => H.native }));
vi.mock("@capacitor/core", async () => {
  const { capacitorPlugin } = await import("@/test/capacitorPlugin");
  return {
    registerPlugin: () =>
      capacitorPlugin({
        writeSnapshot: H.writeSnapshot,
        writeSections: H.writeSections,
        clearSnapshot: H.clearSnapshot,
        getQueuedDrinks: async () => ({ drinks: H.drinks }),
        removeQueuedDrinks: H.removeQueuedDrinks,
      }),
  };
});

import {
  SNAPSHOT_REWRITE_MS,
  __resetHomeWidgetsForTests,
  clearHomeWidgets,
  readWidgetDrinks,
  removeWidgetDrinks,
  widgetDrinkOf,
  writeHomeWidgetSections,
  writeHomeWidgetSnapshot,
} from "../homeWidgets";
import type {
  HomeWidgetSnapshot,
  WidgetFood,
  WidgetWater,
} from "../homeWidgetContract";

const FOOD: WidgetFood = {
  date: "2026-11-11",
  eaten: 1240,
  target: 2400,
  protein: 62,
  proteinTarget: 140,
  updatedAt: 1_000_000,
};
const WATER: WidgetWater = {
  date: "2026-11-11",
  ml: 750,
  targetMl: 2000,
  servingMl: 250,
  servingLabel: "Glass",
  drinkIds: ["d1"],
  updatedAt: 1_000_000,
};

const SNAPSHOT: HomeWidgetSnapshot = {
  version: 1,
  writtenAt: 1_000_000,
  account: "0a1b2c3d",
  days: [],
  week: null,
  streak: null,
  food: null,
  water: null,
};

const DRINK = {
  id: "E621E1F8-C36C-495A-93FC-0C247A3E6E5F",
  account: "0a1b2c3d",
  date: "2026-11-11",
  ml: 250,
  at: 1_762_850_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetHomeWidgetsForTests();
  H.native = true;
  H.drinks = [];
});

describe("writing the snapshot", () => {
  it("does nothing off the phone", async () => {
    H.native = false;
    expect(await writeHomeWidgetSnapshot(SNAPSHOT)).toBe(false);
    expect(H.writeSnapshot).not.toHaveBeenCalled();
  });

  it("hands native the snapshot as JSON", async () => {
    expect(await writeHomeWidgetSnapshot(SNAPSHOT)).toBe(true);
    expect(JSON.parse(H.writeSnapshot.mock.calls[0][0].snapshot)).toEqual(
      SNAPSHOT
    );
  });

  it("writes the same content again only once its time needs refreshing", async () => {
    await writeHomeWidgetSnapshot(SNAPSHOT);
    await writeHomeWidgetSnapshot({ ...SNAPSHOT, writtenAt: 1_000_500 });
    expect(H.writeSnapshot).toHaveBeenCalledTimes(1);
    await writeHomeWidgetSnapshot({
      ...SNAPSHOT,
      writtenAt: SNAPSHOT.writtenAt + SNAPSHOT_REWRITE_MS,
    });
    expect(H.writeSnapshot).toHaveBeenCalledTimes(2);
    // New content goes at once.
    await writeHomeWidgetSnapshot({
      ...SNAPSHOT,
      writtenAt: SNAPSHOT.writtenAt + SNAPSHOT_REWRITE_MS + 1,
      account: "ffffffff",
    });
    expect(H.writeSnapshot).toHaveBeenCalledTimes(3);
  });

  it("says a failed write did not land, and tries the same content again", async () => {
    H.writeSnapshot.mockRejectedValueOnce({ code: "UNIMPLEMENTED" });
    expect(await writeHomeWidgetSnapshot(SNAPSHOT)).toBe(false);
    expect(await writeHomeWidgetSnapshot(SNAPSHOT)).toBe(true);
    expect(H.writeSnapshot).toHaveBeenCalledTimes(2);
  });

  it("clears the widgets on sign-out without throwing, and writes afresh after", async () => {
    await writeHomeWidgetSnapshot(SNAPSHOT);
    H.clearSnapshot.mockRejectedValueOnce(new Error("older build"));
    await expect(clearHomeWidgets()).resolves.toBeUndefined();
    await writeHomeWidgetSnapshot(SNAPSHOT);
    expect(H.writeSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe("writing food or water on its own", () => {
  const sent = () =>
    H.writeSections.mock.calls.map((call) => JSON.parse(call[0].sections));

  it("hands native the section, for the account, and nothing else", async () => {
    expect(
      await writeHomeWidgetSections(
        { account: "0a1b2c3d", food: FOOD },
        1_000_000
      )
    ).toBe(true);
    expect(sent()).toEqual([{ account: "0a1b2c3d", food: FOOD }]);
    expect(H.writeSnapshot).not.toHaveBeenCalled();
  });

  it("writes the same figures again only once their time needs refreshing", async () => {
    await writeHomeWidgetSections(
      { account: "0a1b2c3d", water: WATER },
      1_000_000
    );
    await writeHomeWidgetSections(
      { account: "0a1b2c3d", water: { ...WATER, updatedAt: 1_000_500 } },
      1_000_500
    );
    expect(sent()).toHaveLength(1);
    // New figures go at once, and only the section that changed.
    await writeHomeWidgetSections(
      { account: "0a1b2c3d", food: FOOD, water: { ...WATER, ml: 1000 } },
      1_001_000
    );
    expect(sent().at(-1)).toEqual({
      account: "0a1b2c3d",
      food: FOOD,
      water: { ...WATER, ml: 1000 },
    });
    await writeHomeWidgetSections(
      { account: "0a1b2c3d", water: { ...WATER, ml: 1000 } },
      1_001_000 + SNAPSHOT_REWRITE_MS
    );
    expect(sent()).toHaveLength(3);
  });

  it("skips figures Home's whole snapshot has just written", async () => {
    await writeHomeWidgetSnapshot({ ...SNAPSHOT, food: FOOD, water: WATER });
    await writeHomeWidgetSections(
      { account: SNAPSHOT.account, food: { ...FOOD, updatedAt: 1_000_200 } },
      1_000_200
    );
    expect(H.writeSections).not.toHaveBeenCalled();
    // Another account's are its own.
    await writeHomeWidgetSections(
      { account: "ffffffff", food: FOOD },
      1_000_300
    );
    expect(H.writeSections).toHaveBeenCalledTimes(1);
  });

  it("does nothing off the phone, and says a refused write did not land", async () => {
    H.native = false;
    expect(await writeHomeWidgetSections({ account: "a", food: FOOD })).toBe(
      false
    );
    H.native = true;
    H.writeSections.mockRejectedValueOnce({ code: "UNIMPLEMENTED" });
    expect(await writeHomeWidgetSections({ account: "a", food: FOOD })).toBe(
      false
    );
    expect(await writeHomeWidgetSections({ account: "a", food: FOOD })).toBe(
      true
    );
  });
});

describe("the drinks the widget queued", () => {
  it("reads a drink as the widget writes it", () => {
    expect(widgetDrinkOf(DRINK)).toEqual(DRINK);
    expect(widgetDrinkOf({ ...DRINK, extra: "dropped" })).toEqual(DRINK);
  });

  it("refuses anything else", () => {
    for (const bad of [
      null,
      "drink",
      { ...DRINK, id: "../../etc" },
      { ...DRINK, date: "11/11/2026" },
      { ...DRINK, ml: "250" },
      { ...DRINK, ml: Number.NaN },
      { ...DRINK, at: undefined },
      { ...DRINK, account: 7 },
    ])
      expect(widgetDrinkOf(bad)).toBeNull();
  });

  it("returns the drinks, and the ids of entries that are not drinks so they can be cleared", async () => {
    H.drinks = [DRINK, { id: "AAAA-BBBB", ml: "lots" }, 42];
    expect(await readWidgetDrinks()).toEqual({
      drinks: [DRINK],
      unreadable: ["AAAA-BBBB"],
    });
  });

  it("reads none off the phone, and removes nothing when asked to remove none", async () => {
    H.native = false;
    H.drinks = [DRINK];
    expect(await readWidgetDrinks()).toEqual({ drinks: [], unreadable: [] });
    H.native = true;
    expect(await removeWidgetDrinks([])).toBe(false);
    expect(H.removeQueuedDrinks).not.toHaveBeenCalled();
    expect(await removeWidgetDrinks([DRINK.id])).toBe(true);
    expect(H.removeQueuedDrinks).toHaveBeenCalledWith({ ids: [DRINK.id] });
  });
});

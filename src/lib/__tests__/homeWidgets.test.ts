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
  writeHomeWidgetSnapshot,
} from "../homeWidgets";
import type { HomeWidgetSnapshot } from "../homeWidgetContract";

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

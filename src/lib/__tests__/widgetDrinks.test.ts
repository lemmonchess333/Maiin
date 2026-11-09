// @vitest-environment jsdom
/**
 * A drink the food widget's "+" queued is saved once (Wid1 call 2): through
 * the water log's own queue, under the id the widget made at the tap, so
 * the receipt for that id makes any second save a no-op. These run the
 * real queue against the one Firestore fake (ADR-0009); only the App
 * Group, which is native, is a stand-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/firebase", () => ({
  db: {},
  functions: {},
  auth: {
    get currentUser() {
      return mockUser;
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

/** The App Group, as the plugin keeps it: drinks by id. */
const appGroup = vi.hoisted(() => ({
  drinks: new Map<string, unknown>(),
  /** Make the next removal fail, as an app stopped mid-replay would. */
  failRemove: false,
}));
vi.mock("@/lib/homeWidgets", () => ({
  readWidgetDrinks: async () => ({
    drinks: [...appGroup.drinks.values()],
    unreadable: [],
  }),
  removeWidgetDrinks: async (ids: string[]) => {
    if (appGroup.failRemove) {
      appGroup.failRemove = false;
      return false;
    }
    for (const id of ids) appGroup.drinks.delete(id);
    return true;
  },
}));

import {
  replayWidgetDrinks,
  __resetWidgetDrinksForTests,
} from "../widgetDrinks";
import { flushWater, pendingWater } from "../waterActions";
import { widgetAccount, type WidgetDrink } from "../homeWidgetContract";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { addLocalDays, localDateString } from "../dateHelpers";

const TODAY = localDateString();
const YESTERDAY = localDateString(addLocalDays(new Date(), -1));
const ACCOUNT = widgetAccount("u1");

let n = 0;
function pour(over: Partial<WidgetDrink> = {}): WidgetDrink {
  n += 1;
  const drink: WidgetDrink = {
    id: `0000000${n}-AAAA-4BBB-8CCC-DDDDDDDDDDDD`,
    account: ACCOUNT,
    date: TODAY,
    ml: 250,
    at: Date.now() - 60_000 * n,
    ...over,
  };
  appGroup.drinks.set(drink.id, drink);
  return drink;
}

async function replayAndSync() {
  const saved = await replayWidgetDrinks("u1", 2000);
  await flushWater("u1");
  return saved;
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  appGroup.drinks.clear();
  appGroup.failRemove = false;
  mockUser = { uid: "u1" };
  __resetWidgetDrinksForTests();
});

afterEach(async () => {
  await flushWater("u1");
});

describe("saving the widget's drinks", () => {
  it("saves each drink once, under its own id and with its own time, then takes it out of the App Group", async () => {
    seedFirestore({ [`users/u1/waterLog/${TODAY}`]: { ml: 500 } });
    const a = pour();
    const b = pour({ ml: 500 });
    expect(await replayAndSync()).toBe(2);
    const doc = readDoc(`users/u1/waterLog/${TODAY}`) as {
      ml: number;
      waterReceipts: Record<string, { delta: number; at: number }>;
    };
    expect(doc.ml).toBe(1250);
    expect(doc.waterReceipts[a.id]).toEqual({ delta: 250, at: a.at });
    expect(doc.waterReceipts[b.id]).toEqual({ delta: 500, at: b.at });
    expect(appGroup.drinks.size).toBe(0);
    expect(pendingWater("u1")).toEqual([]);
  });

  it("an app stopped before the App Group was cleared saves nothing twice on its next open", async () => {
    pour();
    appGroup.failRemove = true;
    await replayAndSync();
    // The drink is still in the App Group: the next open replays it.
    expect(appGroup.drinks.size).toBe(1);
    await replayAndSync();
    expect(appGroup.drinks.size).toBe(0);
    expect(readDoc(`users/u1/waterLog/${TODAY}`)).toMatchObject({ ml: 250 });
  });

  it("two replays at once read the drinks once", async () => {
    pour();
    const [first, second] = await Promise.all([
      replayWidgetDrinks("u1", 2000),
      replayWidgetDrinks("u1", 2000),
    ]);
    await flushWater("u1");
    expect([first, second]).toEqual([1, 1]);
    expect(readDoc(`users/u1/waterLog/${TODAY}`)).toMatchObject({ ml: 250 });
  });

  it("a drink poured on an earlier day goes to that day, which keeps its own target", async () => {
    seedFirestore({
      [`users/u1/waterLog/${YESTERDAY}`]: { ml: 1000, targetMl: 2500 },
    });
    pour({ date: YESTERDAY });
    await replayAndSync();
    expect(readDoc(`users/u1/waterLog/${YESTERDAY}`)).toMatchObject({
      ml: 1250,
      targetMl: 2500,
    });
    expect(readDoc(`users/u1/waterLog/${TODAY}`)).toBeUndefined();
  });

  it("another account's drink, or an amount the log refuses, is cleared and never saved", async () => {
    pour({ account: widgetAccount("someone-else") });
    pour({ ml: 0 });
    pour({ ml: 99_999 });
    expect(await replayAndSync()).toBe(0);
    expect(appGroup.drinks.size).toBe(0);
    expect(readDoc(`users/u1/waterLog/${TODAY}`)).toBeUndefined();
  });

  it("a drink the queue cannot keep stays in the App Group for the next open", async () => {
    pour();
    // Signed out between the read and the save: the queue refuses.
    mockUser = null;
    expect(await replayWidgetDrinks("u1", 2000)).toBe(0);
    expect(appGroup.drinks.size).toBe(1);
    mockUser = { uid: "u1" };
    await replayAndSync();
    expect(readDoc(`users/u1/waterLog/${TODAY}`)).toMatchObject({ ml: 250 });
  });
});

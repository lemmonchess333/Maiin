import { describe, it, expect } from "vitest";
import { orderQuickAddItems, type QuickAddItem } from "../quickAddOrder";

/* The stable per-date cache contract for quick-add chips. The
 * cached order pins what the user saw last time; current is the
 * live keyed map computed from this render's freq + favourites
 * + defaults. The pure function combines them so stable rows
 * stay stable, vanished items drop, and brand-new items append
 * at the end without displacing the existing row. */

function item(key: string, name = key, cal = 100): QuickAddItem {
  return { key, name, cal, pro: 0, carb: 0, fat: 0, portionSize: "1 serving" };
}

describe("orderQuickAddItems", () => {
  it("renders items in the cached order", () => {
    const order = ["eggs", "oats", "shake"];
    const current = new Map([
      ["shake", item("shake")],
      ["oats", item("oats")],
      ["eggs", item("eggs")],
    ]);
    const out = orderQuickAddItems(order, current, 5);
    expect(out.map((i) => i.key)).toEqual(["eggs", "oats", "shake"]);
  });

  it("drops cached keys whose item is no longer present", () => {
    /* Vanished items can disappear because the user deleted
       every log for that food, or because the 30-day window
       rolled past their last entry. They drop silently rather
       than rebuilding the whole cache. */
    const order = ["eggs", "deleted-food", "oats"];
    const current = new Map([
      ["eggs", item("eggs")],
      ["oats", item("oats")],
    ]);
    const out = orderQuickAddItems(order, current, 5);
    expect(out.map((i) => i.key)).toEqual(["eggs", "oats"]);
  });

  it("appends new keys at the end without displacing cached order", () => {
    /* A freshly-logged food that wasn't in the cache should
       still appear in chips so the user can re-log it
       immediately. It lands at the end — the user's stable
       row keeps its position. */
    const order = ["eggs", "oats"];
    const current = new Map([
      ["eggs", item("eggs")],
      ["oats", item("oats")],
      ["banana", item("banana")], // new this session
    ]);
    const out = orderQuickAddItems(order, current, 5);
    expect(out.map((i) => i.key)).toEqual(["eggs", "oats", "banana"]);
  });

  it("respects the cap when cached + new exceed it", () => {
    const order = ["a", "b", "c"];
    const current = new Map([
      ["a", item("a")],
      ["b", item("b")],
      ["c", item("c")],
      ["d", item("d")], // new
      ["e", item("e")], // new
    ]);
    const out = orderQuickAddItems(order, current, 4);
    expect(out.map((i) => i.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("handles empty cache by returning current items in iteration order", () => {
    /* First-ever render for a date — no cache. The current map
       is iterated in insertion order, which is the freshly
       computed ranking. The caller seeds the cache from this
       result. */
    const current = new Map([
      ["top-rank", item("top-rank")],
      ["mid-rank", item("mid-rank")],
    ]);
    const out = orderQuickAddItems([], current, 5);
    expect(out.map((i) => i.key)).toEqual(["top-rank", "mid-rank"]);
  });

  it("handles empty current map (e.g. user deleted everything)", () => {
    const out = orderQuickAddItems(["a", "b", "c"], new Map(), 5);
    expect(out).toEqual([]);
  });

  it("preserves cached order even when ranking would have changed", () => {
    /* The whole point: even if a freshly-ranked computation
       would have placed "shake" first, the cache pins "eggs"
       at top until the date changes. */
    const order = ["eggs", "oats", "shake"];
    const current = new Map([
      ["shake", item("shake")], // would be #1 by frequency now
      ["oats", item("oats")],
      ["eggs", item("eggs")],
    ]);
    const out = orderQuickAddItems(order, current, 5);
    expect(out[0].key).toBe("eggs"); // cached order wins
  });
});

/* FOOD-01 — the persisted shape for a quick-add tap. Bundle chips
 * (multi-item historical meals) must re-log the ORIGINAL foodName +
 * full items[]; plain chips keep the single synthetic item. This is
 * the fix for repeats flattening a real dinner into one "Fish,
 * Fries +2" pseudo-food row. */
import { buildQuickAddMealPayload } from "../quickAddOrder";

describe("buildQuickAddMealPayload", () => {
  const bundleItem = (name: string, calories: number) => ({
    name,
    portionSize: "1 serving",
    calories,
    protein: 10,
    carbs: 20,
    fat: 5,
  });

  it("1-item (no bundle): keeps the existing single synthetic item", () => {
    const out = buildQuickAddMealPayload(item("oats", "Oats", 350));
    expect(out.foodName).toBe("Oats");
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toEqual({
      name: "Oats",
      portionSize: "1 serving",
      calories: 350,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  it("2-item bundle: re-logs the original foodName + both components", () => {
    const chip: QuickAddItem = {
      ...item("bacon and eggs", "Bacon and Eggs", 520),
      bundle: {
        foodName: "Bacon and Eggs",
        items: [bundleItem("Bacon", 220), bundleItem("Eggs", 300)],
      },
    };
    const out = buildQuickAddMealPayload(chip);
    expect(out.foodName).toBe("Bacon and Eggs");
    expect(out.items.map((i) => i.name)).toEqual(["Bacon", "Eggs"]);
  });

  it("3+-item bundle: composition survives and the smart display name is NOT persisted", () => {
    const chip: QuickAddItem = {
      // Display name is the flattened smart label — must not leak into
      // the persisted payload.
      ...item("plate", "Fish, Fries +2", 900),
      bundle: {
        foodName: "Plate with Fish, Fries, Salad, and Roasted Vegetables",
        items: [
          bundleItem("Fish", 300),
          bundleItem("Fries", 400),
          bundleItem("Salad", 80),
          bundleItem("Roasted Vegetables", 120),
        ],
      },
    };
    const out = buildQuickAddMealPayload(chip);
    expect(out.foodName).toBe(
      "Plate with Fish, Fries, Salad, and Roasted Vegetables"
    );
    expect(out.items).toHaveLength(4);
    expect(out.foodName).not.toContain("+2");
  });

  it("empty bundle items falls back to the synthetic path", () => {
    const chip: QuickAddItem = {
      ...item("odd", "Odd Meal", 100),
      bundle: { foodName: "Odd Meal", items: [] },
    };
    const out = buildQuickAddMealPayload(chip);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].name).toBe("Odd Meal");
  });
});

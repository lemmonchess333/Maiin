/**
 * offProductToPortion — the one Open Food Facts converter, shared by the
 * barcode lookup and the search results.
 *
 * The contract a logged row depends on: the numbers are per the
 * `servingSize` the row is labelled with. A stated gram serving scales the
 * per-100 g values to it and is trusted (`high`); anything else stays per
 * 100 g, says "100g", and asks the person to confirm (`low`). Calories come
 * from the per-100 g energy when OFF has one, else from the portion's own
 * macros, and the bare `energy-kcal` field (often per SERVING) is never
 * read. The search path once stored 100 g numbers under a "per 30 g" label
 * with the confirm banner suppressed; the first cases below are that row.
 */
import { describe, it, expect } from "vitest";
import {
  OFF_CREDIT,
  offProductToPortion,
  type OffProductLike,
} from "../offNutrition";

/** A cereal bar as OFF publishes it: everything per 100 g. */
const BAR_PER_100G = {
  "energy-kcal_100g": 400,
  proteins_100g: 10,
  carbohydrates_100g: 60,
  fat_100g: 12,
};

const bar = (fields: Partial<OffProductLike> = {}): OffProductLike => ({
  product_name: "Oat bar",
  brands: "Hillside",
  nutriments: BAR_PER_100G,
  ...fields,
});

describe("offProductToPortion — a stated gram serving", () => {
  it("scales every number to the serving and trusts the label", () => {
    expect(offProductToPortion(bar({ serving_size: "30 g" }))).toEqual({
      name: "Oat bar",
      brand: "Hillside",
      servingSize: "30 g",
      servingGrams: 30,
      calories: 120,
      protein: 3,
      carbs: 18,
      fat: 3.6,
      unitConfidence: "high",
    });
  });

  it("reads the grams out of a counted serving and keeps OFF's own wording", () => {
    const portion = offProductToPortion(bar({ serving_size: "1 bar (45g)" }));
    expect(portion.servingSize).toBe("1 bar (45g)");
    expect(portion.servingGrams).toBe(45);
    expect(portion.calories).toBe(180);
    expect(portion.protein).toBe(4.5);
    expect(portion.unitConfidence).toBe("high");
  });

  it("reads a decimal comma, which a French-origin database is full of", () => {
    const portion = offProductToPortion(bar({ serving_size: "32,5 g" }));
    expect(portion.servingGrams).toBe(32.5);
    expect(portion.calories).toBe(130);
    expect(portion.carbs).toBe(19.5);
  });

  it("trims the stated serving before using it as the label", () => {
    const portion = offProductToPortion(bar({ serving_size: "  30 g  " }));
    expect(portion.servingSize).toBe("30 g");
    expect(portion.servingGrams).toBe(30);
  });

  it("rounds macros to one decimal and calories to a whole number", () => {
    const portion = offProductToPortion({
      serving_size: "45 g",
      nutriments: {
        "energy-kcal_100g": 389,
        proteins_100g: 3.33,
        carbohydrates_100g: 71.11,
        fat_100g: 8.88,
      },
    });
    // 3.33 × 0.45 = 1.4985, 71.11 × 0.45 = 31.9995, 8.88 × 0.45 = 3.996,
    // 389 × 0.45 = 175.05.
    expect(portion).toMatchObject({
      protein: 1.5,
      carbs: 32,
      fat: 4,
      calories: 175,
    });
  });
});

describe("offProductToPortion — no gram serving to scale to", () => {
  it("stays per 100 g, says so, and asks for the serving when OFF states none", () => {
    expect(offProductToPortion(bar())).toEqual({
      name: "Oat bar",
      brand: "Hillside",
      servingSize: "100g",
      servingGrams: null,
      calories: 400,
      protein: 10,
      carbs: 60,
      fat: 12,
      unitConfidence: "low",
    });
  });

  it("does the same for a millilitre serving it cannot read as grams", () => {
    const portion = offProductToPortion(bar({ serving_size: "250 ml" }));
    expect(portion.servingSize).toBe("100g");
    expect(portion.servingGrams).toBeNull();
    expect(portion.calories).toBe(400);
    expect(portion.unitConfidence).toBe("low");
  });

  it("does the same for a serving of nothing", () => {
    for (const serving_size of ["0 g", "", "   "]) {
      const portion = offProductToPortion(bar({ serving_size }));
      expect(portion.servingSize).toBe("100g");
      expect(portion.servingGrams).toBeNull();
      expect(portion.protein).toBe(10);
      expect(portion.unitConfidence).toBe("low");
    }
  });
});

describe("offProductToPortion — calories", () => {
  it("never reads the bare energy-kcal field, which is often per serving", () => {
    // 210 is this product's per-SERVING energy. Scaled as if per 100 g it
    // would log a 30 g portion at 63 cal; the macros say 125.
    const portion = offProductToPortion({
      serving_size: "30 g",
      nutriments: {
        "energy-kcal": 210,
        proteins_100g: 10,
        carbohydrates_100g: 60,
        fat_100g: 15,
      },
    });
    // 3 g protein, 18 g carbs, 4.5 g fat: 12 + 72 + 40.5 = 124.5.
    expect(portion.calories).toBe(125);
  });

  it("takes the per-100 g energy over the macros when OFF has it", () => {
    const portion = offProductToPortion({
      serving_size: "30 g",
      nutriments: {
        "energy-kcal": 999,
        "energy-kcal_100g": 380,
        proteins_100g: 10,
        carbohydrates_100g: 60,
        fat_100g: 15,
      },
    });
    expect(portion.calories).toBe(114);
  });

  it("works the calories out from the macros when OFF only has kilojoules", () => {
    const portion = offProductToPortion({
      nutriments: {
        energy_100g: 1500,
        "energy-kj_100g": 1500,
        proteins_100g: 10,
        carbohydrates_100g: 60,
        fat_100g: 5,
      },
    });
    // 40 + 240 + 45, per 100 g; not 1500, and not 1500 kJ in kcal (359).
    expect(portion.calories).toBe(325);
  });

  it("falls back to the macros when the stated energy is zero", () => {
    const portion = offProductToPortion({
      serving_size: "50 g",
      nutriments: {
        "energy-kcal_100g": 0,
        proteins_100g: 20,
        carbohydrates_100g: 10,
        fat_100g: 2,
      },
    });
    // 10 g protein, 5 g carbs, 1 g fat: 40 + 20 + 9.
    expect(portion.calories).toBe(69);
  });

  it("agrees with the rounded macros the row shows when it uses them", () => {
    const portion = offProductToPortion({
      serving_size: "45 g",
      nutriments: {
        proteins_100g: 3.33,
        carbohydrates_100g: 71.11,
        fat_100g: 8.88,
      },
    });
    expect(portion.calories).toBe(
      Math.round(4 * portion.protein + 4 * portion.carbs + 9 * portion.fat)
    );
    expect(portion.calories).toBe(170);
  });
});

describe("offProductToPortion — missing and odd fields", () => {
  it("names a nameless product with the caller's fallback, else Unknown", () => {
    expect(offProductToPortion({}).name).toBe("Unknown");
    expect(offProductToPortion({ product_name: "   " }).name).toBe("Unknown");
    expect(offProductToPortion({}, "Barcode item").name).toBe("Barcode item");
    expect(
      offProductToPortion({ product_name: "  Skyr  " }, "Barcode item").name
    ).toBe("Skyr");
  });

  it("trims the brand, and leaves it empty when there is none", () => {
    expect(offProductToPortion({ brands: "  Arla " }).brand).toBe("Arla");
    expect(offProductToPortion({}).brand).toBe("");
  });

  it("reads zeros for a product with no nutriments at all", () => {
    expect(offProductToPortion({ product_name: "Water" })).toMatchObject({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      servingSize: "100g",
      unitConfidence: "low",
    });
  });

  it("reads numbers sent as strings, and zero for values that are not numbers", () => {
    const portion = offProductToPortion({
      serving_size: "40 g",
      nutriments: {
        proteins_100g: "12.5",
        carbohydrates_100g: "n/a",
        fat_100g: null,
        "energy-kcal_100g": { value: 300, unit: "kcal" },
      },
    });
    expect(portion).toMatchObject({
      protein: 5,
      carbs: 0,
      fat: 0,
      // No readable energy, so from the macros: 4 × 5.
      calories: 20,
      servingGrams: 40,
    });
  });
});

describe("OFF_CREDIT", () => {
  it("names Open Food Facts, as its database licence asks", () => {
    expect(OFF_CREDIT).toMatch(/Open Food Facts/);
  });
});

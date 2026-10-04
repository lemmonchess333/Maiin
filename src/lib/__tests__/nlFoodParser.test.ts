import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFoodText, getFoodSuggestions } from "@/lib/nlFoodParser";

describe("parseFoodText", () => {
  it("returns [] for empty input", () => {
    expect(parseFoodText("")).toEqual([]);
    expect(parseFoodText("   ")).toEqual([]);
  });

  it("parses a single food item with correct macros", () => {
    // No amount: one 150 g cooked portion, the main protein of a plate.
    const result = parseFoodText("chicken");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Chicken",
      calories: 248,
      protein: 47,
      carbs: 0,
      fat: 6,
    });
  });

  it("applies quantity multiplier", () => {
    const result = parseFoodText("2 eggs");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Eggs (x2)",
      calories: 156,
      protein: 12,
      carbs: 2,
      fat: 10,
    });
  });

  it("handles compound 'with' foods by summing macros", () => {
    const result = parseFoodText("toast with butter");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Toast with butter",
      calories: 180,
      protein: 3,
      carbs: 14,
      fat: 12,
    });
  });

  it("splits multiple comma-separated items", () => {
    const result = parseFoodText("2 eggs, toast");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Eggs (x2)");
    expect(result[1].name).toBe("Toast");
  });

  it("returns zero macros for unknown food", () => {
    const result = parseFoodText("xylophone");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Xylophone",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      unrecognized: true,
    });
  });

  it("matches food names case-insensitively", () => {
    const result = parseFoodText("CHICKEN");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBe(248);
    expect(result[0].protein).toBe(47);
    expect(result[0].carbs).toBe(0);
    expect(result[0].fat).toBe(6);
  });

  it("handles number glued to food name (no space): '2chocolate bars'", () => {
    const result = parseFoodText("2chocolate bars");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBeGreaterThan(0);
  });

  it("handles typos via fuzzy matching: 'chciken' → chicken", () => {
    const result = parseFoodText("chciken");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBe(248);
  });

  it("handles depluralized forms: 'chocolate bars' → chocolate", () => {
    const result = parseFoodText("chocolate bar");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBeGreaterThan(0);
  });

  it("merges eggs and boiled egg into a single row", () => {
    const result = parseFoodText("eggs, boiled egg");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBe(78 * 2);
    expect(result[0].protein).toBe(12);
  });

  it("merges across quantity prefixes", () => {
    const result = parseFoodText("2 eggs, 1 boiled egg");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBe(78 * 3);
  });

  it("does not merge fried egg with boiled egg (different macros)", () => {
    const result = parseFoodText("1 fried egg, 1 boiled egg");
    expect(result).toHaveLength(2);
  });

  it("preserves the first matched name on a merged row", () => {
    const result = parseFoodText("boiled egg, eggs");
    expect(result).toHaveLength(1);
    expect(result[0].name.toLowerCase()).toContain("boiled egg");
  });

  it("does not merge unrecognized rows", () => {
    const result = parseFoodText("glorpgorp, eggs");
    expect(result).toHaveLength(2);
    expect(result.some((r) => r.unrecognized)).toBe(true);
  });

  it("merges prawns and shrimp", () => {
    const result = parseFoodText("prawns, shrimp");
    expect(result).toHaveLength(1);
  });
});

describe("parseFoodText — mass/volume portion handling (PR O)", () => {
  it("scales macros against serving grams for '200g chicken'", () => {
    // chicken serving = "150g cooked", 248 cal: 200g is 4/3 of a serving.
    // That is 165 cal per 100 g, the reference, give or take the rounding
    // of the 150 g portion (247.5 to 248), so 331 rather than 330.
    // (The row said "85g cooked" over 165 cal until 2026-09-28, and this
    // test accepted the 388 cal that produced.)
    const result = parseFoodText("200g chicken");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBe(331);
    expect(result[0].portionLabel).toBe("200g");
  });

  it("rejects the pre-fix 33000-calorie bug for '200g chicken'", () => {
    const result = parseFoodText("200g chicken");
    expect(result[0].calories).toBeLessThan(1000);
  });

  it("handles 'kg' suffix: '1.5kg rice'", () => {
    // rice serving = "158g cooked", 200 cal
    // 1500g / 158g ≈ 9.49x → ~1899 cal
    const result = parseFoodText("1.5kg rice");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBeGreaterThan(1800);
    expect(result[0].calories).toBeLessThan(2000);
    expect(result[0].portionLabel).toBe("1.5kg");
  });

  it("scales macros against serving ml for '150ml milk'", () => {
    // milk serving = "240ml", 150 cal
    // 150ml / 240ml = 0.625x → ~94 cal
    const result = parseFoodText("150ml milk");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBeGreaterThan(80);
    expect(result[0].calories).toBeLessThan(110);
    expect(result[0].portionLabel).toBe("150ml");
  });

  it("handles 'l' suffix: '1l water' (zero-cal beverages still scale cleanly)", () => {
    const result = parseFoodText("1l orange juice");
    // orange juice serving = "240ml", 110 cal
    // 1000ml / 240ml ≈ 4.17x → ~459 cal
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBeGreaterThan(400);
    expect(result[0].calories).toBeLessThan(500);
    expect(result[0].portionLabel).toBe("1l");
  });

  it("tolerates whitespace between number and unit: '200 g chicken'", () => {
    const result = parseFoodText("200 g chicken");
    expect(result).toHaveLength(1);
    // The same amount as "200g chicken", space or none.
    expect(result[0].calories).toBe(331);
    expect(result[0].portionLabel).toBe("200g");
  });

  it("preserves portionLabel on unrecognised foods so the row is honest", () => {
    const result = parseFoodText("200g xylophone");
    expect(result).toHaveLength(1);
    expect(result[0].unrecognized).toBe(true);
    expect(result[0].portionLabel).toBe("200g");
    expect(result[0].calories).toBe(0);
  });

  it("does not merge two unit-prefixed rows of the same food", () => {
    // "200g chicken, 100g chicken" should stay as TWO rows; merging
    // loses the per-row portion semantics.
    const result = parseFoodText("200g chicken, 100g chicken");
    expect(result).toHaveLength(2);
    expect(result[0].portionLabel).toBe("200g");
    expect(result[1].portionLabel).toBe("100g");
  });

  it("does not regress count-based qty parsing: '2 eggs' unchanged", () => {
    const result = parseFoodText("2 eggs");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Eggs (x2)");
    expect(result[0].calories).toBe(156);
    expect(result[0].portionLabel).toBeUndefined();
  });

  it("does not regress 'a slice of toast' qty=1 fallback", () => {
    const result = parseFoodText("a slice of toast");
    expect(result).toHaveLength(1);
    expect(result[0].portionLabel).toBeUndefined();
  });

  it("name renders user-friendly: '200g chicken' → '200g chicken'", () => {
    const result = parseFoodText("200g chicken");
    expect(result[0].name).toBe("200g chicken");
  });
});

describe("getFoodSuggestions", () => {
  it("returns [] for short input", () => {
    expect(getFoodSuggestions("")).toEqual([]);
    expect(getFoodSuggestions("a")).toEqual([]);
  });

  it("returns suggestions for partial input 'choc'", () => {
    const results = getFoodSuggestions("choc");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((r) => r.name.toLowerCase().includes("chocolate"))
    ).toBe(true);
    expect(results[0]).toHaveProperty("serving");
  });

  it("returns suggestions for input with leading number '2choc'", () => {
    const results = getFoodSuggestions("2choc");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((r) => r.name.toLowerCase().includes("chocolate"))
    ).toBe(true);
  });

  it("returns fuzzy suggestions for typos 'chiken'", () => {
    const results = getFoodSuggestions("chiken");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name.toLowerCase().includes("chicken"))).toBe(
      true
    );
  });

  it("limits results to the specified limit", () => {
    const results = getFoodSuggestions("ch", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

/* Conjunctions. Before 2026-09-06 only commas / newlines separated foods
   and only ` with ` formed a compound, so an "and"-joined phrase reached
   findBestMatch whole: the longest key found anywhere won and the rest of
   the sentence was discarded. "2 eggs and a slice of toast" logged as two
   slices of toast (160 kcal, 6 g protein — the eggs vanished) and
   "chicken and rice" as chicken alone with 0 g carbs. Both were reproduced
   through the composer. The atoms below are the parser's own single-food
   answers, so the assertion is "the sentence equals its parts". */
describe("parseFoodText — conjunctions", () => {
  it('"2 eggs and a slice of toast" is two eggs AND a slice of toast', () => {
    const result = parseFoodText("2 eggs and a slice of toast");
    expect(result).toEqual([
      { name: "Eggs (x2)", calories: 156, protein: 12, carbs: 2, fat: 10 },
      { name: "Slice of toast", calories: 80, protein: 3, carbs: 14, fat: 1 },
    ]);
  });

  it('"chicken and rice" keeps the rice', () => {
    const result = parseFoodText("chicken and rice");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Chicken", calories: 248 });
    expect(result[1].name).toBe("Rice");
    expect(result[1].carbs).toBeGreaterThan(0);
  });

  it("a quantity belongs to the part it was written in", () => {
    const [eggs, toast] = parseFoodText("2 eggs and toast");
    expect(eggs).toMatchObject({ name: "Eggs (x2)", calories: 156 });
    expect(toast).toMatchObject({ name: "Toast", calories: 80 });
  });

  it("& and + join foods the same way", () => {
    expect(parseFoodText("eggs & toast").map((r) => r.name)).toEqual([
      "Eggs",
      "Toast",
    ]);
    expect(parseFoodText("eggs + toast").map((r) => r.name)).toEqual([
      "Eggs",
      "Toast",
    ]);
  });

  it("a whole-phrase dish stays one row", () => {
    const result = parseFoodText("fish and chips");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fish and chips");
  });

  it("a `with` compound on one side survives the split", () => {
    const names = parseFoodText("toast with butter and 2 eggs").map(
      (r) => r.name
    );
    expect(names).toEqual(["Toast with butter", "Eggs (x2)"]);
  });

  it("does not split when a part is unrecognised", () => {
    // "xqzv" resolves to nothing, so the phrase stays whole and takes the
    // pre-existing single-phrase path rather than inventing a second row.
    const result = parseFoodText("coffee and xqzvblorp");
    expect(result).toHaveLength(1);
  });

  it("commas still separate, and the two rules compose", () => {
    const names = parseFoodText("2 eggs and toast, a banana").map(
      (r) => r.name
    );
    expect(names).toEqual(["Eggs (x2)", "Toast", "Banana"]);
  });

  it('"on" joins two foods: beans on toast is beans and toast', () => {
    /* The longest name alone won, so this was a slice of toast. */
    expect(parseFoodText("beans on toast").map((r) => r.name)).toEqual([
      "Beans",
      "Toast",
    ]);
    expect(parseFoodText("2 eggs on toast").map((r) => r.name)).toEqual([
      "Eggs (x2)",
      "Toast",
    ]);
  });

  it('"on" before something that is not a food leaves the phrase whole', () => {
    expect(parseFoodText("chicken on the bone")).toEqual([
      { ...parseFoodText("chicken")[0], name: "Chicken on the bone" },
    ]);
  });

  it("a flavour of crisps is one bag, however the and is written", () => {
    for (const bag of [
      "salt and vinegar crisps",
      "cheese and onion crisps",
      "sour cream and onion crisps",
      "salt & vinegar crisps",
      "cheese & onion crisps",
    ]) {
      const rows = parseFoodText(bag);
      expect(rows, bag).toHaveLength(1);
      expect(rows[0].calories, bag).toBe(parseFoodText("crisps")[0].calories);
    }
    expect(parseFoodText("2 bags of cheese and onion crisps")[0].calories).toBe(
      2 * parseFoodText("crisps")[0].calories
    );
  });

  it('"&" names a dish as "and" does', () => {
    expect(parseFoodText("fish & chips")).toEqual([
      { ...parseFoodText("fish and chips")[0], name: "Fish & chips" },
    ]);
  });
});

describe("built-in servings lead with grams or ml", () => {
  /* The app weighs food in grams: the diary, the scan result and the
     edit sheet all do. The built-in list opened with American measures
     ("3 oz cooked (85g)", "1 cup (240ml)") for about 100 foods, so the
     suggestions under the text box said ounces to people who never
     use them. A weighed serving now leads with its metric amount; a
     counted one ("1 large (50g)", "1 tbsp (14g)") keeps its count. */
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../nlFoodParser.ts"),
    "utf8"
  );
  const servings = [...source.matchAll(/serving: "([^"]+)"/g)].map((m) => m[1]);

  it("has no serving measured in ounces or cups", () => {
    expect(servings.length).toBeGreaterThan(150);
    expect(servings.filter((s) => /\b(oz|cups?)\b/.test(s))).toEqual([]);
  });

  it("shows the grams first in a suggestion", () => {
    const chicken = getFoodSuggestions("chicken breast")[0];
    expect(chicken.serving).toBe("150g cooked");
  });

  it("still scales a weighed portion against the leading grams", () => {
    // 150g cooked, 248 cal: 300g is exactly two servings. This pinned
    // 170g at 330 cal, the product of a row that put 100 g of chicken's
    // figures under an 85 g label; foodDbIntegrity now checks the rows.
    expect(parseFoodText("300g chicken breast")[0].calories).toBe(496);
  });
});

describe("a typed food with no amount logs a portion someone eats", () => {
  /* The main protein of a plate is 150 g cooked, and foods eaten in pieces,
     slices or smaller amounts keep 100 g. At 100 g, "salmon, potatoes,
     broccoli" logged 393 kcal and "chicken breast, rice" 365, about a fifth
     short of the plate, and logged intake is what the adaptive TDEE learns
     from. Each case compares the bare food with the same food weighed, so
     it holds whatever the row's figures are. */
  const total = (text: string) =>
    parseFoodText(text).reduce((sum, item) => sum + item.calories, 0);

  it.each([
    "chicken",
    "chicken breast",
    "turkey",
    "beef",
    "steak",
    "mince",
    "ground beef",
    "pork",
    "lamb",
    "duck",
    "salmon",
    "fish",
    "cod",
    "tofu",
    "tempeh",
  ])("%s with no amount is a 150 g portion", (food) => {
    expect(parseFoodText(food)[0].calories).toBe(
      parseFoodText(`150g ${food}`)[0].calories
    );
  });

  it.each([
    "chicken thigh",
    "chicken wing",
    "ham",
    "tuna",
    "crab",
    "liver",
    "mackerel",
  ])("%s with no amount stays 100 g", (food) => {
    expect(parseFoodText(food)[0].calories).toBe(
      parseFoodText(`100g ${food}`)[0].calories
    );
  });

  it("logs a typed dinner at the size of the plate", () => {
    expect(total("salmon, potatoes, broccoli")).toBe(497);
    expect(total("chicken breast, rice")).toBe(448);
  });
});

describe("chips are chips, crisps are crisps", () => {
  /* The app speaks British English. "Chips" logged a 28 g bag of crisps,
     so "steak and chips" came to 152 kcal for the side. */
  it("logs chips as the fries they are", () => {
    expect(parseFoodText("chips")[0].calories).toBe(
      parseFoodText("fries")[0].calories
    );
    expect(parseFoodText("chips")[0].calories).toBe(365);
  });

  it("logs the chips in steak and chips", () => {
    const rows = parseFoodText("steak and chips");
    expect(rows.map((r) => r.name)).toEqual(["Steak", "Chips"]);
    expect(rows[1].calories).toBe(365);
  });

  it("keeps fish and chips as one dish", () => {
    const rows = parseFoodText("fish and chips");
    expect(rows).toHaveLength(1);
    expect(rows[0].calories).toBe(595);
  });

  it.each(["crisps", "potato chips"])("logs %s as the snack", (food) => {
    expect(parseFoodText(food)[0].calories).toBe(152);
  });

  it("logs tortilla chips as tortilla chips, not a tortilla", () => {
    /* The longest name in the text wins, and "tortilla" is longer than
       "chips", so this logged a wrap. */
    expect(parseFoodText("tortilla chips")[0].name).toBe("Tortilla chips");
    expect(parseFoodText("tortilla chips")[0].calories).toBe(140);
  });

  it("logs potato chips as crisps, not a potato", () => {
    expect(parseFoodText("potato chips")[0].name).toBe("Potato chips");
  });

  it("merges chips typed beside fries into one row, as one food", () => {
    expect(parseFoodText("chips, fries")).toHaveLength(1);
    expect(parseFoodText("crisps, potato chips")).toHaveLength(1);
  });
});

describe("a typo never turns one food into another", () => {
  /* A correction that lands on a different food logs the wrong thing with
     no warning, where a food the table does not know is flagged as
     unknown. Each word here is a real food or drink a letter or two from
     a row, and each was logged as that row: cider as liver, toffee as
     coffee, a pasty as pasta, 6 wings as 6 glasses of wine. None has a
     row of its own; give one a row and it leaves this list. */
  it.each([
    ["cider", "liver"],
    ["quiche", "juice"],
    ["gammon", "salmon"],
    ["pasty", "pasta"],
    ["pasties", "pasta"],
    ["kippers", "pepper"],
    ["bangers", "burger"],
    ["hake", "cake"],
    ["toffee", "coffee"],
    ["roast", "toast"],
    ["chops", "chips"],
    ["port", "pork"],
    ["sherry", "cherry"],
    ["bitter", "butter"],
    ["batter", "butter"],
    ["soba", "soda"],
    ["beet", "beef"],
    ["wings", "wine"],
    ["leek", "beef"],
    ["lemon", "melon"],
    ["salsa", "salad"],
    ["pesto", "pasta"],
    ["stew", "steak"],
    ["cola", "corn"],
    ["ale", "kale"],
    ["gin", "wine"],
    ["cob", "cod"],
    ["bun", "tuna"],
  ])("%s is not %s", (word) => {
    expect(parseFoodText(word)[0].unrecognized).toBe(true);
  });

  it.each([
    ["chciken", "chicken"],
    ["chiken", "chicken"],
    ["rcie", "rice"],
    ["tuan", "tuna"],
    ["mlik", "milk"],
    ["cofee", "coffee"],
    ["salmom", "salmon"],
    ["bananna", "banana"],
    ["avacado", "avocado"],
    ["brocolli", "broccoli"],
  ])("%s is still %s", (typo, food) => {
    const [typed] = parseFoodText(typo);
    const [meant] = parseFoodText(food);
    expect(typed.unrecognized).toBeUndefined();
    expect(typed).toMatchObject({
      calories: meant.calories,
      protein: meant.protein,
      carbs: meant.carbs,
      fat: meant.fat,
    });
  });
});

describe("foods that were logged as their neighbours", () => {
  /* Each of these matched a different row: Coke the cake row, a spring
     onion a whole onion, garlic bread a clove of garlic, a mince pie
     150 g of mince. */
  it.each([
    ["coke", 139],
    ["diet coke", 1],
    ["spring onion", 5],
    ["garlic bread", 204],
    ["mince pie", 224],
    ["jam", 56],
    ["sugar", 16],
    ["mash", 226],
    ["mashed potato", 226],
  ])("%s logs %i kcal", (food, kcal) => {
    expect(parseFoodText(food)[0].calories).toBe(kcal);
  });

  it("counts mince pies as pies", () => {
    /* "pies" lost its e as well as its s, which left "mince". */
    expect(parseFoodText("2 mince pies")[0].calories).toBe(2 * 224);
    expect(parseFoodText("2 pies")[0].calories).toBe(
      2 * parseFoodText("pie")[0].calories
    );
  });

  it("logs lager as the beer it is, and merges the two", () => {
    expect(parseFoodText("lager")).toEqual([
      { ...parseFoodText("beer")[0], name: "Lager" },
    ]);
    expect(parseFoodText("beer, lager")).toHaveLength(1);
  });

  it("reads the American omelet and the British houmous", () => {
    expect(parseFoodText("omelet")[0].calories).toBe(
      parseFoodText("omelette")[0].calories
    );
    expect(parseFoodText("houmous")[0].calories).toBe(
      parseFoodText("hummus")[0].calories
    );
  });
});

describe("milk in tea or coffee is a splash", () => {
  /* "Tea with milk" added a 240 ml glass of milk to the cup, 152 kcal for
     a cup of tea, on a drink logged several times a day. */
  const splash = (food: string) => {
    const [glass] = parseFoodText(`240ml ${food}`);
    return (glass.calories * 30) / 240;
  };

  it.each(["tea", "coffee", "cup of tea", "espresso"])(
    "%s with milk adds 30 ml of milk",
    (drink) => {
      expect(parseFoodText(`${drink} with milk`)[0].calories).toBe(
        Math.round(parseFoodText(drink)[0].calories + splash("milk"))
      );
    }
  );

  it("whatever the milk", () => {
    expect(parseFoodText("tea with oat milk")[0].calories).toBe(
      Math.round(parseFoodText("tea")[0].calories + splash("oat milk"))
    );
  });

  it("and a count is cups of it", () => {
    expect(parseFoodText("2 cups of tea with milk")[0].calories).toBe(
      Math.round(2 * (parseFoodText("tea")[0].calories + splash("milk")))
    );
  });

  it("only the milk: cream keeps its tablespoon", () => {
    expect(parseFoodText("coffee with cream")[0].calories).toBe(
      parseFoodText("coffee")[0].calories + parseFoodText("cream")[0].calories
    );
  });

  it("but milk on cereal is still a glass of it", () => {
    expect(parseFoodText("cereal with milk")[0].calories).toBe(
      parseFoodText("cereal")[0].calories + parseFoodText("milk")[0].calories
    );
  });

  it("and sugar is its own row", () => {
    expect(parseFoodText("tea with milk and 2 sugars")).toEqual([
      parseFoodText("tea with milk")[0],
      parseFoodText("2 sugars")[0],
    ]);
  });
});

describe("a pint is 568 ml", () => {
  /* A British pint. Read as a count, a pint of beer logged one 355 ml
     can and a pint of milk one 240 ml glass. */
  it.each([
    ["a pint of beer", "beer", 1],
    ["pint of lager", "lager", 1],
    ["a pint of milk", "milk", 1],
    ["2 pints of lager", "lager", 2],
    ["1.5 pints of beer", "beer", 1.5],
    ["half a pint of milk", "milk", 0.5],
    ["half pint of beer", "beer", 0.5],
  ] as const)("%s", (text, food, pints) => {
    const [row] = parseFoodText(text);
    expect(row.calories).toBe(
      parseFoodText(`${568 * pints}ml ${food}`)[0].calories
    );
    expect(row.portionLabel).toBe(
      pints === 0.5 ? "half a pint" : `${pints} pint${pints === 1 ? "" : "s"}`
    );
  });

  it("names the row the way it was ordered", () => {
    expect(parseFoodText("a pint of lager")[0].name).toBe("1 pint of lager");
    expect(parseFoodText("2 pints of beer")[0].name).toBe("2 pints of beer");
    expect(parseFoodText("half a pint of milk")[0].name).toBe(
      "Half a pint of milk"
    );
  });

  it("keeps the pint on a drink it does not know", () => {
    expect(parseFoodText("a pint of cider")[0]).toMatchObject({
      name: "1 pint of cider",
      portionLabel: "1 pint",
      unrecognized: true,
    });
  });

  it("does not read pinto beans as pints", () => {
    expect(parseFoodText("pinto beans")[0].portionLabel).toBeUndefined();
  });

  it("and joins a round the way any amount does", () => {
    expect(
      parseFoodText("2 pints of beer and a packet of crisps").map((r) => r.name)
    ).toEqual(["2 pints of beer", "Packet of crisps"]);
  });
});

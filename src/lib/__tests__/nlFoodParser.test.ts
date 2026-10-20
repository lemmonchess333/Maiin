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

  it("an unrecognised food after and is a row of its own", () => {
    /* Kept whole, the phrase went to the longest key found inside it and
       took that key's macros under the whole phrase's name. A part nobody
       recognises is its own row now, with no macros, which the composer's
       "Couldn't find macros for" warning names. */
    const result = parseFoodText("coffee and xqzvblorp");
    expect(result.map((r) => r.name)).toEqual(["Coffee", "Xqzvblorp"]);
    expect(result[1]).toMatchObject({ calories: 0, unrecognized: true });
  });

  it("logs every food in a meal that names one the table lacks", () => {
    /* Typed in the Food pass, before the table had a flat white: one row
       named "Scrambled eggs on toast and a flat white (x2)" with the eggs'
       182 kcal, the toast and the coffee in the name and in nothing else,
       and no warning. The unknown food here is made up, so the case holds
       whatever the table learns. */
    const result = parseFoodText("2 scrambled eggs on toast and a vlorpcake");
    expect(result.map((r) => r.name)).toEqual([
      "Scrambled eggs (x2)",
      "Toast",
      "Vlorpcake",
    ]);
    expect(result[0].calories).toBe(
      parseFoodText("2 scrambled eggs")[0].calories
    );
    expect(result[1].calories).toBe(parseFoodText("toast")[0].calories);
    expect(result[2]).toMatchObject({ calories: 0, unrecognized: true });
  });

  it("a phrase with no food in it stays whole", () => {
    expect(parseFoodText("xqzv and blorp")).toHaveLength(1);
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
     coffee, a pasty as pasta. None has a
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

describe("a count of a food eaten in pieces counts pieces", () => {
  /* Wings, prawns and berries are weighed by the portion, so a count
     multiplied portions: "6 chicken wings" logged 600 g of wings. */
  const grams = (food: string, g: number) =>
    parseFoodText(`${g}g ${food}`)[0].calories;

  it.each([
    ["6 chicken wings", "chicken wing", 6 * 34],
    ["6 wings", "chicken wing", 6 * 34],
    ["a chicken wing", "chicken wing", 34],
    ["2 chicken thighs", "chicken thigh", 2 * 52],
    ["10 prawns", "prawns", 10 * 6],
    ["4 sardines", "sardines", 4 * 12],
    ["5 strawberries", "strawberries", 5 * 12],
    ["10 grapes", "grapes", 10 * 5],
    ["3 mushrooms", "mushrooms", 3 * 18],
    ["10 almonds", "almonds", 12],
  ] as const)("%s weighs what the pieces weigh", (text, food, g) => {
    expect(parseFoodText(text)[0].calories).toBe(grams(food, g));
  });

  it("logs a bare food as the portion it always was", () => {
    expect(parseFoodText("chicken wings")[0].calories).toBe(
      grams("chicken wing", 100)
    );
    expect(parseFoodText("grapes")[0].calories).toBe(grams("grapes", 92));
  });

  it("keeps counting the thing the count was written against", () => {
    expect(parseFoodText("2 cans of sardines")[0].calories).toBe(
      2 * parseFoodText("sardines")[0].calories
    );
  });

  it("logs wings with their skin, as they are eaten", () => {
    expect(parseFoodText("100g chicken wing")[0].calories).toBe(290);
  });
});

/* Everyday foods the table lacked. Typed in the Food pass, "2 scrambled
   eggs on toast and a flat white" counted the eggs alone: there was no
   flat white, nor honey, sourdough, a jacket potato or the plated dishes
   people type by name, so each logged nothing. */
describe("parseFoodText — everyday foods", () => {
  it("counts the coffee in a cafe breakfast", () => {
    const result = parseFoodText("2 scrambled eggs on toast and a flat white");
    expect(result.map((r) => r.name)).toEqual([
      "Scrambled eggs (x2)",
      "Toast",
      "Flat white",
    ]);
    expect(result[2].calories).toBeGreaterThan(0);
  });

  it("knows the cafe coffees, honey and sourdough", () => {
    for (const food of ["an americano", "a mocha", "honey", "sourdough"]) {
      expect(parseFoodText(food)[0].calories, food).toBeGreaterThan(0);
    }
  });

  it("logs a plated dish by its name, as one meal", () => {
    for (const dish of [
      "spaghetti bolognese",
      "lasagne",
      "lasagna",
      "chilli con carne",
      "mac and cheese",
      "macaroni cheese",
      "bangers and mash",
      "jacket potato",
    ]) {
      const result = parseFoodText(dish);
      expect(result, dish).toHaveLength(1);
      expect(result[0].calories, dish).toBeGreaterThan(200);
    }
  });

  it("merges the two spellings of one dish", () => {
    expect(parseFoodText("lasagne, lasagna")).toHaveLength(1);
    expect(parseFoodText("mac and cheese, macaroni cheese")).toHaveLength(1);
  });
});

describe("quantities inside with phrases", () => {
  const calories = (text: string) =>
    parseFoodText(text).reduce((sum, item) => sum + item.calories, 0);
  const totals = (text: string) =>
    parseFoodText(text).reduce(
      (sum, item) => ({
        calories: sum.calories + item.calories,
        protein: sum.protein + item.protein,
        carbs: sum.carbs + item.carbs,
        fat: sum.fat + item.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  it.each([
    ["200g chicken with rice", "200g chicken, rice"],
    ["200 g chicken with 158g rice", "200 g chicken, 158g rice"],
    ["150ml milk with 2 eggs", "150ml milk, 2 eggs"],
    ["0g chicken with rice", "0g chicken, rice"],
    ["0ml milk with 2 eggs", "0ml milk, 2 eggs"],
    ["2 eggs with 2 toast", "2 eggs, 2 toast"],
    ["2 eggs with 200g rice", "2 eggs, 200g rice"],
    ["2 coffee with 50ml milk", "2 coffee, 50ml milk"],
    ["2 cereal with 150ml milk", "2 cereal, 150ml milk"],
    ["0 eggs with 2 toast", "0 eggs, 2 toast"],
    ["0 eggs with 200g rice", "0 eggs, 200g rice"],
    ["0 coffee with 50ml milk", "0 coffee, 50ml milk"],
    ["2 eggs with 0 toast", "2 eggs, 0 toast"],
    ["2 eggs with 0g rice", "2 eggs, 0g rice"],
    ["2 coffee with 0ml milk", "2 coffee, 0ml milk"],
    ["2 coffee with 1 splash of milk", "2 coffee, 30ml milk"],
    ["2 coffee with 0 splash of milk", "2 coffee, 0ml milk"],
    ["0 coffee with 1 splash of milk", "0 coffee, 30ml milk"],
    ["2 coffee with 2 splashes of milk", "2 coffee, 60ml milk"],
    ["10 almonds with 1 yogurt", "10 almonds, 1 yogurt"],
    ["2 chicken wings with 1 rice", "2 chicken wings, 1 rice"],
    ["almonds with 1 yogurt", "almonds, 1 yogurt"],
    ["2 cans of sardines with 1 rice", "2 cans of sardines, 1 rice"],
    ["0 almonds with 1 yogurt", "0 almonds, 1 yogurt"],
  ])("applies each explicit quantity once: %s", (compound, separate) => {
    expect(totals(compound)).toEqual(totals(separate));
  });
  it("keeps explicit quantities in the compound name instead of suggesting the whole meal repeats", () => {
    expect(parseFoodText("2 eggs with 2 toast")[0].name).toBe(
      "2 eggs with 2 toast"
    );
  });
  it("keeps a zero base and implicit per-serving additions at zero", () => {
    expect(totals("0 toast with butter")).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(totals("0 tea with milk")).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
  it("comma and and joins agree on toast plus two eggs", () => {
    expect(calories("toast, 2 eggs")).toBe(236);
    expect(calories("toast and 2 eggs")).toBe(236);
  });
  it("preserves the explicit egg count inside a with phrase", () => {
    expect(calories("toast with 2 eggs")).toBe(calories("toast, 2 eggs"));
  });
  it("preserves the explicit rice weight inside a with phrase", () => {
    expect(calories("chicken with 200g rice")).toBe(
      calories("chicken, 200g rice")
    );
  });
  it("preserves milk explicitly measured in ml without applying the implied splash", () => {
    expect(calories("coffee with 50ml milk")).toBe(
      calories("coffee, 50ml milk")
    );
    expect(calories("cereal with 150ml milk")).toBe(
      calories("cereal, 150ml milk")
    );
  });
  it("preserves a counted piece food inside a with phrase", () => {
    expect(calories("toast with 10 almonds")).toBe(
      calories("toast, 10 almonds")
    );
  });
  it("preserves outer quantity and implied milk splash semantics", () => {
    expect(calories("2 cups of tea with milk")).toBe(
      2 * calories("tea with milk")
    );
    expect(calories("2 toast with butter")).toBe(
      2 * calories("toast with butter")
    );
    expect(calories("tea with milk")).toBe(21);
    expect(calories("tea with a splash of milk")).toBe(
      calories("tea with milk")
    );
    expect(calories("2 cups of tea with a splash of milk")).toBe(
      calories("2 cups of tea with milk")
    );
    expect(calories("coffee with 2 splashes of milk")).toBe(
      Math.round(calories("coffee") + (calories("milk") * 60) / 240)
    );
  });
});

describe("incomplete with phrases", () => {
  it.each([
    ["chicken with tahini", "Tahini"],
    ["tahini with chicken", "Tahini"],
    ["200g chicken with 30g tahini", "30g tahini"],
    ["chicken with tahini with rice", "Tahini"],
  ])("preserves the unresolved ingredient in %s", (text, missing) => {
    const rows = parseFoodText(text);
    expect(rows.find((row) => row.unrecognized)).toMatchObject({
      name: missing,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(
      rows
        .filter((row) => !row.unrecognized)
        .every((row) => !row.name.toLowerCase().includes("tahini"))
    ).toBe(true);
    expect(rows.some((row) => !row.unrecognized && row.calories > 0)).toBe(
      true
    );
  });
});

describe("measured quantities require a compatible nutrition reference", () => {
  it.each([
    ["50g milk", "240ml", "ml"],
    ["500g milk", "240ml", "ml"],
    ["5ml olive oil", "1 tbsp (14g)", "g"],
    ["50ml olive oil", "1 tbsp (14g)", "g"],
    ["150ml chicken", "150g cooked", "g"],
    ["200g pizza", "1 slice", null],
    ["a pint of pizza", "1 slice", null],
  ] as const)(
    "requires correction for %s instead of substituting one serving",
    (text, referencePortion, expectedUnit) => {
      const rows = parseFoodText(text);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        quantityIssue: { referencePortion, expectedUnit },
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      });
      expect(rows[0].unrecognized).not.toBe(true);
      expect(rows[0].portionLabel).toBeDefined();
    }
  );

  it.each([
    ["50g milk with 2 eggs", "50g milk"],
    ["chicken with 5ml olive oil", "5ml olive oil"],
    ["2 coffee with 50g milk", "50g milk"],
    ["2 eggs and 50ml olive oil", "50ml olive oil"],
  ])("keeps the incompatible part visible in %s", (text, unresolved) => {
    const rows = parseFoodText(text);
    const issue = rows.find((row) => row.quantityIssue);
    expect(issue?.name.toLowerCase()).toBe(unresolved);
    expect(issue?.calories).toBe(0);
    expect(
      rows
        .filter((row) => !row.quantityIssue)
        .every((row) => !row.name.toLowerCase().includes(unresolved))
    ).toBe(true);
    expect(rows.some((row) => !row.quantityIssue && row.calories > 0)).toBe(
      true
    );
  });

  it.each([
    ["120ml milk", 75, 4, 6, 4],
    ["240ml milk", 150, 8, 12, 8],
    ["0.24l milk", 150, 8, 12, 8],
    ["7g olive oil", 60, 0, 0, 7],
    ["14g olive oil", 119, 0, 0, 14],
    ["0.014kg olive oil", 119, 0, 0, 14],
    ["2 eggs", 156, 12, 2, 10],
  ] as const)(
    "retains independently calculated macros for %s",
    (text, calories, protein, carbs, fat) => {
      // References: milk 150/8/12/8 per 240ml; oil 119/0/0/14 per 14g;
      // one egg 78/6/1/5. Scaling happens before whole-gram rounding.
      expect(parseFoodText(text)).toEqual([
        expect.objectContaining({ calories, protein, carbs, fat }),
      ]);
      expect(parseFoodText(text)[0].quantityIssue).toBeUndefined();
    }
  );
});

describe("a measure written after the food", () => {
  /* extractQty read a measure only from the start, so "chicken breast 200g"
     logged the row's 150 g serving (248 kcal) under a name that said 200g.
     References: chicken breast 248 per 150 g, milk 150 per 240 ml. */
  it.each([
    ["chicken breast 200g", "200g chicken breast", 331, "200g"],
    ["chicken breast 200 g", "200g chicken breast", 331, "200g"],
    ["chicken breast 0.2kg", "0.2kg chicken breast", 331, "0.2kg"],
    ["milk 300ml", "300ml milk", 188, "300ml"],
    ["a chicken breast 200g", "200g chicken breast", 331, "200g"],
  ] as const)("%s logs the typed amount", (text, name, calories, label) => {
    expect(parseFoodText(text)).toEqual([
      expect.objectContaining({ name, calories, portionLabel: label }),
    ]);
  });

  it("logs the same as the measure written first", () => {
    expect(parseFoodText("chicken breast 200g")).toEqual(
      parseFoodText("200g chicken breast")
    );
  });

  it("a base food's own measure stands inside a with phrase", () => {
    // 331 for the chicken; the rice keeps its normal serving.
    const rice = parseFoodText("rice")[0].calories;
    expect(parseFoodText("chicken breast 200g with rice")[0].calories).toBe(
      331 + rice
    );
  });

  it("a leading count still wins over a trailing number", () => {
    expect(parseFoodText("2 eggs")[0]).toMatchObject({ calories: 156 });
  });
});

describe("a count written as a fraction or a word", () => {
  /* A fraction was no count (half an avocado logged the whole one, 240 kcal)
     and a number word was part of the name ("two eggs" logged one egg).
     References: avocado 240 per one, egg 78 per one, lager 245 per pint. */
  it.each([
    ["half an avocado", "Avocado (x0.5)", 120],
    ["half avocado", "Avocado (x0.5)", 120],
    ["a half of an avocado", "Avocado (x0.5)", 120],
    ["1/2 avocado", "Avocado (x0.5)", 120],
    ["½ avocado", "Avocado (x0.5)", 120],
    ["1 1/2 avocados", "Avocados (x1.5)", 360],
    ["two eggs", "Eggs (x2)", 156],
    ["Three eggs", "Eggs (x3)", 234],
    ["one egg", "Egg", 78],
  ] as const)("%s", (text, name, calories) => {
    expect(parseFoodText(text)).toEqual([
      expect.objectContaining({ name, calories }),
    ]);
  });

  it("two pints are two pints, and half a pint written as a fraction", () => {
    expect(parseFoodText("two pints of lager")[0]).toMatchObject({
      name: "2 pints of lager",
      calories: 490,
      portionLabel: "2 pints",
    });
    expect(parseFoodText("1/2 pint of milk")).toEqual(
      parseFoodText("half a pint of milk")
    );
  });
});

describe("oats by their packet names are weighed dry", () => {
  /* "porridge" is a cooked bowl (234 g), so "50g porridge oats" found it and
     logged 32 kcal. Oats are 150 per 40 g dry: 50 g is 188. "50g porridge"
     stays the cooked bowl: by weight, porridge is the porridge. */
  it.each([
    ["50g porridge oats", 188],
    ["50g rolled oats", 188],
    ["50g oats", 188],
    ["50g porridge", 32],
  ] as const)("%s", (text, calories) => {
    expect(parseFoodText(text)[0]).toMatchObject({ calories });
  });

  it("a bowl of porridge and a portion of porridge oats are the same food", () => {
    expect(parseFoodText("porridge")[0].calories).toBe(
      parseFoodText("porridge oats")[0].calories
    );
  });
});

describe("a count of the unit a serving is written in", () => {
  /* G4-12: a row whose serving counts its own units ("2 tbsp (32g)",
     "2 slices (16g)", "1 omelette (2 eggs)") was multiplied by the typed
     count again, so "2 tbsp peanut butter" logged 376 kcal where its own
     row says 188, and "3 egg omelette" logged six eggs. References:
     peanut butter 188 per 2 tbsp, bacon 90 per 2 slices, omelette 154
     per 2 eggs. */
  it.each([
    ["2 tbsp peanut butter", 188],
    ["1 tbsp peanut butter", 94],
    ["4 tbsp peanut butter", 376],
    ["2 slices of bacon", 90],
    ["4 slices of bacon", 180],
    ["a slice of bacon", 45],
    ["3 egg omelette", 231],
  ] as const)("%s", (text, calories) => {
    expect(parseFoodText(text)[0]).toMatchObject({ calories });
  });

  it("keeps counting servings when the serving counts something else", () => {
    // The anchors: toast is "1 slice", rice a weighed bowl, an egg "1 large".
    expect(parseFoodText("2 slices of toast")[0].calories).toBe(
      2 * parseFoodText("toast")[0].calories
    );
    expect(parseFoodText("2 cups of rice")[0].calories).toBe(
      2 * parseFoodText("rice")[0].calories
    );
    expect(parseFoodText("2 eggs")[0].calories).toBe(
      2 * parseFoodText("egg")[0].calories
    );
  });
});

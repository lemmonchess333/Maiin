/**
 * The Food diary's pictures (DS4, DESIGN_GUIDE §14m rule 25): every row
 * that stands for a meal carries one. A meal's own photo, read from the
 * device (Food9), comes first; this file picks our drawing for a meal
 * without one, from the names it was logged under, and words the diary's
 * empty day. Pure, so it is tested without rendering the diary.
 */
import { FOOD_ART, type FoodArtKind } from "@/lib/foodArt.data";

/** The diary's line on a day with nothing logged. Never "No … yet". */
export function emptyDiaryLine(isToday: boolean): string {
  return isToday
    ? "Meals you log today show here."
    : "Nothing was logged on this day.";
}

/* Each drawing and the words in a meal's name that call for it, checked
   in this order: the first kind with a word in the name wins, so "egg
   sandwich" is bread, "chicken salad" a salad and "protein shake" a
   drink: the dish is the drawing, and its ingredients come after. Whole
   words only, so "tea" is not found in "steak". */
const FOOD_ART_WORDS: readonly [FoodArtKind, readonly string[]][] = [
  [
    "drink",
    [
      "coffee",
      "latte",
      "cappuccino",
      "espresso",
      "americano",
      "flat white",
      "mocha",
      "tea",
      "juice",
      "milk",
      "shake",
      "smoothie",
      "cola",
      "coke",
      "beer",
      "wine",
      "lemonade",
      "kombucha",
    ],
  ],
  [
    "sweet",
    [
      "chocolate",
      "biscuit",
      "biscuits",
      "cookie",
      "cookies",
      "cake",
      "brownie",
      "muffin",
      "donut",
      "doughnut",
      "ice cream",
      "dessert",
      "sweets",
      "candy",
      "crisps",
      "popcorn",
      "nuts",
      "almonds",
      "peanuts",
      "bar",
      "flapjack",
    ],
  ],
  ["salad", ["salad", "slaw", "stir fry"]],
  [
    "bread",
    [
      "sandwich",
      "toast",
      "bread",
      "bagel",
      "wrap",
      "burrito",
      "burger",
      "pizza",
      "roll",
      "croissant",
      "pancake",
      "pancakes",
      "waffle",
      "waffles",
      "pitta",
      "pita",
      "tortilla",
      "sub",
      "panini",
      "crumpet",
    ],
  ],
  [
    "bowl",
    [
      "oats",
      "oatmeal",
      "porridge",
      "cereal",
      "granola",
      "muesli",
      "yoghurt",
      "yogurt",
      "skyr",
      "soup",
      "stew",
      "chilli",
      "chili",
      "bowl",
    ],
  ],
  [
    "grains",
    [
      "pasta",
      "spaghetti",
      "penne",
      "lasagne",
      "lasagna",
      "noodles",
      "ramen",
      "rice",
      "risotto",
      "quinoa",
      "couscous",
      "potato",
      "potatoes",
      "fries",
      "chips",
      "curry",
      "paella",
    ],
  ],
  ["eggs", ["egg", "eggs", "omelette", "omelet", "frittata", "shakshuka"]],
  [
    "protein",
    [
      "chicken",
      "beef",
      "steak",
      "pork",
      "lamb",
      "turkey",
      "mince",
      "ham",
      "bacon",
      "sausage",
      "sausages",
      "salmon",
      "tuna",
      "cod",
      "fish",
      "prawn",
      "prawns",
      "shrimp",
      "tofu",
      "tempeh",
      "meatballs",
    ],
  ],
  /* After the meats: "salmon & veg" is the salmon. */
  ["salad", ["vegetables", "veg", "greens", "broccoli", "spinach"]],
  [
    "fruit",
    [
      "fruit",
      "apple",
      "banana",
      "orange",
      "berries",
      "blueberries",
      "strawberries",
      "raspberries",
      "grapes",
      "mango",
      "pear",
      "kiwi",
      "melon",
      "pineapple",
      "peach",
      "plum",
      "satsuma",
    ],
  ],
];

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = FOOD_ART_WORDS.map(
  ([kind, words]) =>
    [
      kind,
      new RegExp(`(?:^|[^a-z])(?:${words.map(escape).join("|")})(?:$|[^a-z])`),
    ] as const
);

/**
 * The drawing for a diary row whose meal has no photo of its own (§14m rule
 * 25: a row that stands for a meal carries its own picture). Read from
 * the names the meal was logged under, its own first, then its items'; a
 * name that places nothing gets the plate.
 */
export function foodArtUrl(kind: FoodArtKind): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/${FOOD_ART[kind].src}`;
}

export function foodArtKindFor(names: readonly string[]): FoodArtKind {
  for (const raw of names) {
    const name = raw.toLowerCase();
    for (const [kind, matcher] of MATCHERS) if (matcher.test(name)) return kind;
  }
  return "plate";
}

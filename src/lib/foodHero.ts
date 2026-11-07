/**
 * Food's hero (DS4, DESIGN_GUIDE §14m): the words around the day's figure,
 * and the picture a diary row carries when its meal has no photo.
 *
 * The hero is one figure, the day's calories against its target ("1,240"
 * over "of 2,350 kcal"), inside the calorie ring. It reads what was eaten
 * by default, so a new day starts at 0 on a grey track and the colour
 * arrives with the first meal (§14m rules 16 and 33); the ring's one
 * switch still turns it to what is left (Food10 call 1: the breakdown
 * sheet follows it). Pure, so the words are tested without rendering the
 * page; `FoodHeroCard` and `FoodTimeline` only draw the answers.
 */
import { getCalorieRingDisplay } from "@/lib/calorieRingDisplay";
import { FOOD_ART, type FoodArtKind } from "@/lib/foodArt.data";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";

export interface FoodHeroFigure {
  /** The figure, at the hero's size. */
  value: number;
  /** What the figure is against, under it: "of 2,350 kcal". */
  caption: string;
}

/**
 * The hero's figure and the words under it, for the ring's mode. In the
 * eaten mode it is what was logged against the target; in the left mode,
 * what is left of it, or how far past it the day went (the numbers and
 * nothing else, as the house voice asks of a day over target).
 */
export function foodHeroFigure({
  consumed,
  target,
  mode,
}: {
  consumed: number;
  target: number;
  mode: "left" | "eaten";
}): FoodHeroFigure {
  if (!(target > 0))
    return { value: Math.max(0, consumed), caption: `${CALORIE_UNIT} logged` };
  const { displayValue, labelMode } = getCalorieRingDisplay({
    consumed,
    target,
    isLeftMode: mode === "left",
  });
  const of = `${formatCalories(target)} ${CALORIE_UNIT}`;
  return {
    value: displayValue,
    caption:
      labelMode === "left"
        ? `left of ${of}`
        : labelMode === "over"
          ? `over ${of}`
          : `of ${of}`,
  };
}

/**
 * The hero's one line, or nothing. Only an empty diary has one: today,
 * with no meal on any day the diary has loaded, it gives the first step
 * and the number it fills (the house voice's "day one is a starting
 * line"). A new account's step is its first meal; someone back after a
 * month away is not on their first. Once anything is logged the figure
 * says it all, and a day in the past has no step to offer.
 */
export function foodHeroLine({
  isToday,
  beforeJoined,
  hasAnyMeal,
  isNew,
  target,
}: {
  isToday: boolean;
  beforeJoined: boolean;
  /** Whether the diary holds a meal on any day it has loaded. */
  hasAnyMeal: boolean;
  /** The account began within the diary's window, so it has never
   *  logged a meal at all. */
  isNew: boolean;
  target: number;
}): string | null {
  if (!isToday || beforeJoined || hasAnyMeal) return null;
  const step = isNew ? "Log your first meal" : "Log a meal";
  if (!(target > 0)) return `${step} and it shows here.`;
  return `${step} to start today's ${formatCalories(target)} ${CALORIE_UNIT}.`;
}

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

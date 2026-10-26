import { logger } from "@/lib/logger";

/**
 * NL food parser — parses natural-language food descriptions
 * into structured macro data using a common food database lookup.
 *
 * Features:
 *   - Common foods with approximate macros per typical serving
 *   - Quantity parsing: "2 eggs" → qty=2
 *   - Compound matching: "toast with butter" → sums both
 *   - Multi-word fallback: "ham sandwich" → ham + sandwich if no exact match
 *   - Spelling aliases: yoghurt→yogurt, prawns→shrimp, etc.
 *
 * Examples:
 *   "2 eggs, toast with butter"  → [{name:"Eggs (x2)", …}, {name:"Toast with butter", …}]
 *   "ham sandwich, orange juice" → [{name:"Ham sandwich", …}, {name:"Orange juice", …}]
 */

export interface ParsedFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  unrecognized?: boolean;
  /** The food is known, but its reference cannot measure the typed amount.
   *  Callers must request correction rather than save one-serving macros. */
  quantityIssue?: {
    referencePortion: string;
    expectedUnit: "g" | "ml" | null;
  };
  /** Human-readable portion the user typed ("200g", "150ml", "1.5kg",
   *  "1 pint"). Persisted as the diary row's portionSize so the saved
   *  entry reads back what the user wrote instead of a generic "1
   *  serving". Only set when a mass/volume unit was detected in the
   *  input. */
  portionLabel?: string;
  /** Internal — canonical FOOD_DB key. Used for output dedup. Strip before persisting. */
  _canonicalKey?: string;
}

type Macros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving: string;
};

/* Common foods with approximate macros per serving (USDA averages). Each
   row's numbers are for the serving it names, because a typed "150g"
   scales against the grams in that string: a row whose figures are per
   100 g names 100g, and a counted serving ("1 medium (150g)") carries the
   figures for that weight. `foodDbIntegrity.test.ts` checks rows against
   reference values per 100 g.

   A food typed with no amount logs one serving, so a serving is a portion
   someone eats. The main protein of a plate (meat, poultry, salmon, cod
   and other fish served as a main, tofu, tempeh) is 150 g cooked. At
   100 g, "salmon, potatoes, broccoli" logged 393 kcal and "chicken
   breast, rice" 365, about a fifth short of the plate, and logged intake
   is what the adaptive TDEE learns from. Foods eaten in pieces, slices or
   smaller amounts (thighs, wings, ham, tuna, crab, liver, mackerel) keep
   100 g. */
const FOOD_DB: Record<string, Macros> = {
  // ── Proteins ──
  egg: { calories: 78, protein: 6, carbs: 1, fat: 5, serving: "1 large (50g)" },
  eggs: {
    calories: 78,
    protein: 6,
    carbs: 1,
    fat: 5,
    serving: "1 large (50g)",
  },
  "fried egg": {
    calories: 90,
    protein: 6,
    carbs: 0,
    fat: 7,
    serving: "1 large (46g)",
  },
  "boiled egg": {
    calories: 78,
    protein: 6,
    carbs: 1,
    fat: 5,
    serving: "1 large (50g)",
  },
  "scrambled eggs": {
    calories: 91,
    protein: 6,
    carbs: 1,
    fat: 7,
    serving: "1 large (61g)",
  },
  "poached egg": {
    calories: 71,
    protein: 6,
    carbs: 0,
    fat: 5,
    serving: "1 large (50g)",
  },
  omelette: {
    calories: 154,
    protein: 11,
    carbs: 1,
    fat: 12,
    serving: "1 omelette (2 eggs)",
  },
  omelet: {
    calories: 154,
    protein: 11,
    carbs: 1,
    fat: 12,
    serving: "1 omelette (2 eggs)",
  },
  chicken: {
    calories: 248,
    protein: 47,
    carbs: 0,
    fat: 6,
    serving: "150g cooked",
  },
  "chicken breast": {
    calories: 248,
    protein: 47,
    carbs: 0,
    fat: 6,
    serving: "150g cooked",
  },
  "chicken thigh": {
    calories: 209,
    protein: 26,
    carbs: 0,
    fat: 11,
    serving: "100g cooked",
  },
  /* Meat and skin: nobody skins a wing. */
  "chicken wing": {
    calories: 290,
    protein: 27,
    carbs: 0,
    fat: 19,
    serving: "100g cooked",
  },
  wing: {
    calories: 290,
    protein: 27,
    carbs: 0,
    fat: 19,
    serving: "100g cooked",
  },
  turkey: {
    calories: 203,
    protein: 45,
    carbs: 0,
    fat: 2,
    serving: "150g cooked",
  },
  ham: {
    calories: 145,
    protein: 21,
    carbs: 2,
    fat: 6,
    serving: "100g cooked",
  },
  bacon: {
    calories: 90,
    protein: 6,
    carbs: 0,
    fat: 7,
    serving: "2 slices (16g)",
  },
  sausage: {
    calories: 170,
    protein: 7,
    carbs: 1,
    fat: 15,
    serving: "1 link (56g)",
  },
  beef: {
    calories: 375,
    protein: 39,
    carbs: 0,
    fat: 23,
    serving: "150g cooked",
  },
  steak: {
    calories: 407,
    protein: 39,
    carbs: 0,
    fat: 27,
    serving: "150g cooked",
  },
  mince: {
    calories: 375,
    protein: 39,
    carbs: 0,
    fat: 23,
    serving: "150g cooked",
  },
  "ground beef": {
    calories: 375,
    protein: 39,
    carbs: 0,
    fat: 23,
    serving: "150g cooked",
  },
  pork: {
    calories: 363,
    protein: 41,
    carbs: 0,
    fat: 21,
    serving: "150g cooked",
  },
  lamb: {
    calories: 375,
    protein: 38,
    carbs: 0,
    fat: 24,
    serving: "150g cooked",
  },
  duck: {
    calories: 506,
    protein: 29,
    carbs: 0,
    fat: 42,
    serving: "150g cooked",
  },
  liver: {
    calories: 175,
    protein: 26,
    carbs: 4,
    fat: 5,
    serving: "100g cooked",
  },
  salmon: {
    calories: 312,
    protein: 30,
    carbs: 0,
    fat: 20,
    serving: "150g cooked",
  },
  tuna: {
    calories: 130,
    protein: 28,
    carbs: 0,
    fat: 1,
    serving: "100g cooked",
  },
  fish: {
    calories: 204,
    protein: 30,
    carbs: 0,
    fat: 9,
    serving: "150g cooked",
  },
  cod: {
    calories: 158,
    protein: 35,
    carbs: 0,
    fat: 2,
    serving: "150g cooked",
  },
  mackerel: {
    calories: 262,
    protein: 24,
    carbs: 0,
    fat: 18,
    serving: "100g cooked",
  },
  sardines: {
    calories: 191,
    protein: 23,
    carbs: 0,
    fat: 10,
    serving: "1 can (92g)",
  },
  prawns: {
    calories: 85,
    protein: 18,
    carbs: 0,
    fat: 1,
    serving: "85g cooked",
  },
  shrimp: {
    calories: 85,
    protein: 18,
    carbs: 0,
    fat: 1,
    serving: "85g cooked",
  },
  crab: {
    calories: 97,
    protein: 19,
    carbs: 0,
    fat: 2,
    serving: "100g cooked",
  },
  tofu: {
    calories: 216,
    protein: 26,
    carbs: 5,
    fat: 14,
    serving: "150g",
  },
  tempeh: {
    calories: 293,
    protein: 30,
    carbs: 12,
    fat: 17,
    serving: "150g",
  },
  jerky: { calories: 116, protein: 9, carbs: 3, fat: 7, serving: "28g" },
  "cottage cheese": {
    calories: 98,
    protein: 11,
    carbs: 3,
    fat: 4,
    serving: "100g",
  },

  // ── Carbs & Grains ──
  rice: {
    calories: 200,
    protein: 4,
    carbs: 45,
    fat: 0,
    serving: "158g cooked",
  },
  "brown rice": {
    calories: 216,
    protein: 5,
    carbs: 45,
    fat: 2,
    serving: "195g cooked",
  },
  "fried rice": {
    calories: 238,
    protein: 5,
    carbs: 34,
    fat: 9,
    serving: "165g",
  },
  pasta: {
    calories: 220,
    protein: 8,
    carbs: 43,
    fat: 1,
    serving: "140g cooked",
  },
  noodles: {
    calories: 220,
    protein: 7,
    carbs: 40,
    fat: 3,
    serving: "160g cooked",
  },
  bread: {
    calories: 80,
    protein: 3,
    carbs: 14,
    fat: 1,
    serving: "1 slice (30g)",
  },
  sourdough: {
    calories: 136,
    protein: 5,
    carbs: 26,
    fat: 1,
    serving: "1 slice (50g)",
  },
  toast: {
    calories: 80,
    protein: 3,
    carbs: 14,
    fat: 1,
    serving: "1 slice (30g)",
  },
  "garlic bread": {
    calories: 204,
    protein: 5,
    carbs: 25,
    fat: 9,
    serving: "2 slices (60g)",
  },
  bagel: {
    calories: 250,
    protein: 9,
    carbs: 48,
    fat: 2,
    serving: "1 bagel (95g)",
  },
  tortilla: {
    calories: 150,
    protein: 4,
    carbs: 26,
    fat: 4,
    serving: "1 medium (45g)",
  },
  wrap: { calories: 300, protein: 15, carbs: 35, fat: 10, serving: "1 wrap" },
  pita: {
    calories: 165,
    protein: 5,
    carbs: 33,
    fat: 1,
    serving: "1 pita (60g)",
  },
  naan: {
    calories: 260,
    protein: 9,
    carbs: 45,
    fat: 5,
    serving: "1 piece (90g)",
  },
  flatbread: {
    calories: 200,
    protein: 6,
    carbs: 36,
    fat: 4,
    serving: "1 piece (60g)",
  },
  croissant: {
    calories: 231,
    protein: 5,
    carbs: 26,
    fat: 12,
    serving: "1 croissant (57g)",
  },
  muffin: {
    calories: 340,
    protein: 5,
    carbs: 50,
    fat: 14,
    serving: "1 muffin (113g)",
  },
  pancake: {
    calories: 175,
    protein: 5,
    carbs: 22,
    fat: 7,
    serving: "1 medium (77g)",
  },
  pancakes: {
    calories: 175,
    protein: 5,
    carbs: 22,
    fat: 7,
    serving: "1 medium (77g)",
  },
  waffle: {
    calories: 218,
    protein: 6,
    carbs: 25,
    fat: 11,
    serving: "1 waffle (75g)",
  },
  biscuit: {
    calories: 135,
    protein: 2,
    carbs: 18,
    fat: 6,
    serving: "1 biscuit (35g)",
  },
  cracker: {
    calories: 65,
    protein: 1,
    carbs: 10,
    fat: 2,
    serving: "5 crackers (15g)",
  },
  crackers: {
    calories: 65,
    protein: 1,
    carbs: 10,
    fat: 2,
    serving: "5 crackers (15g)",
  },
  oats: {
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    serving: "40g dry",
  },
  // Oats by their packet names, weighed dry. Without these rows "50g porridge
  // oats" found "porridge", a cooked bowl, and logged 32 kcal for 187.
  "porridge oats": {
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    serving: "40g dry",
  },
  "rolled oats": {
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    serving: "40g dry",
  },
  oatmeal: {
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    serving: "234g cooked",
  },
  porridge: {
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    serving: "234g cooked",
  },
  cereal: {
    calories: 200,
    protein: 4,
    carbs: 40,
    fat: 2,
    serving: "55g",
  },
  granola: {
    calories: 200,
    protein: 5,
    carbs: 30,
    fat: 8,
    serving: "45g",
  },
  couscous: {
    calories: 176,
    protein: 6,
    carbs: 36,
    fat: 0,
    serving: "157g cooked",
  },
  potato: {
    calories: 130,
    protein: 3,
    carbs: 30,
    fat: 0,
    serving: "1 medium (150g)",
  },
  // A jacket potato is a large baked potato, eaten as a meal.
  "jacket potato": {
    calories: 233,
    protein: 6,
    carbs: 53,
    fat: 0,
    serving: "1 large (250g)",
  },
  mash: {
    calories: 226,
    protein: 4,
    carbs: 34,
    fat: 8,
    serving: "200g",
  },
  "mashed potato": {
    calories: 226,
    protein: 4,
    carbs: 34,
    fat: 8,
    serving: "200g",
  },
  "sweet potato": {
    calories: 112,
    protein: 2,
    carbs: 26,
    fat: 0,
    serving: "1 medium (130g)",
  },
  /* "Chips" are what a British plate means by them: fries, as in "steak
     and chips". The app speaks British English, and "crisps" has its own
     row; it said a 28 g bag of crisps, so "steak and chips" logged 152
     kcal of crisps. The snack keeps "crisps" and the American "potato
     chips"; "tortilla chips" is its own food, where the longest-name match
     would otherwise log a tortilla wrap. */
  chips: {
    calories: 365,
    protein: 4,
    carbs: 48,
    fat: 18,
    serving: "1 medium portion (117g)",
  },
  crisps: {
    calories: 152,
    protein: 2,
    carbs: 15,
    fat: 10,
    serving: "28g bag",
  },
  "potato chips": {
    calories: 152,
    protein: 2,
    carbs: 15,
    fat: 10,
    serving: "28g bag",
  },
  /* A flavour named with "and" is still one bag: the joiner would
     otherwise split "cheese and onion crisps" into cheese and crisps. */
  "salt and vinegar crisps": {
    calories: 152,
    protein: 2,
    carbs: 15,
    fat: 10,
    serving: "28g bag",
  },
  "cheese and onion crisps": {
    calories: 152,
    protein: 2,
    carbs: 15,
    fat: 10,
    serving: "28g bag",
  },
  "sour cream and onion crisps": {
    calories: 152,
    protein: 2,
    carbs: 15,
    fat: 10,
    serving: "28g bag",
  },
  "tortilla chips": {
    calories: 140,
    protein: 2,
    carbs: 19,
    fat: 7,
    serving: "28g serving",
  },
  fries: {
    calories: 365,
    protein: 4,
    carbs: 48,
    fat: 18,
    serving: "1 medium portion (117g)",
  },
  "french fries": {
    calories: 365,
    protein: 4,
    carbs: 48,
    fat: 18,
    serving: "1 medium portion (117g)",
  },
  popcorn: {
    calories: 106,
    protein: 3,
    carbs: 21,
    fat: 1,
    serving: "24g popped",
  },
  "rice cake": {
    calories: 35,
    protein: 1,
    carbs: 7,
    fat: 0,
    serving: "1 cake (9g)",
  },
  dumpling: {
    calories: 80,
    protein: 3,
    carbs: 10,
    fat: 3,
    serving: "1 dumpling (30g)",
  },
  dumplings: {
    calories: 80,
    protein: 3,
    carbs: 10,
    fat: 3,
    serving: "1 dumpling (30g)",
  },
  gnocchi: {
    calories: 250,
    protein: 6,
    carbs: 50,
    fat: 2,
    serving: "145g",
  },

  // ── Fruits ──
  banana: {
    calories: 105,
    protein: 1,
    carbs: 27,
    fat: 0,
    serving: "1 medium (118g)",
  },
  apple: {
    calories: 95,
    protein: 0,
    carbs: 25,
    fat: 0,
    serving: "1 medium (182g)",
  },
  orange: {
    calories: 62,
    protein: 1,
    carbs: 15,
    fat: 0,
    serving: "1 medium (131g)",
  },
  mango: {
    calories: 99,
    protein: 1,
    carbs: 25,
    fat: 1,
    serving: "165g sliced",
  },
  strawberry: {
    calories: 4,
    protein: 0,
    carbs: 1,
    fat: 0,
    serving: "1 berry (12g)",
  },
  strawberries: {
    calories: 49,
    protein: 1,
    carbs: 12,
    fat: 0,
    serving: "152g",
  },
  blueberry: {
    calories: 1,
    protein: 0,
    carbs: 0,
    fat: 0,
    serving: "1 berry (1.5g)",
  },
  blueberries: {
    calories: 84,
    protein: 1,
    carbs: 21,
    fat: 0,
    serving: "148g",
  },
  raspberry: {
    calories: 1,
    protein: 0,
    carbs: 0,
    fat: 0,
    serving: "1 berry (3g)",
  },
  raspberries: {
    calories: 64,
    protein: 1,
    carbs: 15,
    fat: 1,
    serving: "123g",
  },
  grapes: {
    calories: 62,
    protein: 1,
    carbs: 16,
    fat: 0,
    serving: "92g",
  },
  pineapple: {
    calories: 82,
    protein: 1,
    carbs: 22,
    fat: 0,
    serving: "165g chunks",
  },
  watermelon: {
    calories: 46,
    protein: 1,
    carbs: 12,
    fat: 0,
    serving: "152g diced",
  },
  coconut: {
    calories: 283,
    protein: 3,
    carbs: 10,
    fat: 27,
    serving: "80g shredded",
  },
  dates: {
    calories: 66,
    protein: 0,
    carbs: 18,
    fat: 0,
    serving: "1 date (24g)",
  },
  raisins: {
    calories: 85,
    protein: 1,
    carbs: 22,
    fat: 0,
    serving: "1 small box (28g)",
  },
  pear: {
    calories: 101,
    protein: 1,
    carbs: 27,
    fat: 0,
    serving: "1 medium (178g)",
  },
  peach: {
    calories: 59,
    protein: 1,
    carbs: 14,
    fat: 0,
    serving: "1 medium (150g)",
  },
  kiwi: {
    calories: 42,
    protein: 1,
    carbs: 10,
    fat: 0,
    serving: "1 medium (69g)",
  },
  cherry: {
    calories: 5,
    protein: 0,
    carbs: 1,
    fat: 0,
    serving: "1 cherry (8g)",
  },
  cherries: {
    calories: 77,
    protein: 1,
    carbs: 20,
    fat: 0,
    serving: "138g",
  },
  melon: {
    calories: 53,
    protein: 1,
    carbs: 13,
    fat: 0,
    serving: "160g diced",
  },
  grapefruit: {
    calories: 52,
    protein: 1,
    carbs: 13,
    fat: 0,
    serving: "1/2 medium (123g)",
  },
  berries: {
    calories: 64,
    protein: 1,
    carbs: 14,
    fat: 0,
    serving: "140g",
  },

  // ── Vegetables ──
  salad: {
    calories: 50,
    protein: 2,
    carbs: 8,
    fat: 1,
    serving: "1 bowl (100g)",
  },
  broccoli: {
    calories: 55,
    protein: 4,
    carbs: 11,
    fat: 1,
    serving: "156g chopped",
  },
  spinach: {
    calories: 23,
    protein: 3,
    carbs: 4,
    fat: 0,
    serving: "100g cooked",
  },
  kale: {
    calories: 33,
    protein: 3,
    carbs: 6,
    fat: 1,
    serving: "67g chopped",
  },
  carrot: {
    calories: 25,
    protein: 1,
    carbs: 6,
    fat: 0,
    serving: "1 medium (61g)",
  },
  carrots: {
    calories: 25,
    protein: 1,
    carbs: 6,
    fat: 0,
    serving: "1 medium (61g)",
  },
  tomato: {
    calories: 22,
    protein: 1,
    carbs: 5,
    fat: 0,
    serving: "1 medium (123g)",
  },
  cucumber: {
    calories: 16,
    protein: 1,
    carbs: 4,
    fat: 0,
    serving: "1/2 medium (100g)",
  },
  pepper: {
    calories: 31,
    protein: 1,
    carbs: 6,
    fat: 0,
    serving: "1 medium (119g)",
  },
  corn: { calories: 86, protein: 3, carbs: 19, fat: 1, serving: "1 ear (90g)" },
  peas: {
    calories: 81,
    protein: 5,
    carbs: 14,
    fat: 0,
    serving: "100g",
  },
  beans: {
    calories: 114,
    protein: 8,
    carbs: 20,
    fat: 0,
    serving: "90g cooked",
  },
  lentils: {
    calories: 115,
    protein: 9,
    carbs: 20,
    fat: 0,
    serving: "99g cooked",
  },
  chickpeas: {
    calories: 134,
    protein: 7,
    carbs: 22,
    fat: 2,
    serving: "82g cooked",
  },
  mushroom: {
    calories: 15,
    protein: 2,
    carbs: 2,
    fat: 0,
    serving: "70g sliced",
  },
  mushrooms: {
    calories: 15,
    protein: 2,
    carbs: 2,
    fat: 0,
    serving: "70g sliced",
  },
  onion: {
    calories: 44,
    protein: 1,
    carbs: 10,
    fat: 0,
    serving: "1 medium (110g)",
  },
  "spring onion": {
    calories: 5,
    protein: 0,
    carbs: 1,
    fat: 0,
    serving: "1 spring onion (15g)",
  },
  garlic: {
    calories: 4,
    protein: 0,
    carbs: 1,
    fat: 0,
    serving: "1 clove (3g)",
  },
  celery: {
    calories: 6,
    protein: 0,
    carbs: 1,
    fat: 0,
    serving: "1 stalk (40g)",
  },
  lettuce: {
    calories: 10,
    protein: 1,
    carbs: 2,
    fat: 0,
    serving: "47g shredded",
  },
  cabbage: {
    calories: 22,
    protein: 1,
    carbs: 5,
    fat: 0,
    serving: "89g shredded",
  },
  cauliflower: {
    calories: 25,
    protein: 2,
    carbs: 5,
    fat: 0,
    serving: "107g",
  },
  zucchini: {
    calories: 33,
    protein: 2,
    carbs: 6,
    fat: 0,
    serving: "1 medium (196g)",
  },
  courgette: {
    calories: 33,
    protein: 2,
    carbs: 6,
    fat: 0,
    serving: "1 medium (196g)",
  },
  eggplant: {
    calories: 20,
    protein: 1,
    carbs: 5,
    fat: 0,
    serving: "82g diced",
  },
  aubergine: {
    calories: 20,
    protein: 1,
    carbs: 5,
    fat: 0,
    serving: "82g diced",
  },
  asparagus: {
    calories: 27,
    protein: 3,
    carbs: 5,
    fat: 0,
    serving: "5 spears (93g)",
  },
  "green beans": {
    calories: 31,
    protein: 2,
    carbs: 7,
    fat: 0,
    serving: "100g",
  },

  // ── Dairy & Fats ──
  milk: {
    calories: 150,
    protein: 8,
    carbs: 12,
    fat: 8,
    serving: "240ml",
  },
  "almond milk": {
    calories: 30,
    protein: 1,
    carbs: 1,
    fat: 3,
    serving: "240ml",
  },
  "oat milk": {
    calories: 120,
    protein: 3,
    carbs: 16,
    fat: 5,
    serving: "240ml",
  },
  cheese: {
    calories: 113,
    protein: 7,
    carbs: 0,
    fat: 9,
    serving: "28g",
  },
  cheddar: {
    calories: 113,
    protein: 7,
    carbs: 0,
    fat: 9,
    serving: "28g",
  },
  mozzarella: {
    calories: 85,
    protein: 6,
    carbs: 1,
    fat: 6,
    serving: "28g",
  },
  parmesan: {
    calories: 110,
    protein: 10,
    carbs: 1,
    fat: 7,
    serving: "28g",
  },
  "cream cheese": {
    calories: 99,
    protein: 2,
    carbs: 1,
    fat: 10,
    serving: "2 tbsp (29g)",
  },
  yogurt: {
    calories: 100,
    protein: 17,
    carbs: 6,
    fat: 1,
    serving: "170g",
  },
  yoghurt: {
    calories: 100,
    protein: 17,
    carbs: 6,
    fat: 1,
    serving: "170g",
  },
  "greek yogurt": {
    calories: 100,
    protein: 17,
    carbs: 6,
    fat: 1,
    serving: "170g",
  },
  "greek yoghurt": {
    calories: 100,
    protein: 17,
    carbs: 6,
    fat: 1,
    serving: "170g",
  },
  butter: {
    calories: 100,
    protein: 0,
    carbs: 0,
    fat: 11,
    serving: "1 tbsp (14g)",
  },
  cream: {
    calories: 52,
    protein: 0,
    carbs: 1,
    fat: 6,
    serving: "1 tbsp (15ml)",
  },
  "ice cream": {
    calories: 207,
    protein: 4,
    carbs: 24,
    fat: 11,
    serving: "100g",
  },
  avocado: {
    calories: 240,
    protein: 3,
    carbs: 13,
    fat: 22,
    serving: "1 medium (150g)",
  },
  "olive oil": {
    calories: 119,
    protein: 0,
    carbs: 0,
    fat: 14,
    serving: "1 tbsp (14g)",
  },
  "coconut oil": {
    calories: 121,
    protein: 0,
    carbs: 0,
    fat: 14,
    serving: "1 tbsp (14g)",
  },
  hummus: {
    calories: 166,
    protein: 8,
    carbs: 14,
    fat: 10,
    serving: "100g",
  },
  houmous: {
    calories: 166,
    protein: 8,
    carbs: 14,
    fat: 10,
    serving: "100g",
  },
  mayo: {
    calories: 94,
    protein: 0,
    carbs: 0,
    fat: 10,
    serving: "1 tbsp (13g)",
  },
  mayonnaise: {
    calories: 94,
    protein: 0,
    carbs: 0,
    fat: 10,
    serving: "1 tbsp (13g)",
  },
  "peanut butter": {
    calories: 188,
    protein: 8,
    carbs: 6,
    fat: 16,
    serving: "2 tbsp (32g)",
  },
  "almond butter": {
    calories: 196,
    protein: 7,
    carbs: 6,
    fat: 18,
    serving: "2 tbsp (32g)",
  },

  // ── Nuts & Seeds ──
  almonds: {
    calories: 160,
    protein: 6,
    carbs: 6,
    fat: 14,
    serving: "28g",
  },
  nuts: { calories: 170, protein: 5, carbs: 6, fat: 15, serving: "28g" },
  walnuts: {
    calories: 185,
    protein: 4,
    carbs: 4,
    fat: 18,
    serving: "28g",
  },
  cashews: {
    calories: 157,
    protein: 5,
    carbs: 9,
    fat: 12,
    serving: "28g",
  },
  peanuts: {
    calories: 161,
    protein: 7,
    carbs: 5,
    fat: 14,
    serving: "28g",
  },
  "trail mix": {
    calories: 175,
    protein: 5,
    carbs: 16,
    fat: 11,
    serving: "28g",
  },

  // ── Drinks ──
  coffee: {
    calories: 5,
    protein: 0,
    carbs: 0,
    fat: 0,
    serving: "240ml",
  },
  espresso: {
    calories: 3,
    protein: 0,
    carbs: 0,
    fat: 0,
    serving: "1 shot (30ml)",
  },
  cappuccino: {
    calories: 120,
    protein: 6,
    carbs: 10,
    fat: 6,
    serving: "240ml",
  },
  latte: {
    calories: 190,
    protein: 10,
    carbs: 18,
    fat: 7,
    serving: "1 grande (470ml)",
  },
  // A flat white is a short latte with less milk; an americano is espresso
  // and water. Both are among the commonest UK coffee orders, and without
  // rows a typed "and a flat white" logged nothing for the coffee.
  "flat white": {
    calories: 110,
    protein: 6,
    carbs: 9,
    fat: 6,
    serving: "1 regular (180ml)",
  },
  americano: {
    calories: 10,
    protein: 1,
    carbs: 1,
    fat: 0,
    serving: "1 regular (350ml)",
  },
  mocha: {
    calories: 290,
    protein: 11,
    carbs: 38,
    fat: 11,
    serving: "1 regular (350ml)",
  },
  tea: { calories: 2, protein: 0, carbs: 0, fat: 0, serving: "240ml" },
  "hot chocolate": {
    calories: 190,
    protein: 8,
    carbs: 27,
    fat: 6,
    serving: "240ml",
  },
  juice: {
    calories: 110,
    protein: 1,
    carbs: 26,
    fat: 0,
    serving: "240ml",
  },
  "orange juice": {
    calories: 110,
    protein: 2,
    carbs: 26,
    fat: 0,
    serving: "240ml",
  },
  "apple juice": {
    calories: 113,
    protein: 0,
    carbs: 28,
    fat: 0,
    serving: "240ml",
  },
  smoothie: {
    calories: 250,
    protein: 10,
    carbs: 40,
    fat: 5,
    serving: "240ml",
  },
  soda: {
    calories: 140,
    protein: 0,
    carbs: 39,
    fat: 0,
    serving: "1 can (355ml)",
  },
  coke: {
    calories: 139,
    protein: 0,
    carbs: 35,
    fat: 0,
    serving: "1 can (330ml)",
  },
  "diet coke": {
    calories: 1,
    protein: 0,
    carbs: 0,
    fat: 0,
    serving: "1 can (330ml)",
  },
  "energy drink": {
    calories: 110,
    protein: 0,
    carbs: 28,
    fat: 0,
    serving: "1 can (250ml)",
  },
  "coconut water": {
    calories: 46,
    protein: 2,
    carbs: 9,
    fat: 0,
    serving: "240ml",
  },
  beer: {
    calories: 153,
    protein: 2,
    carbs: 13,
    fat: 0,
    serving: "1 can (355ml)",
  },
  lager: {
    calories: 153,
    protein: 2,
    carbs: 13,
    fat: 0,
    serving: "1 can (355ml)",
  },
  wine: {
    calories: 125,
    protein: 0,
    carbs: 4,
    fat: 0,
    serving: "148ml glass",
  },

  // ── Supplements ──
  "protein shake": {
    calories: 150,
    protein: 30,
    carbs: 5,
    fat: 2,
    serving: "1 shake (350ml)",
  },
  "protein powder": {
    calories: 120,
    protein: 24,
    carbs: 3,
    fat: 1,
    serving: "1 scoop (31g)",
  },
  whey: {
    calories: 120,
    protein: 24,
    carbs: 3,
    fat: 1,
    serving: "1 scoop (31g)",
  },
  "protein bar": {
    calories: 230,
    protein: 20,
    carbs: 25,
    fat: 8,
    serving: "1 bar (60g)",
  },
  "granola bar": {
    calories: 190,
    protein: 4,
    carbs: 29,
    fat: 7,
    serving: "1 bar (42g)",
  },
  creatine: {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    serving: "1 scoop (5g)",
  },

  // ── Meals & Snacks ──
  sandwich: {
    calories: 350,
    protein: 18,
    carbs: 35,
    fat: 14,
    serving: "1 sandwich",
  },
  // A toastie is a toasted sandwich: the sandwich's row, by its own name,
  // so "cheese toastie" is the toastie and not a slice of cheese.
  toastie: {
    calories: 350,
    protein: 18,
    carbs: 35,
    fat: 14,
    serving: "1 toastie",
  },
  burger: {
    calories: 500,
    protein: 28,
    carbs: 40,
    fat: 25,
    serving: "1 burger",
  },
  pizza: { calories: 285, protein: 12, carbs: 36, fat: 10, serving: "1 slice" },
  burrito: {
    calories: 450,
    protein: 20,
    carbs: 50,
    fat: 18,
    serving: "1 burrito",
  },
  taco: { calories: 210, protein: 9, carbs: 21, fat: 10, serving: "1 taco" },
  tacos: { calories: 210, protein: 9, carbs: 21, fat: 10, serving: "1 taco" },
  quesadilla: {
    calories: 310,
    protein: 13,
    carbs: 32,
    fat: 14,
    serving: "1 quesadilla",
  },
  nachos: {
    calories: 346,
    protein: 9,
    carbs: 36,
    fat: 19,
    serving: "1 serving",
  },
  sushi: { calories: 200, protein: 9, carbs: 38, fat: 1, serving: "6 pieces" },
  curry: {
    calories: 350,
    protein: 20,
    carbs: 30,
    fat: 16,
    serving: "1 serving",
  },
  soup: {
    calories: 150,
    protein: 8,
    carbs: 18,
    fat: 5,
    serving: "240ml",
  },
  chili: {
    calories: 300,
    protein: 20,
    carbs: 25,
    fat: 14,
    serving: "240ml",
  },
  // Everyday plated dishes, each a typical home or ready-meal portion, so
  // a typed dish logs a meal rather than nothing.
  "chilli con carne": {
    calories: 330,
    protein: 26,
    carbs: 24,
    fat: 14,
    serving: "1 portion (300g)",
  },
  "spaghetti bolognese": {
    calories: 540,
    protein: 30,
    carbs: 62,
    fat: 18,
    serving: "1 plate (400g)",
  },
  lasagne: {
    calories: 450,
    protein: 26,
    carbs: 40,
    fat: 21,
    serving: "1 portion (300g)",
  },
  lasagna: {
    calories: 450,
    protein: 26,
    carbs: 40,
    fat: 21,
    serving: "1 portion (300g)",
  },
  "mac and cheese": {
    calories: 500,
    protein: 20,
    carbs: 52,
    fat: 23,
    serving: "1 portion (300g)",
  },
  "macaroni cheese": {
    calories: 500,
    protein: 20,
    carbs: 52,
    fat: 23,
    serving: "1 portion (300g)",
  },
  // Two pork sausages, mash and gravy.
  "bangers and mash": {
    calories: 600,
    protein: 19,
    carbs: 39,
    fat: 41,
    serving: "1 plate (370g)",
  },
  "stir fry": {
    calories: 300,
    protein: 20,
    carbs: 30,
    fat: 10,
    serving: "1 serving",
  },
  kebab: { calories: 500, protein: 30, carbs: 45, fat: 20, serving: "1 kebab" },
  ramen: { calories: 436, protein: 15, carbs: 60, fat: 16, serving: "1 bowl" },
  pho: { calories: 350, protein: 25, carbs: 40, fat: 8, serving: "1 bowl" },
  pie: { calories: 350, protein: 10, carbs: 35, fat: 19, serving: "1 slice" },
  "fish and chips": {
    calories: 595,
    protein: 25,
    carbs: 60,
    fat: 28,
    serving: "1 serving",
  },

  // ── Sweets & Desserts ──
  chocolate: {
    calories: 155,
    protein: 2,
    carbs: 17,
    fat: 9,
    serving: "28g",
  },
  cookie: {
    calories: 150,
    protein: 2,
    carbs: 20,
    fat: 7,
    serving: "1 cookie (30g)",
  },
  cookies: {
    calories: 150,
    protein: 2,
    carbs: 20,
    fat: 7,
    serving: "1 cookie (30g)",
  },
  cake: {
    calories: 350,
    protein: 4,
    carbs: 50,
    fat: 15,
    serving: "1 slice (80g)",
  },
  "mince pie": {
    calories: 224,
    protein: 2,
    carbs: 35,
    fat: 9,
    serving: "1 pie (59g)",
  },
  jam: {
    calories: 56,
    protein: 0,
    carbs: 14,
    fat: 0,
    serving: "1 tbsp (20g)",
  },
  honey: {
    calories: 64,
    protein: 0,
    carbs: 17,
    fat: 0,
    serving: "1 tbsp (21g)",
  },
  sugar: {
    calories: 16,
    protein: 0,
    carbs: 4,
    fat: 0,
    serving: "1 tsp (4g)",
  },
  brownie: {
    calories: 260,
    protein: 3,
    carbs: 36,
    fat: 12,
    serving: "1 brownie (60g)",
  },
  doughnut: {
    calories: 253,
    protein: 4,
    carbs: 30,
    fat: 14,
    serving: "1 doughnut (60g)",
  },
  donut: {
    calories: 253,
    protein: 4,
    carbs: 30,
    fat: 14,
    serving: "1 doughnut (60g)",
  },
};

/**
 * Maps non-canonical FOOD_DB keys to their canonical equivalent. Only
 * include pairs whose macros are byte-identical — different foods that
 * happen to share macros (e.g. cheese/cheddar, yogurt/greek yogurt,
 * protein powder/whey) are deliberately NOT aliased here, because the
 * user typing both probably means two distinct things.
 *
 * Used by the post-parse merge in parseFoodText so that "eggs, boiled
 * egg" doesn't produce two rows with identical totals.
 */
const FOOD_ALIASES: Record<string, string> = {
  // ── Egg cluster (78 / 6 / 1 / 5) ──
  eggs: "egg",
  "boiled egg": "egg",
  // (poached egg differs at 71 cal — not aliased)
  // (fried/scrambled differ — not aliased)

  // ── Plurals ──
  pancakes: "pancake",
  crackers: "cracker",
  dumplings: "dumpling",
  carrots: "carrot",
  mushrooms: "mushroom",
  tacos: "taco",
  cookies: "cookie",

  // ── Regional / spelling variants of the same product ──
  prawns: "shrimp", // UK ↔ US
  mince: "ground beef", // UK ↔ US
  beef: "ground beef", // generic ↔ specific (DB treats equal)
  toast: "bread", // toasted ↔ untoasted (DB treats equal)
  oatmeal: "oats",
  porridge: "oats",
  "porridge oats": "oats",
  "rolled oats": "oats",
  chips: "fries", // UK chips are fries
  "potato chips": "crisps", // US ↔ UK (the snack)
  mash: "mashed potato",
  omelet: "omelette", // US ↔ UK
  houmous: "hummus", // the UK supermarket spelling
  wing: "chicken wing", // wings are chicken wings
  lager: "beer", // a lager is a beer; the row is the same
  "french fries": "fries",
  courgette: "zucchini", // UK ↔ US
  aubergine: "eggplant", // UK ↔ US
  yoghurt: "yogurt",
  "greek yoghurt": "greek yogurt",
  mayo: "mayonnaise",
  donut: "doughnut",
  lasagna: "lasagne", // US ↔ UK
  "macaroni cheese": "mac and cheese", // the UK name
};

/** Canonical form of a FOOD_DB key. Non-aliased keys pass through. */
function canonicalKey(key: string): string {
  return FOOD_ALIASES[key] ?? key;
}

/**
 * What one of a food weighs, for foods weighed by the portion but eaten
 * in pieces. A count of them counts pieces: "6 chicken wings" logged six
 * 100 g portions, 600 g of wings, and "10 almonds" 280 g of nuts. Weights
 * are edible portions from USDA household measures. A bare food keeps its
 * portion, and a count of something else ("2 cans of sardines", "3 bowls
 * of grapes") keeps counting that.
 */
const PIECE_GRAMS: Record<string, number> = {
  "chicken wing": 34,
  wing: 34,
  "chicken thigh": 52,
  prawns: 6,
  shrimp: 6,
  sardines: 12,
  strawberries: 12,
  grapes: 5,
  cherries: 8,
  mushroom: 18,
  mushrooms: 18,
  almonds: 1.2,
  cashews: 1.6,
};

/** The grams of one piece when `rest` names the food itself, plural or
 *  not, and nothing it comes in. */
function pieceGrams(key: string, rest: string): number | null {
  const grams = PIECE_GRAMS[key];
  if (!grams) return null;
  const typed = rest.toLowerCase().trim();
  const singular = typed.split(/\s+/).map(depluralize).join(" ");
  const keySingular = key.split(/\s+/).map(depluralize).join(" ");
  return typed === key || singular === keySingular ? grams : null;
}

/** A British (imperial) pint. */
const PINT_ML = 568;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const NUMBER_WORD_RE = new RegExp(
  `^(${Object.keys(NUMBER_WORDS).join("|")})\\s+(.+)`,
  "i"
);
const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
};

/** "of", "of a", "an" between a fraction and its food: "half of an avocado". */
function afterFraction(rest: string): string {
  return rest.replace(/^(?:of\s+)?(?:an?\s+|the\s+)?/i, "").trim();
}

/**
 * A count written as a fraction or a word: "1/2 avocado", "1 1/2 cups",
 * "½ avocado", "half an avocado", "a quarter of a pizza", "two eggs".
 * Before this a fraction was no count at all (the whole avocado was
 * logged for half) and a number word was part of the name ("two eggs"
 * found one egg). A segment that is itself a food's name is left alone,
 * so a dish named with a number keeps its name.
 */
function fractionOrWordCount(
  segment: string
): { qty: number; rest: string } | null {
  if (FOOD_DB[segment.toLowerCase()]) return null;
  let m = segment.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\s+(.+)/);
  if (m && Number(m[3]) > 0) {
    return {
      qty: Number(m[1]) + Number(m[2]) / Number(m[3]),
      rest: afterFraction(m[4]),
    };
  }
  m = segment.match(/^(\d+)\s*\/\s*(\d+)\s+(.+)/);
  if (m && Number(m[2]) > 0) {
    return { qty: Number(m[1]) / Number(m[2]), rest: afterFraction(m[3]) };
  }
  m = segment.match(/^(\d+)?\s*([½¼¾⅓⅔])\s*(.+)/);
  if (m) {
    return {
      qty: (m[1] ? Number(m[1]) : 0) + UNICODE_FRACTIONS[m[2]],
      rest: afterFraction(m[3]),
    };
  }
  m = segment.match(/^(?:an?\s+)?(half|quarter)\s+(.+)/i);
  if (m) {
    return {
      qty: m[1].toLowerCase() === "half" ? 1 / 2 : 1 / 4,
      rest: afterFraction(m[2]),
    };
  }
  m = segment.match(NUMBER_WORD_RE);
  if (m) return { qty: NUMBER_WORDS[m[1].toLowerCase()], rest: m[2].trim() };
  return null;
}

/** The row's name for a count: "eggs (x2)", "avocado (x0.5)", "avocado". */
function countedName(rest: string, qty: number): string {
  return qty > 0 && qty !== 1
    ? `${rest} (x${Math.round(qty * 100) / 100})`
    : rest;
}

/**
 * Attempt to extract a quantity prefix like "2 eggs" → { qty: 2, rest: "eggs" }
 * Also handles "a" and "an" as qty=1.
 * Handles missing spaces: "2chocolate" → { qty: 2, rest: "chocolate" }
 *
 * Mass/volume units (`g`, `kg`, `ml`, `l`) are detected separately and
 * returned as `grams` / `ml` instead of `qty`. The caller scales macros
 * against the FOOD_DB serving's gram/ml count. Without this branch, an
 * input like "200g chicken" was hitting the bare-number regex below
 * (`200 → qty=200, rest="g chicken"`) and producing ~33000 calories
 * via the word-boundary match on "chicken". The unit branch fires
 * first so the bare-number path never sees those segments.
 *
 * `portionLabel` mirrors the user's typed unit ("200g", "1.5kg",
 * "150ml") so the diary row reads back what they wrote. Whitespace
 * between number and unit is normalised out ("200 g" → "200g") for
 * a tidy display.
 */
function extractQty(segment: string): {
  qty: number;
  grams?: number;
  ml?: number;
  portionLabel?: string;
  /** How the row's name opens when it is not the portion label alone:
   *  "1 pint of" before "lager". */
  namePrefix?: string;
  /** A number or "a"/"an" was typed: "6 wings", "a wing". */
  counted?: boolean;
  rest: string;
} {
  // Mass: "200g chicken" / "1.5kg rice" / "200 g chicken"
  const massMatch = segment.match(/^(\d+(?:\.\d+)?)\s*(kg|g)\b\s+(.+)/i);
  if (massMatch) {
    const num = parseFloat(massMatch[1]);
    const unit = massMatch[2].toLowerCase();
    const grams = unit === "kg" ? num * 1000 : num;
    return {
      qty: 1,
      grams,
      portionLabel: `${num}${unit}`,
      rest: massMatch[3].trim(),
    };
  }
  // Volume: "150ml milk" / "1l water" / "150 ml milk"
  const volMatch = segment.match(/^(\d+(?:\.\d+)?)\s*(ml|l)\b\s+(.+)/i);
  if (volMatch) {
    const num = parseFloat(volMatch[1]);
    const unit = volMatch[2].toLowerCase();
    const ml = unit === "l" ? num * 1000 : num;
    return {
      qty: 1,
      ml,
      portionLabel: `${num}${unit}`,
      rest: volMatch[3].trim(),
    };
  }
  // Pints: "a pint of lager", "2 pints of milk", "half a pint of beer".
  // A British pint is 568 ml, and the drink scales against its row's ml
  // as "568ml lager" would; read as a count, a pint of beer logged one
  // 355 ml can and a pint of milk one 240 ml glass.
  const pintMatch = segment.match(
    /^(?:(\d+(?:\.\d+)?)\s*|(?:an?|one)\s+|(half)\s+(?:an?\s+)?)?pints?\s+(?:of\s+)?(.+)/i
  );
  if (pintMatch) {
    const pints = pintMatch[2]
      ? 0.5
      : pintMatch[1]
        ? parseFloat(pintMatch[1])
        : 1;
    const portionLabel =
      pints === 0.5
        ? "half a pint"
        : `${pints} ${pints === 1 ? "pint" : "pints"}`;
    return {
      qty: 1,
      ml: pints * PINT_ML,
      portionLabel,
      namePrefix: `${portionLabel} of`,
      rest: pintMatch[3].trim(),
    };
  }
  // "1/2 avocado", "half an avocado", "two eggs"; "two pints of lager".
  const written = fractionOrWordCount(segment);
  if (written) {
    const pints = written.rest.match(/^pints?\s+(?:of\s+)?(.+)/i);
    if (pints) {
      const portionLabel =
        written.qty === 0.5
          ? "half a pint"
          : `${Math.round(written.qty * 100) / 100} ${written.qty === 1 ? "pint" : "pints"}`;
      return {
        qty: 1,
        ml: written.qty * PINT_ML,
        portionLabel,
        namePrefix: `${portionLabel} of`,
        rest: pints[1].trim(),
      };
    }
    return { qty: written.qty, counted: true, rest: written.rest };
  }
  // "2 eggs" or "2.5 servings"
  const match = segment.match(/^(\d+(?:\.\d+)?)\s+(.+)/);
  if (match) {
    return { qty: parseFloat(match[1]), counted: true, rest: match[2].trim() };
  }
  // "2chocolate" — number glued to text (no space)
  const gluedMatch = segment.match(/^(\d+(?:\.\d+)?)([a-zA-Z].*)$/);
  if (gluedMatch) {
    return {
      qty: parseFloat(gluedMatch[1]),
      counted: true,
      rest: gluedMatch[2].trim(),
    };
  }
  // A measure written after the food: "chicken breast 200g", "milk 300ml".
  // Read only from the start before, so the serving was logged and the row
  // still said "200g".
  const trailing = segment.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(kg|g|ml|l)$/i);
  if (trailing) {
    const num = parseFloat(trailing[2]);
    const unit = trailing[3].toLowerCase();
    const rest = trailing[1].replace(/^an?\s+/i, "").trim();
    const portionLabel = `${num}${unit}`;
    if (unit === "kg" || unit === "g") {
      return {
        qty: 1,
        grams: unit === "kg" ? num * 1000 : num,
        portionLabel,
        rest,
      };
    }
    return { qty: 1, ml: unit === "l" ? num * 1000 : num, portionLabel, rest };
  }
  // "a slice of toast" → qty=1, rest="slice of toast"
  const aMatch = segment.match(/^an?\s+(.+)/i);
  if (aMatch) {
    return { qty: 1, counted: true, rest: aMatch[1].trim() };
  }
  return { qty: 1, rest: segment };
}

/**
 * Pull the grams count out of a FOOD_DB serving string. A serving
 * weighed out leads with its grams ("85g cooked", "170g"); a counted
 * one gives its weight in brackets ("1 large (50g)", "1 tbsp (14g)").
 * Returns null when the serving is ml-based (drinks) so callers fall
 * back to the volume helper.
 */
function parseServingGrams(serving: string): number | null {
  const m =
    serving.match(/^(\d+(?:\.\d+)?)g\b/) ??
    serving.match(/\((\d+(?:\.\d+)?)g\)/);
  return m ? parseFloat(m[1]) : null;
}

/** Volume counterpart for drinks: "240ml", "148ml glass", "1 can (355ml)". */
function parseServingMl(serving: string): number | null {
  const m =
    serving.match(/^(\d+(?:\.\d+)?)ml\b/) ??
    serving.match(/\((\d+(?:\.\d+)?)ml\)/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * How many of the typed unit a serving holds, when it counts them:
 * "2 tbsp (32g)" holds 2 tbsp, "2 slices (16g)" 2 slices, "1 omelette
 * (2 eggs)" 2 eggs. A count typed against that unit ("2 tbsp peanut
 * butter", "3 egg omelette") counts units, not servings: multiplied as
 * servings, 2 tbsp logged 4.
 */
function servingUnits(serving: string, rest: string): number | null {
  const unit = depluralize(rest.toLowerCase().split(/\s+/)[0] ?? "");
  if (unit.length < 2) return null;
  for (const m of serving
    .toLowerCase()
    .matchAll(/(\d+(?:\.\d+)?)\s+([a-z]+)/g)) {
    if (depluralize(m[2]) === unit) return Number(m[1]);
  }
  return null;
}

/** Scale only against a compatible reference. Mass and volume cannot be
 *  interchanged without food-specific conversion data. */
function foodMultiplier(
  key: string,
  amount: ReturnType<typeof extractQty>
): number | null {
  const item = FOOD_DB[key];
  let multiplier = amount.qty;
  const piece = amount.counted ? pieceGrams(key, amount.rest) : null;
  const units = amount.counted ? servingUnits(item.serving, amount.rest) : null;
  if (piece) {
    const servingGrams = parseServingGrams(item.serving);
    if (servingGrams) multiplier = (amount.qty * piece) / servingGrams;
  } else if (units) {
    multiplier = amount.qty / units;
  } else if (amount.grams !== undefined) {
    const servingGrams = parseServingGrams(item.serving);
    if (!servingGrams) return null;
    multiplier = amount.grams / servingGrams;
  } else if (amount.ml !== undefined) {
    const servingMl = parseServingMl(item.serving);
    if (!servingMl) return null;
    multiplier = amount.ml / servingMl;
  }
  return multiplier;
}

/**
 * Edit distance for typos. Swapping two neighbouring letters ("chciken")
 * is one slip, as it is on a keyboard, not two (optimal string alignment).
 */
function editDistance(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

/**
 * How many slips a typed word may carry and still be read as a food in
 * the table. A correction that lands on a different food logs the wrong
 * thing with no warning, where a food the table does not know is flagged
 * as unknown, so short words get none: "jam" is one letter from "ham",
 * "cob" from "cod". Two slips in a five-letter word read "lager" and
 * "cider" as "liver", so four to seven letters get one ("chiken",
 * "rcie"), and only longer words get two ("brocolli").
 */
function typoAllowance(word: string): number {
  if (word.length <= 3) return 0;
  return word.length < 8 ? 1 : 2;
}

/**
 * Foods one slip from a different row, which the table does not have.
 * Typed, they mean themselves: a pasty is not pasta, port is not pork,
 * bitter is not butter. A food that has a row needs no entry here, since
 * an exact match comes first, and nor does a word whose first letter
 * differs (`findBestMatch` never changes it).
 */
const NOT_TYPOS = new Set([
  "pasty",
  "port",
  "bitter",
  "batter",
  "soba",
  "beet",
  "chops",
]);

/** The table names its dishes with "and" ("fish and chips"); people
 *  often type "&". */
function andForAmpersand(text: string): string {
  return text.replace(/\s+&\s+/g, " and ");
}

/** Strip common plural suffixes: "bars" → "bar", "berries" → "berry",
 *  "potatoes" → "potato". "-es" is the plural only after s, x, z, ch, sh
 *  and o; elsewhere the e is the word's own ("pies" → "pie", "cakes" →
 *  "cake"), and dropping it made "2 mince pies" two portions of mince. */
function depluralize(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (/(?:s|x|z|ch|sh|o)es$/.test(word) && word.length > 3)
    return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3)
    return word.slice(0, -1);
  return word;
}

/**
 * Plain bases a dish is built on: a food named with one is on it or in
 * it, and adds ("chicken salad", "cheese omelette", "tuna pasta"). Every
 * other dish is made with its filling, which its row already holds:
 * "chicken wrap" is a wrap, "beef burrito" a burrito.
 */
const DISH_BASES = new Set([
  "salad",
  "omelette",
  "omelet",
  "toast",
  "bagel",
  "bread",
  "sourdough",
  "pasta",
  "noodles",
  "rice",
  "brown rice",
  "couscous",
  "potato",
  "jacket potato",
  "sweet potato",
  "mash",
  "mashed potato",
  "porridge",
  "oats",
  "oatmeal",
  "tortilla",
  "pita",
  "naan",
  "flatbread",
  "cracker",
  "crackers",
  "rice cake",
]);

/** Spreads and sauces: added to what they are on, and never the dish
 *  ("tuna mayo" is tuna with mayonnaise). */
const CONDIMENTS = new Set([
  "mayo",
  "mayonnaise",
  "butter",
  "jam",
  "honey",
  "hummus",
  "houmous",
  "cream cheese",
]);

let keysLongestFirst: string[] | null = null;
function foodKeysLongestFirst(): string[] {
  keysLongestFirst ??= Object.keys(FOOD_DB).sort((a, b) => b.length - a.length);
  return keysLongestFirst;
}

/** The foods a phrase names, in the order named. A longer name takes its
 *  words first: "peanut butter sandwich" names peanut butter and a
 *  sandwich, not butter. */
function foodsNamed(text: string): string[] {
  const taken: [number, number][] = [];
  const found: { key: string; at: number }[] = [];
  for (const key of foodKeysLongestFirst()) {
    const re = new RegExp(
      `\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "g"
    );
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + key.length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      found.push({ key, at: start });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.key);
}

/** The closest key within the typed word's allowance (see
 *  `typoAllowance`), or null. */
function closestTypo(candidates: string[]): string | null {
  let bestKey: string | null = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    if (NOT_TYPOS.has(candidate)) continue;
    const allowance = typoAllowance(candidate);
    for (const key of foodKeysLongestFirst()) {
      // Words further apart in length than the allowance cannot match.
      if (Math.abs(candidate.length - key.length) > allowance) continue;
      // Nearly every misspelling keeps its first letter, so a word that
      // differs there is another word: hake is a fish, not cake, and
      // toffee is not coffee.
      if (key[0] !== candidate[0]) continue;
      const dist = editDistance(candidate, key);
      if (dist <= allowance && dist < bestDist) {
        bestDist = dist;
        bestKey = key;
      }
    }
  }
  return bestKey;
}

/** A phrase's food: the row it names (`head`) and the rows added to it. */
interface Dish {
  head: string;
  added: string[];
}

/**
 * The food a phrase names. An exact row wins, then its singular. Failing
 * that, the dish is the last food named, as English names a dish: the
 * longest name used to win, and the rest vanished ("chicken wrap" logged
 * a chicken breast, "blueberry muffin" 1 kcal of blueberries). A plain
 * base adds the foods named with it (`DISH_BASES`), and a condiment is
 * added to whatever it is on (`CONDIMENTS`). Then typos.
 */
function matchDish(text: string): Dish | null {
  const lower = andForAmpersand(text.toLowerCase().trim());
  if (FOOD_DB[lower]) return { head: lower, added: [] };

  // "chocolate bars" → "chocolate bar"
  const depluralWords = lower.split(/\s+/).map(depluralize).join(" ");
  if (FOOD_DB[depluralWords]) return { head: depluralWords, added: [] };

  // The singular can name more of the phrase ("chicken salads" names a
  // salad), or less ("onion crisps" loses its crisps): the reading that
  // covers more of it stands.
  const asTyped = foodsNamed(lower);
  const singular =
    depluralWords === lower ? asTyped : foodsNamed(depluralWords);
  const covered = (keys: string[]) =>
    keys.reduce((n, key) => n + key.length, 0);
  const named = covered(singular) > covered(asTyped) ? singular : asTyped;
  if (named.length > 0) {
    const dishes = named.filter((key) => !CONDIMENTS.has(key));
    const head = (dishes.length > 0 ? dishes : named).at(-1)!;
    const rest = [...named];
    rest.splice(rest.lastIndexOf(head), 1);
    // What the row's own serving counts is the dish, not added to it:
    // an egg omelette is the omelette ("1 omelette (2 eggs)").
    const others = rest.filter(
      (key) => servingUnits(FOOD_DB[head].serving, key) === null
    );
    const added = DISH_BASES.has(head)
      ? others
      : others.filter((key) => CONDIMENTS.has(key));
    return { head, added };
  }

  const typo = closestTypo([lower, depluralWords]);
  return typo ? { head: typo, added: [] } : null;
}

/** The row a phrase names, ignoring what is added to it. */
function findBestMatch(text: string): string | null {
  return matchDish(text)?.head ?? null;
}

/** A dish's macros: its row, and one serving of each food added to it,
 *  against the row's serving. */
function dishItem(dish: Dish): Macros {
  const item = { ...FOOD_DB[dish.head] };
  for (const key of dish.added) {
    item.calories += FOOD_DB[key].calories;
    item.protein += FOOD_DB[key].protein;
    item.carbs += FOOD_DB[key].carbs;
    item.fat += FOOD_DB[key].fat;
  }
  return item;
}

/**
 * Merge parsed rows that resolved to the same canonical FOOD_DB key.
 * Sums macros; preserves the first row's display name so the user sees
 * what they actually typed first ("Eggs" wins over "Boiled egg").
 *
 * Rows with no _canonicalKey (unrecognized, or compound `with` rows)
 * never merge.
 *
 * Strips `_canonicalKey` from every output row — the field is internal
 * to the merge step and shouldn't leak into the public ParsedFood
 * payload (where it would break `toEqual` test assertions and
 * potentially leak into Firestore writes if a consumer ever spread
 * the row).
 */
function mergeByCanonicalKey(rows: ParsedFood[]): ParsedFood[] {
  const out: ParsedFood[] = [];
  const idxByKey = new Map<string, number>();

  for (const row of rows) {
    const { _canonicalKey, ...clean } = row;
    if (!_canonicalKey) {
      out.push(clean);
      continue;
    }
    const existing = idxByKey.get(_canonicalKey);
    if (existing === undefined) {
      idxByKey.set(_canonicalKey, out.length);
      out.push(clean);
      continue;
    }
    const merged = out[existing];
    out[existing] = {
      ...merged,
      calories: merged.calories + clean.calories,
      protein: merged.protein + clean.protein,
      carbs: merged.carbs + clean.carbs,
      fat: merged.fat + clean.fat,
    };
  }

  return out;
}

/**
 * Parse a natural-language food description into structured items.
 * Splits on commas and newlines. Handles "with" compounds (e.g. "toast with butter")
 * and multi-word fallback matching (e.g. "ham sandwich").
 */
/**
 * Conjunction splitting — "2 eggs and a slice of toast" is two foods.
 *
 * Before this, only commas and newlines separated foods and only ` with `
 * formed a compound, so an "and"-joined phrase reached `findBestMatch`
 * whole: the LONGEST key found anywhere in it won (toast over eggs) and
 * the rest of the sentence was discarded — "2 eggs and a slice of toast"
 * logged as two slices of toast, "chicken and rice" as chicken alone with
 * 0 g carbs. Reproduced through the composer.
 *
 * Rules, deliberately narrow:
 *   - Whole-phrase keys stay whole ("fish and chips" is one dish).
 *   - A part is a food when it resolves on its own (a single food, a
 *     `with` compound, or a compound-word match).
 *   - "and", "&" and "+" split whenever at least one part is a food. A part
 *     nobody recognises is then its own row, with no macros, which the
 *     composer names in its "Couldn't find macros for" warning. Keeping the
 *     phrase whole instead handed it to the longest key found anywhere in
 *     it, so "2 scrambled eggs on toast and a flat white" logged one row of
 *     that name with the eggs' 182 kcal: the toast and the coffee were in
 *     the name and in nothing else, and nothing said so (Food pass).
 *   - A phrase with no food in it at all stays whole, so the existing path
 *     decides.
 *   - A quantity belongs to the part it was written in: "2 eggs and toast"
 *     is two eggs and one toast.
 *   - "on" joins two foods as "and" does, but only when both sides are
 *     foods: "beans on toast" is beans and toast, where the longest name
 *     alone logged a slice of toast, and "chicken on the bone" is chicken.
 *   - "&" reads as "and", so "fish & chips" and "cheese & onion crisps"
 *     find their rows (see `andForAmpersand`).
 */
const CONJUNCTION_SPLIT_RE = /\s+(?:and|&|\+|on)\s+/i;
const AND_SPLIT_RE = /\s+(?:and|&|\+)\s+/i;
const ON_SPLIT_RE = /\s+on\s+/i;
const CONJUNCTION_KEYS = Object.keys(FOOD_DB).filter((k) =>
  /\s(?:and|&|on)\s/.test(k)
);

function partResolves(part: string): boolean {
  const { rest } = extractQty(part);
  if (!rest) return false;
  return rest.split(/\s+with\s+/i).some((w) => findBestMatch(w) !== null);
}

function splitConjunctions(segment: string): string[] {
  if (!CONJUNCTION_SPLIT_RE.test(segment)) return [segment];
  const lower = andForAmpersand(extractQty(segment).rest.toLowerCase());
  const depluraled = lower.split(/\s+/).map(depluralize).join(" ");
  if (FOOD_DB[lower] || FOOD_DB[depluraled]) return [segment];
  for (const key of CONJUNCTION_KEYS) {
    const re = new RegExp(
      `\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
    );
    if (re.test(lower)) return [segment];
  }
  const splitOn = (part: string): string[] => {
    const sides = part
      .split(ON_SPLIT_RE)
      .map((s) => s.trim())
      .filter(Boolean);
    return sides.length > 1 && sides.every(partResolves) ? sides : [part];
  };
  const parts = segment
    .split(AND_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(splitOn);
  if (parts.length < 2 || !parts.some(partResolves)) return [segment];
  return parts;
}

/**
 * Milk in a cup of tea or coffee is a splash, not the glass its row
 * describes: "tea with milk" added 240 ml of milk to the cup, 152 kcal
 * for a cup of tea, on a drink logged several times a day. A mug takes
 * about 30 ml.
 */
const SPLASH_ML = 30;
const CUP_DRINKS = new Set(["tea", "coffee", "espresso"]);

/** How much of an added food's serving goes into the food it was added
 *  to ("tea with milk" → a splash of the milk). */
function addedShare(baseKey: string | null, key: string): number {
  if (!baseKey || !CUP_DRINKS.has(baseKey)) return 1;
  if (key !== "milk" && !key.endsWith(" milk")) return 1;
  const ml = parseServingMl(FOOD_DB[key].serving);
  return ml ? SPLASH_ML / ml : 1;
}

function unresolvedFood(
  text: string,
  quantityIssue?: ParsedFood["quantityIssue"]
): ParsedFood {
  const { qty, grams, ml, portionLabel, namePrefix, rest } = extractQty(text);
  const displayName =
    grams !== undefined || ml !== undefined
      ? `${namePrefix ?? portionLabel} ${rest}`
      : countedName(rest, qty);
  if (!quantityIssue) logger.warn("[nlFoodParser] Unrecognized food:", rest);
  return {
    name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    ...(quantityIssue ? { quantityIssue } : { unrecognized: true }),
    ...(portionLabel ? { portionLabel } : {}),
  };
}

function unresolvedQuantity(text: string, key: string): ParsedFood {
  const referencePortion = FOOD_DB[key].serving;
  return unresolvedFood(text, {
    referencePortion,
    expectedUnit: parseServingGrams(referencePortion)
      ? "g"
      : parseServingMl(referencePortion)
        ? "ml"
        : null,
  });
}

export function parseFoodText(input: string): ParsedFood[] {
  if (!input.trim()) return [];

  // Split on commas, newlines, then on conjunctions (see above).
  const segments = input
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(splitConjunctions);

  const results: ParsedFood[] = [];

  for (const segment of segments) {
    const { qty, grams, ml, portionLabel, namePrefix, counted, rest } =
      extractQty(segment);

    const hasUnitPrefix = grams !== undefined || ml !== undefined;

    // A leading measure belongs to the base; the addition keeps its own
    // portion (or normal serving), just as in "200g chicken, rice".
    const withParts = rest.split(/\s+with\s+/i);

    if (withParts.length > 1) {
      let totalCal = 0,
        totalP = 0,
        totalC = 0,
        totalF = 0;
      let anyMatch = false;
      let hasExplicitSide = false;
      const baseKey = findBestMatch(withParts[0]);
      const typedParts = segment.split(/\s+with\s+/i);
      const matchedParts: { index: number; text: string }[] = [];
      const unresolved: ParsedFood[] = [];

      for (const [i, part] of withParts.entries()) {
        const extracted = extractQty(part);
        // The leading count was removed before splitting "with". Keep
        // that context so a counted base uses its piece weight; the count
        // itself still applies once through `qty` below. Bare foods and
        // containers keep their normal serving because pieceGrams checks
        // that the remaining wording names only the food itself.
        // A measure typed after the base ("chicken 200g with rice") is in
        // the part, not the segment, so the part's own measure stands then.
        const amount =
          i === 0
            ? {
                ...extracted,
                counted,
                grams: grams ?? extracted.grams,
                ml: ml ?? extracted.ml,
              }
            : extracted;
        const dish = matchDish(amount.rest);
        if (dish) {
          const key = dish.head;
          // A measure cannot be shared out between a base and what is on it.
          const measured =
            amount.grams !== undefined || amount.ml !== undefined;
          const multiplier =
            measured && dish.added.length > 0
              ? null
              : foodMultiplier(key, amount);
          if (multiplier === null) {
            unresolved.push(
              unresolvedQuantity(i === 0 ? typedParts[0] : part, key)
            );
            continue;
          }
          matchedParts.push({ index: i, text: part });
          const item = dishItem(dish);
          const assumedShare = i === 0 ? 1 : addedShare(baseKey, key);
          const articlePortion = /^an?\s+/i.test(part);
          const impliedSplash =
            assumedShare !== 1 &&
            amount.grams === undefined &&
            amount.ml === undefined &&
            (!amount.counted ||
              articlePortion ||
              /\bsplash(?:es)?\b/i.test(amount.rest));
          const explicitPortion =
            amount.grams !== undefined ||
            amount.ml !== undefined ||
            (amount.counted && !(impliedSplash && articlePortion));
          if (i > 0 && explicitPortion) hasExplicitSide = true;
          // An explicit measure wins over an implied splash. An article
          // ("a splash of milk") retains the existing cup-sized assumption.
          const portionShare = impliedSplash
            ? assumedShare * amount.qty
            : multiplier;
          // The leading quantity repeats the base and implicit additions.
          // A side's own count, grams or ml is an absolute amount, applied
          // once even when the leading quantity is zero.
          const share = portionShare * (i === 0 || !explicitPortion ? qty : 1);
          totalCal += item.calories * share;
          totalP += item.protein * share;
          totalC += item.carbs * share;
          totalF += item.fat * share;
          anyMatch = true;
        } else {
          // Keep the missing ingredient (including its typed portion).
          // A caller must not mistake a known subtotal for the whole meal.
          unresolved.push(unresolvedFood(i === 0 ? typedParts[0] : part));
        }
      }

      if (anyMatch) {
        const knownRest =
          unresolved.length > 0
            ? matchedParts.map((part) => part.text).join(" with ")
            : rest;
        const hasKnownBase = matchedParts[0].index === 0;
        // A whole-meal xN suffix would imply that explicit sides repeat too.
        let displayName = countedName(knownRest, qty);
        if (hasExplicitSide) {
          displayName =
            unresolved.length > 0
              ? matchedParts
                  .map((part) => (part.index === 0 ? typedParts[0] : part.text))
                  .join(" with ")
              : segment;
        }
        if (hasUnitPrefix && hasKnownBase) {
          displayName = `${namePrefix ?? portionLabel} ${knownRest}`;
        }
        // Compound `with` rows are a separate semantic from single-food rows;
        // intentionally NOT setting _canonicalKey so they never merge with
        // simple foods (the macros are sums, not 1:1 to a single FOOD_DB entry).
        results.push({
          name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
          calories: Math.round(totalCal),
          protein: Math.round(totalP),
          carbs: Math.round(totalC),
          fat: Math.round(totalF),
        });
        results.push(...unresolved);
        continue;
      }
      if (unresolved.length > 0) {
        results.push(...unresolved);
        continue;
      }
    }

    const dish = matchDish(rest);
    if (dish) {
      const key = dish.head;
      const item = dishItem(dish);
      const combined = dish.added.length > 0;
      // A measure cannot be shared out between a base and what is on it.
      const multiplier =
        hasUnitPrefix && combined
          ? null
          : foodMultiplier(key, { qty, grams, ml, counted, rest });
      if (multiplier === null) {
        results.push(unresolvedQuantity(segment, key));
        continue;
      }
      // Name preserves the user's wording: typed portion ("200g chicken")
      // rounds out the prefix already, so we just title-case the rest
      // and the portionLabel carries the unit.
      const displayName = hasUnitPrefix
        ? `${namePrefix ?? portionLabel} ${rest}`
        : countedName(rest, qty);
      results.push({
        name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        calories: Math.round(item.calories * multiplier),
        protein: Math.round(item.protein * multiplier),
        carbs: Math.round(item.carbs * multiplier),
        fat: Math.round(item.fat * multiplier),
        // Only compatible quantities reach this point. Persist the typed
        // portion alongside the macros calculated for that same amount.
        ...(portionLabel ? { portionLabel } : {}),
        // Skip canonical-key dedup when an explicit portion was
        // typed — merging "200g chicken" with "100g chicken" loses
        // the per-row portion semantics. Each portioned row stays
        // independent in the diary. A dish with foods added to it is
        // a sum, not its row, so it never merges with that row either.
        ...(hasUnitPrefix || combined
          ? {}
          : { _canonicalKey: canonicalKey(key) }),
      });
      continue;
    }

    results.push(unresolvedFood(segment));
  }

  return mergeByCanonicalKey(results);
}

export interface FoodSuggestion {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving: string;
}

/**
 * Return autocomplete suggestions from the food DB based on partial input.
 * Handles leading numbers (e.g. "2choc" → searches "choc"), fuzzy typos,
 * and ranks results by relevance.
 */
export function getFoodSuggestions(input: string, limit = 8): FoodSuggestion[] {
  const raw = input.trim().toLowerCase();
  if (!raw || raw.length < 2) return [];

  // Strip leading quantity so "2choc" searches for "choc"
  const { rest } = extractQty(raw);
  const query = rest.toLowerCase().trim();
  if (!query || query.length < 2) return [];

  const depluralQuery = query.split(/\s+/).map(depluralize).join(" ");
  const seen = new Set<string>();
  const results: { key: string; score: number }[] = [];

  // De-duplicate keys that map to the same macros (e.g. "egg" and "eggs")
  const uniqueKeys = Object.keys(FOOD_DB);

  for (const key of uniqueKeys) {
    // Exact prefix match (highest priority)
    if (key.startsWith(query) || key.startsWith(depluralQuery)) {
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ key, score: 0 });
      }
      continue;
    }

    // Contains the query as a substring
    if (key.includes(query) || key.includes(depluralQuery)) {
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ key, score: 1 });
      }
      continue;
    }

    // Any word in the key starts with query
    const keyWords = key.split(/\s+/);
    if (
      keyWords.some((w) => w.startsWith(query) || w.startsWith(depluralQuery))
    ) {
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ key, score: 2 });
      }
      continue;
    }

    // Fuzzy match: only for single-word queries against single-word keys
    if (!query.includes(" ") && !key.includes(" ") && query.length >= 3) {
      const dist = editDistance(query, key);
      const maxDist = query.length <= 4 ? 1 : 2;
      if (dist <= maxDist) {
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ key, score: 3 + dist });
        }
      }
    }
  }

  // Sort by score (lower is better), then alphabetically
  results.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));

  return results.slice(0, limit).map(({ key }) => {
    const m = FOOD_DB[key];
    return {
      name: key.charAt(0).toUpperCase() + key.slice(1),
      calories: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
      serving: m.serving,
    };
  });
}

import { logger } from "@/lib/logger";

/**
 * NL food parser — parses natural-language food descriptions
 * into structured macro data using a common food database lookup.
 *
 * Features:
 *   - ~160 common foods with approximate macros per typical serving
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
  /** Human-readable portion the user typed ("200g", "150ml", "1.5kg").
   *  Persisted as the diary row's portionSize so the saved entry reads
   *  back what the user wrote instead of a generic "1 serving". Only
   *  set when a mass/volume unit was detected in the input. */
  portionLabel?: string;
  /** Internal — canonical FOOD_DB key. Used for output dedup. Strip before persisting. */
  _canonicalKey?: string;
}

type Macros = { calories: number; protein: number; carbs: number; fat: number; serving: string };

// ~160 common foods with approximate macros per typical serving (USDA averages)
const FOOD_DB: Record<string, Macros> = {
  // ── Proteins ──
  egg: { calories: 78, protein: 6, carbs: 1, fat: 5, serving: "1 large (50g)" },
  eggs: { calories: 78, protein: 6, carbs: 1, fat: 5, serving: "1 large (50g)" },
  "fried egg": { calories: 90, protein: 6, carbs: 0, fat: 7, serving: "1 large (46g)" },
  "boiled egg": { calories: 78, protein: 6, carbs: 1, fat: 5, serving: "1 large (50g)" },
  "scrambled eggs": { calories: 91, protein: 6, carbs: 1, fat: 7, serving: "1 large (61g)" },
  "poached egg": { calories: 71, protein: 6, carbs: 0, fat: 5, serving: "1 large (50g)" },
  omelette: { calories: 154, protein: 11, carbs: 1, fat: 12, serving: "1 omelette (2 eggs)" },
  chicken: { calories: 165, protein: 31, carbs: 0, fat: 4, serving: "3 oz cooked (85g)" },
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fat: 4, serving: "3 oz cooked (85g)" },
  "chicken thigh": { calories: 209, protein: 26, carbs: 0, fat: 11, serving: "3 oz cooked (85g)" },
  "chicken wing": { calories: 203, protein: 30, carbs: 0, fat: 8, serving: "3 oz cooked (85g)" },
  turkey: { calories: 135, protein: 30, carbs: 0, fat: 1, serving: "3 oz cooked (85g)" },
  ham: { calories: 145, protein: 21, carbs: 2, fat: 6, serving: "3 oz cooked (85g)" },
  bacon: { calories: 90, protein: 6, carbs: 0, fat: 7, serving: "2 slices (16g)" },
  sausage: { calories: 170, protein: 7, carbs: 1, fat: 15, serving: "1 link (56g)" },
  beef: { calories: 250, protein: 26, carbs: 0, fat: 15, serving: "3 oz cooked (85g)" },
  steak: { calories: 271, protein: 26, carbs: 0, fat: 18, serving: "3 oz cooked (85g)" },
  mince: { calories: 250, protein: 26, carbs: 0, fat: 15, serving: "3 oz cooked (85g)" },
  "ground beef": { calories: 250, protein: 26, carbs: 0, fat: 15, serving: "3 oz cooked (85g)" },
  pork: { calories: 242, protein: 27, carbs: 0, fat: 14, serving: "3 oz cooked (85g)" },
  lamb: { calories: 250, protein: 25, carbs: 0, fat: 16, serving: "3 oz cooked (85g)" },
  duck: { calories: 337, protein: 19, carbs: 0, fat: 28, serving: "3 oz cooked (85g)" },
  liver: { calories: 175, protein: 26, carbs: 4, fat: 5, serving: "3 oz cooked (85g)" },
  salmon: { calories: 208, protein: 20, carbs: 0, fat: 13, serving: "3 oz cooked (85g)" },
  tuna: { calories: 130, protein: 28, carbs: 0, fat: 1, serving: "3 oz cooked (85g)" },
  fish: { calories: 136, protein: 20, carbs: 0, fat: 6, serving: "3 oz cooked (85g)" },
  cod: { calories: 82, protein: 18, carbs: 0, fat: 1, serving: "3 oz cooked (85g)" },
  mackerel: { calories: 205, protein: 19, carbs: 0, fat: 14, serving: "3 oz cooked (85g)" },
  sardines: { calories: 208, protein: 25, carbs: 0, fat: 11, serving: "1 can (92g)" },
  prawns: { calories: 85, protein: 18, carbs: 0, fat: 1, serving: "3 oz cooked (85g)" },
  shrimp: { calories: 85, protein: 18, carbs: 0, fat: 1, serving: "3 oz cooked (85g)" },
  crab: { calories: 97, protein: 19, carbs: 0, fat: 2, serving: "3 oz cooked (85g)" },
  tofu: { calories: 144, protein: 17, carbs: 3, fat: 9, serving: "1/2 cup (126g)" },
  tempeh: { calories: 195, protein: 20, carbs: 8, fat: 11, serving: "3 oz (85g)" },
  jerky: { calories: 116, protein: 9, carbs: 3, fat: 7, serving: "1 oz (28g)" },
  "cottage cheese": { calories: 98, protein: 11, carbs: 3, fat: 4, serving: "1/2 cup (113g)" },

  // ── Carbs & Grains ──
  rice: { calories: 200, protein: 4, carbs: 45, fat: 0, serving: "1 cup cooked (158g)" },
  "brown rice": { calories: 216, protein: 5, carbs: 45, fat: 2, serving: "1 cup cooked (195g)" },
  "fried rice": { calories: 238, protein: 5, carbs: 34, fat: 9, serving: "1 cup (165g)" },
  pasta: { calories: 220, protein: 8, carbs: 43, fat: 1, serving: "1 cup cooked (140g)" },
  noodles: { calories: 220, protein: 7, carbs: 40, fat: 3, serving: "1 cup cooked (160g)" },
  bread: { calories: 80, protein: 3, carbs: 14, fat: 1, serving: "1 slice (30g)" },
  toast: { calories: 80, protein: 3, carbs: 14, fat: 1, serving: "1 slice (30g)" },
  bagel: { calories: 250, protein: 9, carbs: 48, fat: 2, serving: "1 bagel (95g)" },
  tortilla: { calories: 150, protein: 4, carbs: 26, fat: 4, serving: "1 medium (45g)" },
  wrap: { calories: 300, protein: 15, carbs: 35, fat: 10, serving: "1 wrap" },
  pita: { calories: 165, protein: 5, carbs: 33, fat: 1, serving: "1 pita (60g)" },
  naan: { calories: 260, protein: 9, carbs: 45, fat: 5, serving: "1 piece (90g)" },
  flatbread: { calories: 200, protein: 6, carbs: 36, fat: 4, serving: "1 piece (60g)" },
  croissant: { calories: 231, protein: 5, carbs: 26, fat: 12, serving: "1 croissant (57g)" },
  muffin: { calories: 340, protein: 5, carbs: 50, fat: 14, serving: "1 muffin (113g)" },
  pancake: { calories: 175, protein: 5, carbs: 22, fat: 7, serving: "1 medium (77g)" },
  pancakes: { calories: 175, protein: 5, carbs: 22, fat: 7, serving: "1 medium (77g)" },
  waffle: { calories: 218, protein: 6, carbs: 25, fat: 11, serving: "1 waffle (75g)" },
  biscuit: { calories: 135, protein: 2, carbs: 18, fat: 6, serving: "1 biscuit (35g)" },
  cracker: { calories: 65, protein: 1, carbs: 10, fat: 2, serving: "5 crackers (15g)" },
  crackers: { calories: 65, protein: 1, carbs: 10, fat: 2, serving: "5 crackers (15g)" },
  oats: { calories: 150, protein: 5, carbs: 27, fat: 3, serving: "1/2 cup dry (40g)" },
  oatmeal: { calories: 150, protein: 5, carbs: 27, fat: 3, serving: "1 cup cooked (234g)" },
  porridge: { calories: 150, protein: 5, carbs: 27, fat: 3, serving: "1 cup cooked (234g)" },
  cereal: { calories: 200, protein: 4, carbs: 40, fat: 2, serving: "1 cup (55g)" },
  granola: { calories: 200, protein: 5, carbs: 30, fat: 8, serving: "1/2 cup (45g)" },
  couscous: { calories: 176, protein: 6, carbs: 36, fat: 0, serving: "1 cup cooked (157g)" },
  potato: { calories: 130, protein: 3, carbs: 30, fat: 0, serving: "1 medium (150g)" },
  "sweet potato": { calories: 112, protein: 2, carbs: 26, fat: 0, serving: "1 medium (130g)" },
  chips: { calories: 274, protein: 3, carbs: 36, fat: 14, serving: "1 oz bag (28g)" },
  crisps: { calories: 274, protein: 3, carbs: 36, fat: 14, serving: "1 oz bag (28g)" },
  fries: { calories: 312, protein: 3, carbs: 41, fat: 15, serving: "1 medium order (117g)" },
  "french fries": { calories: 312, protein: 3, carbs: 41, fat: 15, serving: "1 medium order (117g)" },
  popcorn: { calories: 106, protein: 3, carbs: 21, fat: 1, serving: "3 cups popped (24g)" },
  "rice cake": { calories: 35, protein: 1, carbs: 7, fat: 0, serving: "1 cake (9g)" },
  dumpling: { calories: 80, protein: 3, carbs: 10, fat: 3, serving: "1 dumpling (30g)" },
  dumplings: { calories: 80, protein: 3, carbs: 10, fat: 3, serving: "1 dumpling (30g)" },
  gnocchi: { calories: 250, protein: 6, carbs: 50, fat: 2, serving: "1 cup (145g)" },

  // ── Fruits ──
  banana: { calories: 105, protein: 1, carbs: 27, fat: 0, serving: "1 medium (118g)" },
  apple: { calories: 95, protein: 0, carbs: 25, fat: 0, serving: "1 medium (182g)" },
  orange: { calories: 62, protein: 1, carbs: 15, fat: 0, serving: "1 medium (131g)" },
  mango: { calories: 99, protein: 1, carbs: 25, fat: 1, serving: "1 cup sliced (165g)" },
  strawberry: { calories: 4, protein: 0, carbs: 1, fat: 0, serving: "1 berry (12g)" },
  strawberries: { calories: 49, protein: 1, carbs: 12, fat: 0, serving: "1 cup (152g)" },
  blueberry: { calories: 1, protein: 0, carbs: 0, fat: 0, serving: "1 berry (1.5g)" },
  blueberries: { calories: 84, protein: 1, carbs: 21, fat: 0, serving: "1 cup (148g)" },
  raspberry: { calories: 1, protein: 0, carbs: 0, fat: 0, serving: "1 berry (3g)" },
  raspberries: { calories: 64, protein: 1, carbs: 15, fat: 1, serving: "1 cup (123g)" },
  grapes: { calories: 62, protein: 1, carbs: 16, fat: 0, serving: "1 cup (92g)" },
  pineapple: { calories: 82, protein: 1, carbs: 22, fat: 0, serving: "1 cup chunks (165g)" },
  watermelon: { calories: 46, protein: 1, carbs: 12, fat: 0, serving: "1 cup diced (152g)" },
  coconut: { calories: 283, protein: 3, carbs: 10, fat: 27, serving: "1/2 cup shredded (40g)" },
  dates: { calories: 66, protein: 0, carbs: 18, fat: 0, serving: "1 date (24g)" },
  raisins: { calories: 85, protein: 1, carbs: 22, fat: 0, serving: "1 small box (28g)" },
  pear: { calories: 101, protein: 1, carbs: 27, fat: 0, serving: "1 medium (178g)" },
  peach: { calories: 59, protein: 1, carbs: 14, fat: 0, serving: "1 medium (150g)" },
  kiwi: { calories: 42, protein: 1, carbs: 10, fat: 0, serving: "1 medium (69g)" },
  cherry: { calories: 5, protein: 0, carbs: 1, fat: 0, serving: "1 cherry (8g)" },
  cherries: { calories: 77, protein: 1, carbs: 20, fat: 0, serving: "1 cup (138g)" },
  melon: { calories: 53, protein: 1, carbs: 13, fat: 0, serving: "1 cup diced (160g)" },
  grapefruit: { calories: 52, protein: 1, carbs: 13, fat: 0, serving: "1/2 medium (123g)" },
  berries: { calories: 64, protein: 1, carbs: 14, fat: 0, serving: "1 cup (140g)" },

  // ── Vegetables ──
  salad: { calories: 50, protein: 2, carbs: 8, fat: 1, serving: "1 bowl (100g)" },
  broccoli: { calories: 55, protein: 4, carbs: 11, fat: 1, serving: "1 cup chopped (156g)" },
  spinach: { calories: 23, protein: 3, carbs: 4, fat: 0, serving: "1 cup cooked (180g)" },
  kale: { calories: 33, protein: 3, carbs: 6, fat: 1, serving: "1 cup chopped (67g)" },
  carrot: { calories: 25, protein: 1, carbs: 6, fat: 0, serving: "1 medium (61g)" },
  carrots: { calories: 25, protein: 1, carbs: 6, fat: 0, serving: "1 medium (61g)" },
  tomato: { calories: 22, protein: 1, carbs: 5, fat: 0, serving: "1 medium (123g)" },
  cucumber: { calories: 16, protein: 1, carbs: 4, fat: 0, serving: "1/2 medium (100g)" },
  pepper: { calories: 31, protein: 1, carbs: 6, fat: 0, serving: "1 medium (119g)" },
  corn: { calories: 96, protein: 3, carbs: 21, fat: 1, serving: "1 ear (90g)" },
  peas: { calories: 81, protein: 5, carbs: 14, fat: 0, serving: "1/2 cup (80g)" },
  beans: { calories: 114, protein: 8, carbs: 20, fat: 0, serving: "1/2 cup cooked (90g)" },
  lentils: { calories: 115, protein: 9, carbs: 20, fat: 0, serving: "1/2 cup cooked (99g)" },
  chickpeas: { calories: 134, protein: 7, carbs: 22, fat: 2, serving: "1/2 cup cooked (82g)" },
  mushroom: { calories: 15, protein: 2, carbs: 2, fat: 0, serving: "1 cup sliced (70g)" },
  mushrooms: { calories: 15, protein: 2, carbs: 2, fat: 0, serving: "1 cup sliced (70g)" },
  onion: { calories: 44, protein: 1, carbs: 10, fat: 0, serving: "1 medium (110g)" },
  garlic: { calories: 4, protein: 0, carbs: 1, fat: 0, serving: "1 clove (3g)" },
  celery: { calories: 6, protein: 0, carbs: 1, fat: 0, serving: "1 stalk (40g)" },
  lettuce: { calories: 10, protein: 1, carbs: 2, fat: 0, serving: "1 cup shredded (47g)" },
  cabbage: { calories: 22, protein: 1, carbs: 5, fat: 0, serving: "1 cup shredded (89g)" },
  cauliflower: { calories: 25, protein: 2, carbs: 5, fat: 0, serving: "1 cup (107g)" },
  zucchini: { calories: 17, protein: 1, carbs: 3, fat: 0, serving: "1 medium (196g)" },
  courgette: { calories: 17, protein: 1, carbs: 3, fat: 0, serving: "1 medium (196g)" },
  eggplant: { calories: 20, protein: 1, carbs: 5, fat: 0, serving: "1 cup diced (82g)" },
  aubergine: { calories: 20, protein: 1, carbs: 5, fat: 0, serving: "1 cup diced (82g)" },
  asparagus: { calories: 27, protein: 3, carbs: 5, fat: 0, serving: "5 spears (93g)" },
  "green beans": { calories: 31, protein: 2, carbs: 7, fat: 0, serving: "1 cup (100g)" },

  // ── Dairy & Fats ──
  milk: { calories: 150, protein: 8, carbs: 12, fat: 8, serving: "1 cup (240ml)" },
  "almond milk": { calories: 30, protein: 1, carbs: 1, fat: 3, serving: "1 cup (240ml)" },
  "oat milk": { calories: 120, protein: 3, carbs: 16, fat: 5, serving: "1 cup (240ml)" },
  cheese: { calories: 113, protein: 7, carbs: 0, fat: 9, serving: "1 oz (28g)" },
  cheddar: { calories: 113, protein: 7, carbs: 0, fat: 9, serving: "1 oz (28g)" },
  mozzarella: { calories: 85, protein: 6, carbs: 1, fat: 6, serving: "1 oz (28g)" },
  parmesan: { calories: 110, protein: 10, carbs: 1, fat: 7, serving: "1 oz (28g)" },
  "cream cheese": { calories: 99, protein: 2, carbs: 1, fat: 10, serving: "2 tbsp (29g)" },
  yogurt: { calories: 100, protein: 17, carbs: 6, fat: 1, serving: "3/4 cup (170g)" },
  yoghurt: { calories: 100, protein: 17, carbs: 6, fat: 1, serving: "3/4 cup (170g)" },
  "greek yogurt": { calories: 100, protein: 17, carbs: 6, fat: 1, serving: "3/4 cup (170g)" },
  "greek yoghurt": { calories: 100, protein: 17, carbs: 6, fat: 1, serving: "3/4 cup (170g)" },
  butter: { calories: 100, protein: 0, carbs: 0, fat: 11, serving: "1 tbsp (14g)" },
  cream: { calories: 52, protein: 0, carbs: 1, fat: 6, serving: "1 tbsp (15ml)" },
  "ice cream": { calories: 207, protein: 4, carbs: 24, fat: 11, serving: "1/2 cup (66g)" },
  avocado: { calories: 240, protein: 3, carbs: 13, fat: 22, serving: "1 medium (150g)" },
  "olive oil": { calories: 119, protein: 0, carbs: 0, fat: 14, serving: "1 tbsp (14g)" },
  "coconut oil": { calories: 121, protein: 0, carbs: 0, fat: 14, serving: "1 tbsp (14g)" },
  hummus: { calories: 166, protein: 8, carbs: 14, fat: 10, serving: "1/3 cup (75g)" },
  mayo: { calories: 94, protein: 0, carbs: 0, fat: 10, serving: "1 tbsp (13g)" },
  mayonnaise: { calories: 94, protein: 0, carbs: 0, fat: 10, serving: "1 tbsp (13g)" },
  "peanut butter": { calories: 188, protein: 8, carbs: 6, fat: 16, serving: "2 tbsp (32g)" },
  "almond butter": { calories: 196, protein: 7, carbs: 6, fat: 18, serving: "2 tbsp (32g)" },

  // ── Nuts & Seeds ──
  almonds: { calories: 160, protein: 6, carbs: 6, fat: 14, serving: "1 oz (28g)" },
  nuts: { calories: 170, protein: 5, carbs: 6, fat: 15, serving: "1 oz (28g)" },
  walnuts: { calories: 185, protein: 4, carbs: 4, fat: 18, serving: "1 oz (28g)" },
  cashews: { calories: 157, protein: 5, carbs: 9, fat: 12, serving: "1 oz (28g)" },
  peanuts: { calories: 161, protein: 7, carbs: 5, fat: 14, serving: "1 oz (28g)" },
  "trail mix": { calories: 175, protein: 5, carbs: 16, fat: 11, serving: "1 oz (28g)" },

  // ── Drinks ──
  coffee: { calories: 5, protein: 0, carbs: 0, fat: 0, serving: "1 cup (240ml)" },
  espresso: { calories: 3, protein: 0, carbs: 0, fat: 0, serving: "1 shot (30ml)" },
  cappuccino: { calories: 120, protein: 6, carbs: 10, fat: 6, serving: "1 cup (240ml)" },
  latte: { calories: 190, protein: 10, carbs: 18, fat: 7, serving: "1 grande (470ml)" },
  tea: { calories: 2, protein: 0, carbs: 0, fat: 0, serving: "1 cup (240ml)" },
  "hot chocolate": { calories: 190, protein: 8, carbs: 27, fat: 6, serving: "1 cup (240ml)" },
  juice: { calories: 110, protein: 1, carbs: 26, fat: 0, serving: "1 cup (240ml)" },
  "orange juice": { calories: 110, protein: 2, carbs: 26, fat: 0, serving: "1 cup (240ml)" },
  "apple juice": { calories: 113, protein: 0, carbs: 28, fat: 0, serving: "1 cup (240ml)" },
  smoothie: { calories: 250, protein: 10, carbs: 40, fat: 5, serving: "1 cup (240ml)" },
  soda: { calories: 140, protein: 0, carbs: 39, fat: 0, serving: "1 can (355ml)" },
  "energy drink": { calories: 110, protein: 0, carbs: 28, fat: 0, serving: "1 can (250ml)" },
  "coconut water": { calories: 46, protein: 2, carbs: 9, fat: 0, serving: "1 cup (240ml)" },
  beer: { calories: 153, protein: 2, carbs: 13, fat: 0, serving: "1 can (355ml)" },
  wine: { calories: 125, protein: 0, carbs: 4, fat: 0, serving: "5 oz glass (148ml)" },

  // ── Supplements ──
  "protein shake": { calories: 150, protein: 30, carbs: 5, fat: 2, serving: "1 shake (350ml)" },
  "protein powder": { calories: 120, protein: 24, carbs: 3, fat: 1, serving: "1 scoop (31g)" },
  whey: { calories: 120, protein: 24, carbs: 3, fat: 1, serving: "1 scoop (31g)" },
  "protein bar": { calories: 230, protein: 20, carbs: 25, fat: 8, serving: "1 bar (60g)" },
  "granola bar": { calories: 190, protein: 4, carbs: 29, fat: 7, serving: "1 bar (42g)" },
  creatine: { calories: 0, protein: 0, carbs: 0, fat: 0, serving: "1 scoop (5g)" },

  // ── Meals & Snacks ──
  sandwich: { calories: 350, protein: 18, carbs: 35, fat: 14, serving: "1 sandwich" },
  burger: { calories: 500, protein: 28, carbs: 40, fat: 25, serving: "1 burger" },
  pizza: { calories: 285, protein: 12, carbs: 36, fat: 10, serving: "1 slice" },
  burrito: { calories: 450, protein: 20, carbs: 50, fat: 18, serving: "1 burrito" },
  taco: { calories: 210, protein: 9, carbs: 21, fat: 10, serving: "1 taco" },
  tacos: { calories: 210, protein: 9, carbs: 21, fat: 10, serving: "1 taco" },
  quesadilla: { calories: 310, protein: 13, carbs: 32, fat: 14, serving: "1 quesadilla" },
  nachos: { calories: 346, protein: 9, carbs: 36, fat: 19, serving: "1 serving" },
  sushi: { calories: 200, protein: 9, carbs: 38, fat: 1, serving: "6 pieces" },
  curry: { calories: 350, protein: 20, carbs: 30, fat: 16, serving: "1 serving" },
  soup: { calories: 150, protein: 8, carbs: 18, fat: 5, serving: "1 cup (240ml)" },
  chili: { calories: 300, protein: 20, carbs: 25, fat: 14, serving: "1 cup (240ml)" },
  "stir fry": { calories: 300, protein: 20, carbs: 30, fat: 10, serving: "1 serving" },
  kebab: { calories: 500, protein: 30, carbs: 45, fat: 20, serving: "1 kebab" },
  ramen: { calories: 436, protein: 15, carbs: 60, fat: 16, serving: "1 bowl" },
  pho: { calories: 350, protein: 25, carbs: 40, fat: 8, serving: "1 bowl" },
  pie: { calories: 350, protein: 10, carbs: 35, fat: 19, serving: "1 slice" },
  "fish and chips": { calories: 595, protein: 25, carbs: 60, fat: 28, serving: "1 serving" },

  // ── Sweets & Desserts ──
  chocolate: { calories: 155, protein: 2, carbs: 17, fat: 9, serving: "1 oz (28g)" },
  cookie: { calories: 150, protein: 2, carbs: 20, fat: 7, serving: "1 cookie (30g)" },
  cookies: { calories: 150, protein: 2, carbs: 20, fat: 7, serving: "1 cookie (30g)" },
  cake: { calories: 350, protein: 4, carbs: 50, fat: 15, serving: "1 slice (80g)" },
  brownie: { calories: 260, protein: 3, carbs: 36, fat: 12, serving: "1 brownie (60g)" },
  doughnut: { calories: 253, protein: 4, carbs: 30, fat: 14, serving: "1 doughnut (60g)" },
  donut: { calories: 253, protein: 4, carbs: 30, fat: 14, serving: "1 doughnut (60g)" },
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
  prawns: "shrimp",                 // UK ↔ US
  mince: "ground beef",             // UK ↔ US
  beef: "ground beef",              // generic ↔ specific (DB treats equal)
  toast: "bread",                   // toasted ↔ untoasted (DB treats equal)
  oatmeal: "oats",
  porridge: "oats",
  crisps: "chips",                  // UK ↔ US (the snack, not fries)
  "french fries": "fries",
  courgette: "zucchini",            // UK ↔ US
  aubergine: "eggplant",            // UK ↔ US
  yoghurt: "yogurt",
  "greek yoghurt": "greek yogurt",
  mayo: "mayonnaise",
  donut: "doughnut",
};

/** Canonical form of a FOOD_DB key. Non-aliased keys pass through. */
function canonicalKey(key: string): string {
  return FOOD_ALIASES[key] ?? key;
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
  // "2 eggs" or "2.5 servings"
  const match = segment.match(/^(\d+(?:\.\d+)?)\s+(.+)/);
  if (match) {
    return { qty: parseFloat(match[1]), rest: match[2].trim() };
  }
  // "2chocolate" — number glued to text (no space)
  const gluedMatch = segment.match(/^(\d+(?:\.\d+)?)([a-zA-Z].*)$/);
  if (gluedMatch) {
    return { qty: parseFloat(gluedMatch[1]), rest: gluedMatch[2].trim() };
  }
  // "a slice of toast" → qty=1, rest="slice of toast"
  const aMatch = segment.match(/^an?\s+(.+)/i);
  if (aMatch) {
    return { qty: 1, rest: aMatch[1].trim() };
  }
  return { qty: 1, rest: segment };
}

/**
 * Pull the grams count out of a FOOD_DB serving string. The DB
 * convention is "<descriptive> (Ng)" — e.g. "3 oz cooked (85g)",
 * "1 large (50g)", "1 cup cooked (158g)". Returns null when the
 * serving is ml-based (beverages) so callers fall back to the
 * volume helper.
 */
function parseServingGrams(serving: string): number | null {
  const m = serving.match(/\((\d+(?:\.\d+)?)g\)/);
  return m ? parseFloat(m[1]) : null;
}

/** Volume counterpart for beverages — "1 cup (240ml)", "1 can (355ml)". */
function parseServingMl(serving: string): number | null {
  const m = serving.match(/\((\d+(?:\.\d+)?)ml\)/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Simple Levenshtein distance for fuzzy matching.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/** Strip common plural suffixes: "bars" → "bar", "cookies" → "cookie" */
function depluralize(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("es") && word.length > 3) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

/**
 * Try to find an exact or substring match in the food DB.
 * Falls back to depluralized forms and fuzzy (Levenshtein) matching.
 * Returns the best matching key, or null.
 */
function findBestMatch(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Exact match
  if (FOOD_DB[lower]) return lower;

  // Try depluralized form: "chocolate bars" → "chocolate bar"
  const depluralWords = lower.split(/\s+/).map(depluralize).join(" ");
  if (FOOD_DB[depluralWords]) return depluralWords;

  // Try multi-word matches (longest first) — require word boundaries
  const sortedKeys = Object.keys(FOOD_DB).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(lower)) return key;
  }

  // Try depluralized text against word boundaries
  if (depluralWords !== lower) {
    for (const key of sortedKeys) {
      const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(depluralWords)) return key;
    }
  }

  // Fuzzy matching: allow small typos (distance ≤ 2 for words ≥ 4 chars)
  let bestKey: string | null = null;
  let bestDist = Infinity;
  const candidates = [lower, depluralWords];
  for (const candidate of candidates) {
    for (const key of sortedKeys) {
      // Only fuzzy-match single-word keys against single-word input,
      // or multi-word keys against multi-word input of similar length
      if (Math.abs(candidate.length - key.length) > 3) continue;
      const dist = levenshtein(candidate, key);
      const maxDist = key.length <= 3 ? 1 : 2;
      if (dist <= maxDist && dist < bestDist) {
        bestDist = dist;
        bestKey = key;
      }
    }
  }
  if (bestKey) return bestKey;

  return null;
}

/**
 * Try to match multiple words in a segment against individual DB keys.
 * "ham sandwich" → finds "ham" and "sandwich", sums their macros.
 * Returns the combined macros and matched words, or null if <1 match.
 */
function findCompoundMatch(text: string): { macros: Macros; matchedKeys: string[] } | null {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);
  const matched: { key: string; macros: Macros }[] = [];
  const usedIndices = new Set<number>();

  // Try multi-word keys first (longest first), then single words
  const sortedKeys = Object.keys(FOOD_DB).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const keyWords = key.split(/\s+/);
    // Check if consecutive words in `words` match this key
    for (let i = 0; i <= words.length - keyWords.length; i++) {
      if (usedIndices.has(i)) continue;
      const slice = words.slice(i, i + keyWords.length).join(" ");
      if (slice === key) {
        matched.push({ key, macros: FOOD_DB[key] });
        for (let j = i; j < i + keyWords.length; j++) usedIndices.add(j);
        break;
      }
    }
  }

  if (matched.length === 0) return null;

  const combined: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, serving: "1 serving" };
  for (const m of matched) {
    combined.calories += m.macros.calories;
    combined.protein += m.macros.protein;
    combined.carbs += m.macros.carbs;
    combined.fat += m.macros.fat;
  }

  return { macros: combined, matchedKeys: matched.map((m) => m.key) };
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
export function parseFoodText(input: string): ParsedFood[] {
  if (!input.trim()) return [];

  // Split on commas, newlines
  const segments = input
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const results: ParsedFood[] = [];

  for (const segment of segments) {
    const { qty, grams, ml, portionLabel, rest } = extractQty(segment);

    // Mass/volume-prefixed inputs skip the compound `with` path —
    // the user's portion applies to one food, not a sum. "100g
    // chicken with rice" is ambiguous (rice portion is unclear);
    // we treat the whole rest as a single food and match best-effort.
    const hasUnitPrefix = grams !== undefined || ml !== undefined;

    // Handle "X with Y" pattern (e.g. "toast with butter")
    const withParts = hasUnitPrefix ? [rest] : rest.split(/\s+with\s+/i);

    if (withParts.length > 1) {
      let totalCal = 0, totalP = 0, totalC = 0, totalF = 0;
      let anyMatch = false;

      for (const part of withParts) {
        const key = findBestMatch(part);
        if (key) {
          const item = FOOD_DB[key];
          totalCal += item.calories;
          totalP += item.protein;
          totalC += item.carbs;
          totalF += item.fat;
          anyMatch = true;
        }
      }

      if (anyMatch) {
        const displayName = qty > 1 ? `${rest} (x${qty})` : rest;
        // Compound `with` rows are a separate semantic from single-food rows;
        // intentionally NOT setting _canonicalKey so they never merge with
        // simple foods (the macros are sums, not 1:1 to a single FOOD_DB entry).
        results.push({
          name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
          calories: Math.round(totalCal * qty),
          protein: Math.round(totalP * qty),
          carbs: Math.round(totalC * qty),
          fat: Math.round(totalF * qty),
        });
        continue;
      }
    }

    // Try exact/substring match first
    const key = findBestMatch(rest);
    if (key) {
      const item = FOOD_DB[key];
      // Compute macro multiplier. Mass/volume prefixes scale against
      // the FOOD_DB serving's gram/ml count; fall back to count-based
      // qty otherwise. If the user wrote "200g" on a beverage (or
      // "150ml" on a solid food), the serving unit won't match — we
      // conservatively use qty=1 (one-serving macros), but
      // `portionLabel` still carries the user's wording so the saved
      // entry stays honest. Better than silently producing the
      // count-prefix bug (200x macros).
      let multiplier = qty;
      if (grams !== undefined) {
        const servingGrams = parseServingGrams(item.serving);
        if (servingGrams) multiplier = grams / servingGrams;
      } else if (ml !== undefined) {
        const servingMl = parseServingMl(item.serving);
        if (servingMl) multiplier = ml / servingMl;
      }
      // Name preserves the user's wording: typed portion ("200g chicken")
      // rounds out the prefix already, so we just title-case the rest
      // and the portionLabel carries the unit.
      const displayName = hasUnitPrefix
        ? `${portionLabel} ${rest}`
        : qty > 1
          ? `${rest} (x${qty})`
          : rest;
      results.push({
        name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        calories: Math.round(item.calories * multiplier),
        protein: Math.round(item.protein * multiplier),
        carbs: Math.round(item.carbs * multiplier),
        fat: Math.round(item.fat * multiplier),
        // Surface the typed portion so the save path persists it as
        // the diary row's portionSize. Unit-mismatched rows still
        // carry the label (it's what the user wrote); the caller
        // sees qty=1 macros and can decide whether to flag.
        ...(portionLabel ? { portionLabel } : {}),
        // Skip canonical-key dedup when an explicit portion was
        // typed — merging "200g chicken" with "100g chicken" loses
        // the per-row portion semantics. Each portioned row stays
        // independent in the diary.
        ...(hasUnitPrefix ? {} : { _canonicalKey: canonicalKey(key) }),
      });
      continue;
    }

    // Fallback: compound word matching ("ham sandwich" → ham + sandwich)
    // Skipped for unit-prefixed inputs — see hasUnitPrefix note above.
    const compound = hasUnitPrefix ? null : findCompoundMatch(rest);
    if (compound && compound.macros.calories > 0) {
      const displayName = qty > 1 ? `${rest} (x${qty})` : rest;
      results.push({
        name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        calories: Math.round(compound.macros.calories * qty),
        protein: Math.round(compound.macros.protein * qty),
        carbs: Math.round(compound.macros.carbs * qty),
        fat: Math.round(compound.macros.fat * qty),
        _canonicalKey: canonicalKey(compound.matchedKeys[0]),
      });
      continue;
    }

    // Unrecognized — return with zero macros and flag. Unit-prefixed
    // inputs still carry their portionLabel so the user sees "200g
    // <unknown food>" instead of losing the wording entirely.
    logger.warn('[nlFoodParser] Unrecognized food:', rest);
    const displayName = hasUnitPrefix
      ? `${portionLabel} ${rest}`
      : qty > 1
        ? `${rest} (x${qty})`
        : rest;
    results.push({
      name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      unrecognized: true,
      ...(portionLabel ? { portionLabel } : {}),
    });
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
    if (keyWords.some(w => w.startsWith(query) || w.startsWith(depluralQuery))) {
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ key, score: 2 });
      }
      continue;
    }

    // Fuzzy match: only for single-word queries against single-word keys
    if (!query.includes(" ") && !key.includes(" ") && query.length >= 3) {
      const dist = levenshtein(query, key);
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

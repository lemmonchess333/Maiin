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
}

type Macros = { calories: number; protein: number; carbs: number; fat: number };

// ~160 common foods with approximate macros per typical serving (USDA averages)
const FOOD_DB: Record<string, Macros> = {
  // ── Proteins ──
  egg: { calories: 78, protein: 6, carbs: 1, fat: 5 },
  eggs: { calories: 78, protein: 6, carbs: 1, fat: 5 },
  "fried egg": { calories: 90, protein: 6, carbs: 0, fat: 7 },
  "boiled egg": { calories: 78, protein: 6, carbs: 1, fat: 5 },
  "scrambled eggs": { calories: 91, protein: 6, carbs: 1, fat: 7 },
  "poached egg": { calories: 71, protein: 6, carbs: 0, fat: 5 },
  omelette: { calories: 154, protein: 11, carbs: 1, fat: 12 },
  chicken: { calories: 165, protein: 31, carbs: 0, fat: 4 },
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fat: 4 },
  "chicken thigh": { calories: 209, protein: 26, carbs: 0, fat: 11 },
  "chicken wing": { calories: 203, protein: 30, carbs: 0, fat: 8 },
  turkey: { calories: 135, protein: 30, carbs: 0, fat: 1 },
  ham: { calories: 145, protein: 21, carbs: 2, fat: 6 },
  bacon: { calories: 90, protein: 6, carbs: 0, fat: 7 },
  sausage: { calories: 170, protein: 7, carbs: 1, fat: 15 },
  beef: { calories: 250, protein: 26, carbs: 0, fat: 15 },
  steak: { calories: 271, protein: 26, carbs: 0, fat: 18 },
  mince: { calories: 250, protein: 26, carbs: 0, fat: 15 },
  "ground beef": { calories: 250, protein: 26, carbs: 0, fat: 15 },
  pork: { calories: 242, protein: 27, carbs: 0, fat: 14 },
  lamb: { calories: 250, protein: 25, carbs: 0, fat: 16 },
  duck: { calories: 337, protein: 19, carbs: 0, fat: 28 },
  liver: { calories: 175, protein: 26, carbs: 4, fat: 5 },
  salmon: { calories: 208, protein: 20, carbs: 0, fat: 13 },
  tuna: { calories: 130, protein: 28, carbs: 0, fat: 1 },
  fish: { calories: 136, protein: 20, carbs: 0, fat: 6 },
  cod: { calories: 82, protein: 18, carbs: 0, fat: 1 },
  mackerel: { calories: 205, protein: 19, carbs: 0, fat: 14 },
  sardines: { calories: 208, protein: 25, carbs: 0, fat: 11 },
  prawns: { calories: 85, protein: 18, carbs: 0, fat: 1 },
  shrimp: { calories: 85, protein: 18, carbs: 0, fat: 1 },
  crab: { calories: 97, protein: 19, carbs: 0, fat: 2 },
  tofu: { calories: 144, protein: 17, carbs: 3, fat: 9 },
  tempeh: { calories: 195, protein: 20, carbs: 8, fat: 11 },
  jerky: { calories: 116, protein: 9, carbs: 3, fat: 7 },
  "cottage cheese": { calories: 98, protein: 11, carbs: 3, fat: 4 },

  // ── Carbs & Grains ──
  rice: { calories: 200, protein: 4, carbs: 45, fat: 0 },
  "brown rice": { calories: 216, protein: 5, carbs: 45, fat: 2 },
  "fried rice": { calories: 238, protein: 5, carbs: 34, fat: 9 },
  pasta: { calories: 220, protein: 8, carbs: 43, fat: 1 },
  noodles: { calories: 220, protein: 7, carbs: 40, fat: 3 },
  bread: { calories: 80, protein: 3, carbs: 14, fat: 1 },
  toast: { calories: 80, protein: 3, carbs: 14, fat: 1 },
  bagel: { calories: 250, protein: 9, carbs: 48, fat: 2 },
  tortilla: { calories: 150, protein: 4, carbs: 26, fat: 4 },
  wrap: { calories: 300, protein: 15, carbs: 35, fat: 10 },
  pita: { calories: 165, protein: 5, carbs: 33, fat: 1 },
  naan: { calories: 260, protein: 9, carbs: 45, fat: 5 },
  flatbread: { calories: 200, protein: 6, carbs: 36, fat: 4 },
  croissant: { calories: 231, protein: 5, carbs: 26, fat: 12 },
  muffin: { calories: 340, protein: 5, carbs: 50, fat: 14 },
  pancake: { calories: 175, protein: 5, carbs: 22, fat: 7 },
  pancakes: { calories: 175, protein: 5, carbs: 22, fat: 7 },
  waffle: { calories: 218, protein: 6, carbs: 25, fat: 11 },
  biscuit: { calories: 135, protein: 2, carbs: 18, fat: 6 },
  cracker: { calories: 65, protein: 1, carbs: 10, fat: 2 },
  crackers: { calories: 65, protein: 1, carbs: 10, fat: 2 },
  oats: { calories: 150, protein: 5, carbs: 27, fat: 3 },
  oatmeal: { calories: 150, protein: 5, carbs: 27, fat: 3 },
  porridge: { calories: 150, protein: 5, carbs: 27, fat: 3 },
  cereal: { calories: 200, protein: 4, carbs: 40, fat: 2 },
  granola: { calories: 200, protein: 5, carbs: 30, fat: 8 },
  couscous: { calories: 176, protein: 6, carbs: 36, fat: 0 },
  potato: { calories: 130, protein: 3, carbs: 30, fat: 0 },
  "sweet potato": { calories: 112, protein: 2, carbs: 26, fat: 0 },
  chips: { calories: 274, protein: 3, carbs: 36, fat: 14 },
  crisps: { calories: 274, protein: 3, carbs: 36, fat: 14 },
  fries: { calories: 312, protein: 3, carbs: 41, fat: 15 },
  "french fries": { calories: 312, protein: 3, carbs: 41, fat: 15 },
  popcorn: { calories: 106, protein: 3, carbs: 21, fat: 1 },
  "rice cake": { calories: 35, protein: 1, carbs: 7, fat: 0 },
  dumpling: { calories: 80, protein: 3, carbs: 10, fat: 3 },
  dumplings: { calories: 80, protein: 3, carbs: 10, fat: 3 },
  gnocchi: { calories: 250, protein: 6, carbs: 50, fat: 2 },

  // ── Fruits ──
  banana: { calories: 105, protein: 1, carbs: 27, fat: 0 },
  apple: { calories: 95, protein: 0, carbs: 25, fat: 0 },
  orange: { calories: 62, protein: 1, carbs: 15, fat: 0 },
  mango: { calories: 99, protein: 1, carbs: 25, fat: 1 },
  strawberry: { calories: 4, protein: 0, carbs: 1, fat: 0 },
  strawberries: { calories: 49, protein: 1, carbs: 12, fat: 0 },
  blueberry: { calories: 1, protein: 0, carbs: 0, fat: 0 },
  blueberries: { calories: 84, protein: 1, carbs: 21, fat: 0 },
  raspberry: { calories: 1, protein: 0, carbs: 0, fat: 0 },
  raspberries: { calories: 64, protein: 1, carbs: 15, fat: 1 },
  grapes: { calories: 62, protein: 1, carbs: 16, fat: 0 },
  pineapple: { calories: 82, protein: 1, carbs: 22, fat: 0 },
  watermelon: { calories: 46, protein: 1, carbs: 12, fat: 0 },
  coconut: { calories: 283, protein: 3, carbs: 10, fat: 27 },
  dates: { calories: 66, protein: 0, carbs: 18, fat: 0 },
  raisins: { calories: 85, protein: 1, carbs: 22, fat: 0 },
  pear: { calories: 101, protein: 1, carbs: 27, fat: 0 },
  peach: { calories: 59, protein: 1, carbs: 14, fat: 0 },
  kiwi: { calories: 42, protein: 1, carbs: 10, fat: 0 },
  cherry: { calories: 5, protein: 0, carbs: 1, fat: 0 },
  cherries: { calories: 77, protein: 1, carbs: 20, fat: 0 },
  melon: { calories: 53, protein: 1, carbs: 13, fat: 0 },
  grapefruit: { calories: 52, protein: 1, carbs: 13, fat: 0 },
  berries: { calories: 64, protein: 1, carbs: 14, fat: 0 },

  // ── Vegetables ──
  salad: { calories: 50, protein: 2, carbs: 8, fat: 1 },
  broccoli: { calories: 55, protein: 4, carbs: 11, fat: 1 },
  spinach: { calories: 23, protein: 3, carbs: 4, fat: 0 },
  kale: { calories: 33, protein: 3, carbs: 6, fat: 1 },
  carrot: { calories: 25, protein: 1, carbs: 6, fat: 0 },
  carrots: { calories: 25, protein: 1, carbs: 6, fat: 0 },
  tomato: { calories: 22, protein: 1, carbs: 5, fat: 0 },
  cucumber: { calories: 16, protein: 1, carbs: 4, fat: 0 },
  pepper: { calories: 31, protein: 1, carbs: 6, fat: 0 },
  corn: { calories: 96, protein: 3, carbs: 21, fat: 1 },
  peas: { calories: 81, protein: 5, carbs: 14, fat: 0 },
  beans: { calories: 114, protein: 8, carbs: 20, fat: 0 },
  lentils: { calories: 115, protein: 9, carbs: 20, fat: 0 },
  chickpeas: { calories: 134, protein: 7, carbs: 22, fat: 2 },
  mushroom: { calories: 15, protein: 2, carbs: 2, fat: 0 },
  mushrooms: { calories: 15, protein: 2, carbs: 2, fat: 0 },
  onion: { calories: 44, protein: 1, carbs: 10, fat: 0 },
  garlic: { calories: 4, protein: 0, carbs: 1, fat: 0 },
  celery: { calories: 6, protein: 0, carbs: 1, fat: 0 },
  lettuce: { calories: 10, protein: 1, carbs: 2, fat: 0 },
  cabbage: { calories: 22, protein: 1, carbs: 5, fat: 0 },
  cauliflower: { calories: 25, protein: 2, carbs: 5, fat: 0 },
  zucchini: { calories: 17, protein: 1, carbs: 3, fat: 0 },
  courgette: { calories: 17, protein: 1, carbs: 3, fat: 0 },
  eggplant: { calories: 20, protein: 1, carbs: 5, fat: 0 },
  aubergine: { calories: 20, protein: 1, carbs: 5, fat: 0 },
  asparagus: { calories: 27, protein: 3, carbs: 5, fat: 0 },
  "green beans": { calories: 31, protein: 2, carbs: 7, fat: 0 },

  // ── Dairy & Fats ──
  milk: { calories: 150, protein: 8, carbs: 12, fat: 8 },
  "almond milk": { calories: 30, protein: 1, carbs: 1, fat: 3 },
  "oat milk": { calories: 120, protein: 3, carbs: 16, fat: 5 },
  cheese: { calories: 113, protein: 7, carbs: 0, fat: 9 },
  cheddar: { calories: 113, protein: 7, carbs: 0, fat: 9 },
  mozzarella: { calories: 85, protein: 6, carbs: 1, fat: 6 },
  parmesan: { calories: 110, protein: 10, carbs: 1, fat: 7 },
  "cream cheese": { calories: 99, protein: 2, carbs: 1, fat: 10 },
  yogurt: { calories: 100, protein: 17, carbs: 6, fat: 1 },
  yoghurt: { calories: 100, protein: 17, carbs: 6, fat: 1 },
  "greek yogurt": { calories: 100, protein: 17, carbs: 6, fat: 1 },
  "greek yoghurt": { calories: 100, protein: 17, carbs: 6, fat: 1 },
  butter: { calories: 100, protein: 0, carbs: 0, fat: 11 },
  cream: { calories: 52, protein: 0, carbs: 1, fat: 6 },
  "ice cream": { calories: 207, protein: 4, carbs: 24, fat: 11 },
  avocado: { calories: 240, protein: 3, carbs: 13, fat: 22 },
  "olive oil": { calories: 119, protein: 0, carbs: 0, fat: 14 },
  "coconut oil": { calories: 121, protein: 0, carbs: 0, fat: 14 },
  hummus: { calories: 166, protein: 8, carbs: 14, fat: 10 },
  mayo: { calories: 94, protein: 0, carbs: 0, fat: 10 },
  mayonnaise: { calories: 94, protein: 0, carbs: 0, fat: 10 },
  "peanut butter": { calories: 188, protein: 8, carbs: 6, fat: 16 },
  "almond butter": { calories: 196, protein: 7, carbs: 6, fat: 18 },

  // ── Nuts & Seeds ──
  almonds: { calories: 160, protein: 6, carbs: 6, fat: 14 },
  nuts: { calories: 170, protein: 5, carbs: 6, fat: 15 },
  walnuts: { calories: 185, protein: 4, carbs: 4, fat: 18 },
  cashews: { calories: 157, protein: 5, carbs: 9, fat: 12 },
  peanuts: { calories: 161, protein: 7, carbs: 5, fat: 14 },
  "trail mix": { calories: 175, protein: 5, carbs: 16, fat: 11 },

  // ── Drinks ──
  coffee: { calories: 5, protein: 0, carbs: 0, fat: 0 },
  espresso: { calories: 3, protein: 0, carbs: 0, fat: 0 },
  cappuccino: { calories: 120, protein: 6, carbs: 10, fat: 6 },
  latte: { calories: 190, protein: 10, carbs: 18, fat: 7 },
  tea: { calories: 2, protein: 0, carbs: 0, fat: 0 },
  "hot chocolate": { calories: 190, protein: 8, carbs: 27, fat: 6 },
  juice: { calories: 110, protein: 1, carbs: 26, fat: 0 },
  "orange juice": { calories: 110, protein: 2, carbs: 26, fat: 0 },
  "apple juice": { calories: 113, protein: 0, carbs: 28, fat: 0 },
  smoothie: { calories: 250, protein: 10, carbs: 40, fat: 5 },
  soda: { calories: 140, protein: 0, carbs: 39, fat: 0 },
  "energy drink": { calories: 110, protein: 0, carbs: 28, fat: 0 },
  "coconut water": { calories: 46, protein: 2, carbs: 9, fat: 0 },
  beer: { calories: 153, protein: 2, carbs: 13, fat: 0 },
  wine: { calories: 125, protein: 0, carbs: 4, fat: 0 },

  // ── Supplements ──
  "protein shake": { calories: 150, protein: 30, carbs: 5, fat: 2 },
  "protein powder": { calories: 120, protein: 24, carbs: 3, fat: 1 },
  whey: { calories: 120, protein: 24, carbs: 3, fat: 1 },
  "protein bar": { calories: 230, protein: 20, carbs: 25, fat: 8 },
  "granola bar": { calories: 190, protein: 4, carbs: 29, fat: 7 },
  creatine: { calories: 0, protein: 0, carbs: 0, fat: 0 },

  // ── Meals & Snacks ──
  sandwich: { calories: 350, protein: 18, carbs: 35, fat: 14 },
  burger: { calories: 500, protein: 28, carbs: 40, fat: 25 },
  pizza: { calories: 285, protein: 12, carbs: 36, fat: 10 },
  burrito: { calories: 450, protein: 20, carbs: 50, fat: 18 },
  taco: { calories: 210, protein: 9, carbs: 21, fat: 10 },
  tacos: { calories: 210, protein: 9, carbs: 21, fat: 10 },
  quesadilla: { calories: 310, protein: 13, carbs: 32, fat: 14 },
  nachos: { calories: 346, protein: 9, carbs: 36, fat: 19 },
  sushi: { calories: 200, protein: 9, carbs: 38, fat: 1 },
  curry: { calories: 350, protein: 20, carbs: 30, fat: 16 },
  soup: { calories: 150, protein: 8, carbs: 18, fat: 5 },
  chili: { calories: 300, protein: 20, carbs: 25, fat: 14 },
  "stir fry": { calories: 300, protein: 20, carbs: 30, fat: 10 },
  kebab: { calories: 500, protein: 30, carbs: 45, fat: 20 },
  ramen: { calories: 436, protein: 15, carbs: 60, fat: 16 },
  pho: { calories: 350, protein: 25, carbs: 40, fat: 8 },
  pie: { calories: 350, protein: 10, carbs: 35, fat: 19 },
  "fish and chips": { calories: 595, protein: 25, carbs: 60, fat: 28 },

  // ── Sweets & Desserts ──
  chocolate: { calories: 155, protein: 2, carbs: 17, fat: 9 },
  cookie: { calories: 150, protein: 2, carbs: 20, fat: 7 },
  cookies: { calories: 150, protein: 2, carbs: 20, fat: 7 },
  cake: { calories: 350, protein: 4, carbs: 50, fat: 15 },
  brownie: { calories: 260, protein: 3, carbs: 36, fat: 12 },
  doughnut: { calories: 253, protein: 4, carbs: 30, fat: 14 },
  donut: { calories: 253, protein: 4, carbs: 30, fat: 14 },
};

/**
 * Attempt to extract a quantity prefix like "2 eggs" → { qty: 2, rest: "eggs" }
 * Also handles "a" and "an" as qty=1.
 * Handles missing spaces: "2chocolate" → { qty: 2, rest: "chocolate" }
 */
function extractQty(segment: string): { qty: number; rest: string } {
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

  const combined: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const m of matched) {
    combined.calories += m.macros.calories;
    combined.protein += m.macros.protein;
    combined.carbs += m.macros.carbs;
    combined.fat += m.macros.fat;
  }

  return { macros: combined, matchedKeys: matched.map((m) => m.key) };
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
    const { qty, rest } = extractQty(segment);

    // Handle "X with Y" pattern (e.g. "toast with butter")
    const withParts = rest.split(/\s+with\s+/i);

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
      const displayName = qty > 1 ? `${rest} (x${qty})` : rest;
      results.push({
        name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        calories: Math.round(item.calories * qty),
        protein: Math.round(item.protein * qty),
        carbs: Math.round(item.carbs * qty),
        fat: Math.round(item.fat * qty),
      });
      continue;
    }

    // Fallback: compound word matching ("ham sandwich" → ham + sandwich)
    const compound = findCompoundMatch(rest);
    if (compound && compound.macros.calories > 0) {
      const displayName = qty > 1 ? `${rest} (x${qty})` : rest;
      results.push({
        name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        calories: Math.round(compound.macros.calories * qty),
        protein: Math.round(compound.macros.protein * qty),
        carbs: Math.round(compound.macros.carbs * qty),
        fat: Math.round(compound.macros.fat * qty),
      });
      continue;
    }

    // Unrecognized — return with zero macros
    const displayName = qty > 1 ? `${rest} (x${qty})` : rest;
    results.push({
      name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  }

  return results;
}

export interface FoodSuggestion {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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
    };
  });
}

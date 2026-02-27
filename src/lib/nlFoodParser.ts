/**
 * Simple NL food parser — parses natural-language food descriptions
 * into structured macro data using a common food database lookup.
 *
 * Examples:
 *   "2 eggs, toast with butter"  → [{name:"Eggs (x2)", …}, {name:"Toast with butter", …}]
 *   "protein shake"              → [{name:"Protein Shake", …}]
 */

interface ParsedFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// Common food items with approximate macros per typical serving
const FOOD_DB: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {
  egg: { calories: 78, protein: 6, carbs: 1, fat: 5 },
  eggs: { calories: 78, protein: 6, carbs: 1, fat: 5 },
  toast: { calories: 80, protein: 3, carbs: 14, fat: 1 },
  bread: { calories: 80, protein: 3, carbs: 14, fat: 1 },
  butter: { calories: 100, protein: 0, carbs: 0, fat: 11 },
  rice: { calories: 200, protein: 4, carbs: 45, fat: 0 },
  chicken: { calories: 165, protein: 31, carbs: 0, fat: 4 },
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fat: 4 },
  salmon: { calories: 208, protein: 20, carbs: 0, fat: 13 },
  tuna: { calories: 130, protein: 28, carbs: 0, fat: 1 },
  steak: { calories: 271, protein: 26, carbs: 0, fat: 18 },
  beef: { calories: 250, protein: 26, carbs: 0, fat: 15 },
  pasta: { calories: 220, protein: 8, carbs: 43, fat: 1 },
  oats: { calories: 150, protein: 5, carbs: 27, fat: 3 },
  oatmeal: { calories: 150, protein: 5, carbs: 27, fat: 3 },
  porridge: { calories: 150, protein: 5, carbs: 27, fat: 3 },
  banana: { calories: 105, protein: 1, carbs: 27, fat: 0 },
  apple: { calories: 95, protein: 0, carbs: 25, fat: 0 },
  yogurt: { calories: 100, protein: 17, carbs: 6, fat: 1 },
  "greek yogurt": { calories: 100, protein: 17, carbs: 6, fat: 1 },
  milk: { calories: 150, protein: 8, carbs: 12, fat: 8 },
  cheese: { calories: 113, protein: 7, carbs: 0, fat: 9 },
  avocado: { calories: 240, protein: 3, carbs: 13, fat: 22 },
  "peanut butter": { calories: 188, protein: 8, carbs: 6, fat: 16 },
  "protein shake": { calories: 150, protein: 30, carbs: 5, fat: 2 },
  "protein powder": { calories: 120, protein: 24, carbs: 3, fat: 1 },
  whey: { calories: 120, protein: 24, carbs: 3, fat: 1 },
  salad: { calories: 50, protein: 2, carbs: 8, fat: 1 },
  broccoli: { calories: 55, protein: 4, carbs: 11, fat: 1 },
  "sweet potato": { calories: 112, protein: 2, carbs: 26, fat: 0 },
  potato: { calories: 130, protein: 3, carbs: 30, fat: 0 },
  "protein bar": { calories: 230, protein: 20, carbs: 25, fat: 8 },
  almonds: { calories: 160, protein: 6, carbs: 6, fat: 14 },
  nuts: { calories: 170, protein: 5, carbs: 6, fat: 15 },
  coffee: { calories: 5, protein: 0, carbs: 0, fat: 0 },
  latte: { calories: 190, protein: 10, carbs: 18, fat: 7 },
  "orange juice": { calories: 110, protein: 2, carbs: 26, fat: 0 },
  smoothie: { calories: 250, protein: 10, carbs: 40, fat: 5 },
  sandwich: { calories: 350, protein: 18, carbs: 35, fat: 14 },
  burger: { calories: 500, protein: 28, carbs: 40, fat: 25 },
  pizza: { calories: 285, protein: 12, carbs: 36, fat: 10 },
  wrap: { calories: 300, protein: 15, carbs: 35, fat: 10 },
  bagel: { calories: 250, protein: 9, carbs: 48, fat: 2 },
  cereal: { calories: 200, protein: 4, carbs: 40, fat: 2 },
  granola: { calories: 200, protein: 5, carbs: 30, fat: 8 },
  bacon: { calories: 90, protein: 6, carbs: 0, fat: 7 },
  sausage: { calories: 170, protein: 7, carbs: 1, fat: 15 },
};

/**
 * Attempt to extract a quantity prefix like "2 eggs" → { qty: 2, rest: "eggs" }
 */
function extractQty(segment: string): { qty: number; rest: string } {
  const match = segment.match(/^(\d+)\s+(.+)/);
  if (match) {
    return { qty: parseInt(match[1], 10), rest: match[2].trim() };
  }
  return { qty: 1, rest: segment };
}

/**
 * Try to find a match in the food DB. Returns the best matching key, or null.
 */
function findBestMatch(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Exact match
  if (FOOD_DB[lower]) return lower;

  // Try multi-word matches (longest first)
  const sortedKeys = Object.keys(FOOD_DB).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) return key;
  }

  return null;
}

/**
 * Parse a natural-language food description into structured items.
 * Splits on commas and newlines. Handles "with" compounds (e.g. "toast with butter").
 */
export function parseFoodText(input: string): ParsedFood[] {
  if (!input.trim()) return [];

  // Split on commas, newlines, "and"
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
      // Compound food: sum up all parts
      let totalCal = 0, totalP = 0, totalC = 0, totalF = 0;
      let allMatched = true;

      for (const part of withParts) {
        const key = findBestMatch(part);
        if (key) {
          const item = FOOD_DB[key];
          totalCal += item.calories;
          totalP += item.protein;
          totalC += item.carbs;
          totalF += item.fat;
        } else {
          allMatched = false;
        }
      }

      if (allMatched || totalCal > 0) {
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

    // Single food match
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
    } else {
      // Unrecognized — return with zero macros, user can edit
      const displayName = qty > 1 ? `${rest} (x${qty})` : rest;
      results.push({
        name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      });
    }
  }

  return results;
}

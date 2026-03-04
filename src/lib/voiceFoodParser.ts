/**
 * Voice Food Parser
 * Converts spoken food descriptions to structured data.
 * Works alongside nlFoodParser for more natural voice input patterns.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, half: 0.5,
};

const UNIT_MAP: Record<string, string> = {
  grams: "g", gram: "g", g: "g",
  ounces: "oz", ounce: "oz", oz: "oz",
  cups: "cup", cup: "cup",
  tablespoons: "tbsp", tablespoon: "tbsp", tbsp: "tbsp",
  teaspoons: "tsp", teaspoon: "tsp", tsp: "tsp",
  slices: "slice", slice: "slice",
  pieces: "piece", piece: "piece",
  ml: "ml", milliliters: "ml",
  liters: "l", liter: "l", l: "l",
};

interface ParsedVoiceItem {
  quantity: number;
  unit: string;
  name: string;
  raw: string;
}

function normalizeNumberWords(text: string): string {
  let result = text;
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, String(num));
  }
  return result;
}

function normalizeUnits(text: string): string {
  let result = text;
  for (const [variant, standard] of Object.entries(UNIT_MAP)) {
    const regex = new RegExp(`\\b${variant}\\b`, "gi");
    result = result.replace(regex, standard);
  }
  return result;
}

export function parseVoiceInput(rawText: string): ParsedVoiceItem[] {
  if (!rawText.trim()) return [];

  // Normalize
  let text = rawText.toLowerCase().trim();
  text = normalizeNumberWords(text);
  text = normalizeUnits(text);

  // Split by "and", commas, or "with"
  const parts = text
    .split(/\s*(?:,|and|with|plus)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const items: ParsedVoiceItem[] = [];

  for (const part of parts) {
    // Pattern: [quantity] [unit] [food name]
    const match = part.match(/^(\d+\.?\d*)\s*([a-z]+)?\s+(.+)$/);
    if (match) {
      items.push({
        quantity: parseFloat(match[1]),
        unit: match[2] || "serving",
        name: match[3].trim(),
        raw: part,
      });
      continue;
    }

    // Pattern: [food name] (no quantity — assume 1)
    items.push({
      quantity: 1,
      unit: "serving",
      name: part.trim(),
      raw: part,
    });
  }

  return items;
}

export function formatParsedItems(items: ParsedVoiceItem[]): string {
  return items
    .map((item) => {
      if (item.quantity === 1 && item.unit === "serving") {
        return item.name;
      }
      return `${item.quantity} ${item.unit} ${item.name}`;
    })
    .join(", ");
}

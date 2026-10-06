import type { Meal, MealItem } from "@/hooks/useMeals";
import { localDateString } from "@/lib/dateHelpers";

/*
 * DEV/TEST-ONLY data for the break-food lab. Rendered only by
 * BreakFoodLab, which is stripped from production builds.
 *
 * "demo" is the day the diary is usually looked at with. "worst" is the
 * data real logs produce, one failure per row so they show together:
 * Open Food Facts product names and serving strings as barcode scans
 * bring them in, AI names, portions that multiply into floats, and
 * counts and calories past what the row was drawn for. "one" is a day
 * with a single meal, every count at one.
 */
export type BreakDataset = "demo" | "worst" | "one";

/** A Firestore-like timestamp at today's hh:mm. */
function at(hour: number, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return { toDate: () => new Date(d) };
}

const TODAY = localDateString();

function item(
  name: string,
  portionSize: string,
  calories: number,
  protein = 10,
  carbs = 20,
  fat = 5
): MealItem {
  return { name, portionSize, calories, protein, carbs, fat };
}

let seq = 0;
function meal(
  foodName: string,
  items: MealItem[],
  createdAt: ReturnType<typeof at>,
  extra: Partial<Meal> = {}
): Meal {
  seq += 1;
  const sum = (
    k: keyof Pick<MealItem, "calories" | "protein" | "carbs" | "fat">
  ) => items.reduce((n, i) => n + i[k], 0);
  return {
    id: `break-food-${seq}`,
    date: TODAY,
    foodName,
    items,
    totalCalories: sum("calories"),
    totalProtein: sum("protein"),
    totalCarbs: sum("carbs"),
    totalFat: sum("fat"),
    confidence: "high",
    createdAt,
    ...extra,
  };
}

/** The same log `n` times — the diary groups them into one "×N" row. */
function times(n: number, make: () => Meal): Meal[] {
  return Array.from({ length: n }, make);
}

/* A small inline photo, so the photo-card shape renders without a
   network or the device store. */
const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e9c46a"/><circle cx="200" cy="150" r="90" fill="#f4a261"/></svg>'
  );

const demo: Meal[] = [
  meal("Porridge with banana", [item("Porridge", "1 bowl", 320)], at(8, 5)),
  ...times(2, () =>
    meal("Coffee", [item("Coffee", "1 cup", 40, 2, 4, 1)], at(10, 30))
  ),
  meal("Chicken salad", [item("Chicken salad", "1 plate", 420)], at(13, 10)),
  meal(
    "Salmon, rice and greens",
    [item("Salmon", "1 fillet", 610)],
    at(19, 0),
    {
      photoUrl: PHOTO,
    }
  ),
];

const worst: Meal[] = [
  // An Open Food Facts product name, as long as they come.
  meal(
    "Tesco Finest Belgian Milk Chocolate Chunk & Salted Caramel Cookie Dough Ice Cream With Honeycomb Pieces",
    [item("Ice cream", "1 container (170 g)", 486)],
    at(21, 40),
    { meal: "snacks" }
  ),
  // Two products that differ only at the end.
  meal(
    "Müller Corner Greek Style Yogurt Strawberry",
    [item("Yogurt", "1 pot (135 g)", 152)],
    at(10, 15),
    { meal: "breakfast" }
  ),
  meal(
    "Müller Corner Greek Style Yogurt Blueberry",
    [item("Yogurt", "1 pot (135 g)", 154)],
    at(10, 16),
    { meal: "breakfast" }
  ),
  // A serving in grams, logged three times: the label pluralises units.
  ...times(3, () =>
    meal("Oats", [item("Oats", "40 g", 150)], at(7, 30), { meal: "breakfast" })
  ),
  // A fractional portion, three times: 0.1 × 3 is not 0.3 in floats.
  ...times(3, () =>
    meal(
      "Olive oil",
      [item("Olive oil", "0.1 cup", 191, 0, 0, 22)],
      at(12, 5),
      {
        meal: "lunch",
      }
    )
  ),
  // A serving with a description in brackets, twice.
  ...times(2, () =>
    meal(
      "Protein bar",
      [item("Protein bar", "1 bar (60 g)", 210)],
      at(16, 20),
      { meal: "snacks", userEditCount: 2 } as Partial<Meal>
    )
  ),
  // One long word: a compound no row has room for.
  meal(
    "Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz-Eintopf",
    [item("Eintopf", "1 bowl", 540)],
    at(13, 0),
    { meal: "lunch" }
  ),
  // Right-to-left, CJK and emoji names.
  meal("شاورما دجاج مع الثوم", [item("Shawarma", "1 wrap", 680)], at(14, 2), {
    meal: "lunch",
  }),
  meal("麻婆豆腐", [item("Mapo tofu", "1 plate", 520)], at(19, 30), {
    meal: "dinner",
  }),
  meal("🍕 Pizza night", [item("Pizza", "4 slices", 1140)], at(20, 15), {
    meal: "dinner",
  }),
  // A huge single entry: a whole day's catering tray.
  meal(
    "Catering tray",
    [item("Catering tray", "1 tray", 12480, 600, 1400, 520)],
    at(18, 0),
    {
      meal: "dinner",
    }
  ),
  // Logged many times: the same snack, twelve times in one slot.
  ...times(12, () =>
    meal("Almonds", [item("Almonds", "1 handful", 160)], at(15, 0), {
      meal: "snacks",
    })
  ),
  // An AI photo meal with a long name, and one whose photo is gone.
  meal(
    "Grilled halloumi, roasted vegetable and quinoa bowl with tahini dressing",
    [item("Bowl", "1 bowl", 720)],
    at(12, 45),
    { meal: "lunch", photoUrl: PHOTO }
  ),
  meal("Lost photo", [item("Lost", "1 plate", 300)], at(11, 0), {
    meal: "lunch",
    photoUrl: "https://example.com/meal-photos/does-not-exist.jpg",
  }),
  // A zero-calorie entry and one with no name.
  meal("Water", [item("Water", "1 glass", 0, 0, 0, 0)], at(9, 0), {
    meal: "breakfast",
  }),
  meal("", [item("", "1 serving", 250)], at(17, 30), { meal: "snacks" }),
];

const one: Meal[] = [
  meal("Apple", [item("Apple", "1 apple", 95, 0, 25, 0)], at(9, 45)),
];

export const MEALS: Record<BreakDataset, Meal[]> = { demo, worst, one };

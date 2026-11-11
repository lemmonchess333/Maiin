/**
 * The portion a logged meal was eaten at, read from and written to its
 * items' `portionSize`.
 *
 * There is no separate portion field on a meal. Every path that logs a
 * scaled amount writes the multiplier into the portion text and scales the
 * numbers beside it: the barcode result and the search sheet write
 * "1.5x 100g", the copy and quick-add sheets write "1.5 × 1 serving", a
 * multi-item scan writes "1.5x 1 cup pasta" on the one item it scaled.
 * This module is the one reader of that convention, so the diary caption
 * and the edit sheet agree on what a row says, and the one writer the edit
 * sheet uses, so a corrected portion is stored the way a logged one is.
 */
import type { Meal, MealItem } from "@/hooks/useMeals";
import { round1 } from "@/lib/foodParseHelpers";
import { buildFoodNameFromItems } from "@/lib/foodNameBuilder";

/** A multiplier written at the front of a portion: "1.5x ", "2 × ". */
const MULTIPLIER_PREFIX = /^(\d+(?:[.,]\d+)?|[.,]\d+)\s*[x×]\s+(.+)$/i;
/** A portion that is a weight in grams and nothing else: "100g", "150 g". */
const GRAMS_ONLY = /^(\d+(?:[.,]\d+)?)\s*(?:g|gr|grams?)$/i;
/** A count of something: "1 serving", "2 eggs", "1 bar (60 g)", "250 ml". */
const COUNTED = /^(\d+(?:[.,]\d+)?)\s*([A-Za-zÀ-ÿ].*)$/;
/** What a scaled portion without a stated base is a multiple of. */
const DEFAULT_BASE = "1 serving";

const readNumber = (text: string) => Number(text.replace(",", "."));

/** A number for a portion: at most two places, no trailing zeros. */
export function tidyAmount(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** What a typed amount counts: grams of a food measured by weight, or
 *  servings of anything else. */
export type AmountUnit = "grams" | "servings";

/* The step is a convenience, the typed field is what makes any amount
   reachable. Grams step by 10, not by half a serving: on a per-100g food
   that was 50 g at a time, so 30 g and 125 g, ordinary portions, could not
   be reached. */
export const AMOUNT_STEP: Record<AmountUnit, number> = {
  grams: 10,
  servings: 0.5,
};

/** A typed amount, or null while it is blank, zero or not a number.
 *  A comma reads as a decimal point ("1,5"). */
export function parseAmount(text: string): number | null {
  const raw = text.trim();
  if (raw === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The amount one step up or down from the typed one, never below a step.
 *  A blank or unreadable field steps from one step. */
export function stepAmount(
  text: string,
  unit: AmountUnit,
  direction: 1 | -1
): string {
  const step = AMOUNT_STEP[unit];
  const current = parseAmount(text) ?? step;
  return tidyAmount(Math.max(step, current + direction * step));
}

export interface PortionReading {
  /** How many of `base` the portion is. 1 when nothing is written. */
  multiplier: number;
  /** The portion the multiplier scales, as it was logged. */
  base: string;
}

/** Split a stored portion into its multiplier and the portion it scales.
 *  Nested prefixes multiply: a copy of a 1.5x entry at 2 is "2 × 1.5x 100g",
 *  three hundred grams. */
export function readPortion(portionSize: string | undefined): PortionReading {
  let base = (portionSize ?? "").trim();
  let multiplier = 1;
  for (let match = base.match(MULTIPLIER_PREFIX); match;) {
    const n = readNumber(match[1]);
    if (!Number.isFinite(n) || n <= 0) break;
    multiplier *= n;
    base = match[2].trim();
    match = base.match(MULTIPLIER_PREFIX);
  }
  return { multiplier, base };
}

/** The portion text for `multiplier` of `base`, in the stored form. */
export function writePortion(multiplier: number, base: string): string {
  const portion = base || DEFAULT_BASE;
  const rounded = Math.round(multiplier * 10000) / 10000;
  return rounded === 1 ? portion : `${rounded}x ${portion}`;
}

/** Grams in a portion that is a weight and nothing else, else null. */
export function gramsOf(base: string): number | null {
  const match = base.trim().match(GRAMS_ONLY);
  if (!match) return null;
  const grams = readNumber(match[1]);
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

/** Units that never take a plural: "120 g", not "120 gs". */
const UNPLURALISED_UNITS = new Set([
  "g",
  "kg",
  "mg",
  "ml",
  "l",
  "oz",
  "lb",
  "lbs",
  "tbsp",
  "tsp",
  "kcal",
  "cal",
  "fl",
]);

/** The plural of a unit's first word, leaving what follows it alone:
 *  "bar (60 g)" becomes "bars (60 g)", not "bar (60 g)s". */
export function pluraliseUnit(unit: string): string {
  const match = unit.match(/^([A-Za-zÀ-ÿ]+)(.*)$/);
  if (!match) return unit;
  const [, word, rest] = match;
  const lower = word.toLowerCase();
  if (UNPLURALISED_UNITS.has(lower) || /s$/i.test(word)) return unit;
  if (/(x|z|ch|sh)$/i.test(word)) return `${word}es${rest}`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies${rest}`;
  return `${word}s${rest}`;
}

/** The singular of a unit's first word, for an amount of exactly one:
 *  half of "2 eggs" is "1 egg". Only undoes what pluraliseUnit does. */
function singularUnit(unit: string): string {
  const match = unit.match(/^([A-Za-zÀ-ÿ]+)(.*)$/);
  if (!match) return unit;
  const [, word, rest] = match;
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y${rest}`;
  if (/sses$/i.test(word)) return `${word.slice(0, -2)}${rest}`;
  if (/(x|z|ch|sh)es$/i.test(word)) return `${word.slice(0, -2)}${rest}`;
  if (/[^s]s$/i.test(word) && !UNPLURALISED_UNITS.has(word.toLowerCase())) {
    return `${word.slice(0, -1)}${rest}`;
  }
  return unit;
}

/**
 * A portion as the diary says it: "150g", "1.5 servings", "2 eggs",
 * "1.5 bars (60 g)". Grams stay unspaced, the food surface's house style.
 * Null for a blank portion.
 */
export function describePortion(
  portionSize: string | undefined
): string | null {
  const { multiplier, base } = readPortion(portionSize);
  const portion = base || (multiplier !== 1 ? DEFAULT_BASE : "");
  if (!portion) return null;
  const grams = gramsOf(portion);
  if (grams !== null) return `${round1(grams * multiplier)}g`;
  if (multiplier === 1) return portion;
  const counted = portion.match(COUNTED);
  if (counted) {
    const amount = readNumber(counted[1]) * multiplier;
    if (!Number.isFinite(amount) || amount <= 0) return portion;
    const unit = counted[2];
    return `${tidyAmount(amount)} ${amount === 1 ? singularUnit(unit) : pluraliseUnit(unit)}`;
  }
  return `${tidyAmount(multiplier)} servings`;
}

/** The diary caption's portion for a meal: its one item's portion, or
 *  null when it has none or several (a multi-item entry has no one
 *  portion to name). */
export function mealPortionCaption(meal: Pick<Meal, "items">): string | null {
  const items = meal.items ?? [];
  if (items.length !== 1) return null;
  return describePortion(items[0].portionSize);
}

export interface EntryPortion {
  /** The entry's servings against what it was first logged at. */
  multiplier: number;
  /** Grams in one of those servings, when the entry is one item whose
   *  portion is a weight; the amount is then typed in grams. */
  baseGrams: number | null;
}

/** Where a meal's portion stands. Items scaled together carry the same
 *  multiplier, and that is the entry's. Items scaled one by one (a
 *  multi-item scan) share none, so the entry reads as one serving of
 *  what was logged and a change scales every item from there. */
export function entryPortion(meal: Pick<Meal, "items">): EntryPortion {
  const items = meal.items ?? [];
  const readings = items.map((item) => readPortion(item.portionSize));
  const first = readings[0];
  const shared =
    first && readings.every((r) => r.multiplier === first.multiplier)
      ? first.multiplier
      : 1;
  return {
    multiplier: shared,
    baseGrams: readings.length === 1 ? gramsOf(first.base) : null,
  };
}

/** Where one item's portion stands: its multiplier against what it was
 *  logged at, and the grams in one of those when it is a weight. */
export function itemPortion(item: Pick<MealItem, "portionSize">): {
  multiplier: number;
  baseGrams: number | null;
} {
  const { multiplier, base } = readPortion(item.portionSize);
  return { multiplier, baseGrams: gramsOf(base) };
}

/** The fields a person sets by changing an item's amount, locked against
 *  a later automatic refinement (F1d: per-item locks, each field on its
 *  own). */
export const ITEM_AMOUNT_FIELDS = [
  "portionSize",
  "calories",
  "protein",
  "carbs",
  "fat",
] as const;

/** One item at `nextMultiplier` servings of what it was logged at, its
 *  figures scaled with it and kept to one place, as `rescaleMealPortion`
 *  keeps them. The fields that moved are added to its locks. */
export function rescaleItem(item: MealItem, nextMultiplier: number): MealItem {
  if (!Number.isFinite(nextMultiplier) || nextMultiplier <= 0) {
    throw new Error("Enter an amount greater than 0.");
  }
  const { multiplier, base } = readPortion(item.portionSize);
  if (nextMultiplier === multiplier) return item;
  const ratio = nextMultiplier / multiplier;
  const scale = (n: unknown) => round1(finite(n) * ratio);
  return {
    ...item,
    portionSize: writePortion(nextMultiplier, base),
    calories: scale(item.calories),
    protein: scale(item.protein),
    carbs: scale(item.carbs),
    fat: scale(item.fat),
    ...(item.fiber !== undefined ? { fiber: scale(item.fiber) } : {}),
    ...(item.sugar !== undefined ? { sugar: scale(item.sugar) } : {}),
    ...(item.sodium !== undefined ? { sodium: scale(item.sodium) } : {}),
    userEditedFields: Array.from(
      new Set([...(item.userEditedFields ?? []), ...ITEM_AMOUNT_FIELDS])
    ),
  };
}

/**
 * A multi-item entry rebuilt from its edited items: the items that are
 * left, and totals that are their sum (F1d: the totals of an entry of
 * several foods come from its foods). Fibre, sugar and sodium are summed
 * where every item carries them; where the items do not, the entry's own
 * total moves with its calories, the only figure both sides have.
 */
export function mealFromItems(
  meal: Pick<
    Meal,
    "items" | "totalCalories" | "totalFiber" | "totalSugar" | "totalSodium"
  >,
  items: MealItem[]
): RescaledPortion {
  if (items.length === 0) {
    throw new Error("Keep at least one item, or delete the entry.");
  }
  const sum = (pick: (item: MealItem) => unknown) =>
    round1(items.reduce((s, item) => s + finite(pick(item)), 0));
  const totalCalories = sum((item) => item.calories);
  const before = (meal.items ?? []).reduce(
    (s, item) => s + finite(item.calories),
    0
  );
  const calorieShare = before > 0 ? totalCalories / before : 1;
  const micro = (
    key: "fiber" | "sugar" | "sodium",
    total: number | undefined
  ): number | undefined => {
    if (items.every((item) => item[key] !== undefined))
      return sum((item) => item[key]);
    return total === undefined ? undefined : round1(total * calorieShare);
  };
  const totalFiber = micro("fiber", meal.totalFiber);
  const totalSugar = micro("sugar", meal.totalSugar);
  const totalSodium = micro("sodium", meal.totalSodium);
  return {
    items,
    totalCalories,
    totalProtein: sum((item) => item.protein),
    totalCarbs: sum((item) => item.carbs),
    totalFat: sum((item) => item.fat),
    ...(totalFiber !== undefined ? { totalFiber } : {}),
    ...(totalSugar !== undefined ? { totalSugar } : {}),
    ...(totalSodium !== undefined ? { totalSodium } : {}),
  };
}

/**
 * The entry's name once items are removed, when the name was made from
 * its items: the typed meal's "Chicken, Rice, Oil" and the scan's
 * "Chicken, Rice +1" both name what is in it, so taking the oil out
 * takes it out of the name. A name of the person's own, or the scan's
 * product name, stays. Null when nothing changes.
 */
export function nameFromItems(
  meal: Pick<Meal, "foodName" | "items">,
  next: readonly MealItem[]
): string | null {
  const before = meal.items ?? [];
  const joined = (list: readonly MealItem[]) =>
    list.map((item) => item.name).join(", ");
  let renamed: string | null = null;
  if (meal.foodName === joined(before)) renamed = joined(next);
  else if (meal.foodName === buildFoodNameFromItems(before, meal.foodName))
    renamed = buildFoodNameFromItems(next, meal.foodName);
  return renamed && renamed !== meal.foodName ? renamed : null;
}

export interface RescaledPortion {
  items: MealItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber?: number;
  totalSugar?: number;
  totalSodium?: number;
}

const finite = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

/**
 * The meal at `nextMultiplier` servings, scaled from what it holds now.
 * Every figure is kept to one place rather than to whole numbers, as the
 * barcode path keeps them: each change scales the stored figures, so whole
 * numbers would drift with every edit (237 kcal halved and doubled again
 * would come back as 238). Every screen rounds them for display.
 */
export function rescaleMealPortion(
  meal: Meal,
  nextMultiplier: number
): RescaledPortion {
  if (!Number.isFinite(nextMultiplier) || nextMultiplier <= 0) {
    throw new Error("Enter an amount greater than 0.");
  }
  const ratio = nextMultiplier / entryPortion(meal).multiplier;
  const scale = (n: unknown) => round1(finite(n) * ratio);
  const items = (meal.items ?? []).map((item) => {
    const { multiplier, base } = readPortion(item.portionSize);
    return {
      ...item,
      portionSize: writePortion(multiplier * ratio, base),
      calories: scale(item.calories),
      protein: scale(item.protein),
      carbs: scale(item.carbs),
      fat: scale(item.fat),
      ...(item.fiber !== undefined ? { fiber: scale(item.fiber) } : {}),
      ...(item.sugar !== undefined ? { sugar: scale(item.sugar) } : {}),
      ...(item.sodium !== undefined ? { sodium: scale(item.sodium) } : {}),
    };
  });
  return {
    items,
    totalCalories: scale(meal.totalCalories),
    totalProtein: scale(meal.totalProtein),
    totalCarbs: scale(meal.totalCarbs),
    totalFat: scale(meal.totalFat),
    ...(meal.totalFiber !== undefined
      ? { totalFiber: scale(meal.totalFiber) }
      : {}),
    ...(meal.totalSugar !== undefined
      ? { totalSugar: scale(meal.totalSugar) }
      : {}),
    ...(meal.totalSodium !== undefined
      ? { totalSodium: scale(meal.totalSodium) }
      : {}),
  };
}

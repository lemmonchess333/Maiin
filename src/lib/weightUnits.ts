/**
 * Kilogram ↔ pound conversion, in one place. Body weight is STORED in kg
 * (users/{uid}.weightKg, the bodyweight log) and displayed in the user's
 * unit; the 2.20462 literal lives here and nowhere else.
 */
export const LB_PER_KG = 2.20462;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

/** A stored kg weight rendered to one decimal in the display unit. */
export function formatWeightInUnit(kg: number, unit: "kg" | "lbs"): string {
  return (unit === "lbs" ? kgToLb(kg) : kg).toFixed(1);
}

/** Stone presentation retains tenths of a pound, including carry at 14 lb. */
export function kgToStonePounds(kg: number): { stone: number; pounds: number } {
  const tenths = Math.round(kgToLb(kg) * 10);
  const stone = Math.floor(tenths / 140);
  return { stone, pounds: (tenths - stone * 140) / 10 };
}
export function stonePoundsToKg(stone: number, pounds: number): number {
  return lbToKg(stone * 14 + pounds);
}
export function formatStonePounds(kg: number): string {
  const { stone, pounds } = kgToStonePounds(kg);
  return `${stone} st ${Number(pounds.toFixed(1))} lb`;
}

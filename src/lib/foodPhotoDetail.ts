/**
 * The detail a person can add to a meal photo on its result ("cooked in
 * butter", "the bowl is 400 g"), sent with the same photo to analyzeFood
 * (Mob2, call 3). The server refuses one longer than its cap
 * (`FOOD_DETAIL_MAX_CHARS` in functions/lib/foodPhotoDetail.js); the field
 * stops at the same number, pinned by foodPhotoDetail.cross.test.ts.
 */
export const FOOD_PHOTO_DETAIL_MAX = 200;

/** The detail as it is sent: spaces tidied, or null when there is none. */
export function tidyFoodPhotoDetail(raw: string): string | null {
  const detail = raw.replace(/\s+/g, " ").trim();
  return detail ? detail.slice(0, FOOD_PHOTO_DETAIL_MAX) : null;
}

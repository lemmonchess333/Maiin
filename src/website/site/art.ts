/**
 * The app's own drawings the website's pages show: exercise guides
 * (public/form-art), food (public/food-art) and challenge medals
 * (public/medals). The Hosting build ships only the website's part of
 * `public/` (scripts/website/websiteEntry.ts), so the build copies exactly
 * these (scripts/website/prerender.ts), and a page names a drawing only
 * through this list.
 */
export const FORM_ART = {
  squat: "/form-art/squat.webp",
  benchPress: "/form-art/bench-press.webp",
  deadlift: "/form-art/deadlift.webp",
  overheadPress: "/form-art/overhead-press.webp",
  pullUps: "/form-art/pull-ups.webp",
  barbellRow: "/form-art/barbell-row.webp",
  romanianDeadlift: "/form-art/romanian-deadlift.webp",
  hipThrust: "/form-art/hip-thrust.webp",
  runEasy: "/form-art/run-easy.webp",
} as const;

export const FOOD_ART = {
  eggs: "/food-art/eggs.webp",
  bowl: "/food-art/bowl.webp",
  salad: "/food-art/salad.webp",
  fruit: "/food-art/fruit.webp",
  plate: "/food-art/plate.webp",
} as const;

export const MEDAL_ART = {
  fastest5kGold: "/medals/fastest-5k-gold.webp",
  strengthBuilderSilver: "/medals/strength-builder-silver.webp",
  mileageBronze: "/medals/monthly-mileage-bronze.webp",
} as const;

/** Every drawing above, as the build copies it from `public/`. */
export const SITE_ART_FILES: readonly string[] = [
  ...Object.values(FORM_ART),
  ...Object.values(FOOD_ART),
  ...Object.values(MEDAL_ART),
];

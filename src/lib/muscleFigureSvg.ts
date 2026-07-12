/**
 * Mini muscle-figure SVG data-URIs for the exercise picker's category
 * tiles (lift-arc picker redesign, 2026-07-12).
 *
 * Same vendored anatomy art as MiniMuscleFigure / the Form view, but
 * generated as PURE STRINGS (one per exercise CATEGORY, memoised) and
 * rendered via <img src=dataURI> — 151 picker rows share nine cached
 * images instead of mounting 151 × ~120 SVG polygons, which is the
 * only way the anatomy vocabulary is affordable in a long list.
 *
 * The map here is body-part categories (EXERCISE_CATEGORIES:
 * Chest/Back/…) → bodyModelData muscle slugs — a DIFFERENT domain from
 * MiniMuscleFigure's movementCategory taxonomy, so it's a sibling map,
 * not a drifted copy.
 */
import { ANTERIOR, POSTERIOR } from "@/lib/bodyModelData";
import { THEME } from "@/lib/theme";

const BODY = "#B6BDC3"; // react-body-highlighter's default body grey

const CATEGORY_FIGURE: Record<
  string,
  { view: "ant" | "post"; muscles: string[] }
> = {
  Chest: { view: "ant", muscles: ["chest"] },
  Back: { view: "post", muscles: ["upper-back", "lower-back", "trapezius"] },
  Shoulders: { view: "ant", muscles: ["front-deltoids"] },
  Biceps: { view: "ant", muscles: ["biceps"] },
  Triceps: { view: "post", muscles: ["triceps"] },
  Legs: {
    view: "post",
    muscles: ["gluteal", "hamstring", "calves", "quadriceps"],
  },
  Core: { view: "ant", muscles: ["abs", "obliques"] },
  "Full Body": {
    view: "ant",
    muscles: ["chest", "quadriceps", "front-deltoids", "abs"],
  },
  Cardio: { view: "ant", muscles: ["calves", "quadriceps"] },
};

const cache = new Map<string, string>();

/** Data-URI of the category's tinted figure, or null for categories
 *  without a mapping (caller renders its icon fallback). */
export function categoryFigureUri(category: string): string | null {
  const def = CATEGORY_FIGURE[category];
  if (!def) return null;
  const hit = cache.get(category);
  if (hit) return hit;

  const data = def.view === "post" ? POSTERIOR : ANTERIOR;
  const viewBox = def.view === "post" ? "4 0 92 224" : "4 0 92 206";
  const tinted = new Set(def.muscles);
  const polys = data
    .map((p) => {
      const hitPoly = tinted.has(p.muscle);
      const fill = hitPoly ? THEME.lifting : BODY;
      const opacity = hitPoly ? "0.95" : p.muscle === "head" ? "0.5" : "0.3";
      const points = (p.points as [number, number][])
        .map(([x, y]) => `${x},${y}`)
        .join(" ");
      return `<polygon points="${points}" fill="${fill}" fill-opacity="${opacity}"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${polys}</svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  cache.set(category, uri);
  return uri;
}

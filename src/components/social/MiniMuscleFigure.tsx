/**
 * MiniMuscleFigure — the app's signature muscle-map body as feed
 * imagery (Social uplift v1, 2026-07-11).
 *
 * Lift cards were text lists; runs at least had a route line. This
 * renders the SAME vendored anatomy art the Form view and the rig
 * demos use, ghosted to a silhouette with the session's trained
 * muscle groups tinted in the lifting purple — instantly readable
 * ("push day", "leg day") and imagery no other app has, because it's
 * the product's own brand figure rather than a stock photo.
 *
 * Pure static SVG: no filters, no animation (WKWebView glow rule;
 * feed cards must stay cheap in long lists).
 *
 * View selection: pull-dominant and hinge-dominant sessions read from
 * BEHIND (lats/traps/glutes live on the posterior art); everything
 * else uses the anterior figure. Categories are the movementCategory
 * taxonomy persisted on activity docs (`muscleGroups`).
 */
import { useMemo } from "react";
import { ANTERIOR, POSTERIOR } from "@/lib/bodyModelData";
import { THEME } from "@/lib/theme";

/** react-body-highlighter's default body grey — same constant the rig
 *  and Form views draw with. */
const BODY = "#B6BDC3";

const ANT_MAP: Record<string, string[]> = {
  horizontal_push: ["chest", "front-deltoids", "triceps"],
  vertical_push: ["front-deltoids", "triceps"],
  knee_dominant: ["quadriceps", "abductors", "calves"],
  arms_biceps: ["biceps", "forearm"],
  arms_triceps: ["triceps", "forearm"],
  core: ["abs", "obliques"],
};

const POST_MAP: Record<string, string[]> = {
  horizontal_pull: ["upper-back", "back-deltoids", "trapezius"],
  vertical_pull: ["upper-back", "trapezius", "back-deltoids"],
  hip_dominant: ["gluteal", "hamstring", "lower-back"],
};

/** Whether any of the given movementCategory keys map onto the figure —
 *  callers use this to decide whether to render the hero panel at all
 *  (the panel without a figure would be an empty tinted band). */
// eslint-disable-next-line react-refresh/only-export-components
export function hasMuscleFigure(categories: string[]): boolean {
  return categories.some((c) => ANT_MAP[c] || POST_MAP[c]);
}

export default function MiniMuscleFigure({
  categories,
  className,
}: {
  categories: string[];
  className?: string;
}) {
  const { data, tinted, viewBox } = useMemo(() => {
    const postHits = categories.filter((c) => POST_MAP[c]).length;
    const antHits = categories.filter((c) => ANT_MAP[c]).length;
    const usePosterior = postHits > antHits;
    const map = usePosterior ? POST_MAP : ANT_MAP;
    return {
      data: usePosterior ? POSTERIOR : ANTERIOR,
      tinted: new Set(categories.flatMap((c) => map[c] ?? [])),
      // Slight side-crop keeps the figure large in a portrait slot.
      viewBox: usePosterior ? "4 0 92 224" : "4 0 92 206",
    };
  }, [categories]);

  if (tinted.size === 0) return null;

  return (
    <svg
      viewBox={viewBox}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Muscles trained this session"
    >
      {data.map((p, i) => {
        const hit = tinted.has(p.muscle);
        return (
          <polygon
            key={i}
            points={(p.points as [number, number][])
              .map(([x, y]) => `${x},${y}`)
              .join(" ")}
            fill={hit ? THEME.lifting : BODY}
            fillOpacity={hit ? 0.92 : p.muscle === "head" ? 0.5 : 0.32}
          />
        );
      })}
    </svg>
  );
}

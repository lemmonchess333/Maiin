/**
 * RouteMapHero — a run card's route on a real street map (Soc15 call 5).
 *
 * The post names an image of its map in each theme (`routeMap`, made by
 * routeMapUpload.ts after the post exists). The card shows the one for
 * the theme on screen, in a box of the image's own 5:2 ratio, so nothing
 * is cropped and the credit drawn into its corner stays in view. The box
 * is the image's ratio rather than a height in rem: at large text the
 * numbers under it grow, and the map keeps its shape.
 *
 * The drawn route (RouteScene) holds the box until the image has loaded,
 * and the image fades in over it. The image already carries the line, so
 * the drawing is never shown on top of it. An image that fails to load
 * leaves the drawing where it is.
 */
import { useState } from "react";
import RouteScene from "./RouteScene";
import { routeMapSrc } from "./routeMapSrc";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import type { RouteCoordinate } from "@/lib/routeSegments";
import { cn } from "@/lib/utils";

function MapImage({
  preview,
  src,
}: {
  preview: RouteCoordinate[];
  src: string;
}) {
  const [state, setState] = useState<"loading" | "shown" | "failed">("loading");
  const shown = state === "shown";
  return (
    <>
      {/* The drawing until the map is in; under it, out of the
          accessibility tree, once it is. */}
      <div className="absolute inset-0" aria-hidden={shown || undefined}>
        <RouteScene preview={preview} />
      </div>
      {state !== "failed" && (
        <img
          src={src}
          alt="Run route map"
          aria-hidden={!shown || undefined}
          loading="lazy"
          decoding="async"
          draggable={false}
          data-route-map=""
          onLoad={() => setState("shown")}
          onError={() => setState("failed")}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none",
            shown ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </>
  );
}

export default function RouteMapHero({
  preview,
  routeMap,
}: {
  preview: RouteCoordinate[];
  /** The post's `routeMap`: a download URL per theme. */
  routeMap: unknown;
}) {
  const dark = useIsDarkTheme();
  const src = routeMapSrc(routeMap, dark);
  return (
    <div className="relative aspect-[5/2] w-full overflow-hidden">
      {src ? (
        // A new image (the theme flipped) starts from the drawing again.
        <MapImage key={src} preview={preview} src={src} />
      ) : (
        <div className="absolute inset-0">
          <RouteScene preview={preview} />
        </div>
      )}
    </div>
  );
}

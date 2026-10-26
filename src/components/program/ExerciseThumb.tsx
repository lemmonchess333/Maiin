import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { formArtCutoutUrl, getFormArtCutout } from "@/lib/formArtCutouts";
import { categoryFigureUri } from "@/lib/muscleFigureSvg";
import { findCatalogueExercise } from "@/lib/exercises";

const BOX = {
  sm: "size-10 rounded-lg",
  md: "size-12 rounded-xl",
  lg: "size-16 rounded-2xl",
} as const;

/**
 * An exercise's picture at list size (DS3: drawings where they help).
 *
 * The drawing, cut out of its black background (`formArtCutouts`), when
 * the exercise has released art. Otherwise the muscles its category works,
 * the exercise picker's own figure. Otherwise, for a custom exercise the
 * library does not know, a dumbbell. The tile is the raised surface, so a
 * white drawing reads on both themes.
 *
 * `exerciseId` may be a logged id or name: it is resolved to the catalogue
 * exercise first (`findCatalogueExercise`), so a session logged as "Back
 * Squat" shows the squat's drawing rather than the generic tile.
 *
 * Decorative: the exercise's name always sits beside it.
 */
export default function ExerciseThumb({
  exerciseId,
  size = "md",
  className,
}: {
  exerciseId: string;
  size?: keyof typeof BOX;
  className?: string;
}) {
  const exercise = findCatalogueExercise(exerciseId);
  const cutout = getFormArtCutout(exercise?.id ?? exerciseId);
  const figure = cutout ? null : categoryFigureUri(exercise?.category ?? "");
  return (
    <div
      aria-hidden="true"
      data-thumb={cutout ? "drawing" : figure ? "muscles" : "icon"}
      className={cn(
        BOX[size],
        "shrink-0 overflow-hidden bg-muted flex items-center justify-center",
        className
      )}
    >
      {cutout ? (
        <img
          src={formArtCutoutUrl(cutout)}
          alt=""
          draggable={false}
          decoding="async"
          loading="lazy"
          className="exercise-drawing size-full object-contain p-0.5"
        />
      ) : figure ? (
        <img src={figure} alt="" draggable={false} className="h-[88%] w-auto" />
      ) : (
        <Dumbbell className="size-5 text-lifting-strong" />
      )}
    </div>
  );
}

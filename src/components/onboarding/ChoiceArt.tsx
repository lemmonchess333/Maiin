import ExerciseThumb from "@/components/program/ExerciseThumb";
import { categoryFigureUri } from "@/lib/muscleFigureSvg";

/** What an onboarding choice shows beside its words (DS3). */
export type ChoiceArtSpec =
  /** An exercise's cut-out drawing, as Train and the finish screen show it. */
  | { kind: "exercise"; id: string }
  /** The muscles a category works, where no one exercise says it. */
  | { kind: "muscles"; category: string }
  /** A run's route, longer for a runner who runs more. */
  | { kind: "route"; distance: 1 | 2 | 3 }
  /** A level, as one to three of the brand mark's chevrons. */
  | { kind: "level"; level: 1 | 2 | 3 };

const TILE =
  "size-12 shrink-0 overflow-hidden rounded-xl bg-muted flex items-center justify-center";

/* Routes on a 24 grid, as switchbacks: a short curve for someone
   starting out, then one more turn for each step up, never crossing
   itself. A small dot where it starts, a larger one where it ends. */
const ROUTES: Record<
  1 | 2 | 3,
  { d: string; start: [number, number]; end: [number, number] }
> = {
  1: { d: "M8.5 15.5c3.5 0 6-2.5 7-6", start: [8.5, 15.5], end: [15.5, 9.5] },
  2: {
    d: "M5 17.5c4.5 0 12-.5 12-4.5s-7.5-3-9-6",
    start: [5, 17.5],
    end: [8, 7],
  },
  3: {
    d: "M4 20c5 0 14-.5 14-4.5s-12-2-12-5.5 8.5-3.5 13-5",
    start: [4, 20],
    end: [19, 5],
  },
};

function RouteGlyph({ distance }: { distance: 1 | 2 | 3 }) {
  const route = ROUTES[distance];
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={route.d} />
      <circle
        cx={route.start[0]}
        cy={route.start[1]}
        r={1.5}
        fill="currentColor"
        stroke="none"
      />
      <circle
        cx={route.end[0]}
        cy={route.end[1]}
        r={2.3}
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/* The mark's chevron, three high: the ones a level has drawn solid, the
   rest faint, so a level reads as a step on a scale of three. */
const CHEVRON_ROWS = [17.5, 12.5, 7.5] as const;

function LevelGlyph({ level }: { level: 1 | 2 | 3 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {CHEVRON_ROWS.map((y, i) => (
        <polyline
          key={y}
          points={`6.5,${y + 2.5} 12,${y - 2} 17.5,${y + 2.5}`}
          strokeOpacity={i < level ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

/**
 * The drawing beside an onboarding choice (DS3): the same 48 px tile the
 * exercise rows use, so a goal or a setup reads as a picture of the
 * training it leads to rather than a generic icon repeated down the
 * list. Decorative: the choice's words carry its name.
 *
 * The route and the level draw in `currentColor`, so they take the
 * card's own tone, coral for running and purple for lifting.
 */
export default function ChoiceArt({ art }: { art: ChoiceArtSpec }) {
  if (art.kind === "exercise") return <ExerciseThumb exerciseId={art.id} />;
  if (art.kind === "muscles") {
    const figure = categoryFigureUri(art.category);
    return (
      <div aria-hidden="true" data-choice-art="muscles" className={TILE}>
        {figure && (
          <img
            src={figure}
            alt=""
            draggable={false}
            className="h-[88%] w-auto"
          />
        )}
      </div>
    );
  }
  return (
    <div aria-hidden="true" data-choice-art={art.kind} className={TILE}>
      {art.kind === "route" ? (
        <RouteGlyph distance={art.distance} />
      ) : (
        <LevelGlyph level={art.level} />
      )}
    </div>
  );
}

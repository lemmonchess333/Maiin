import { useMemo } from "react";
import { BadgeHex } from "@/features/streaks/BadgeHex";
import {
  BADGE_ART,
  BADGE_DEFINITIONS,
  TIER_COLORS,
  type BadgeDef,
} from "@/features/streaks/badges";
import { Trophy } from "lucide-react";
import { ENAMEL_DIRECTION } from "./badgeDirections/enamel";
import { DRAWN_DIRECTION } from "./badgeDirections/drawn";
import {
  SAMPLES,
  type BadgeState,
  type Direction,
  type Sample,
} from "./badgeDirections/samples";

/*
 * DEV/TEST-ONLY badge directions lab (DS4 call 4). Not in production
 * builds; see the route gating in App.tsx (same pattern as BrandBakeoff).
 *
 * Two ways to redraw the 30 badges in Tropos's own art, drawn for six of
 * them and shown at the sizes the app shows a badge: the profile's shelf
 * (56 px), the badge grid (64 px, earned and not yet earned) and the
 * reveal after the seal breaks (120 px). The art is the SVG each badge
 * would ship as, put through BadgeHex exactly as the app puts the current
 * art through it. The capture spec films the page in both themes.
 */

const DIRECTIONS: readonly Direction[] = [ENAMEL_DIRECTION, DRAWN_DIRECTION];

const uri = (svg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

function def(sample: Sample): BadgeDef {
  const found = BADGE_DEFINITIONS.find((b) => b.id === sample.id);
  if (!found) throw new Error(`no badge ${sample.id}`);
  return found;
}

function useArt(direction: Direction) {
  return useMemo(() => {
    const art = new Map<string, string>();
    for (const s of SAMPLES) {
      for (const state of ["earned", "locked"] as BadgeState[]) {
        art.set(`${s.id}:${state}`, uri(direction.draw(s, state)));
      }
    }
    return (s: Sample, state: BadgeState) => art.get(`${s.id}:${state}`)!;
  }, [direction]);
}

/** A badge not yet earned, in its own drawn grey: no CSS filter on it,
 *  so the page shows the art as drawn. */
function LockedArt({ src, size }: { src: string; size: number }) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, display: "block" }}
    />
  );
}

function Shelf({ direction }: { direction: Direction }) {
  const art = useArt(direction);
  return (
    <ul className="grid grid-cols-4 gap-2" aria-label="Shelf, 56 px">
      {SAMPLES.slice(0, 4).map((s) => (
        <li key={s.id} className="flex flex-col items-center gap-1">
          <BadgeHex
            Icon={Trophy}
            tier={s.tier}
            earned
            size={56}
            imageSrc={art(s, "earned")}
          />
          <span className="text-xs text-muted-foreground text-center leading-tight">
            {def(s).name}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Grid({
  direction,
  state,
}: {
  direction: Direction;
  state: BadgeState;
}) {
  const art = useArt(direction);
  return (
    <div className="grid grid-cols-3 gap-2">
      {SAMPLES.map((s) => (
        <div
          key={s.id}
          className="relative p-3 rounded-xl bg-card border border-border/50 text-center flex flex-col"
        >
          <div className="flex items-center justify-center py-1 mb-2">
            {state === "earned" ? (
              <BadgeHex
                Icon={Trophy}
                tier={s.tier}
                earned
                size={64}
                imageSrc={art(s, "earned")}
              />
            ) : (
              <LockedArt src={art(s, "locked")} size={64} />
            )}
          </div>
          <p
            className={
              state === "earned"
                ? "text-xs font-semibold leading-tight flex-1 text-foreground"
                : "text-xs font-semibold leading-tight flex-1 text-muted-foreground"
            }
          >
            {def(s).name}
          </p>
          <p className="text-caption font-mono tabular-nums mt-1 text-muted-foreground">
            {state === "earned" ? "13 Nov 2026" : def(s).description}
          </p>
        </div>
      ))}
    </div>
  );
}

function Reveal({
  direction,
  sample,
}: {
  direction: Direction;
  sample: Sample;
}) {
  const art = useArt(direction);
  const tier = TIER_COLORS[sample.tier];
  const d = def(sample);
  return (
    <div
      className="w-full rounded-3xl p-6 text-center space-y-3 relative overflow-hidden"
      style={{ background: "var(--glass-bg)", border: `1.5px solid ${tier}40` }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 32%, ${tier}, transparent 70%)`,
        }}
      />
      <div className="relative flex justify-center">
        <BadgeHex
          Icon={Trophy}
          tier={sample.tier}
          earned
          size={120}
          imageSrc={art(sample, "earned")}
        />
      </div>
      <div className="relative space-y-1">
        <p className="text-xs font-semibold" style={{ color: tier }}>
          {sample.tier.charAt(0).toUpperCase() + sample.tier.slice(1)} badge
        </p>
        <p className="text-xl font-bold text-foreground">{d.name}</p>
        <p className="text-sm text-muted-foreground">{d.description}</p>
      </div>
    </div>
  );
}

function DirectionColumn({ direction }: { direction: Direction }) {
  return (
    <section
      aria-label={direction.name}
      data-direction={direction.key}
      className="min-w-0 space-y-4"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-bold">{direction.name}</h2>
        <p className="text-sm text-muted-foreground">{direction.summary}</p>
      </div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Shelf · 56 px
      </h3>
      <Shelf direction={direction} />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Grid · 64 px · earned
      </h3>
      <Grid direction={direction} state="earned" />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Grid · 64 px · not yet earned
      </h3>
      <Grid direction={direction} state="locked" />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Reveal · 120 px
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Reveal direction={direction} sample={SAMPLES[0]} />
        <Reveal direction={direction} sample={SAMPLES[3]} />
      </div>
    </section>
  );
}

/** The art the badges carry today, at the grid's size, for the before. */
function Now() {
  return (
    <section aria-label="Now" className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Now · 64 px
      </h2>
      <ul className="flex flex-wrap gap-3">
        {SAMPLES.map((s) => (
          <li key={s.id}>
            <BadgeHex
              Icon={Trophy}
              tier={s.tier}
              earned
              size={64}
              imageSrc={BADGE_ART[s.id]}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BadgeDirectionsLab() {
  return (
    <main className="max-w-5xl w-full min-w-0 mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Badge directions</h1>
        <p className="text-sm text-muted-foreground">
          Two ways to draw the badges in Tropos’s own art, for six of the 30, at
          the sizes the app shows them. Nothing on this page earns anything.
        </p>
      </div>
      <Now />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {DIRECTIONS.map((d) => (
          <DirectionColumn key={d.key} direction={d} />
        ))}
      </div>
    </main>
  );
}

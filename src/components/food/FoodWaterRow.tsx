import { useEffect, useState } from "react";
import { Droplets } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { haptic } from "@/lib/haptic";
import { useWaterLog } from "@/hooks/useWaterLog";
import {
  WATER_PRESETS,
  formatWaterVolume,
  splitWaterVolume,
  waterProgress,
  waterTargetWords,
} from "@/lib/waterUnits";

/** How long the row offers to take the last drink back, as Home's tile
 *  does. */
const UNDO_WINDOW_MS = 4000;

/**
 * Water for the day on screen, at the foot of the Food diary (Mob2, call
 * 2): the day's total and the two everyday sizes, one tap each, with Undo
 * for a few seconds after a tap. Past days take water too, so a bottle
 * forgotten yesterday can be added from yesterday's diary. Yazio, Lifesum,
 * Cal AI and MyFitnessPal put water where food is logged.
 *
 * Home keeps its glass (Home4): this is the compact form of the same
 * reading, from the same hook and the same documents. The sizes are the
 * hydration teal's, as on Home's tile: water has no Button variant of its
 * own, and its controls are teal-edged, unfilled.
 *
 * The total is said against the day's target, in the tile's words ("1.5 L
 * of 2 L", "3 L · 2 L reached"; `waterTargetWords`), with a thin teal bar
 * under it that fills as the tile's glass does (`waterProgress`), full
 * once the target is met: the row is the glass laid on its side.
 */
export default function FoodWaterRow({ date }: { date: string }) {
  const {
    ml,
    target,
    loading,
    logWater,
    drinks,
    removeDrink,
    syncStatus,
    retry,
  } = useWaterLog(date);
  /* The moment of the last add, or null; the line names the newest drink
     at render, so the line and Undo cannot name different drinks. */
  const [justLogged, setJustLogged] = useState<number | null>(null);
  const [prevDate, setPrevDate] = useState(date);
  if (prevDate !== date) {
    setPrevDate(date);
    setJustLogged(null);
  }
  useEffect(() => {
    if (justLogged === null) return;
    const id = window.setTimeout(() => setJustLogged(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(id);
  }, [justLogged]);
  const newest = drinks[0];
  const showUndo = justLogged !== null && !!newest;
  const { value, unit } = splitWaterVolume(ml);
  const against = waterTargetWords(ml, target);
  /* After the amount: "of 2 L", or "· 2 L reached" once it is met. */
  const targetWords = against ? (
    <>
      {" "}
      {against.met && <span aria-hidden="true">· </span>}
      <InlineNumerals>{against.words}</InlineNumerals>
    </>
  ) : (
    " logged"
  );

  return (
    <Card size="compact" tone="flat" className="@container space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 grow basis-[8em] items-center gap-2">
          <Droplets className="size-4 shrink-0 text-teal" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">Water</h2>
            {loading ? (
              <span
                className="block h-4 w-12 rounded bg-muted motion-safe:animate-pulse"
                role="status"
                aria-label="Loading water"
              />
            ) : showUndo && newest ? (
              <p className="text-xs text-foreground" aria-live="polite">
                <span className="font-mono tabular-nums">
                  +{formatWaterVolume(newest.ml)}
                </span>{" "}
                · <span className="font-mono tabular-nums">{value}</span> {unit}
                {targetWords}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                <span className="font-mono tabular-nums">{value}</span> {unit}
                {targetWords}
              </p>
            )}
            {/* The glass on its side: a grey track from the first paint (an
                empty day is a track at zero), teal as water is logged. The
                line above says the numbers, so the bar is not read out. */}
            <div
              data-water-bar=""
              aria-hidden="true"
              className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
              style={{ background: "hsl(var(--muted-foreground) / 0.2)" }}
            >
              <div
                className="h-full rounded-full bg-teal motion-safe:transition-[width] motion-safe:duration-300"
                style={{
                  width: `${loading ? 0 : waterProgress(ml, target) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {showUndo && newest ? (
            <Button
              variant="ghost"
              aria-label={`Undo ${formatWaterVolume(newest.ml)}`}
              className="text-teal"
              onClick={() => {
                haptic("light");
                removeDrink(newest.id);
                setJustLogged(null);
              }}
            >
              Undo
            </Button>
          ) : null}
          {WATER_PRESETS.slice(0, 2).map((preset) => (
            <Button
              key={preset.id}
              variant="ghost"
              aria-label={`Add ${formatWaterVolume(preset.ml)}`}
              disabled={loading}
              className="rounded-full border border-teal px-3 text-teal hover:bg-teal/10"
              onClick={() => {
                if (!logWater(preset.ml)) return;
                haptic();
                setJustLogged(Date.now());
              }}
            >
              {/* One span, as Home's: the Button's gap would split the
                  figure from its unit. */}
              <span>
                +
                <span className="font-mono tabular-nums">
                  {splitWaterVolume(preset.ml).value}
                </span>{" "}
                {splitWaterVolume(preset.ml).unit}
              </span>
            </Button>
          ))}
        </div>
      </div>
      {syncStatus && (
        <div role="status" className="flex flex-wrap items-center gap-2">
          <p className="text-micro text-muted-foreground">{syncStatus}</p>
          <Button variant="ghost" onClick={retry}>
            Retry sync
          </Button>
        </div>
      )}
    </Card>
  );
}

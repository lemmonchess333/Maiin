import { useEffect, useState } from "react";
import { Droplets } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { haptic } from "@/lib/haptic";
import { useWaterLog } from "@/hooks/useWaterLog";
import {
  WATER_PRESETS,
  formatWaterVolume,
  splitWaterVolume,
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
 */
export default function FoodWaterRow({ date }: { date: string }) {
  const { ml, loading, logWater, drinks, removeDrink, syncStatus, retry } =
    useWaterLog(date);
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

  return (
    <Card size="compact" className="@container space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 grow basis-[8em] items-center gap-2">
          <span className="size-8 shrink-0 rounded-lg bg-teal/10 flex items-center justify-center">
            <Droplets className="size-3.5 text-teal" aria-hidden="true" />
          </span>
          <div className="min-w-0">
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
              </p>
            ) : (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                <span className="font-mono tabular-nums">{value}</span> {unit}{" "}
                logged
              </p>
            )}
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

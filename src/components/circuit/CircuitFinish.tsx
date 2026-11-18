import { useId } from "react";
import FinishHero from "@/components/workout/FinishHero";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { Button } from "@/components/ui/Button";
import {
  CIRCUIT_EFFORTS,
  circuitFinishCaption,
  circuitMinutes,
  circuitRewardLine,
  circuitTooShortLine,
} from "@/features/circuit/circuitCopy";
import type { Circuit, CircuitEffort } from "@/features/circuit/circuitTypes";
import { formArtCutoutUrl, getFormArtCutout } from "@/lib/formArtCutouts";
import { cn } from "@/lib/utils";

/**
 * The end of a circuit (Circ1 (11), (2), (A)), on the lift finish's own
 * hero (`FinishHero`): the circuit's first move drawn as its picture, its
 * name, the minutes as the one display figure, and the rounds and moves
 * under them. A first circuit is the reward register, in lifting's colour
 * with confetti (DS4 call 3); any other is the calm summary. Then the one
 * tap for how it felt, which steers the ladder (Circ1 (7)), and Save. A
 * circuit under 7 minutes says so and saves nothing.
 */
export default function CircuitFinish({
  circuit,
  finished,
  roundsDone,
  activeSeconds,
  saves,
  reward,
  effort,
  saving,
  error,
  onRate,
  onSave,
  onClose,
}: {
  circuit: Circuit;
  finished: boolean;
  roundsDone: number;
  activeSeconds: number;
  /** Ran 7 minutes or more (Circ1 (A)). */
  saves: boolean;
  /** A first circuit, or a best where the kind has one. */
  reward: "first" | "best" | null;
  effort?: CircuitEffort;
  saving: boolean;
  error?: string;
  onRate: (effort: CircuitEffort | undefined) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const feelId = useId();
  const minutes = circuitMinutes(activeSeconds);
  const lead = circuit.moves[0];
  const cutout = lead ? getFormArtCutout(lead.exerciseId) : null;
  const tone = saves && reward ? "lifting" : null;
  return (
    <div
      className="min-h-dvh bg-background px-[16px]"
      style={{
        paddingTop: "calc(var(--safe-top) + 16px)",
        paddingBottom: "calc(var(--safe-bottom) + 24px)",
      }}
    >
      <main className="mx-auto flex max-w-lg flex-col gap-[20px]">
        <FinishHero
          kicker={finished ? "Circuit done" : "Circuit ended"}
          tone={tone}
          confetti={tone !== null}
          picture={
            cutout ? (
              <img
                src={formArtCutoutUrl(cutout)}
                alt=""
                aria-hidden="true"
                draggable={false}
                decoding="async"
                className="exercise-drawing h-full max-h-80 w-[min(70%,17rem)] object-contain"
              />
            ) : undefined
          }
          title={circuit.name}
          titleLevel={1}
          figure={{ value: String(minutes) }}
          caption={circuitFinishCaption(roundsDone, circuit.moves.length)}
          line={saves && reward ? circuitRewardLine(reward) : null}
          lineIcon={tone ? "trophy" : null}
        />

        <ul className="space-y-[6px]" aria-label="Moves">
          {circuit.moves.map((move, index) => (
            <li
              key={`${move.exerciseId}-${index}`}
              className="flex items-center gap-[10px] text-sm text-foreground"
            >
              <ExerciseThumb exerciseId={move.exerciseId} size="sm" />
              <span className="min-w-0 break-words">{move.name}</span>
            </li>
          ))}
        </ul>

        {saves ? (
          <>
            <fieldset className="space-y-[8px]">
              <legend
                id={feelId}
                className="text-sm font-semibold text-foreground"
              >
                How did it feel?
              </legend>
              <div className="flex flex-wrap gap-[8px]">
                {CIRCUIT_EFFORTS.map((choice) => {
                  const chosen = effort === choice.effort;
                  return (
                    <button
                      key={choice.effort}
                      type="button"
                      aria-pressed={chosen}
                      disabled={saving}
                      onClick={() => onRate(chosen ? undefined : choice.effort)}
                      className={cn(
                        "min-h-[44px] min-w-[88px] flex-1 rounded-xl px-[12px] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        chosen
                          ? "bg-lifting-strong text-white"
                          : "bg-card text-foreground card-shadow"
                      )}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              variant="neutral"
              size="lg"
              fullWidth
              loading={saving}
              onClick={onSave}
            >
              Save circuit
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {circuitTooShortLine(activeSeconds)}
            </p>
            <Button variant="neutral" size="lg" fullWidth onClick={onClose}>
              Close
            </Button>
          </>
        )}
      </main>
    </div>
  );
}

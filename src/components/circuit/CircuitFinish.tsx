import { useId } from "react";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { Button } from "@/components/ui/Button";
import {
  CIRCUIT_EFFORTS,
  circuitMinutes,
  circuitTooShortLine,
} from "@/features/circuit/circuitCopy";
import type { Circuit, CircuitEffort } from "@/features/circuit/circuitTypes";
import { cn } from "@/lib/utils";

/**
 * The end of a circuit (Circ1 (11), (2), (A)): a calm summary, since a
 * timed circuit has no best and a routine session gets no full screen
 * (DS4 call 3), with the rounds, the minutes and the moves; then the one
 * tap for how it felt, which steers the ladder (Circ1 (7)), and Save.
 * A circuit under 7 minutes says so and saves nothing.
 */
export default function CircuitFinish({
  circuit,
  finished,
  roundsDone,
  activeSeconds,
  saves,
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
  effort?: CircuitEffort;
  saving: boolean;
  error?: string;
  onRate: (effort: CircuitEffort | undefined) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const feelId = useId();
  const minutes = circuitMinutes(activeSeconds);
  const figures = [
    { value: roundsDone, unit: roundsDone === 1 ? "round" : "rounds" },
    { value: minutes, unit: "min" },
    {
      value: circuit.moves.length,
      unit: circuit.moves.length === 1 ? "move" : "moves",
    },
  ];
  return (
    <div
      className="min-h-dvh bg-background px-[16px]"
      style={{
        paddingTop: "calc(var(--safe-top) + 24px)",
        paddingBottom: "calc(var(--safe-bottom) + 24px)",
      }}
    >
      <main className="mx-auto flex max-w-lg flex-col gap-[20px]">
        <header className="flex items-center gap-[12px]">
          <ExerciseThumb
            exerciseId={circuit.moves[0]?.exerciseId ?? ""}
            className="size-[72px] rounded-2xl"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-lifting-strong">
              {finished ? "Circuit done" : "Circuit ended"}
            </p>
            <h1 className="break-words text-2xl font-bold text-foreground">
              {circuit.name}
            </h1>
          </div>
        </header>

        <dl className="grid grid-cols-3 gap-[8px]">
          {figures.map((figure) => (
            <div
              key={figure.unit}
              className="rounded-xl bg-card p-[12px] text-center card-shadow"
            >
              <dt className="sr-only">{figure.unit}</dt>
              <dd className="text-2xl font-bold tabular-nums text-foreground">
                {figure.value}
              </dd>
              <dd className="text-xs text-muted-foreground" aria-hidden="true">
                {figure.unit}
              </dd>
            </div>
          ))}
        </dl>

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

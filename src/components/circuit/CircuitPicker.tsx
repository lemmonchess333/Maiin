import { ChevronRight, X } from "lucide-react";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import {
  circuitKitLine,
  circuitShapeLine,
} from "@/features/circuit/circuitCopy";
import type { Circuit, CircuitKit } from "@/features/circuit/circuitTypes";

/**
 * The circuits on offer (Circ1 (14)): the person's six built-in circuits,
 * each length standard and low impact, built for their kit and injuries.
 * A row starts its circuit: the tap that starts it is also the one that
 * lets the phone speak (iOS speaks only after a tap).
 */
export default function CircuitPicker({
  circuits,
  kit,
  onChoose,
  onClose,
}: {
  /** Null while the person's circuit history is read: each circuit is
   *  offered at its rung, so none is offered before it is known. */
  circuits: readonly Circuit[] | null;
  kit: CircuitKit;
  onChoose: (circuit: Circuit) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="min-h-dvh bg-background px-[16px]"
      style={{
        paddingTop: "calc(var(--safe-top) + 8px)",
        paddingBottom: "calc(var(--safe-bottom) + 24px)",
      }}
    >
      <div className="mx-auto max-w-lg">
        <IconButton
          aria-label="Close"
          variant="ghost"
          icon={<X className="size-5" />}
          onClick={onClose}
        />
        <header className="mt-2 mb-5">
          <h1 className="text-h1 leading-tight tracking-tight font-extrabold text-foreground">
            Circuit
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Work and rest on a clock. {circuitKitLine(kit)}.
          </p>
        </header>
        {circuits === null && (
          <p className="sr-only" role="status">
            Loading your circuits
          </p>
        )}
        <ul
          className="space-y-[8px]"
          aria-label="Circuits"
          aria-busy={circuits === null}
        >
          {circuits === null &&
            Array.from({ length: 6 }, (_, i) => (
              <li
                key={i}
                aria-hidden="true"
                className="h-[72px] rounded-xl bg-card card-shadow motion-safe:animate-pulse"
              />
            ))}
          {(circuits ?? []).map((circuit) => (
            <li key={circuit.id}>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => onChoose(circuit)}
                className="min-h-[56px] justify-start gap-[12px] bg-card p-[12px] text-left font-normal card-shadow hover:bg-card"
              >
                <ExerciseThumb
                  exerciseId={circuit.moves[0]?.exerciseId ?? ""}
                  className="size-[48px] rounded-xl"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {circuit.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {circuitShapeLine(circuit)}
                  </span>
                </span>
                <ChevronRight
                  className="size-[16px] shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

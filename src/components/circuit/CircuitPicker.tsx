import { ChevronRight, X } from "lucide-react";
import ExerciseThumb from "@/components/program/ExerciseThumb";
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
  circuits: readonly Circuit[];
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
          <h1 className="text-2xl font-bold text-foreground">Circuit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Work and rest on a clock. {circuitKitLine(kit)}.
          </p>
        </header>
        <ul className="space-y-[8px]" aria-label="Circuits">
          {circuits.map((circuit) => (
            <li key={circuit.id}>
              <button
                type="button"
                onClick={() => onChoose(circuit)}
                className="flex w-full min-h-[56px] items-center gap-[12px] rounded-xl bg-card p-[12px] text-left card-shadow transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

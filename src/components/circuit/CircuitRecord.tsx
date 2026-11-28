import ExerciseThumb from "@/components/program/ExerciseThumb";
import { Card } from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import {
  CIRCUIT_SIDED_LINE,
  circuitFeltWords,
  circuitLevelWords,
} from "@/features/circuit/circuitCopy";
import type { SavedCircuit } from "@/features/circuit/savedCircuit";

/**
 * A saved circuit's moves, as its workout's page shows them (Circ1 (11)):
 * each move with its drawing, then how it ran (the interval, the level)
 * and how it felt. A circuit has no sets, so this stands where a lift's
 * exercises do.
 */
export default function CircuitRecord({ circuit }: { circuit: SavedCircuit }) {
  return (
    <section aria-labelledby="circuit-moves" className="space-y-2">
      <SectionHeading id="circuit-moves">Moves</SectionHeading>
      <Card padded={false} tone="flat" className="divide-y divide-border">
        {circuit.moves.map((move, index) => (
          <div
            key={`${move.exerciseId}-${index}`}
            className="flex items-center gap-[12px] p-[12px]"
          >
            <ExerciseThumb exerciseId={move.exerciseId} size="sm" />
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-foreground">
                {move.name}
              </p>
              {move.sided && (
                <p className="text-xs text-muted-foreground">
                  {CIRCUIT_SIDED_LINE}
                </p>
              )}
            </div>
          </div>
        ))}
      </Card>
      <p className="text-sm text-muted-foreground">
        {[
          `${circuit.workSeconds} s on, ${circuit.restSeconds} s off`,
          circuitLevelWords(circuit.level),
          circuitFeltWords(circuit.effort),
        ].join(" · ")}
      </p>
    </section>
  );
}

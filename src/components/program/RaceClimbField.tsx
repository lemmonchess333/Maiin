import type { ReactElement, ReactNode } from "react";
import type { RaceDistance } from "@/features/program/programTypes";
import { climbFieldNote, parseClimbField } from "@/lib/raceClimb";
import { elevationUnitLabel, type DistanceUnit } from "@/lib/distanceUnits";

/**
 * Run26 (2): a race's total climb, optional, in metres or feet. Trail is a
 * property of any race, so the field sits under every distance; the line
 * under it says whether the climb makes a trail plan.
 */
export default function RaceClimbField({
  id,
  distance,
  text,
  onTextChange,
  unit,
  labelClassName = "text-sm",
  wrapLabel = (label) => label,
}: {
  id: string;
  distance: RaceDistance;
  /** The field as typed. */
  text: string;
  onTextChange: (next: string) => void;
  unit: DistanceUnit;
  labelClassName?: string;
  /** Sets the label in the page's own heading (the run-plan editor's
   *  `SectionHeading`). */
  wrapLabel?: (label: ReactElement) => ReactNode;
}) {
  const climbM = parseClimbField(text, unit);
  return (
    <div className="space-y-2">
      {wrapLabel(
        <label htmlFor={id} className={labelClassName}>
          Total climb (optional)
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          aria-invalid={climbM === null}
          aria-describedby={`${id}-note`}
          className="ds-input min-h-11 w-32 text-sm font-mono tabular-nums"
        />
        <span className="text-sm text-muted-foreground">
          {elevationUnitLabel(unit)}
        </span>
      </div>
      <p
        id={`${id}-note`}
        className={
          climbM === null
            ? "text-xs text-destructive-strong text-pretty"
            : "text-xs text-muted-foreground text-pretty"
        }
      >
        {climbFieldNote({ distance, climbM, unit })}
      </p>
    </div>
  );
}

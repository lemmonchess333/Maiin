import ExerciseThumb from "@/components/program/ExerciseThumb";
import InlineNumerals from "@/components/ui/InlineNumerals";
import type { InjuryChanges } from "@/features/program/injuryChanges";

/** How many swaps the list names before it counts the rest. */
const SHOWN = 4;

/**
 * What the limitations just chosen changed in the plan (FV3): each swap,
 * the new lift with its picture, and any lift that stays because nothing
 * safe replaces it. Live, so choosing Knee shows the squat change.
 */
export default function InjuryChangesList({
  changes,
}: {
  changes: InjuryChanges;
}) {
  const { swaps, kept } = changes;
  return (
    <section
      className="rounded-2xl bg-card card-shadow p-4 space-y-3"
      aria-label="What this changes"
      aria-live="polite"
    >
      <h2 className="text-base font-semibold">What this changes</h2>
      {swaps.length === 0 && kept.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing in your plan needed changing.
        </p>
      )}
      {swaps.length > 0 && (
        <ul className="space-y-2">
          {swaps.slice(0, SHOWN).map((swap) => (
            <li
              key={`${swap.fromId}>${swap.toId}`}
              className="flex items-center gap-3"
            >
              <ExerciseThumb exerciseId={swap.toId} size="sm" />
              <span className="min-w-0 text-sm">
                <span className="text-muted-foreground">{swap.fromName}</span>{" "}
                <span aria-hidden="true">→</span>
                <span className="sr-only">becomes</span>{" "}
                <span className="font-medium">{swap.toName}</span>
              </span>
            </li>
          ))}
          {swaps.length > SHOWN && (
            <li className="text-sm text-muted-foreground pl-[3.25rem]">
              <InlineNumerals>{`and ${swaps.length - SHOWN} more`}</InlineNumerals>
            </li>
          )}
        </ul>
      )}
      {kept.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {`${kept.map((lift) => lift.name).join(", ")} ${kept.length === 1 ? "stays" : "stay"} with no safe swap. Go lighter, or replace ${kept.length === 1 ? "it" : "them"} in Train.`}
        </p>
      )}
    </section>
  );
}

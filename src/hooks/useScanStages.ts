import { useEffect, useState } from "react";

/* Scan-stage copy — flavour lines for the analysis wait, rotating on a
 * timer and HOLDING on the last (a cycle that wraps reads as the scan
 * starting over; a sequence that settles reads as progress). They
 * describe what the model genuinely does in one pass — never a fake
 * progress bar, never a number we don't have yet. Two sets because a
 * nutrition label is not a plate. */
export const SCAN_STAGES_FOOD = [
  "Reading your plate…",
  "Spotting ingredients…",
  "Sizing portions…",
  "Counting the macros…",
] as const;
export const SCAN_STAGES_LABEL = [
  "Reading the label…",
  "Finding the serving size…",
  "Counting the macros…",
] as const;
const SCAN_STAGE_MS = 1300;

/** Current stage line while `active`; resets to the first line each
 *  time a new analysis starts. Exported so the hold-on-last behaviour
 *  is unit-testable with fake timers, without driving a camera. */
export function useScanStages(
  active: boolean,
  stages: readonly string[]
): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    setIndex(0);
    const id = setInterval(
      () => setIndex((i) => Math.min(i + 1, stages.length - 1)),
      SCAN_STAGE_MS
    );
    return () => clearInterval(id);
  }, [active, stages]);
  return stages[Math.min(index, stages.length - 1)];
}

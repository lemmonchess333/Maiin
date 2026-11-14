/**
 * What the race build's leg trim does to a week, for the switch that asks
 * (`raceLegTrimCut` counts it): said as the sets it takes, not "a third",
 * which a plan with two-set leg lifts never lost. Its own module, so the
 * screens that ask (setup, Run plan) load no more than the line.
 */
export const legTrimEffect = (cut: number) =>
  `${String(cut)} fewer leg ${cut === 1 ? "set" : "sets"} a week, at the same weights`;

/**
 * Geometry for Today's Energy calorie bar.
 *
 * The track normally runs 0→target, but stretches to at most 130% of
 * target once intake passes it, so an overshoot has somewhere to go. That
 * makes the right-hand end of the track mean different things in the two
 * cases, and the 100%-of-target tick exists to say where target sits once
 * it is no longer the end.
 *
 * It was drawn unconditionally. Under target — the ordinary case, and the
 * one every user is in for most of the day — the track already ends at
 * target, so the tick was placed at `left: 100%`: a 2px sliver hanging off
 * the right edge of a rounded track, marking a boundary the track's own end
 * already marks. In the Home capture it reads as a rendering artifact, not
 * as information.
 *
 * So the tick is returned only when the track has actually stretched, and
 * it is CENTRED on its position rather than starting there — a marker whose
 * left edge sits on the value it marks is off by its own width.
 */
export interface EnergyBarGeometry {
  /** Fill width, as a percentage of the track. */
  barWidth: number;
  /** Target marker position as a percentage, or null when the track's own
   *  end already marks target. */
  tickPct: number | null;
}

/** Widest the track stretches, as a percentage of target. */
export const ENERGY_BAR_MAX_PCT = 130;

export function energyBarGeometry(caloriePct: number): EnergyBarGeometry {
  const pct = Number.isFinite(caloriePct) ? Math.max(caloriePct, 0) : 0;
  const maxPct = Math.max(100, Math.min(pct, ENERGY_BAR_MAX_PCT));
  return {
    barWidth: Math.min((pct / maxPct) * 100, 100),
    tickPct: maxPct > 100 ? (100 / maxPct) * 100 : null,
  };
}

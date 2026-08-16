import { PACE_BANDS, GAP_BAND } from "../../lib/runPaceBands";

interface PaceLegendProps {
  /**
   * Show the "No GPS" key. Only pass true when the track actually contains a
   * recording gap (`hasRecordingGap`) — a key for a colour that isn't on the
   * map sends the reader hunting for grey that isn't there, which is the same
   * failure as the un-keyed colour this legend was fixed for, mirrored.
   */
  hasGap?: boolean;
}

/**
 * Key for the pace-coloured route line.
 *
 * The swatches are GENERATED from `PACE_BANDS`, the table the map paints
 * from. They used to be three hand-written divs while the painter emitted
 * four colours, so the orange band had no key at all and read as a break in
 * the line.
 *
 * The caption is the other half of the fix. The comparison is against this
 * run's own average pace — there is no target involved — and the old middle
 * label, "On pace", asked a question the screen could not answer: on pace
 * for what?
 */
export default function PaceLegend({ hasGap = false }: PaceLegendProps) {
  const bands = hasGap ? [...PACE_BANDS, GAP_BAND] : PACE_BANDS;
  return (
    <div className="py-2">
      <div className="flex items-center justify-center gap-5">
        {bands.map((band) => (
          <div key={band.id} className="flex items-center gap-1.5">
            <div
              className="w-4 h-1.5 rounded-full"
              style={{ background: band.color }}
            />
            <span className="text-xs text-muted-foreground">{band.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        Compared with this run&rsquo;s average pace
      </p>
    </div>
  );
}

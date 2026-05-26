/**
 * PR-J Q5 chunk B3i — dedicated expand sheet for "+N more" extras.
 *
 * The cap-at-2 rule (Q5 P71) means cells / cards stay compact even
 * on days with many logged runs (Strava sync after a few days
 * offline, double-day runners, etc.). This sheet is the overflow
 * surface — the user taps "+N more" and gets a full list of every
 * unclaimed saved run for that date, sortable + scannable + tap-
 * through to RunDetail.
 *
 * Before B3i the overflow tap navigated to /history as a functional
 * fallback. /history shows ALL runs across the user's lifetime so
 * finding the specific day's extras involved scrolling. This sheet
 * scopes to the single date and renders the runs in a tight list.
 *
 * Mounted from:
 *   - RunWeekStrip (Programme run sub-tab) — "+N more" pill
 *   - DayPeekCard (Home day peek) — "+N more" row
 *
 * Both surfaces own their own local open/close state for the sheet
 * (kept colocated rather than lifted to the parent — the parent
 * doesn't need to know about overflow expansion).
 */

import { useNavigate } from "react-router-dom";
import { Footprints } from "lucide-react";
import { format } from "date-fns";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateHelpers";
import { paceLabel, durationLabel, distanceLabel } from "@/lib/runLabels";
import type { SavedRunDoc } from "@/hooks/useClaimMap";

interface ExtrasExpandSheetProps {
  open: boolean;
  onClose: () => void;
  /** Local YYYY-MM-DD of the date whose extras the sheet is showing.
   *  Used for the header label ("Extra runs · Tue 12 May"). */
  dateKey: string | null;
  /** Full list of unclaimed saved runs for `dateKey`. The caller
   *  passes everything (not capped) — this sheet IS the overflow
   *  surface. */
  extras: SavedRunDoc[];
}

export default function ExtrasExpandSheet({
  open,
  onClose,
  dateKey,
  extras,
}: ExtrasExpandSheetProps) {
  const navigate = useNavigate();

  const dateLabel = dateKey ? format(parseLocalDate(dateKey), "EEE d MMM") : "";
  const headerCount = extras.length;
  const headerCountLabel = `${headerCount} ${headerCount === 1 ? "run" : "runs"}`;

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={dateKey ? `Extra runs on ${dateLabel}` : "Extra runs"}
      hideHeader
    >
      <div className="px-5 pb-6 pt-4 space-y-3">
        {/* Drag handle (BottomSheet hides its own when hideHeader). */}
        <div className="w-9 h-1 rounded-full bg-border mx-auto" />
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Extra runs
          </p>
          <p className="text-base font-semibold text-foreground mt-0.5">
            {dateLabel}
            {headerCount > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                {" · "}
                {headerCountLabel}
              </span>
            )}
          </p>
        </div>

        {extras.length === 0 ? (
          // Defensive — caller should never open with zero extras,
          // but better to render a recognisable empty than to crash
          // the layout.
          <p className="text-sm text-muted-foreground py-4 text-center">
            No extra runs to show.
          </p>
        ) : (
          <ul className="space-y-2 list-none">
            {extras.map((extra) => (
              <li key={extra.id}>
                <ExtraRunListItem
                  extra={extra}
                  onTap={() => {
                    navigate(`/run/${extra.id}`);
                    onClose();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * Single row inside the expand sheet. More detail than the inline
 * cell pills — distance, bucket, pace + duration when present.
 * Cross-references RunSummary / RunDetail formatting helpers so the
 * numbers line up with the rest of the app.
 *
 * Aria-label combines all the data so a screen-reader user gets
 * the full picture from one announcement.
 */
function ExtraRunListItem({
  extra,
  onTap,
}: {
  extra: SavedRunDoc;
  onTap: () => void;
}) {
  const distanceText =
    typeof extra.distance === "number" && extra.distance > 0
      ? distanceLabel(extra.distance)
      : "—";
  const bucketText =
    typeof extra.type === "string" && extra.type.length > 0
      ? extra.type
      : "run";
  const paceText =
    typeof extra.avgPace === "number" && extra.avgPace > 0
      ? paceLabel(extra.avgPace)
      : null;
  const durationText =
    typeof extra.duration === "number" && extra.duration > 0
      ? durationLabel(extra.duration)
      : null;
  const detailParts = [distanceText, bucketText];
  if (paceText) detailParts.push(paceText);
  if (durationText) detailParts.push(durationText);

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Extra run: ${detailParts.join(", ")}. Tap to open.`}
      className={cn(
        "w-full text-left rounded-xl px-3 py-3",
        "bg-card border border-border/60",
        "flex items-center gap-3",
        "min-h-[44px]",
        "motion-safe:transition-colors motion-safe:active:scale-[0.98]",
        "hover:border-border"
      )}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${THEME.running}1A` }}
      >
        <Footprints className="w-4 h-4" style={{ color: THEME.running }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {distanceText}
          {" · "}
          <span className="text-muted-foreground">{bucketText}</span>
        </p>
        {(paceText || durationText) && (
          <p className="text-xs text-muted-foreground font-mono tabular-nums truncate">
            {paceText && <>{paceText}</>}
            {paceText && durationText && " · "}
            {durationText && <>{durationText}</>}
          </p>
        )}
      </div>
    </button>
  );
}

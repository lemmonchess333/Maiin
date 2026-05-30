/**
 * HybridWeekRail — the Programme Run cockpit's week-at-a-glance rail.
 *
 * Training-plan primitive (see CLAUDE.md → "Training plan primitives").
 * Replaces the run-only RunWeekStrip with a true HYBRID rail: each day
 * tile shows up to two lanes — a coral RUN lane and a purple LIFT lane —
 * so a hybrid lifter/runner can read the relationship between the two
 * disciplines across the week. A combined ("both") day is now obvious by
 * construction: both lanes render in the same tile, which retires the
 * old separate "clash" dumbbell badge.
 *
 * Compact lane labels (30m / 15K / 5×1K / Push) keep the 7-column grid
 * readable; the full session names live in the DayCommandSheet.
 *
 * The Q5 "extras" feature (logged runs that don't claim a planned slot)
 * is preserved: extras pills stack under each day, the first-extra
 * coachmark anchors to the first visible pill, and "+N more" taps through
 * to ExtrasExpandSheet — identical contract to the old RunWeekStrip.
 *
 * Palette: coral (run) + purple (lift) tints only. 44px tap target per
 * tile. Reduced-motion respected via motion-safe: prefixes.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronsRight, AlertTriangle } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DAY_LABELS } from "@/lib/scheduleUtils";
import Coachmark from "@/components/ui/Coachmark";
import ExtrasExpandSheet from "./ExtrasExpandSheet";
import type { SavedRunDoc } from "@/hooks/useClaimMap";
import type {
  HybridWeekRailItem,
  HybridRunStatus,
} from "@/lib/runProgrammeViewModel";

/** Q5 P71 cap — 2 extras visible per cell; overflow taps through. */
const EXTRAS_VISIBLE_CAP = 2;

interface HybridWeekRailProps {
  items: HybridWeekRailItem[];
  /** Unclaimed saved runs per date (Q5 extras). Keyed by YYYY-MM-DD. */
  unclaimedByDate: Map<string, SavedRunDoc[]>;
  /** Tap handler — receives the YYYY-MM-DD for the tapped day. */
  onDayTap: (dateKey: string) => void;
}

function RunStatusIcon({ status }: { status: HybridRunStatus }) {
  if (status === "done") return <Check className="size-2.5" />;
  if (status === "manual") return <Check className="size-2.5 opacity-50" />;
  if (status === "skipped") return <ChevronsRight className="size-2.5" />;
  if (status === "race_no_show") return <AlertTriangle className="size-2.5" />;
  return null;
}

function LiftStatusIcon({
  status,
}: {
  status: "planned" | "done" | "skipped";
}) {
  if (status === "done") return <Check className="size-2.5" />;
  if (status === "skipped") return <ChevronsRight className="size-2.5" />;
  return null;
}

/** a11y status word appended to a run lane's accessible name. */
function runStatusWord(status: HybridRunStatus): string {
  switch (status) {
    case "done":
      return ", completed";
    case "manual":
      return ", marked complete";
    case "skipped":
      return ", skipped";
    case "race_no_show":
      return ", race no-show";
    default:
      return "";
  }
}

function liftStatusWord(status: "planned" | "done" | "skipped"): string {
  if (status === "done") return ", completed";
  if (status === "skipped") return ", skipped";
  return "";
}

export default function HybridWeekRail({
  items,
  unclaimedByDate,
  onDayTap,
}: HybridWeekRailProps) {
  const navigate = useNavigate();
  const [extrasSheetDate, setExtrasSheetDate] = useState<string | null>(null);

  // First-extra coachmark anchor: the first visible extras pill across
  // all 7 columns (column-major). Composite key (date + saved-run id) so
  // the same pill stays anchored. Null when no extras render this week.
  const coachmarkAnchorKey = useMemo(() => {
    for (const item of items) {
      const extras = unclaimedByDate.get(item.dateKey) ?? [];
      if (extras.length > 0) {
        return `${item.dateKey}:${extras[0].id}`;
      }
    }
    return null;
  }, [items, unclaimedByDate]);

  return (
    <section className="rounded-2xl bg-card border border-border p-3 space-y-3 shadow-card">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        This week
      </h3>
      <ol className="grid grid-cols-7 gap-1.5 list-none items-start">
        {items.map((item) => {
          const ariaParts = [DAY_LABELS[item.dayIndex]];
          if (item.run) {
            ariaParts.push(
              `run ${item.run.title}${runStatusWord(item.run.status)}`
            );
          }
          if (item.lift) {
            ariaParts.push(
              `lift ${item.lift.title}${liftStatusWord(item.lift.status)}`
            );
          }
          if (!item.run && !item.lift) ariaParts.push("rest");
          if (item.isToday) ariaParts.push("today");

          const extras = unclaimedByDate.get(item.dateKey) ?? [];
          const visibleExtras = extras.slice(0, EXTRAS_VISIBLE_CAP);
          const overflowCount = Math.max(0, extras.length - EXTRAS_VISIBLE_CAP);

          const runDone =
            item.run?.status === "done" || item.run?.status === "manual";
          const liftDone = item.lift?.status === "done";

          return (
            <li key={item.dateKey} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onDayTap(item.dateKey)}
                aria-label={ariaParts.join(", ")}
                className={cn(
                  "min-h-[82px] w-full rounded-xl border px-1 py-1.5",
                  "flex flex-col items-center gap-1",
                  "motion-safe:transition-transform motion-safe:active:scale-[0.97]",
                  "hover:bg-muted/40",
                  item.isToday ? "border-foreground/30" : "border-border"
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase leading-none",
                    item.isToday ? "" : "text-muted-foreground"
                  )}
                  style={item.isToday ? { color: THEME.running } : undefined}
                >
                  {item.dayLabel}
                </span>

                <div className="flex-1 w-full flex flex-col justify-end gap-1">
                  {item.run && (
                    <span
                      className={cn(
                        "min-h-[20px] rounded-md px-1 text-[10px] font-semibold",
                        "flex items-center justify-center gap-0.5 truncate",
                        runDone || item.run.status === "skipped"
                          ? "line-through"
                          : ""
                      )}
                      style={{
                        backgroundColor: `${THEME.running}1A`,
                        color: THEME.running,
                      }}
                    >
                      <RunStatusIcon status={item.run.status} />
                      <span className="truncate">{item.run.shortLabel}</span>
                    </span>
                  )}
                  {item.lift && (
                    <span
                      className={cn(
                        "min-h-[20px] rounded-md px-1 text-[10px] font-semibold",
                        "flex items-center justify-center gap-0.5 truncate",
                        liftDone || item.lift.status === "skipped"
                          ? "line-through"
                          : ""
                      )}
                      style={{
                        backgroundColor: `${THEME.lifting}1A`,
                        color: THEME.lifting,
                      }}
                    >
                      <LiftStatusIcon status={item.lift.status} />
                      <span className="truncate">{item.lift.shortLabel}</span>
                    </span>
                  )}
                  {!item.run && !item.lift && (
                    <span className="min-h-[20px] flex items-center justify-center text-[10px] text-muted-foreground">
                      —
                    </span>
                  )}
                </div>
              </button>

              {/* Q5 extras stack — logged runs that didn't claim a slot. */}
              {visibleExtras.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {visibleExtras.map((extra) => {
                    const pill = (
                      <ExtraRunPill
                        extra={extra}
                        onTap={() => navigate(`/run/${extra.id}`)}
                      />
                    );
                    if (coachmarkAnchorKey === `${item.dateKey}:${extra.id}`) {
                      return (
                        <Coachmark
                          key={extra.id}
                          storageKey="extras-pill-v1"
                          placement="top"
                          content="Your logged runs show here · Tap to open"
                        >
                          {pill}
                        </Coachmark>
                      );
                    }
                    return <div key={extra.id}>{pill}</div>;
                  })}
                  {overflowCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setExtrasSheetDate(item.dateKey)}
                      aria-label={`${overflowCount} more extra ${overflowCount === 1 ? "run" : "runs"} for ${DAY_LABELS[item.dayIndex]} — open all`}
                      className={cn(
                        "min-h-[24px] rounded-md px-1 text-[9px] leading-tight",
                        "border border-dashed border-muted-foreground/40",
                        "text-muted-foreground/80 hover:text-foreground",
                        "motion-safe:transition-colors motion-safe:active:scale-[0.97]"
                      )}
                    >
                      +{overflowCount} more
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <ExtrasExpandSheet
        open={extrasSheetDate !== null}
        onClose={() => setExtrasSheetDate(null)}
        dateKey={extrasSheetDate}
        extras={
          extrasSheetDate ? (unclaimedByDate.get(extrasSheetDate) ?? []) : []
        }
      />
    </section>
  );
}

/**
 * Extras pill — outlined-not-filled border + smaller text + dimmed =
 * "this isn't a planned slot." Multi-channel differentiation (size +
 * border + contrast) so it survives prefers-contrast / colour-blindness.
 * Ported from RunWeekStrip's ExtraRunPill (Q5 P70).
 */
function ExtraRunPill({
  extra,
  onTap,
}: {
  extra: SavedRunDoc;
  onTap: () => void;
}) {
  const distanceKm =
    typeof extra.distance === "number" && extra.distance > 0
      ? extra.distance / 1000
      : null;
  const distanceText =
    distanceKm === null
      ? "Run"
      : Number.isInteger(distanceKm)
        ? `${distanceKm}km`
        : `${distanceKm.toFixed(1)}km`;
  const bucketText =
    typeof extra.type === "string" && extra.type.length > 0 ? extra.type : "";
  const ariaLabel = bucketText
    ? `Extra run: ${distanceText} ${bucketText}, tap to open`
    : `Extra run: ${distanceText}, tap to open`;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={ariaLabel}
      className={cn(
        "min-h-[24px] rounded-md px-1 py-0.5",
        "border text-[9px] leading-tight",
        "border-muted-foreground/40 text-muted-foreground",
        "motion-safe:transition-colors motion-safe:active:scale-[0.97]",
        "hover:text-foreground hover:border-muted-foreground/70",
        "truncate"
      )}
    >
      {distanceText}
    </button>
  );
}

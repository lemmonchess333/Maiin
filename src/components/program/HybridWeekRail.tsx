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
import SectionLabel from "@/components/ui/SectionLabel";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DAY_LABELS } from "@/lib/scheduleUtils";
import Coachmark from "@/components/ui/Coachmark";
import ExtrasExpandSheet from "./ExtrasExpandSheet";
import type { SavedRunDoc } from "@/hooks/useClaimMap";
import type {
  HybridWeekRailItem,
  HybridRunStatus,
  HybridLiftStatus,
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

/**
 * One discipline lane in a day tile (coral run or purple lift).
 *
 * Legibility rules (from production review):
 *   - 9px label + tight padding + NO inline status icon, so compact labels
 *     ("Tempo" / "Upper" / "8×400m") get the full ~40px column and don't clip.
 *   - DONE is a SOLID sport-colour pill with a white label — unmissable, not
 *     a faint strikethrough that vanishes. Status is read from the fill, not
 *     an icon that would steal label width. Manual completion ("marked", not
 *     logged) is the same solid pill at 70% opacity — distinct at a glance
 *     (Q2 P24) without consuming space.
 *   - SKIPPED is the de-emphasised state: neutral muted pill + strikethrough.
 *   - race_no_show keeps the coral alert glyph (rare, and a strong signal).
 */
function Lane({
  colour,
  label,
  status,
}: {
  colour: string;
  label: string;
  status: HybridRunStatus | HybridLiftStatus;
}) {
  const isSkipped = status === "skipped";
  const isDone = status === "done" || status === "manual";
  const isNoShow = status === "race_no_show";
  return (
    <span
      className={cn(
        "min-h-[20px] rounded-md px-0.5 text-caption font-semibold leading-none",
        "flex items-center justify-center gap-0.5",
        isSkipped && "bg-muted text-muted-foreground line-through",
        isDone && "text-white",
        // Manual completion ("marked", not logged) — a faded solid keeps it
        // distinct from a real ✅ at a glance (Q2 P24), without an icon that
        // would clip the label.
        status === "manual" && "opacity-70"
      )}
      style={
        isSkipped
          ? undefined
          : isDone
            ? { backgroundColor: colour }
            : { backgroundColor: `${colour}1A`, color: colour }
      }
    >
      {isNoShow && <AlertTriangle className="size-2 shrink-0" />}
      <span className="truncate">{label}</span>
    </span>
  );
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
    <section className="rounded-2xl bg-card border border-border p-3 space-y-3 card-shadow">
      <SectionLabel as="h3" tier="section">
        This week
      </SectionLabel>
      <ol className="grid grid-cols-7 gap-1 list-none items-start">
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

          return (
            <li key={item.dateKey} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onDayTap(item.dateKey)}
                aria-label={ariaParts.join(", ")}
                className={cn(
                  "min-h-[82px] w-full rounded-xl border px-0.5 py-1.5",
                  "flex flex-col items-center gap-1",
                  "motion-safe:transition-transform motion-safe:active:scale-[0.97]",
                  "hover:bg-muted/40",
                  !item.isToday && "border-border"
                )}
                style={item.isToday ? { borderColor: THEME.brand } : undefined}
              >
                <span
                  className={cn(
                    "text-caption font-bold uppercase leading-none",
                    item.isToday ? "" : "text-muted-foreground"
                  )}
                  style={item.isToday ? { color: THEME.brand } : undefined}
                >
                  {item.dayLabel}
                </span>

                <div className="flex-1 w-full flex flex-col justify-end gap-1">
                  {item.run && (
                    <Lane
                      colour={THEME.running}
                      label={item.run.shortLabel}
                      status={item.run.status}
                    />
                  )}
                  {item.lift && (
                    <Lane
                      colour={THEME.lifting}
                      label={item.lift.shortLabel}
                      status={item.lift.status}
                    />
                  )}
                  {!item.run && !item.lift && (
                    <span className="min-h-[20px] flex items-center justify-center text-caption text-muted-foreground">
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
                        "min-h-[24px] rounded-md px-1 text-caption leading-tight",
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
        "border text-caption leading-tight",
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

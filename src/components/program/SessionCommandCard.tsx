/**
 * SessionCommandCard — the Programme Run cockpit's "what do I do next"
 * command surface.
 *
 * Training-plan primitive (see CLAUDE.md → "Training plan primitives").
 * Replaces the old "Next · Pending" status row with a proper command
 * card: a clear title + meta, a single primary action (Start), and a
 * separate overflow that opens the DayCommandSheet. The whole card is
 * NOT the Start button — the primary action is its own control so the
 * overflow can live beside it without a nested-button violation.
 *
 * Sport-coded: running uses coral (`sport` Button variant), lifting uses
 * brand purple (`primary`). Tinted surface only — no gradients, no new
 * colours. 44px+ touch targets via the Button/IconButton primitives.
 */

import { MoreHorizontal, Play, Footprints, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

interface SessionCommandCardProps {
  /** Temporal status label — "Up next", "Due today", "Tomorrow", "Pending". */
  eyebrow: string;
  title: string;
  description?: string;
  meta: string[];
  sport: "run" | "lift";
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  onManage?: () => void;
}

export default function SessionCommandCard({
  eyebrow,
  title,
  description,
  meta,
  sport,
  primaryActionLabel,
  onPrimaryAction,
  onManage,
}: SessionCommandCardProps) {
  const isRun = sport === "run";
  const Icon = isRun ? Footprints : Dumbbell;
  // DS1b: sport tint via tokens (both branches are in-scope sport colours).
  const surfaceClass = isRun
    ? "bg-running/6 border-running/19"
    : "bg-lifting/6 border-lifting/19";
  const tileClass = isRun ? "bg-running/12" : "bg-lifting/12";
  const accentText = isRun ? "text-running" : "text-lifting";

  return (
    <section
      aria-label={`${eyebrow} — ${title}`}
      className={cn(
        "rounded-2xl border p-4 space-y-4 shadow-card",
        surfaceClass
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "size-11 rounded-2xl flex items-center justify-center shrink-0",
            tileClass
          )}
        >
          <Icon className={cn("size-5", accentText)} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              accentText
            )}
          >
            {eyebrow}
          </p>
          <h3 className="text-xl font-extrabold leading-tight text-foreground truncate">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {description}
            </p>
          )}
        </div>
        {onManage && (
          <IconButton
            aria-label="Manage session"
            variant="ghost"
            size="sm"
            icon={<MoreHorizontal />}
            onClick={onManage}
            className="-mt-1 -mr-1"
          />
        )}
      </div>

      {meta.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-hidden="true">
          {meta.map((item) => (
            <span
              key={item}
              className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      )}

      <Button
        variant={sport === "run" ? "sport" : "primary"}
        size="lg"
        fullWidth
        leftIcon={<Play className="size-4" fill="currentColor" />}
        onClick={onPrimaryAction}
      >
        {primaryActionLabel}
      </Button>
    </section>
  );
}

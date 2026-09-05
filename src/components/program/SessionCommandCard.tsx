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

import { Fragment } from "react";
import { MoreHorizontal, Play, Footprints, Dumbbell } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
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
  /** Optional primary action. Omit for terminal / non-startable sessions
   *  (e.g. a completed or skipped lift day) — the card then shows the
   *  eyebrow + title + meta with no Start button. Run always passes both. */
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onManage?: () => void;
}

/**
 * Static metadata reads as one quiet line — "5 exercises · ~43 min" — not
 * as a row of pills. A pill is the shape of a selection or a state; a
 * fact the user cannot tap should not borrow it. Numerals take the
 * numeral font (Archivo, tabular) and words stay in the text font, so a
 * mixed token like "~43 min" keeps both fonts where they belong. Wraps
 * as text; the separators are decorative and hidden from readers.
 */
function MetaLine({ items }: { items: string[] }) {
  return (
    <p className="text-sm text-muted-foreground leading-snug">
      {items.map((item, i) => (
        <Fragment key={item}>
          {i > 0 && (
            <>
              {" "}
              <span aria-hidden="true">·</span>{" "}
            </>
          )}
          <span className="whitespace-nowrap">
            {item.split(" ").map((token, j) => (
              <Fragment key={j}>
                {j > 0 && " "}
                <span
                  className={cn(/\d/.test(token) && "font-mono tabular-nums")}
                >
                  {token}
                </span>
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </p>
  );
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
  const accentText = isRun ? "text-running-strong" : "text-lifting-strong";
  // DS2: sport-hue ambient halo — the cohesion twin of the Performance /
  // Food hero halos, in the session's sport colour. A soft directional glow
  // from the icon corner layered over the flat tint for depth (functional
  // sport-state expression, not a new colour/gradient palette).
  const haloVar = isRun ? "var(--running)" : "var(--lifting)";

  return (
    <section
      aria-label={`${eyebrow} — ${title}`}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 card-shadow",
        surfaceClass
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-6 -top-6 size-40 rounded-full"
        style={{
          background: `radial-gradient(circle, hsl(${haloVar} / 0.18), transparent 70%)`,
        }}
      />
      <div className="relative space-y-4">
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
            <SectionLabel tier="section" className={accentText}>
              {eyebrow}
            </SectionLabel>
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

        {meta.length > 0 && <MetaLine items={meta} />}

        {primaryActionLabel && onPrimaryAction && (
          <Button
            variant={sport === "run" ? "sport" : "primary"}
            size="lg"
            fullWidth
            leftIcon={<Play className="size-4" fill="currentColor" />}
            onClick={onPrimaryAction}
          >
            {primaryActionLabel}
          </Button>
        )}
      </div>
    </section>
  );
}

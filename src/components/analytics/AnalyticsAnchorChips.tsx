import { useEffect, useRef, useState } from "react";
import { THEME } from "@/lib/theme";

/* Hist5b pin 1 — sticky anchor chip row with scroll-spy.
   Replaces the dropped sport-filtered tabs as the focused-review
   affordance. Renders pills for every section currently rendered
   on the Analytics scroll; tapping a pill smooth-scrolls to that
   section, and the chip row highlights whichever section is
   currently in view as the user scrolls.

   Hist5b pin 2 — the chip row is the ONLY sticky-on-scroll
   element above the Analytics content (TimeRangePills, the tab
   row, and the offline banner all stay non-sticky to avoid the
   iOS Safari position:fixed compounding drift documented in
   Layout.tsx's PWA Safeguard 2).

   Scroll-spy implementation uses IntersectionObserver (Hist5d
   Stress 15 + Stress 30 of the grill) so the active highlight
   survives inline accordion expansion / dynamic content changes
   in surrounding sections without recomputing static offsets. */

export interface AnchorChip {
  /** Stable element id assigned to the section (e.g. 'analytics-running'). */
  id: string;
  /** Visible chip label. */
  label: string;
  /** Sport-coded chip colour for the active state. */
  color: string;
}

interface AnalyticsAnchorChipsProps {
  chips: AnchorChip[];
}

export default function AnalyticsAnchorChips({ chips }: AnalyticsAnchorChipsProps) {
  const [activeId, setActiveId] = useState<string | null>(chips[0]?.id ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Watch each anchored section's intersection with the viewport.
     The chip whose section is most-visible wins the active highlight.
     Re-runs when the chip set changes (sections gain/lose visibility
     via Hist5's auto-hide rules). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (chips.length === 0) return;

    const observers: IntersectionObserver[] = [];
    const visibilityMap = new Map<string, number>();

    for (const chip of chips) {
      const el = document.getElementById(chip.id);
      if (!el) continue;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visibilityMap.set(chip.id, entry.intersectionRatio);
          }
          /* Pick the chip whose section is currently most visible.
             Tie-break on chip order so behaviour is deterministic
             when two sections are equally visible (e.g. at scroll
             boundaries). */
          let bestId = chips[0].id;
          let bestRatio = -1;
          for (const c of chips) {
            const r = visibilityMap.get(c.id) ?? 0;
            if (r > bestRatio) {
              bestRatio = r;
              bestId = c.id;
            }
          }
          if (bestRatio > 0) setActiveId(bestId);
        },
        {
          /* Anchored to a band ~30% from the top — the user reads
             the section once it's clearly entered the viewport, not
             when its first pixel appears. Matches typical scroll-spy
             tuning across reference apps. */
          rootMargin: "-20% 0px -60% 0px",
          threshold: [0, 0.5, 1],
        },
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => {
      for (const o of observers) o.disconnect();
    };
  }, [chips]);

  /* Auto-scroll the chip row so the active chip is visible —
     important on iPhone widths where the row scrolls horizontally.
     Without this, scrolling past the Lifting section on a phone
     leaves the highlighted chip offscreen. */
  useEffect(() => {
    if (!activeId || !scrollRef.current) return;
    const chipEl = scrollRef.current.querySelector<HTMLAnchorElement>(
      `a[data-chip-id="${activeId}"]`,
    );
    if (chipEl) {
      chipEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeId]);

  if (chips.length === 0) return null;

  return (
    <nav
      aria-label="Jump to section"
      className="sticky z-20 -mx-4 px-4 py-2 bg-background/80 backdrop-blur-md border-b border-border/30"
      /* Sticky offset accounts for the safe-area top + any fixed
         elements above the content. Layout.tsx renders the safe-area
         occluder at z-30 + the offline banner above; the chip row
         sits below them at z-20 so it can't compete for the safe
         area. */
      style={{ top: "var(--safe-top, 0px)" }}
    >
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {chips.map((chip) => {
          const active = chip.id === activeId;
          return (
            <a
              key={chip.id}
              href={`#${chip.id}`}
              data-chip-id={chip.id}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(chip.id);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  /* Optimistic highlight — the observer will catch up
                     once the scroll completes, but the user sees the
                     active state flip immediately on tap. */
                  setActiveId(chip.id);
                }
              }}
              className={[
                "shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-all motion-safe:active:scale-95",
                active ? "text-white" : "bg-muted text-muted-foreground",
              ].join(" ")}
              style={
                active
                  ? { backgroundColor: chip.color, boxShadow: `0 1px 6px ${chip.color}40` }
                  : undefined
              }
              aria-current={active ? "true" : undefined}
            >
              {chip.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/* Default colour palette for the sport-coded anchor chips. Consumer
   builds the chip array; exports kept here so each surface using
   the same palette stays in sync without re-deriving. */
export const ANCHOR_CHIP_COLORS = {
  running: THEME.running,
  lifting: THEME.lifting,
  nutrition: THEME.success,
  lifetime: THEME.text.muted,
} as const;

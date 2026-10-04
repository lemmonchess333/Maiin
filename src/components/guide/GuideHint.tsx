import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  arrow,
  autoUpdate,
  flip,
  FloatingArrow,
  offset,
  shift,
  useFloating,
  type Placement,
} from "@floating-ui/react";
import { Button } from "@/components/ui/Button";
import GuideMark from "@/components/guide/GuideMark";
import { screenBand } from "@/components/guide/screenBand";
import { useEducationCard } from "@/components/EducationLaneProvider";
import { useGuideHint } from "@/hooks/useGuideHint";
import { GUIDE_HINTS, type GuideHintId } from "@/lib/firstGuide";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import { cn } from "@/lib/utils";

/** How long to look for the anchor once the hint's moment has come. */
const ANCHOR_WAIT_MS = 3000;

/**
 * How far the hint keeps from each edge. On a page it keeps above the tab
 * bar, turning to the other side of its anchor rather than sit across the
 * bar; a full-screen view has covered the bar, so its hints use the whole
 * height.
 */
function edges(layer: "page" | "session", side: number) {
  if (layer === "session")
    return { top: 8, bottom: 8, left: side, right: side };
  const band = screenBand();
  return {
    top: band.top + 8,
    bottom: window.innerHeight - band.bottom + 8,
    left: side,
    right: side,
  };
}

interface GuideHintProps {
  id: GuideHintId;
  /** The page says the moment has come: the thing the hint explains is on
   *  screen, and nothing else is in front of it. */
  when: boolean;
  /** Show it even if it has been seen: a first-week row asked for it. */
  requested?: boolean;
  /** Words other than the hint's own, when the page knows better (the
   *  first set without the automatic rest timer). */
  body?: string;
  /** Full-screen views (the workout, the run screen) sit at z-50; a hint
   *  there has to sit above them. */
  layer?: "page" | "session";
  placement?: Placement;
  /** The hint has closed (Got it, a tap elsewhere, Escape). */
  onClose?: () => void;
}

/**
 * One of the first-visit guide's hints (FV1): the guide's mark, a line
 * about the thing in front of you, and Got it. It turns up once, the first
 * time a place is used, for an account that has met the guide; a
 * first-week row can ask for it again.
 *
 * It points at whatever carries `data-guide-anchor="<id>"`, found in the
 * page rather than wrapped: wrapping a control in a floating-ui reference
 * replaces its own click and key handlers (Tooltip's cloneElement), and
 * every anchor here is a working control. It doesn't dim the page, and it
 * goes through the education lane, so it never shows beside another tip.
 * Any tap outside it closes it and still reaches what was tapped: tapping
 * the circle it points at both closes it and completes the set.
 */
export default function GuideHint({
  id,
  when,
  requested = false,
  body,
  layer = "page",
  placement = "bottom",
  onClose,
}: GuideHintProps) {
  const { allowed, owed, markSeen } = useGuideHint(id);
  const [closed, setClosed] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const wants = allowed && when && (requested || owed) && !closed;
  const lane = useEducationCard({
    id: `guide:${id}`,
    priority: 35,
    eligible: wants,
  });
  const open = wants && lane.visible && !!anchor && anchor.isConnected;
  const titleId = useId();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<SVGSVGElement>(null);
  const reported = useRef(false);

  // The anchor, found once the page has drawn it with a size.
  useEffect(() => {
    if (!wants) return;
    let raf = 0;
    const started = performance.now();
    const look = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-guide-anchor="${id}"]`
      );
      const r = el?.getBoundingClientRect();
      if (el && r && r.width > 0 && r.height > 0) {
        setAnchor(el);
        return;
      }
      if (performance.now() - started < ANCHOR_WAIT_MS)
        raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);
    return () => cancelAnimationFrame(raf);
  }, [wants, id]);

  const { refs, floatingStyles, context } = useFloating({
    open,
    placement,
    elements: { reference: anchor },
    middleware: [
      offset(12),
      flip(() => ({ padding: edges(layer, 8) })),
      shift(() => ({ padding: edges(layer, 16) })),
      /* floating-ui's `arrow` reads the ref lazily during positioning, as
         Tooltip notes; the lint rule doesn't model that. */
      // eslint-disable-next-line react-hooks/refs
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const close = () => {
    setClosed(true);
    markSeen();
    onClose?.();
  };
  const closeFromPage = useEffectEvent(close);

  // Reported once, the first time it shows.
  useEffect(() => {
    if (!open || reported.current) return;
    reported.current = true;
    trackLifecycle("guide_hint_viewed", { hint: id });
  }, [open, id]);

  // A tap anywhere but the hint closes it (and still does what it does);
  // so does Escape. Leaving the page with it open counts as seen.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!bubbleRef.current?.contains(e.target as Node)) closeFromPage();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFromPage();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const seenOnLeave = useEffectEvent(() => {
    if (reported.current && !closed) markSeen();
  });
  useEffect(() => () => seenOnLeave(), []);

  if (!open || typeof document === "undefined") return null;

  const words = GUIDE_HINTS[id];
  return createPortal(
    <div
      ref={(el) => {
        bubbleRef.current = el;
        refs.setFloating(el);
      }}
      style={floatingStyles}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-guide-hint={id}
      className={cn(
        "w-[min(calc(100vw-2rem),20rem)]",
        layer === "session" ? "z-[55]" : "z-40"
      )}
    >
      {/* The bubble and its arrow fade in together. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="rounded-2xl border border-border bg-card p-4 pb-2 shadow-lg"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <GuideMark />
            <h2
              id={titleId}
              className="text-base font-bold leading-snug text-foreground"
            >
              {words.title}
            </h2>
          </div>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            {body ?? words.body}
          </p>
          <div className="mt-1 flex justify-end">
            <Button variant="ghost" className="-mr-2" onClick={() => close()}>
              Got it
            </Button>
          </div>
        </div>
        <FloatingArrow
          ref={arrowRef}
          context={context}
          width={14}
          height={7}
          strokeWidth={1}
          className="fill-card [&>path:first-of-type]:stroke-border [&>path:last-of-type]:stroke-card"
        />
      </motion.div>
    </div>,
    document.body
  );
}

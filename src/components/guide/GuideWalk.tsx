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
} from "@floating-ui/react";
import { Button } from "@/components/ui/Button";
import GuideMark from "@/components/guide/GuideMark";
import { screenBand } from "@/components/guide/screenBand";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { flightBetween, type Box, type Flight } from "@/lib/launchSplash";
import { cn } from "@/lib/utils";
import type { GuideStop } from "@/lib/firstGuide";

/** The mark's flight out of Home's header, and back. */
const FLIGHT_S = 0.5;
/** The card's and the dim's fades. */
const FADE_S = 0.2;
/** The spotlight's move between stops. */
const MOVE_S = 0.3;
/** A target that never holds still (a page still loading around it) gets
 *  its card anyway, after this long. */
const SETTLE_CAP_MS = 1500;
/** Room the card needs beside its target: its height and the arrow's gap. */
const CARD_ROOM = 200;

const box = (r: {
  left: number;
  top: number;
  width: number;
  height: number;
}): Box => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

/** The element a stop points at, when it is on the page and has a size. */
function findTarget(stop: GuideStop | undefined): HTMLElement | null {
  if (!stop) return null;
  const el = document.querySelector<HTMLElement>(
    `[data-guide-stop="${stop.target}"]`
  );
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

/**
 * Where a target can sit: below the status bar, above the tab bar. The
 * tab bar is dimmed with the rest of the page, so the card may cover it,
 * but a target behind it would show the bar through the spotlight.
 */
function targetBand(): { top: number; bottom: number } {
  const band = screenBand();
  return { top: band.top + 12, bottom: band.bottom - 8 };
}

/**
 * Scrolls the page so the target, and the card beside it, are in view
 * when they aren't already. On a tall phone the first two stops need
 * nothing; the Food card sits below the fold on every phone. No explicit
 * behaviour: the stylesheet's scroll-behavior decides, smooth unless
 * Reduce Motion is on (reducedMotionScroll.spec.ts).
 */
function bringIntoView(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const band = targetBand();
  const screenBottom = window.innerHeight - 8;
  const inBand = r.top >= band.top && r.bottom <= band.bottom;
  const fitsBelow = inBand && r.bottom + CARD_ROOM <= screenBottom;
  const fitsAbove = inBand && r.top - CARD_ROOM >= band.top;
  if (fitsBelow || fitsAbove) return;
  window.scrollBy({ top: r.top - band.top });
}

/** The header's mark, when it is on screen to fly from or back to. */
function headerMark(): Box | null {
  const el = document.querySelector("[data-brand-mark]");
  if (!el) return null;
  const b = box(el.getBoundingClientRect());
  const band = targetBand();
  return b.height > 0 && b.top >= band.top - 12 && b.top < band.bottom
    ? b
    : null;
}

export interface GuideWalkProps {
  stops: GuideStop[];
  /** Fly the mark out of Home's header at the start and back at the end:
   *  the first-visit walk and its replay. A stop opened from the
   *  first-week card starts where the person already is. */
  fromHeader?: boolean;
  /** A stop has been shown (once each). */
  onStep?: (index: number, stop: GuideStop) => void;
  /** The walk has ended: Done on the last stop, or Skip / Escape. */
  onClose: (result: { finished: boolean; index: number }) => void;
}

/**
 * The first-visit walk (FV1): the page dims around one thing at a time and
 * the guide's card says what it is for, with Skip and Next. The first-visit
 * walk starts with the Tropos mark lifting out of Home's header into the
 * card, and ends where it began: the page goes back to where it was (the
 * Food stop scrolls it on every phone) and the mark flies back into the
 * header.
 *
 * A stop whose target isn't on the page, or has no size, is passed over,
 * so a card the day doesn't show never gets a stop pointing at nothing;
 * a walk with nothing to point at ends at once. Taps outside the card do
 * nothing: the walk ends from its own buttons or Escape. Reduce Motion
 * gets fades only: no flight and no gliding spotlight. Transform and
 * opacity only, the WKWebView-safe recipe; the card's position is
 * floating-ui's transform, so only its inner surface fades (see Tooltip).
 */
export default function GuideWalk({
  stops,
  fromHeader = false,
  onStep,
  onClose,
}: GuideWalkProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const bodyId = useId();
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [spot, setSpot] = useState<Box | null>(null);
  /** This stop's target has held still: scrolled into view, with the
   *  spotlight glided to it. Until then the card is hidden, and, between
   *  stops, the spotlight glides rather than following scrolling at once. */
  const [settled, setSettled] = useState(false);
  const [closing, setClosing] = useState(false);
  /** The mark in flight, between Home's header and the card; `fade` when
   *  it has nowhere to land. */
  const [flyer, setFlyer] = useState<{
    from: Box;
    flight: Flight;
    fade?: boolean;
  } | null>(null);
  /** The card's own mark shows except while the flyer stands in for it. */
  const [markHome, setMarkHome] = useState(true);
  const [shown, setShown] = useState(false);
  /** Ended: nothing is drawn, the tap shield included, whether or not the
   *  parent has unmounted the walk yet. */
  const [over, setOver] = useState(false);
  const arrowRef = useRef<SVGSVGElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const viewed = useRef(new Set<number>());
  const ended = useRef(false);
  const opened = useRef(false);
  /** Where the page was scrolled when the walk began. */
  const startScroll = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const frame = useRef(0);
  const later = (fn: () => void, s: number) => {
    timers.current.push(window.setTimeout(fn, s * 1000));
  };

  const stop = stops[index];
  const last = index === stops.length - 1;
  const single = stops.length === 1;
  const visible = shown && settled && !closing;

  const end = (finished: boolean, at: number) => {
    if (ended.current) return;
    ended.current = true;
    document.documentElement.classList.remove("guiding");
    setOver(true);
    onClose({ finished, index: at });
  };

  const { refs, floatingStyles, isPositioned, context } = useFloating({
    open: !!target,
    placement: "bottom",
    elements: { reference: target },
    middleware: [
      offset(14),
      flip({ padding: 8 }),
      shift({ padding: 16 }),
      /* floating-ui's `arrow` reads the ref lazily during positioning, as
         Tooltip notes; the lint rule doesn't model that. */
      // eslint-disable-next-line react-hooks/refs
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: (reference, floating, update) =>
      autoUpdate(reference, floating, () => {
        update();
        setSpot(box(reference.getBoundingClientRect()));
      }),
  });

  /* This stop's target, passing over any the page isn't showing, brought
     into view. Measured in the frame after the page has laid out. Then
     the card waits for the target to hold still for as long as the
     spotlight's glide takes (a few frames for the first stop, which has
     no glide, and under Reduce Motion), so it never lands beside a
     target that is still scrolling and turns to its other side midway. */
  useEffect(() => {
    if (closing) return;
    let raf = requestAnimationFrame(() => {
      let i = index;
      let el = findTarget(stops[i]);
      while (!el && i < stops.length - 1) {
        i += 1;
        el = findTarget(stops[i]);
      }
      if (!el) {
        end(false, index);
        return;
      }
      if (i !== index) {
        setIndex(i);
        return;
      }
      if (startScroll.current === null) {
        /* A walk led from the header begins at the top of Home, where the
           mark and the first stop are: the replay arrives from Settings
           with that page's scroll, and the app keeps a page's scroll
           across a route change. Instant, before anything is drawn. */
        if (fromHeader && window.scrollY > 0)
          window.scrollTo({ top: 0, behavior: "instant" });
        startScroll.current = window.scrollY;
      }
      bringIntoView(el);
      setTarget(el);
      setSpot(box(el.getBoundingClientRect()));

      const target = el;
      const hold = reduce || !opened.current ? 50 : (MOVE_S + 0.05) * 1000;
      const began = performance.now();
      let stillSince = began;
      let lastTop = target.getBoundingClientRect().top;
      const watch = () => {
        const now = performance.now();
        const top = target.getBoundingClientRect().top;
        if (top !== lastTop) {
          lastTop = top;
          stillSince = now;
        }
        if (now - stillSince >= hold || now - began >= SETTLE_CAP_MS) {
          setSettled(true);
          return;
        }
        raf = requestAnimationFrame(watch);
      };
      raf = requestAnimationFrame(watch);
    });
    return () => cancelAnimationFrame(raf);
    // `end` reads only refs and the parent's callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stops, closing, reduce, fromHeader]);

  /* The opening, once the card first has its place: the mark flies out of
     the header into the card and the card fades in as it travels. With
     no header mark in view, or under Reduce Motion, the card fades in
     with its mark. */
  useEffect(() => {
    if (!isPositioned || !settled || opened.current) return;
    opened.current = true;
    const from = fromHeader && !reduce ? headerMark() : null;
    const slot = slotRef.current;
    const to = slot ? box(slot.getBoundingClientRect()) : null;
    if (from && to && to.height > 0) {
      document.documentElement.classList.add("guiding");
      later(() => {
        setMarkHome(false);
        setFlyer({ from, flight: flightBetween(from, to) });
      }, 0);
      later(() => setShown(true), FLIGHT_S * 0.3);
      later(() => {
        setMarkHome(true);
        setFlyer(null);
      }, FLIGHT_S + 0.05);
      return;
    }
    later(() => setShown(true), 0);
  }, [isPositioned, settled, fromHeader, reduce]);

  // Every stop is reported once, when its card is on screen.
  useEffect(() => {
    if (!visible || !stop || viewed.current.has(index)) return;
    viewed.current.add(index);
    onStep?.(index, stop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, index, stop]);

  // Focus starts on the card's main button, as a dialog's does, and stays
  // on it from stop to stop (the words change around it, and the card's
  // live region reads them out); it goes back where it was when the walk
  // ends.
  useEffect(() => {
    if (visible) primaryRef.current?.focus({ preventScroll: true });
  }, [visible]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(frame.current);
      document.documentElement.classList.remove("guiding");
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  /** Calls `fn` once the page has stopped scrolling: at `to` when a
   *  scroll there was asked for, or after a while whatever happens. */
  const whenScrolled = (to: number | null, fn: () => void) => {
    const began = performance.now();
    let last = window.scrollY;
    let still = 0;
    const look = () => {
      const y = window.scrollY;
      still = y === last ? still + 1 : 0;
      last = y;
      const arrived = to === null || Math.abs(y - to) <= 1;
      if (
        (arrived && still >= 2) ||
        performance.now() - began > SETTLE_CAP_MS
      ) {
        fn();
        return;
      }
      frame.current = requestAnimationFrame(look);
    };
    frame.current = requestAnimationFrame(look);
  };

  /* The ending: the card and the dim fade. The first-visit walk ends where
     it began: it gives back the scroll it borrowed for a stop below the
     fold, and the mark, held where the card had it, flies into the header
     once the page has stopped. The walk reports once that has run (a
     timer, as LaunchSplash does: framer's completion callbacks can fire
     as a new target starts). */
  const close = (finished: boolean) => {
    if (closing || ended.current) return;
    setClosing(true);
    const back = fromHeader ? startScroll.current : null;
    const scrollBack = back !== null && Math.abs(window.scrollY - back) > 1;
    if (scrollBack) window.scrollTo({ top: back });
    const slot = slotRef.current;
    if (!fromHeader || reduce || !markHome || !slot) {
      later(() => end(finished, index), FADE_S + 0.05);
      return;
    }
    const from = box(slot.getBoundingClientRect());
    const hold = { x: 0, y: 0, scale: 1 };
    setMarkHome(false);
    setFlyer({ from, flight: hold });
    whenScrolled(scrollBack ? back : null, () => {
      const to = headerMark();
      if (to) {
        setFlyer({ from, flight: flightBetween(from, to) });
        later(() => end(finished, index), FLIGHT_S + 0.05);
        return;
      }
      setFlyer({ from, flight: hold, fade: true });
      later(() => end(finished, index), FADE_S + 0.05);
    });
  };

  const next = () => {
    // Mid-move the card is hidden; a second Enter waits for it.
    if (!visible) return;
    if (last) {
      close(true);
      return;
    }
    setSettled(false);
    setIndex((i) => i + 1);
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(false);
      return;
    }
    if (e.key !== "Tab") return;
    // Focus stays in the card: Skip and the main button, round again.
    const order = [skipRef.current, primaryRef.current].filter(
      (b): b is HTMLButtonElement => !!b
    );
    if (order.length === 0) return;
    const at = order.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.shiftKey
      ? order[(at - 1 + order.length) % order.length]
      : order[(at + 1) % order.length];
    e.preventDefault();
    to.focus();
  });
  useEffect(() => {
    const handle = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  if (typeof document === "undefined" || !stop || over) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-guide-walk=""
    >
      {/* Taps outside the card land here and do nothing. */}
      <div className="fixed inset-0 z-40" aria-hidden="true" />
      {spot && (
        <motion.div
          aria-hidden="true"
          className="fixed z-40 rounded-2xl pointer-events-none"
          // It starts where the first stop is, and fades in there.
          initial={{ opacity: 0, ...spot }}
          animate={{
            opacity: closing ? 0 : 1,
            left: spot.left,
            top: spot.top,
            width: spot.width,
            height: spot.height,
          }}
          transition={{
            opacity: { duration: FADE_S },
            // It glides from stop to stop, and follows scrolling at once.
            default: { duration: shown && !settled && !reduce ? MOVE_S : 0 },
          }}
          style={{
            // The page around the spotlight, dimmed as a sheet dims it.
            boxShadow: "0 0 0 200vmax rgb(0 0 0 / 0.6)",
          }}
        />
      )}
      {target && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className={cn(
            "z-40 w-[min(calc(100vw-2rem),22rem)]",
            // Not tappable until it can be seen.
            !visible && "pointer-events-none"
          )}
        >
          {/* The card and its arrow fade in together once the card is in
              place, and fade out at the end. Next hides them at once: the
              words change as the card goes, and must never show in the
              last stop's place. A CSS transition rather than framer, so
              the hide lands in the same frame as the new words. */}
          <div
            style={{
              opacity: visible ? 1 : 0,
              transition:
                visible || closing ? `opacity ${FADE_S}s ease-out` : "none",
            }}
          >
            <div
              className="rounded-2xl border border-border bg-card p-4 shadow-lg"
              aria-live="polite"
            >
              <div className="flex items-center gap-2">
                <span ref={slotRef} className={markHome ? "" : "invisible"}>
                  <GuideMark />
                </span>
                <h2
                  id={titleId}
                  className="text-base font-bold leading-snug text-foreground"
                >
                  {stop.title}
                </h2>
              </div>
              <p
                id={bodyId}
                className="mt-1 text-sm leading-snug text-muted-foreground"
              >
                {stop.body}
              </p>
              <div className="mt-3 flex items-center gap-1">
                {!single && (
                  <span className="mr-auto text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">{index + 1}</span>{" "}
                    of{" "}
                    <span className="font-mono tabular-nums">
                      {stops.length}
                    </span>
                  </span>
                )}
                {!single && !last && (
                  <Button
                    ref={skipRef}
                    variant="ghost"
                    onClick={() => close(false)}
                  >
                    Skip
                  </Button>
                )}
                <Button
                  ref={primaryRef}
                  onClick={next}
                  className={single ? "ml-auto" : undefined}
                >
                  {single ? "Got it" : last ? "Done" : "Next"}
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
          </div>
        </div>
      )}
      {flyer && (
        <motion.div
          aria-hidden="true"
          className="fixed z-40 pointer-events-none"
          style={{
            left: flyer.from.left,
            top: flyer.from.top,
            width: flyer.from.width,
            height: flyer.from.height,
          }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{
            x: flyer.flight.x,
            y: flyer.flight.y,
            scale: flyer.flight.scale,
            opacity: flyer.fade ? 0 : 1,
          }}
          transition={{
            duration: FLIGHT_S,
            ease: [0.65, 0, 0.25, 1],
            opacity: { duration: FADE_S },
          }}
        >
          <GuideMark className="size-full" cutClass="stroke-background" />
        </motion.div>
      )}
    </div>,
    document.body
  );
}

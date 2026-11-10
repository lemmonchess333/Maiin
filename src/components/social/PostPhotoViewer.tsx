/**
 * A post's photos, full screen (Soc15 call 2).
 *
 * Tapping a photo on a post opens this over everything: the photo whole
 * (object-contain) on the media stage, "2 of 3" at the top, a close
 * button, and a swipe or the arrow keys between photos, as Strava's and
 * Instagram's viewers work. Escape and the device's back close it, and
 * focus goes back to the photo that opened it (useFocusTrap). Each photo
 * is named for a screen reader ("Photo 2 of 3 from Maya Chen's run").
 *
 * The photo is held, as in Apple Photos: it follows a sideways swipe with
 * its neighbour coming in beside it, a pull down closes the viewer with
 * the stage fading under it, two fingers pinch it, a zoomed photo pans,
 * and a double tap zooms in to where it landed or back out. The rules are
 * numbers in `photoGesture.ts`; this file only applies them.
 *
 * With Reduce Motion the photo still follows the finger (that is the
 * person's own movement), but nothing slides or springs on its own: a
 * turn or a close is immediate.
 */
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useBackDismiss } from "@/lib/backDismiss";
import { postPhotoAlt, type PostPhoto } from "@/lib/postPhotos";
import {
  backdropOpacity,
  closeOnRelease,
  doubleTapView,
  dragAxis,
  followX,
  followY,
  isDoubleTap,
  pinchView,
  releaseVelocity,
  settleView,
  turnOnRelease,
  type Axis,
  type Point,
  type View,
} from "@/lib/photoGesture";

/** The dark gap between two photos while one slides in, in px. */
const GAP_PX = 16;
const SPRING = { type: "spring", stiffness: 420, damping: 40 } as const;

const STAGE_BUTTON =
  "text-stage-foreground hover:bg-stage-raised focus-visible:ring-offset-stage";

type Gesture =
  | {
      kind: "one";
      origin: Point;
      axis: Axis | "pan" | null;
      startView: View;
      /** Where the strip and the pull were when the finger came down. */
      baseX: number;
      baseY: number;
      previous: { t: number; x: number; y: number } | null;
      last: { t: number; x: number; y: number };
      /** The finger left down when a pinch ended: its lift is never a tap. */
      afterPinch: boolean;
    }
  | {
      kind: "pinch";
      startView: View;
      startMid: Point;
      startDistance: number;
    };

type OneFinger = Extract<Gesture, { kind: "one" }>;

const AT_REST: View = { scale: 1, x: 0, y: 0 };

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function settle(value: MotionValue<number>, to: number, reduced: boolean) {
  if (reduced) value.set(to);
  else animate(value, to, SPRING);
}

export default function PostPhotoViewer({
  photos,
  startIndex,
  authorName,
  kind,
  onClose,
}: {
  photos: PostPhoto[];
  startIndex: number;
  authorName: string;
  kind: "run" | "workout";
  onClose: () => void;
}) {
  const count = photos.length;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), count - 1)
  );
  const [zoomed, setZoomed] = useState(false);
  const reduced = useReducedMotion();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const stageRef = useRef<HTMLDivElement>(null);

  // The strip of photos (sideways), the pull (down), and the open
  // photo's zoom. Motion values, so a finger moves them without a render.
  const stripX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const zoomScale = useMotionValue(1);
  const zoomX = useMotionValue(0);
  const zoomY = useMotionValue(0);
  const stageSize = useRef({ width: 0, height: 0 });
  const backdrop = useTransform(pullY, (y) =>
    backdropOpacity(y, stageSize.current.height || window.innerHeight)
  );
  const pullScale = useTransform(pullY, (y) =>
    y > 0
      ? 1 - Math.min(0.15, (y / (stageSize.current.height || 800)) * 0.3)
      : 1
  );

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ time: number; point: Point } | null>(null);
  /** Where the strip starts after the photo changes, so it slides home. */
  const enterFrom = useRef<{ offset: number; velocity: number } | null>(null);
  const closing = useRef(false);
  /** The view the open photo is at, or settling to: what a tap decides on. */
  const rest = useRef<View>(AT_REST);

  useBackDismiss(true, onClose);

  const measure = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    stageSize.current = {
      width: rect?.width || window.innerWidth,
      height: rect?.height || window.innerHeight,
    };
    return {
      size: stageSize.current,
      centre: {
        x: (rect?.left ?? 0) + stageSize.current.width / 2,
        y: (rect?.top ?? 0) + stageSize.current.height / 2,
      },
    };
  };
  const view = (): View => ({
    scale: zoomScale.get(),
    x: zoomX.get(),
    y: zoomY.get(),
  });
  const showView = (next: View, animated: boolean) => {
    const values: [MotionValue<number>, number][] = [
      [zoomScale, next.scale],
      [zoomX, next.x],
      [zoomY, next.y],
    ];
    for (const [value, to] of values) {
      if (animated) settle(value, to, reduced);
      else value.set(to);
    }
  };
  const toRest = (next: View) => {
    rest.current = next;
    showView(next, true);
    setZoomed(next.scale > 1);
  };

  /** Turn to the photo `step` away; `fromOffset` is where the strip sits. */
  const go = (step: -1 | 1, fromOffset = 0, velocity = 0) => {
    const next = index + step;
    if (next < 0 || next >= count) return;
    const width = stageSize.current.width || measure().size.width;
    enterFrom.current = reduced
      ? null
      : { offset: fromOffset + step * (width + GAP_PX), velocity };
    rest.current = AT_REST;
    setIndex(next);
    setZoomed(false);
  };

  // The new photo is drawn at rest; the strip starts where the old one
  // was and slides home, so a swipe hands over without a jump.
  useLayoutEffect(() => {
    zoomScale.set(1);
    zoomX.set(0);
    zoomY.set(0);
    const from = enterFrom.current;
    enterFrom.current = null;
    if (!from) {
      stripX.set(0);
      return;
    }
    stripX.set(from.offset);
    animate(stripX, 0, { ...SPRING, velocity: from.velocity * 1000 });
  }, [index, stripX, zoomScale, zoomX, zoomY]);

  const close = (velocity = 0) => {
    if (closing.current) return;
    closing.current = true;
    if (reduced) {
      onClose();
      return;
    }
    const height = stageSize.current.height || window.innerHeight;
    animate(pullY, height, {
      duration: 0.2,
      ease: "easeOut",
      velocity: velocity * 1000,
    }).then(onClose);
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Nothing behind it scrolls while it is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      kind: "pinch",
      startView: view(),
      startMid: midpoint(a, b),
      startDistance: Math.hypot(a.x - b.x, a.y - b.y),
    };
    // A swipe or a pull under way gives way to the pinch.
    settle(stripX, 0, reduced);
    settle(pullY, 0, reduced);
  };
  const startOne = (
    point: Point,
    axis: OneFinger["axis"],
    afterPinch = false
  ) => {
    const t = performance.now();
    gesture.current = {
      kind: "one",
      origin: point,
      axis,
      startView: view(),
      baseX: stripX.get(),
      baseY: pullY.get(),
      previous: null,
      last: { t, ...point },
      afterPinch,
    };
  };

  /** Apply where the one finger is now. */
  const follow = (g: OneFinger, point: Point) => {
    const t = performance.now();
    g.previous = g.last;
    g.last = { t, ...point };
    const dx = point.x - g.origin.x;
    const dy = point.y - g.origin.y;
    if (g.axis === null) g.axis = dragAxis(dx, dy);
    if (g.axis === "pan") {
      showView(
        {
          scale: g.startView.scale,
          x: g.startView.x + dx,
          y: g.startView.y + dy,
        },
        false
      );
    } else if (g.axis === "x") {
      stripX.set(g.baseX + followX(dx, index, count));
    } else if (g.axis === "y") {
      pullY.set(g.baseY + followY(dy));
    }
  };

  const release = (g: OneFinger, point: Point) => {
    const { size, centre } = measure();
    const dx = point.x - g.origin.x;
    const now = performance.now();
    if (g.axis === "pan") {
      toRest(settleView(view(), size));
      // The last finger of a pinch lifting is the pinch ending, not a tap.
      if (g.afterPinch) return;
      // A zoomed photo still takes a tap: a pan that never moved is one.
      if (dragAxis(dx, point.y - g.origin.y) !== null) return;
    }
    if (g.axis === "x") {
      const v = releaseVelocity(
        g.previous && { t: g.previous.t, v: g.previous.x },
        { t: g.last.t, v: g.last.x },
        now
      );
      const turn = turnOnRelease(dx, v, size.width, index, count);
      if (turn) go(turn, stripX.get(), v);
      else settle(stripX, 0, reduced);
      return;
    }
    if (g.axis === "y") {
      const v = releaseVelocity(
        g.previous && { t: g.previous.t, v: g.previous.y },
        { t: g.last.t, v: g.last.y },
        now
      );
      if (closeOnRelease(pullY.get(), v, size.height)) close(v);
      else settle(pullY, 0, reduced);
      return;
    }
    // A tap: two close together zoom in to where they landed, or out.
    if (isDoubleTap(lastTap.current, now, point)) {
      lastTap.current = null;
      toRest(doubleTapView(rest.current, point, centre, size));
    } else {
      lastTap.current = { time: now, point };
    }
  };

  const photo = photos[index];
  if (!photo) return null;
  const name = authorName.trim();
  const title = name
    ? `Photos from ${name}'s ${kind}`
    : `Photos from this ${kind}`;
  const slides = [index - 1, index, index + 1].filter(
    (i) => i >= 0 && i < count
  );

  return createPortal(
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex flex-col text-stage-foreground pt-[var(--safe-top)] pb-[var(--safe-bottom)]"
      // A portal's touches still bubble through React to the page that
      // opened it, whose swipe changes tab. The viewer's gestures are its own.
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* The stage, on its own layer so a pull can fade it. */}
      <motion.div
        aria-hidden="true"
        data-photo-backdrop
        className="absolute inset-0 bg-stage"
        style={{ opacity: backdrop }}
      />
      <motion.div
        className="relative flex shrink-0 items-center gap-2 px-2 py-1"
        style={{ opacity: backdrop }}
      >
        <IconButton
          onClick={onClose}
          aria-label="Close photos"
          icon={<X />}
          className={STAGE_BUTTON}
        />
        <p
          aria-live="polite"
          className="flex-1 text-center text-sm font-medium font-mono tabular-nums"
        >
          {index + 1} of {count}
        </p>
        {/* Balances the close button, so the count sits in the middle. */}
        <span aria-hidden="true" className="size-11 shrink-0" />
      </motion.div>

      <div
        ref={stageRef}
        data-zoomed={zoomed ? "true" : "false"}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onPointerDown={(e) => {
          if ((e.target as Element).closest?.("button")) return;
          if (closing.current) return;
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            // A pointer the browser no longer tracks; the gesture still runs.
          }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          measure();
          // A finger takes hold of the photo where it is, mid-spring or not.
          for (const value of [stripX, pullY, zoomScale, zoomX, zoomY])
            value.stop();
          if (pointers.current.size === 2) startPinch();
          else if (pointers.current.size === 1)
            startOne(
              { x: e.clientX, y: e.clientY },
              rest.current.scale > 1.01 ? "pan" : null
            );
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          const point = { x: e.clientX, y: e.clientY };
          pointers.current.set(e.pointerId, point);
          const g = gesture.current;
          if (!g) return;
          if (g.kind === "pinch") {
            const [a, b] = [...pointers.current.values()];
            if (!b) return;
            showView(
              pinchView(
                g.startView,
                g.startMid,
                g.startDistance,
                midpoint(a, b),
                Math.hypot(a.x - b.x, a.y - b.y),
                measure().centre
              ),
              false
            );
          } else {
            follow(g, point);
          }
        }}
        onPointerUp={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          const point = { x: e.clientX, y: e.clientY };
          pointers.current.delete(e.pointerId);
          const g = gesture.current;
          if (!g) return;
          if (g.kind === "pinch") {
            const remaining = [...pointers.current.values()][0];
            if (remaining) {
              // One finger stays down: it carries on panning.
              startOne(remaining, "pan", true);
              return;
            }
            gesture.current = null;
            toRest(settleView(view(), measure().size));
            return;
          }
          if (pointers.current.size > 0) return;
          gesture.current = null;
          // A lift away from the last move is one more sample; a lift on
          // the same spot is not, or it would read as the finger stopping.
          if (point.x !== g.last.x || point.y !== g.last.y) follow(g, point);
          release(g, point);
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size > 0) return;
          gesture.current = null;
          settle(stripX, 0, reduced);
          settle(pullY, 0, reduced);
          toRest(settleView(view(), measure().size));
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ x: stripX, y: pullY, scale: pullScale }}
        >
          {slides.map((i) => {
            const offset = i - index;
            const open = offset === 0;
            const shown = photos[i];
            return (
              <div
                key={shown.id}
                aria-hidden={open ? undefined : "true"}
                className="absolute inset-0 flex items-center justify-center"
                style={
                  open
                    ? undefined
                    : {
                        transform: `translateX(calc(${offset * 100}% + ${offset * GAP_PX}px))`,
                      }
                }
              >
                <motion.img
                  src={shown.url}
                  alt={postPhotoAlt(i, count, authorName, kind)}
                  width={shown.w}
                  height={shown.h}
                  decoding="async"
                  draggable={false}
                  style={
                    open ? { x: zoomX, y: zoomY, scale: zoomScale } : undefined
                  }
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            );
          })}
        </motion.div>
        {count > 1 && (
          // The arrows fade with the stage on a pull, like the count.
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{ opacity: backdrop }}
          >
            {/* aria-disabled at the ends rather than disabled: a button
                that turns disabled under the finger or the keyboard
                drops focus to the page behind. */}
            <IconButton
              onClick={() => go(-1)}
              aria-disabled={index === 0}
              aria-label="Previous photo"
              icon={<ChevronLeft />}
              className={`pointer-events-auto absolute left-2 top-1/2 -translate-y-1/2 bg-stage/60 aria-disabled:opacity-40 ${STAGE_BUTTON}`}
            />
            <IconButton
              onClick={() => go(1)}
              aria-disabled={index === count - 1}
              aria-label="Next photo"
              icon={<ChevronRight />}
              className={`pointer-events-auto absolute right-2 top-1/2 -translate-y-1/2 bg-stage/60 aria-disabled:opacity-40 ${STAGE_BUTTON}`}
            />
          </motion.div>
        )}
      </div>
    </div>,
    document.body
  );
}

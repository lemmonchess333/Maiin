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
 * A photo slides in from the side it came from; with Reduce Motion it
 * only fades, and framer's MotionConfig (reducedMotion="user") holds the
 * same.
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useBackDismiss } from "@/lib/backDismiss";
import { postPhotoAlt, type PostPhoto } from "@/lib/postPhotos";

/** How far a finger has to travel, in px, for a swipe to turn the photo. */
const SWIPE_PX = 50;

const STAGE_BUTTON =
  "text-stage-foreground hover:bg-stage-raised focus-visible:ring-offset-stage";

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
  const [state, setState] = useState(() => ({
    index: Math.min(Math.max(0, startIndex), count - 1),
    direction: 0,
  }));
  const { index, direction } = state;
  const reduced = useReducedMotion();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useBackDismiss(true, onClose);

  const go = (step: -1 | 1) =>
    setState((s) => {
      const next = s.index + step;
      if (next < 0 || next >= count) return s;
      return { index: next, direction: step };
    });

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

  const photo = photos[index];
  if (!photo) return null;
  const name = authorName.trim();
  const title = name
    ? `Photos from ${name}'s ${kind}`
    : `Photos from this ${kind}`;

  return createPortal(
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex flex-col bg-stage text-stage-foreground pt-[var(--safe-top)] pb-[var(--safe-bottom)]"
    >
      <div className="flex shrink-0 items-center gap-2 px-2 py-1">
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
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center select-none"
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
          go(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        <motion.img
          key={photo.id}
          src={photo.url}
          alt={postPhotoAlt(index, count, authorName, kind)}
          width={photo.w}
          height={photo.h}
          decoding="async"
          draggable={false}
          initial={{ opacity: 0, x: reduced ? 0 : direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduced ? 0.12 : 0.2, ease: "easeOut" }}
          className="max-h-full max-w-full object-contain"
        />
        {count > 1 && (
          <>
            {/* aria-disabled at the ends rather than disabled: a button
                that turns disabled under the finger or the keyboard
                drops focus to the page behind. */}
            <IconButton
              onClick={() => go(-1)}
              aria-disabled={index === 0}
              aria-label="Previous photo"
              icon={<ChevronLeft />}
              className={`absolute left-2 top-1/2 -translate-y-1/2 bg-stage/60 aria-disabled:opacity-40 ${STAGE_BUTTON}`}
            />
            <IconButton
              onClick={() => go(1)}
              aria-disabled={index === count - 1}
              aria-label="Next photo"
              icon={<ChevronRight />}
              className={`absolute right-2 top-1/2 -translate-y-1/2 bg-stage/60 aria-disabled:opacity-40 ${STAGE_BUTTON}`}
            />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

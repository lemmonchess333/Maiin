import { useState, useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

interface Props {
  id: string;
  /** Human name of the exercise — names BOTH the reorder handle and the
   *  swipe-delete action for assistive tech. Required even when
   *  showHandle={false} because it still names the delete action. */
  label: string;
  children: React.ReactNode;
  justDropped?: boolean;
  onDelete?: () => void;
  showHandle?: boolean;
}

export default function SortableExerciseRow({
  id,
  label,
  children,
  justDropped,
  onDelete,
  showHandle = true,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  /* The red Delete panel exists only while the row is off its resting
     place. At rest the row covers it exactly, but a rounded corner is
     antialiased, and the red showed through as a hairline down the right
     edge of every row (the Food log had the same edge, #2469). It hides
     again once the row has slid all the way home. */
  const [panelShown, setPanelShown] = useState(false);
  // The offset the row is heading to, read synchronously by the handlers.
  const offsetRef = useRef(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const directionLocked = useRef<"horizontal" | "vertical" | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startRef.current = { x: touch.clientX, y: touch.clientY };
    directionLocked.current = null;
    setSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startRef.current.x;
    const deltaY = touch.clientY - startRef.current.y;

    if (!directionLocked.current) {
      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return;
      directionLocked.current =
        Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (directionLocked.current !== "horizontal") return;

    setSwiping(true);
    setPanelShown(true);
    const clamped = Math.max(-80, Math.min(0, deltaX));
    offsetRef.current = clamped;
    setOffsetX(clamped);
  }, []);

  const handleTouchEnd = useCallback(() => {
    startRef.current = null;
    directionLocked.current = null;
    setSwiping(false);
    const next = offsetRef.current < -45 ? -80 : 0;
    // A row already home does not animate, so no transition will end to
    // hide the panel: hide it now.
    if (next === 0 && offsetRef.current === 0) setPanelShown(false);
    offsetRef.current = next;
    setOffsetX(next);
  }, []);

  const handleCardClick = useCallback(() => {
    if (offsetX < 0) {
      offsetRef.current = 0;
      setOffsetX(0);
    }
  }, [offsetX]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative overflow-hidden transition-colors",
        isDragging && "scale-[1.02] shadow-lg opacity-90",
        justDropped && "bg-success/10"
      )}
    >
      {/* Delete panel behind the card */}
      {onDelete && panelShown && (
        <button
          type="button"
          onClick={() => {
            haptic("light");
            onDelete();
          }}
          className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center bg-destructive"
          style={{ borderRadius: 10 }}
          aria-label={`Delete ${label}`}
        >
          <Trash2 className="size-5 text-white" />
        </button>
      )}

      {/* Swipeable card content */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="relative flex items-center bg-card"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 0.2s ease-out",
          borderRadius: 10,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && offsetX === 0 && !swiping)
            setPanelShown(false);
        }}
      >
        {/* Drag handle — only shown when showHandle is true */}
        {showHandle && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            // Capture phase: a plain onPointerDown placed after {...listeners}
            // overwrites dnd-kit's activation listener and breaks dragging.
            onPointerDownCapture={() => haptic("light")}
            aria-label={`Reorder ${label}`}
            className="size-11 touch-none shrink-0 cursor-grab active:cursor-grabbing flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div
              aria-hidden="true"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 3px)",
                gap: 3,
              }}
            >
              {[0, 1, 2, 3, 4, 5].map((j) => (
                <div
                  key={j}
                  className="bg-muted-foreground"
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    opacity: 0.22,
                  }}
                />
              ))}
            </div>
          </button>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

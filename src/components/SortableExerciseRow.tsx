import { useState, useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

interface Props {
  id: string;
  children: React.ReactNode;
  justDropped?: boolean;
  onDelete?: () => void;
}

export default function SortableExerciseRow({ id, children, justDropped, onDelete }: Props) {
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

    // Lock direction on first significant movement
    if (!directionLocked.current) {
      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return;
      directionLocked.current = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (directionLocked.current !== "horizontal") return;

    setSwiping(true);
    // Only allow left swipe (negative delta), cap at -80
    const clamped = Math.max(-80, Math.min(0, deltaX));
    setOffsetX(clamped);
  }, []);

  const handleTouchEnd = useCallback(() => {
    startRef.current = null;
    directionLocked.current = null;
    setSwiping(false);
    // Snap: if past threshold, reveal delete; otherwise snap back
    setOffsetX((prev) => (prev < -45 ? -80 : 0));
  }, []);

  // Tap anywhere to dismiss revealed delete panel
  const handleCardClick = useCallback(() => {
    if (offsetX < 0) {
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
        "relative overflow-hidden rounded-[14px] transition-colors",
        isDragging && "scale-[1.02] shadow-lg opacity-90",
        justDropped && "bg-green-50 dark:bg-green-950/20",
      )}
    >
      {/* Delete panel behind the card */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center rounded-[14px]"
          style={{ background: "#FF3B30" }}
          aria-label="Delete exercise"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Swipeable card content */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="relative flex items-center gap-1 bg-card"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 0.2s ease",
          borderRadius: 14,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          onPointerDown={() => haptic("light")}
          className="touch-none p-2 shrink-0 cursor-grab active:cursor-grabbing"
          style={{ minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <GripVertical className="w-3.5 h-3.5" style={{ color: "#9ca3af" }} />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

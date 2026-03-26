import { useState, useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
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

    if (!directionLocked.current) {
      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return;
      directionLocked.current = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (directionLocked.current !== "horizontal") return;

    setSwiping(true);
    const clamped = Math.max(-80, Math.min(0, deltaX));
    setOffsetX(clamped);
  }, []);

  const handleTouchEnd = useCallback(() => {
    startRef.current = null;
    directionLocked.current = null;
    setSwiping(false);
    setOffsetX((prev) => (prev < -45 ? -80 : 0));
  }, []);

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
        "relative overflow-hidden transition-colors",
        isDragging && "scale-[1.02] shadow-lg opacity-90",
        justDropped && "bg-green-50 dark:bg-green-950/20",
      )}
    >
      {/* Delete panel behind the card */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center"
          style={{ background: "#FF3B30", borderRadius: 10 }}
          aria-label="Delete exercise"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Swipeable card content */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="relative flex items-center"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 0.2s ease",
          backgroundColor: "#FFFFFF",
          borderRadius: 10,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
      >
        {/* 2×3 dot grid drag handle */}
        <button
          {...attributes}
          {...listeners}
          onPointerDown={() => haptic("light")}
          className="touch-none shrink-0 cursor-grab active:cursor-grabbing flex items-center justify-center"
          style={{ width: 28, minHeight: 44 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 3px)", gap: 3 }}>
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "#8E8E93", opacity: 0.22 }} />
            ))}
          </div>
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

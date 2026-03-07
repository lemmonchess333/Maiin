import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  children: React.ReactNode;
  justDropped?: boolean;
}

export default function SortableExerciseRow({ id, children, justDropped }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

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
        "flex items-center gap-1 transition-colors rounded-lg",
        isDragging && "scale-[1.02] shadow-lg opacity-90",
        justDropped && "bg-green-50 dark:bg-green-950/20",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="touch-none p-2 shrink-0 cursor-grab active:cursor-grabbing"
        style={{ minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

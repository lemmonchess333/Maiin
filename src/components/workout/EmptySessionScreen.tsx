import type { ReactNode } from "react";
import { Dumbbell, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * The workout screen while a session has no exercises yet: an empty
 * workout (Mob1 call 1), or a day with nothing in it. Its one action is
 * to add the first exercise. Loaded only when it is needed, as most
 * sessions never show it.
 */
export default function EmptySessionScreen({
  title,
  onClose,
  onAdd,
  children,
}: {
  title: string;
  onClose: () => void;
  onAdd: () => void;
  /** The exercise picker, while it is open. */
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col pt-[var(--safe-top)] safe-area-pb">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border/50">
        <p
          role="heading"
          aria-level={1}
          className="min-w-0 truncate text-base font-bold text-foreground"
        >
          {title}
        </p>
        <IconButton
          variant="ghost"
          aria-label="Close workout"
          onClick={onClose}
          icon={<X className="size-5 text-muted-foreground" />}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-4">
        <EmptyState
          icon={Dumbbell}
          headline="No exercises yet"
          sub="Add the first one, and its sets are ready to log."
        />
      </div>
      <div className="px-4 py-3 border-t border-border/50 bg-background">
        <Button
          size="lg"
          fullWidth
          onClick={onAdd}
          leftIcon={<Plus className="size-4" aria-hidden="true" />}
        >
          Add exercise
        </Button>
      </div>
      {children}
    </div>
  );
}

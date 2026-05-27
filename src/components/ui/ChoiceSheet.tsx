/**
 * ChoiceSheet — bottom-sheet primitive for "pick one of N actions"
 * prompts where each action runs an async writer.
 *
 * Owns the double-tap guard, the per-button pending state, the
 * "Verb…" label idiom, and the opacity-40 dim on non-active
 * siblings. Consumers supply the body content (eyebrow / icon /
 * summary) as `children` and the choice list as `choices`.
 *
 * Extracted from `FellBehindSheet` so that future adaptive-coaching
 * prompts (missed-lift streak, hydration shortfall, recovery
 * extension) don't reinvent the same state machine. Today
 * `FellBehindSheet` is the only consumer — keep the surface small
 * and grow it only when a second consumer surfaces a missing knob.
 */

import { useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

export type ChoiceVariant = "primary" | "secondary" | "ghost";

export interface Choice {
  id: string;
  label: string;
  /** Label rendered while this choice's writer is in flight (e.g.
   *  "Shifting…"). Falls back to `label` if omitted. */
  pendingLabel?: string;
  variant: ChoiceVariant;
  /** Async writer. On success the sheet closes via `onClose`; on
   *  throw the pending state clears so the user can retry. */
  onSelect: () => Promise<void>;
}

interface ChoiceSheetProps {
  open: boolean;
  /** Soft-close path (outside-tap / Escape / swipe / writer success).
   *  Does NOT run a writer — that's the choices' responsibility. */
  onClose: () => void;
  title: string;
  description?: string;
  hideHeader?: boolean;
  /** Body content rendered above the choices — eyebrow / icon /
   *  summary copy. Bespoke per consumer. */
  children?: ReactNode;
  choices: Choice[];
  /** Tag used in the "writer failed" log line — defaults to the
   *  generic label. Override for sheet-specific log namespacing. */
  logTag?: string;
}

const VARIANT_CLASSES: Record<ChoiceVariant, string> = {
  primary: "bg-primary text-primary-foreground text-sm font-semibold",
  secondary:
    "bg-card border border-border text-foreground text-sm font-semibold",
  ghost: "text-muted-foreground hover:text-foreground text-sm font-medium",
};

export function ChoiceSheet({
  open,
  onClose,
  title,
  description,
  hideHeader,
  children,
  choices,
  logTag = "choiceSheet",
}: ChoiceSheetProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleSelect(choice: Choice): Promise<void> {
    if (pendingId) return;
    setPendingId(choice.id);
    try {
      await choice.onSelect();
      onClose();
    } catch (err) {
      logger.warn(`[${logTag}] ${choice.id} writer failed`, err);
      setPendingId(null);
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      hideHeader={hideHeader}
    >
      <div className="px-5 pb-6 pt-4 space-y-4">
        <div className="w-9 h-1 rounded-full bg-border mx-auto" />

        {children}

        <div className="space-y-2">
          {choices.map((choice) => {
            const isPending = pendingId === choice.id;
            const otherPending = pendingId && !isPending;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => handleSelect(choice)}
                disabled={!!pendingId}
                className={cn(
                  "w-full py-2.5 rounded-xl",
                  "active:scale-[0.97] transition-transform",
                  VARIANT_CLASSES[choice.variant],
                  otherPending && "opacity-40"
                )}
              >
                {isPending && choice.pendingLabel
                  ? choice.pendingLabel
                  : choice.label}
              </button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}

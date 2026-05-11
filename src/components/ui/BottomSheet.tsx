/**
 * Tropos design-system BottomSheet primitive.
 *
 * Sprint 3 — thin wrapper around vaul's <Drawer.*> that bakes in the
 * Tropos defaults so call sites stop duplicating the same boilerplate:
 *
 *   - Backdrop:      `fixed inset-0 bg-black/50 z-40`
 *   - Content:       `fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl
 *                     flex flex-col bg-background safe-area-pb` with
 *                     max-height the caller supplies (default 85vh)
 *   - Drag handle:   centred 40×4 pill with bg-border
 *   - Header:        `px-4 pb-3 border-b border-border/30` rendering
 *                    Drawer.Title (aria-labelledby is wired by vaul)
 *
 * vaul already provides the heavy lifting (focus trap, escape-to-
 * close, backdrop dismiss, body scroll lock, drag-to-dismiss). The
 * Sprint 3 value is consistency: every bottom sheet looks and behaves
 * the same and uses Drawer.Title so the title is announced as the
 * accessible name. Pre-Sprint-3 several call sites omitted
 * Drawer.Title — vaul still renders, but screen readers announce
 * "dialog" with no name.
 *
 * Children compose the body content below the header (drag handle +
 * title strip). Callers add their own padding inside the children
 * because layouts vary (lists, forms, full-bleed maps, etc.).
 */
import { Drawer } from "vaul";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name. Rendered via Drawer.Title so screen readers
   *  announce it as the dialog's name. Pass `null` only if your
   *  body content includes its own labelled-by heading. */
  title: string | null;
  /** Optional description rendered via Drawer.Description (wired
   *  to aria-describedby by vaul). */
  description?: string;
  /** Tailwind max-height utility. Default is `max-h-[85vh]`. */
  maxHeight?: string;
  /** When false, the sheet cannot be dismissed by drag/backdrop/
   *  escape — only by parent state change. Default true. */
  dismissible?: boolean;
  /** Render no header strip (drag handle + title row). Useful for
   *  full-bleed sheets where the body owns the entire surface
   *  including its own close affordance. Default false. */
  hideHeader?: boolean;
  /** Override the Content element's className for bespoke layouts
   *  (e.g. dark surfaces). Merged with the defaults via cn(). */
  className?: string;
  /** Override the Overlay element's className. Used when a sheet
   *  needs to layer above other sheets/drawers (e.g. a
   *  confirmation sheet opened from inside an active workout's
   *  exercise demo drawer). Default z-index is z-40 for Overlay
   *  and z-50 for Content; override both via this prop + className
   *  to lift the whole sheet above the default stack. */
  overlayClassName?: string;
  children: ReactNode;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  maxHeight = "max-h-[85vh]",
  dismissible = true,
  hideHeader = false,
  className,
  overlayClassName,
  children,
}: BottomSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      dismissible={dismissible}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          className={cn("fixed inset-0 bg-black/50 z-40", overlayClassName)}
        />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50",
            "rounded-t-2xl flex flex-col bg-background safe-area-pb",
            maxHeight,
            className,
          )}
        >
          {hideHeader ? (
            // When the caller hides the visible header strip, we
            // still emit a visually-hidden Drawer.Title for the
            // aria-labelledby wiring so SRs always have a name.
            title ? (
              <Drawer.Title className="sr-only">{title}</Drawer.Title>
            ) : null
          ) : (
            <>
              {/* Drag handle — vaul styles this as the drag affordance
                  out of the box; this is the visual one Tropos uses. */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              {title ? (
                <div className="px-4 pb-3 border-b border-border/30">
                  <Drawer.Title className="text-base font-semibold text-foreground">
                    {title}
                  </Drawer.Title>
                  {description ? (
                    <Drawer.Description className="text-xs text-muted-foreground mt-1">
                      {description}
                    </Drawer.Description>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default BottomSheet;

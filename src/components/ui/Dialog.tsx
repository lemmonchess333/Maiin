/**
 * Tropos design-system Dialog primitive.
 *
 * Sprint 3 — single source of truth for centred modal dialogs.
 * Replaces ~7 hand-rolled centred-modal shapes across the app
 * (StallModal, ReportModal, ProModal, the RunBottomSheet stop-
 * confirm, account-delete confirms, etc.) that each implemented
 * slightly different focus traps, escape handlers, scroll locks,
 * backdrop dismissals, and aria wiring. Many missed one or more —
 * notably the RunBottomSheet stop-confirm had no focus trap and no
 * escape handler at all.
 *
 * The primitive bundles the full a11y contract for a modal:
 *   - role="dialog" + aria-modal="true" (override role="alertdialog"
 *     for confirmation dialogs)
 *   - aria-labelledby wired to the title (when title is provided)
 *   - aria-describedby wired to the description (when description
 *     is provided)
 *   - Focus trap via useFocusTrap (Tab + Shift+Tab wrap, focus
 *     restored to the previously-focused element on close)
 *   - Escape key dismisses (closeOnEscape, default true)
 *   - Backdrop click dismisses (closeOnBackdrop, default true)
 *   - Body scroll locked while open (set body overflow=hidden,
 *     restored on close)
 *   - Optional X close button top-right (aria-label "Close")
 *   - Enter/exit fade+scale animation via Framer Motion, respecting
 *     the app's MotionConfig reducedMotion="user" setting
 *
 * Sizes (max width):
 *   - sm   320px — the ConfirmDialog footprint. Default.
 *   - md   440px — for forms / longer copy.
 *   - lg   560px — for richer content (StallModal-style detail).
 *
 * The children render in the body area; callers compose their own
 * footer (typically two Button primitives in a flex row). This is
 * deliberately NOT prescriptive about button layout because the
 * existing call sites vary (one button, two buttons, three
 * buttons with one demoted to a text link, etc.).
 */
import { useEffect, useEffectEvent, useId } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, m as motion } from "framer-motion";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { cn } from "@/lib/utils";

export type DialogSize = "sm" | "md" | "lg";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Rendered as the styled heading at the top of the dialog AND
   *  wired up to aria-labelledby. Omit only when the children
   *  already render a heading and you pass aria-labelledby manually
   *  via the labelledBy prop. */
  title?: string;
  /** Rendered as a muted paragraph below the title AND wired up to
   *  aria-describedby. */
  description?: string;
  /** Override aria-labelledby (use when title is rendered inside
   *  children for custom styling). */
  labelledBy?: string;
  size?: DialogSize;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** Render a top-right X close button. Default false — most
   *  dialogs have an explicit Cancel action in their footer. */
  closeButton?: boolean;
  /** Set role="alertdialog" instead of role="dialog". Use for
   *  confirmations that REQUIRE user response before continuing. */
  role?: "dialog" | "alertdialog";
  /** Optional className applied to the content panel (e.g. for
   *  bespoke max-height / dark-surface overrides). */
  className?: string;
  /** Optional className applied to the backdrop overlay — typically a
   *  z-index override (e.g. `z-[60]`) so the dialog can nest ABOVE a
   *  sheet/drawer that already occupies the default z-50 layer. Pair
   *  with a matching z override on `className` for the panel. */
  overlayClassName?: string;
  /** Surface tone. "dark" forces a dark panel + light title/description text
   *  regardless of app theme — for always-dark surfaces like the run flow.
   *  Default "light" (bg-card, themed text). */
  tone?: "light" | "dark";
  /** Panel position. "bottom" anchors the panel near the bottom on mobile
   *  (thumb-reachable) and centres it on desktop; "center" is always centred.
   *  Default "center". */
  position?: "center" | "bottom";
  children: ReactNode;
}

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: "w-[min(320px,calc(100vw-48px))]",
  md: "w-[min(440px,calc(100vw-32px))]",
  lg: "w-[min(560px,calc(100vw-32px))]",
};

const POSITION_CLASSES: Record<"center" | "bottom", string> = {
  center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
  bottom:
    "left-1/2 -translate-x-1/2 bottom-4 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2",
};

const TONE_PANEL: Record<"light" | "dark", string> = {
  light: "bg-card",
  dark: "bg-[#1A1A1F]",
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  labelledBy,
  size = "sm",
  closeOnBackdrop = true,
  closeOnEscape = true,
  closeButton = false,
  role = "dialog",
  className,
  overlayClassName,
  tone = "light",
  position = "center",
  children,
}: DialogProps) {
  const generatedTitleId = useId();
  const generatedDescId = useId();
  const titleId = title ? generatedTitleId : labelledBy;
  const descId = description ? generatedDescId : undefined;

  const ref = useFocusTrap<HTMLDivElement>(open);

  // Escape handler. `onClose` wrapped in useEffectEvent so the
  // effect doesn't resubscribe on every parent render that gives us
  // a fresh callback identity (React 19 pattern — keeps the listener
  // stable while still calling the latest onClose).
  const escapeOnClose = useEffectEvent(onClose);
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") escapeOnClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closeOnEscape]);

  // Body scroll lock. Preserve and restore the previous overflow
  // value so we don't fight with other components that also lock
  // scroll (e.g. vaul drawers — though dialogs and drawers don't
  // typically stack).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className={cn("fixed inset-0 bg-black/50 z-50", overlayClassName)}
            role="presentation"
            onClick={closeOnBackdrop ? onClose : undefined}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
          <motion.div
            ref={ref}
            role={role}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className={cn(
              "fixed z-50",
              POSITION_CLASSES[position],
              "rounded-2xl p-5 shadow-xl",
              TONE_PANEL[tone],
              SIZE_CLASSES[size],
              className
            )}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
          >
            {closeButton ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-3 right-3 size-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-[0.97] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
            {title ? (
              <p
                id={titleId}
                className={cn(
                  "text-base font-semibold pr-6",
                  tone === "dark" ? "text-white" : "text-foreground"
                )}
              >
                {title}
              </p>
            ) : null}
            {description ? (
              <p
                id={descId}
                className={cn(
                  "text-sm mt-2",
                  tone === "dark" ? "text-white/60" : "text-muted-foreground"
                )}
              >
                {description}
              </p>
            ) : null}
            <div className={cn(title || description ? "mt-3" : null)}>
              {children}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export default Dialog;
